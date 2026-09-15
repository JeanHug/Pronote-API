/**
 * JOB STORE — Durable Object
 * ==========================
 * Remplace intégralement Cloudflare KV comme file d'attente ET bus de
 * résultats.
 *
 * Pourquoi un Durable Object et non KV :
 *  - KV est *eventually consistent* : un job écrit depuis un PoP pouvait mettre
 *    jusqu'à 60 s à devenir visible par le runner (autre continent), et le
 *    résultat 60 s à revenir. C'est LA cause des « 2 minutes ».
 *  - KV limite les écritures à 1/s par clé : la file vivait sous une clé unique
 *    (`queue:jobs`) et était réécrite intégralement à chaque ajout/retrait →
 *    jobs perdus par lecture-modification-écriture concurrente.
 *  - KV n'a pas de transaction : deux runners pouvaient réclamer le même job.
 *
 * Un Durable Object est mono-thread et fortement cohérent : toutes les
 * opérations ci-dessous sont atomiques par construction. Le plan Workers Free
 * autorise les Durable Objects à backend SQLite.
 *
 * Budget : chaque appel est une sous-requête vers un service Cloudflare
 * (quota interne de 1000/invocation sur Free), pas une sous-requête externe
 * (quota de 50). On reste donc très loin des limites.
 */

type JobRecord = {
  jobId: string;
  username: string;
  password: string;
  pronoteUrl: string;
  entUrl: string;
  format: 'json' | 'html';
  createdAt: number;
  status: 'queued' | 'running' | 'done' | 'error';
  claimedAt: number | null;
  runnerId: string | null;
  result: string | null;
  errorCode: string | null;
  attempts: number;
};

const JOB_TTL_MS = 30 * 60 * 1000;       // 30 min : un job non traité est périmé
const RESULT_TTL_MS = 60 * 60 * 1000;    // 1 h de rétention des résultats
const CLAIM_TIMEOUT_MS = 3 * 60 * 1000;  // un job « running » non terminé est remis en file
const HEARTBEAT_TTL_MS = 60 * 1000;
export const RATE_WINDOW_MS = 60 * 1000;
export const MAX_JOBS_PER_WINDOW = 10;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_WAIT_MS = 30_000;

type JobState = {
  status: string;
  result: string | null;
  errorCode: string | null;
};

type Waiter = (state: JobState) => void;
type ClaimWaiter = { wake: () => void };

export interface RateLimitRow {
  n: number;
  ts: number;
}

export interface RateLimitDecision extends RateLimitRow {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Calcule une fenêtre FIXE de limitation de débit.
 *
 * `ts` est l'instant du PREMIER appel de la fenêtre et ne bouge plus jusqu'à
 * son expiration. L'ancienne implémentation le remplaçait par `now` à chaque
 * appel, y compris refusé : un client qui suivait Retry-After repoussait donc
 * sa propre échéance indéfiniment.
 */
export function advanceRateLimit(current: RateLimitRow | undefined, now: number): RateLimitDecision {
  const active = Boolean(current && now - current.ts < RATE_WINDOW_MS);
  const ts = active && current ? current.ts : now;
  const n = active && current ? current.n + 1 : 1;
  return {
    n,
    ts,
    allowed: n <= MAX_JOBS_PER_WINDOW,
    remaining: Math.max(0, MAX_JOBS_PER_WINDOW - n),
    resetAt: ts + RATE_WINDOW_MS,
  };
}

export class JobStore implements DurableObject {
  private state: DurableObjectState;
  private sql: SqlStorage;
  /** Requêtes /wait actuellement suspendues, réveillées dès POST /result. */
  private waiters = new Map<string, Set<Waiter>>();
  /** Long-polls des runners au repos, réveillés dès la création d'un job. */
  private claimWaiters: ClaimWaiter[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sql = state.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        jobId       TEXT PRIMARY KEY,
        username    TEXT NOT NULL,
        password    TEXT NOT NULL,
        pronoteUrl  TEXT NOT NULL,
        entUrl      TEXT NOT NULL,
        format      TEXT NOT NULL,
        createdAt   INTEGER NOT NULL,
        status      TEXT NOT NULL,
        claimedAt   INTEGER,
        runnerId    TEXT,
        result      TEXT,
        errorCode   TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0
      );
    `);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, createdAt);`);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS hits (
        bucket TEXT PRIMARY KEY,
        n      INTEGER NOT NULL,
        ts     INTEGER NOT NULL
      );
    `);

    // Purge périodique. Un DO peut programmer ses propres alarmes — pas besoin
    // d'un cron externe ni de TTL sur une clé unique comme avec KV.
    this.state.blockConcurrencyWhile(async () => {
      const cur = await this.state.storage.getAlarm();
      if (cur === null) {
        await this.state.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
      }
    });
  }

  async alarm(): Promise<void> {
    const now = Date.now();

    // Jobs périmés jamais réclamés, ou réclamés puis abandonnés par un runner
    // mort (l'ancienne architecture perdait ces jobs en silence).
    this.sql.exec(`DELETE FROM jobs WHERE status = 'done' AND createdAt < ?`, now - RESULT_TTL_MS);
    this.sql.exec(`DELETE FROM jobs WHERE status = 'error' AND createdAt < ?`, now - RESULT_TTL_MS);
    this.sql.exec(
      `UPDATE jobs
          SET status = 'queued', claimedAt = NULL, runnerId = NULL
        WHERE status = 'running' AND claimedAt < ?`,
      now - CLAIM_TIMEOUT_MS,
    );
    this.sql.exec(`DELETE FROM jobs WHERE status = 'queued' AND createdAt < ?`, now - JOB_TTL_MS);
    this.sql.exec(`DELETE FROM hits WHERE ts < ?`, now - RATE_WINDOW_MS * 2);

    await this.state.storage.setAlarm(now + CLEANUP_INTERVAL_MS);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Compteur persistant du coût réel d'une extraction. Les lectures de
      // santé servant à lire le compteur sont volontairement exclues : une
      // mesure avant/après rapporte ainsi exactement les requêtes du flux
      // mesuré, sans ajouter le coût de la sonde elle-même.
      if (path !== '/health') this.countRequest();

      switch (`${request.method} ${path}`) {
        case 'POST /job':            return await this.createJob(request);
        case 'POST /claim':          return await this.claimJob(request);
        case 'POST /result':         return await this.storeResult(request);
        case 'GET /result':          return await this.getResult(url);
        case 'POST /wait':           return await this.waitForResult(request);
        case 'POST /heartbeat':      return await this.heartbeat(request);
        case 'GET /health':          return await this.health();
        case 'POST /ratelimit':      return await this.rateLimit(request);
        case 'GET /stats':           return await this.stats();
        default:
          return this.json({ error: 'not found' }, 404);
      }
    } catch (err) {
      return this.json({ error: (err as Error).message }, 500);
    }
  }

  private countRequest(): void {
    this.sql.exec(`
      INSERT INTO meta (k, v) VALUES ('do_requests', '1')
      ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)
    `);
  }

  private requestCount(): number {
    const row = [...this.sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = 'do_requests'`)][0];
    return Number(row?.v ?? 0);
  }

  // -------------------------------------------------------------------------
  // File d'attente
  // -------------------------------------------------------------------------

  private async createJob(request: Request): Promise<Response> {
    const body = await request.json<{
      jobId: string; username: string; password: string;
      pronoteUrl: string; entUrl: string; format: 'json' | 'html';
    }>();

    // INSERT est atomique : plus de perte par lecture-modification-écriture.
    this.sql.exec(
      `INSERT INTO jobs (jobId, username, password, pronoteUrl, entUrl, format, createdAt, status, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0)`,
      body.jobId, body.username, body.password,
      body.pronoteUrl, body.entUrl, body.format, Date.now(),
    );

    // Réveille immédiatement un runner en long-poll. Sans cela, sa boucle à
    // 300 ms consommerait à elle seule plus de 100 000 requêtes par jour.
    this.claimWaiters.shift()?.wake();

    return this.json({ ok: true, jobId: body.jobId }, 201);
  }

  /**
   * Réclame atomiquement le job en tête de file.
   * Le DO étant mono-thread, deux runners ne peuvent JAMAIS obtenir le même
   * job — ce que KV permettait (double scraping, double coût).
   */
  private takeJob(runnerId: string): JobRecord | null {
    const job = [...this.sql.exec<JobRecord>(
      `SELECT * FROM jobs WHERE status = 'queued' ORDER BY createdAt ASC LIMIT 1`,
    )][0];
    if (!job) return null;

    this.sql.exec(
      `UPDATE jobs SET status = 'running', claimedAt = ?, runnerId = ?, attempts = attempts + 1
        WHERE jobId = ? AND status = 'queued'`,
      Date.now(), runnerId, job.jobId,
    );
    return job;
  }

  private claimResponse(job: JobRecord | null): Response {
    if (!job) return this.json({ hasJob: false }, 200);
    return this.json({
      hasJob: true,
      job: {
        jobId: job.jobId,
        username: job.username,
        password: job.password,
        pronoteUrl: job.pronoteUrl,
        entUrl: job.entUrl,
        format: job.format,
      },
    }, 200);
  }

  private async claimJob(request: Request): Promise<Response> {
    const { runnerId, waitMs = 0 } = await request.json<{ runnerId: string; waitMs?: number }>();
    const immediate = this.takeJob(runnerId);
    if (immediate || waitMs <= 0) return this.claimResponse(immediate);

    const timeoutMs = Math.max(1, Math.min(Number.isFinite(waitMs) ? waitMs : 0, MAX_WAIT_MS));
    return await new Promise<Response>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const waiter: ClaimWaiter = {
        wake: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.claimWaiters = this.claimWaiters.filter((w) => w !== waiter);
          resolve(this.claimResponse(this.takeJob(runnerId)));
        },
      };

      this.claimWaiters.push(waiter);
      timer = setTimeout(waiter.wake, timeoutMs);
      request.signal.addEventListener('abort', waiter.wake, { once: true });
    });
  }

  // -------------------------------------------------------------------------
  // Résultats
  // -------------------------------------------------------------------------

  private async storeResult(request: Request): Promise<Response> {
    const body = await request.json<{
      jobId: string; success: boolean; payload: string; errorCode?: string;
    }>();

    const check = [...this.sql.exec<{ jobId: string }>(`SELECT jobId FROM jobs WHERE jobId = ?`, body.jobId)];
    if (check.length === 0) {
      return this.json({ ok: false, error: 'jobId inconnu' }, 404);
    }

    const status = body.success ? 'done' : 'error';
    const state: JobState = {
      status,
      result: body.payload,
      errorCode: body.errorCode ?? null,
    };

    // On ne stocke QUE la réponse assainie de l'API — plus jamais le HTML
    // complet de la session, qui doublait le volume transféré et stocké.
    this.sql.exec(
      `UPDATE jobs SET status = ?, result = ?, errorCode = ? WHERE jobId = ?`,
      state.status, state.result, state.errorCode, body.jobId,
    );

    // Réveil immédiat de toutes les requêtes synchrones tenues ouvertes pour
    // ce job. Une seule requête DO remplace les ~125 GET générés auparavant
    // par la scrutation toutes les 200 ms.
    const listeners = this.waiters.get(body.jobId);
    if (listeners) {
      this.waiters.delete(body.jobId);
      for (const notify of listeners) notify(state);
    }

    return this.json({ ok: true }, 200);
  }

  private readJobState(jobId: string): JobState {
    const row = [...this.sql.exec<JobState>(
      `SELECT status, result, errorCode FROM jobs WHERE jobId = ?`, jobId,
    )][0];
    return row ?? { status: 'expired', result: null, errorCode: null };
  }

  private async getResult(url: URL): Promise<Response> {
    const jobId = url.searchParams.get('jobId');
    if (!jobId || jobId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(jobId)) {
      return this.json({ error: 'jobId invalide' }, 400);
    }

    const state = this.readJobState(jobId);
    if (state.status === 'done' || state.status === 'error') {
      return this.json(state, 200);
    }
    return this.json({ status: state.status }, 200);
  }

  /**
   * Attend le résultat sans scrutation.
   *
   * La requête reste suspendue dans l'instance du Durable Object. `storeResult`
   * résout sa promesse dès l'écriture SQLite ; le timeout ne sert qu'à rendre
   * la main au Worker afin qu'il émette son 202 exploitable.
   */
  private async waitForResult(request: Request): Promise<Response> {
    const body = await request.json<{ jobId?: string; timeoutMs?: number }>();
    const jobId = body.jobId ?? '';
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(jobId)) {
      return this.json({ error: 'jobId invalide' }, 400);
    }

    const immediate = this.readJobState(jobId);
    if (immediate.status === 'done' || immediate.status === 'error' || immediate.status === 'expired') {
      return this.json(immediate, 200);
    }

    const requested = Number(body.timeoutMs ?? MAX_WAIT_MS);
    const timeoutMs = Math.max(1, Math.min(Number.isFinite(requested) ? requested : MAX_WAIT_MS, MAX_WAIT_MS));

    return await new Promise<Response>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;

      const finish = (state: JobState): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const listeners = this.waiters.get(jobId);
        listeners?.delete(finish);
        if (listeners?.size === 0) this.waiters.delete(jobId);
        resolve(this.json(state, 200));
      };

      const listeners = this.waiters.get(jobId) ?? new Set<Waiter>();
      listeners.add(finish);
      this.waiters.set(jobId, listeners);

      timer = setTimeout(() => finish(this.readJobState(jobId)), timeoutMs);
      request.signal.addEventListener('abort', () => finish(this.readJobState(jobId)), { once: true });
    });
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private async heartbeat(request: Request): Promise<Response> {
    const body = await request.json<{
      runnerId: string; status?: string; logs?: string[]; protocolVersion?: number;
    }>();
    await this.state.storage.put('heartbeat', {
      runnerId: body.runnerId,
      status: body.status || 'running',
      protocolVersion: body.protocolVersion ?? 0,
      lastPing: Date.now(),
      logs: (body.logs || []).slice(-20),
    });
    return this.json({ ok: true }, 200);
  }

  private async health(): Promise<Response> {
    const hb = await this.state.storage.get<{
      lastPing: number; runnerId: string; protocolVersion?: number;
    }>('heartbeat');
    const online = Boolean(
      hb && hb.protocolVersion === 6 && Date.now() - hb.lastPing < HEARTBEAT_TTL_MS,
    );
    const pending = [...this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'`)][0]?.n ?? 0;
    return this.json({
      runnerOnline: online,
      runnerId: hb?.runnerId ?? null,
      lastPing: hb?.lastPing ?? null,
      queueDepth: pending,
      requetesDO: this.requestCount(),
    }, 200);
  }

  // -------------------------------------------------------------------------
  // Limitation de débit — remplace l'absence totale de protection
  // -------------------------------------------------------------------------

  private async rateLimit(request: Request): Promise<Response> {
    const { key } = await request.json<{ key: string }>();
    const now = Date.now();
    const bucket = key || 'anon';

    const current = [...this.sql.exec<{ n: number; ts: number }>(
      `SELECT n, ts FROM hits WHERE bucket = ?`, bucket,
    )][0];
    const decision = advanceRateLimit(current, now);

    // `ts` reste le début de la fenêtre active. Les refus ne repoussent donc
    // jamais l'échéance annoncée au client par Retry-After.
    this.sql.exec(
      `INSERT INTO hits (bucket, n, ts) VALUES (?, ?, ?)
       ON CONFLICT(bucket) DO UPDATE SET n = ?, ts = ?`,
      bucket, decision.n, decision.ts, decision.n, decision.ts,
    );

    return this.json(decision, 200);
  }

  private async stats(): Promise<Response> {
    const byStatus = [...this.sql.exec<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`,
    )];
    return this.json({ byStatus, requetesDO: this.requestCount() }, 200);
  }

  private json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
