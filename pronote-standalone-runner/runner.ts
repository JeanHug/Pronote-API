/**
 * RUNNER PRONOTE — BOUCLE D'EXTRACTION
 * ====================================
 * Tourne dans une VM GitHub Actions. Récupère les jobs auprès du Worker, les
 * exécute avec Puppeteer, renvoie la réponse assainie.
 *
 * Corrections par rapport à l'ancienne version :
 *
 *  - `WORKER_URL` est réellement LUE depuis l'environnement (elle était
 *    transmise par le workflow puis ignorée par le code, qui la codait en dur).
 *  - Le relais ne déclenche plus le run DEUX fois (deux canaux concurrents qui
 *    s'annulaient mutuellement par le jeu de `cancel-in-progress`).
 *  - La logique de fin de session n'est plus court-circuitée par le garde de
 *    concurrence : elle était placée APRÈS un `return` anticipé, donc le relais
 *    et la sortie propre étaient inatteignables dès que 3 jobs tournaient.
 *  - Plus aucun mot de passe n'est publié (l'ancien code postait le job complet
 *    en commentaire d'une issue PUBLIQUE et le supprimait après coup, alors que
 *    le flux RSS, les notifications e-mail et les webhooks l'avaient déjà
 *    diffusé).
 *  - Plus de polling GitHub toutes les 800 ms (4 500 requêtes/h pour une limite
 *    de 5 000) : la file est désormais interrogée directement sur le Worker,
 *    via un Durable Object à cohérence forte. Le canal GitHub de secours a été
 *    supprimé : il contournait une latence qui n'existe plus.
 *  - Le serveur Express de santé a été retiré : une VM GitHub Actions n'expose
 *    aucun port entrant, ce service n'était joignable par personne.
 *  - Les erreurs sont journalisées au lieu d'être avalées par `catch (_) {}`.
 */

import { runScrape, closeBrowser } from './scraper.ts';
import type { ErrorCode } from '../src/pronote/types.ts';

// ---------------------------------------------------------------------------
// Configuration — toutes les valeurs viennent de l'environnement
// ---------------------------------------------------------------------------

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

/** URL du Worker. Plus de valeur codée en dur : le workflow fait foi. */
const WORKER_URL = env('WORKER_URL').replace(/\/$/, '');
/** Token partagé avec le Worker, qui authentifie les endpoints runner. */
const RUNNER_TOKEN = env('RUNNER_TOKEN') || env('GH_TOKEN');
const RUNNER_ID = env('GITHUB_RUN_ID', 'local') + '-' + env('GITHUB_RUN_ATTEMPT', '1');

const SESSION_MAX_MS = 5 * 60 * 60 * 1000 - 3 * 60 * 1000; // 4 h 57
const RELAY_LEAD_MS = 4 * 60 * 1000;                        // relais à T-4 min
const POLL_INTERVAL_MS = 300;
const POLL_BACKOFF_MAX_MS = 5_000;
const MAX_CONCURRENT_JOBS = 2;                              // 2 jobs × 6 onglets = 12 max
const HEARTBEAT_INTERVAL_MS = 15_000;

const sessionStart = Date.now();
const sessionExpiresAt = sessionStart + SESSION_MAX_MS;

// ---------------------------------------------------------------------------
// Journalisation — jamais de secret, identifiants masqués
// ---------------------------------------------------------------------------

const recentLogs: string[] = [];

function log(msg: string): void {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  recentLogs.push(line);
  if (recentLogs.length > 40) recentLogs.shift();
}

function fatal(msg: string): never {
  log(`ERREUR FATALE : ${msg}`);
  process.exit(1);
}

if (!WORKER_URL) fatal('WORKER_URL non défini. Le runner ne peut pas savoir où envoyer ses résultats.');
if (!RUNNER_TOKEN) fatal('RUNNER_TOKEN (ou GH_TOKEN) non défini. Les endpoints runner sont authentifiés : sans token, tout appel sera refusé en 401.');

// ---------------------------------------------------------------------------
// Client Worker
// ---------------------------------------------------------------------------

interface JobMessage {
  jobId: string;
  username: string;
  password: string;
  pronoteUrl: string;
  entUrl: string;
  format: 'json' | 'html';
}

async function workerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  // /next-job utilise un long-poll de 25 s : le timeout réseau doit lui
  // laisser une marge, sans rendre les autres appels non bornés.
  const timer = setTimeout(() => ctrl.abort(), 35_000);
  try {
    return await fetch(`${WORKER_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${RUNNER_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Runner-Protocol': '6',
        'User-Agent': `Pronote-Runner/${RUNNER_ID}`,
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

let heartbeatFailures = 0;

async function heartbeat(): Promise<void> {
  try {
    const res = await workerFetch('/api/v1/runner/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        runnerId: RUNNER_ID,
        status: 'running',
        startedAt: sessionStart,
        sessionExpiresAt,
        lastPing: Date.now(),
        logs: recentLogs.slice(-15),
      }),
    });
    heartbeatFailures = 0;
    if (!res.ok) {
      log(`Heartbeat refusé (HTTP ${res.status}).`);
    }
  } catch (err) {
    heartbeatFailures++;
    // On journalise : l'ancien code avalait ces erreurs, ce qui masquait
    // complètement une panne de connectivité avec le Worker.
    if (heartbeatFailures === 1 || heartbeatFailures % 10 === 0) {
      log(`Heartbeat en échec (${heartbeatFailures}×) : ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Relais de session — UN SEUL canal de déclenchement
// ---------------------------------------------------------------------------

let relayTriggered = false;

/**
 * Déclenche le prochain run de 5 h.
 *
 * L'ancienne version appelait l'API GitHub via DEUX canaux (workflow_dispatch
 * puis repository_dispatch), créant deux runs dans le même groupe de
 * concurrence : le second annulait le premier. Le workflow, lui, en ajoutait un
 * troisième via `curl`. Un seul dispatch suffit.
 */
async function triggerRelay(): Promise<void> {
  if (relayTriggered) return;
  relayTriggered = true;
  log('Relais : déclenchement de la session suivante.');

  try {
    const res = await workerFetch('/api/v1/runner/relay', { method: 'POST', body: JSON.stringify({ reason: 'session_rotation' }) });
    if (res.ok) {
      log('Relais accepté par le Worker.');
    } else {
      log(`Relais refusé (HTTP ${res.status}).`);
    }
  } catch (err) {
    log(`Relais impossible : ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Traitement d'un job
// ---------------------------------------------------------------------------

const processedJobs = new Set<string>();
let activeJobs = 0;

async function handleJob(job: JobMessage): Promise<void> {
  activeJobs++;
  const t0 = Date.now();
  log(`Job ${job.jobId} démarré (format: ${job.format}).`);

  try {
    const outcome = await runScrape({
      username: job.username,
      password: job.password,
      pronoteUrl: job.pronoteUrl,
      entUrl: job.entUrl,
      format: job.format,
      onLog: (m) => log(`[${job.jobId}] ${m}`),
    });

    const elapsed = Date.now() - t0;

    const payload = outcome.payload
      ? { ...outcome.payload, jobId: job.jobId }
      : {
          jobId: job.jobId,
          success: false,
          status: 'error' as const,
          executionTimeMs: elapsed,
          timestamp: new Date().toISOString(),
          errorCode: outcome.errorCode ?? ('SCRAPER_ERROR' as ErrorCode),
          error: outcome.error ?? 'Erreur inconnue.',
          // Uniquement durées, compteurs d'octets et booléens 0/1 : aucune
          // donnée DOM ni aucun identifiant. Utile pour diagnostiquer le SSO.
          diagnostics: outcome.timings,
        };

    const res = await workerFetch('/api/v1/runner/job-result', {
      method: 'POST',
      body: JSON.stringify({
        jobId: job.jobId,
        success: outcome.success,
        errorCode: outcome.errorCode,
        payload: JSON.stringify(payload),
      }),
    });

    if (res.ok) {
      log(`Job ${job.jobId} transmis (${(elapsed / 1000).toFixed(2)} s, succès: ${outcome.success}).`);
    } else {
      log(`Job ${job.jobId} : transmission refusée (HTTP ${res.status}).`);
    }
  } catch (err) {
    const elapsed = Date.now() - t0;
    log(`Job ${job.jobId} en exception (${elapsed} ms) : ${(err as Error).message}`);

    await workerFetch('/api/v1/runner/job-result', {
      method: 'POST',
      body: JSON.stringify({
        jobId: job.jobId,
        success: false,
        errorCode: 'SCRAPER_ERROR',
        payload: JSON.stringify({
          jobId: job.jobId,
          success: false,
          status: 'error',
          executionTimeMs: elapsed,
          timestamp: new Date().toISOString(),
          errorCode: 'SCRAPER_ERROR',
          error: 'Erreur interne du runner lors du scraping.',
        }),
      }),
    }).catch(() => null);
  } finally {
    activeJobs--;
  }
}

// ---------------------------------------------------------------------------
// Boucle principale
// ---------------------------------------------------------------------------

let stopping = false;

async function shutdown(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`Arrêt demandé (${reason}). Jobs actifs : ${activeJobs}.`);

  // On laisse les jobs en cours se terminer : l'ancienne architecture les
  // perdait systématiquement, l'annulation tombant au milieu du scraping.
  const deadline = Date.now() + 90_000;
  while (activeJobs > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }

  await closeBrowser().catch(() => null);
  log('Runner arrêté proprement.');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('unhandledRejection', (r) => log(`Promesse rejetée non gérée : ${String(r)}`));
process.on('uncaughtException', (e) => log(`Exception non capturée : ${e.message}`));

async function mainLoop(): Promise<void> {
  let consecutiveErrors = 0;

  // La boucle ne sort JAMAIS par exception : elle journalise et continue.
  // L'ancienne version enveloppait tout dans `try { … } catch (_) {}`, si bien
  // qu'une panne permanente faisait tourner le runner 5 h en ne faisant RIEN,
  // sans un seul message d'erreur.
  for (;;) {
    try {
      // --- Fin de session : vérifiée AVANT le garde de concurrence, qui la
      //     rendait inatteignable dès que 3 jobs tournaient (bug d'origine).
      const now = Date.now();
      if (now >= sessionExpiresAt && activeJobs === 0) {
        log('Durée de session atteinte.');
        break;
      }
      if (sessionExpiresAt - now <= RELAY_LEAD_MS && !relayTriggered) {
        await triggerRelay();
      }

      if (activeJobs >= MAX_CONCURRENT_JOBS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const res = await workerFetch('/api/v1/runner/next-job', {
        method: 'POST',
        // Le Durable Object tient cette requête ouverte et la réveille dès
        // qu'un job arrive. Cela remplace ~3,3 requêtes/s au repos.
        body: JSON.stringify({ runnerId: RUNNER_ID, waitMs: 25_000 }),
      });

      if (!res.ok) {
        throw new Error(`next-job a répondu HTTP ${res.status}`);
      }

      const data = await res.json<{ hasJob: boolean; job?: JobMessage }>();
      consecutiveErrors = 0;

      if (data.hasJob && data.job && !processedJobs.has(data.job.jobId)) {
        processedJobs.add(data.job.jobId);
        // Purge bornée : l'ancienne version laissait la Set croître sans limite.
        if (processedJobs.size > 5_000) {
          const first = processedJobs.values().next().value;
          if (first) processedJobs.delete(first);
        }
        void handleJob(data.job);
      }

    } catch (err) {
      consecutiveErrors++;
      const backoff = Math.min(POLL_INTERVAL_MS * 2 ** Math.min(consecutiveErrors, 5), POLL_BACKOFF_MAX_MS);
      if (consecutiveErrors === 1 || consecutiveErrors % 20 === 0) {
        log(`Erreur de boucle (${consecutiveErrors}×) : ${(err as Error).message} — nouvel essai dans ${backoff} ms.`);
      }
      await new Promise((r) => setTimeout(r, backoff));
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  await shutdown('fin de session');
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

log('──────────────────────────────────────────────');
log('PRONOTE RUNNER DÉMARRÉ');
log(`  Worker       : ${WORKER_URL}`);
log(`  Runner ID    : ${RUNNER_ID}`);
log(`  File d'attente: Durable Object (cohérence forte, KV supprimé)`);
log(`  Fin session  : ${new Date(sessionExpiresAt).toISOString()}`);
log('──────────────────────────────────────────────');

await heartbeat();
setInterval(() => { void heartbeat(); }, HEARTBEAT_INTERVAL_MS);

await mainLoop();
