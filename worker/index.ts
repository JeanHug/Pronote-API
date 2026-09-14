/**
 * PRONOTE API — PASSERELLE CLOUDFLARE WORKERS
 * ==========================================
 * Architecture : Worker (edge) + Durable Object (état cohérent) + Runner
 * GitHub Actions (navigateur).
 *
 * Remplace l'ancien `worker.js`, qui utilisait Cloudflare KV comme file
 * d'attente ET bus de résultats — un stockage *eventually consistent* dont la
 * latence de propagation atteint 60 s, alors que la boucle d'attente était
 * plafonnée à 50 s. L'API ne pouvait donc pas répondre. Voir AUDIT, section 1.
 *
 * Ce qui a changé :
 *  - KV supprimé intégralement → Durable Object à cohérence forte (jobstore.ts)
 *  - Les endpoints runner sont AUTHENTIFIÉS (l'ancien `/api/runner/poll-job`
 *    distribuait les mots de passe ENT à qui les demandait)
 *  - Les mots de passe ne sont PLUS publiés en commentaire d'issue publique
 *  - Le timeout renvoie un `jobId` exploitable au lieu d'un 504 sans référence
 *  - CORS restreint (l'ancien `*` permettait à tout site de lire les notes)
 *  - Validation d'URL contre la SSRF
 *  - `jobId` non devinable (crypto.randomUUID au lieu de Date.now + 6 car.)
 *  - Limitation de débit par IP
 *  - Documentation générée depuis le schéma, donc jamais désynchronisée
 */

import { JobStore } from './jobstore.ts';
import { dispatchRunner, postDiagnostic } from './github.ts';
import {
  safeEqual, extractBearer, validateScrapeBody, corsHeaders, json,
  maskLogin, cleanText,
} from './security.ts';
import { renderDocs } from './docs.ts';
import { FIELDS, ERROR_CATALOG, EXAMPLE, SCHEMA_VERSION } from '../src/pronote/schema.ts';
import type { ErrorCode } from '../src/pronote/types.ts';

export { JobStore };

interface Env {
  JOB_STORE: DurableObjectNamespace;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_FALLBACK_ISSUE?: string;
  RUNNER_TOKEN?: string;
  API_KEYS?: string;
  ALLOWED_ORIGINS?: string;
  ALLOWED_HOST_SUFFIXES?: string;
  SYNC_WAIT_MS?: string;
  DEFAULT_PRONOTE_URL?: string;
  DEFAULT_ENT_URL?: string;
}

/**
 * Budget d'attente synchrone. Au-delà, l'API renvoie 202 avec un jobId
 * exploitable plutôt que d'échouer — l'appelant peut alors interroger
 * `GET /api/v1/job/:jobId` autant de fois que nécessaire.
 */
const DEFAULT_SYNC_WAIT_MS = 25_000;
const POLL_INTERVAL_MS = 200;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // --- Stub du Durable Object : instance unique, donc sérialisation
      //     naturelle de toutes les opérations d'état.
      const id = env.JOB_STORE.idFromName('pronote-global');
      const doFetch = (path: string, init?: RequestInit) => {
        const stub = env.JOB_STORE.get(id);
        return stub.fetch(`https://jobstore.internal${path}`, init);
      };

      // =====================================================================
      // SANTÉ
      // =====================================================================
      if (url.pathname === '/api/v1/health' || url.pathname === '/api/health' || url.pathname === '/health') {
        const res = await doFetch('/health');
        const h = await res.json<Record<string, unknown>>();
        return json({
          status: 'ok',
          version: SCHEMA_VERSION,
          architecture: 'Worker + Durable Object (cohérence forte) + runner GitHub Actions',
          storage: 'Durable Object SQLite (KV supprimé)',
          runnerOnline: h.runnerOnline,
          runnerId: h.runnerId,
          queueDepth: h.queueDepth,
          timestamp: new Date().toISOString(),
        }, 200, cors);
      }

      // =====================================================================
      // SCHÉMA PUBLIC (JSON) — généré depuis la source unique de vérité
      // =====================================================================
      if (url.pathname === '/api/v1/schema' || url.pathname === '/api/schema') {
        return json({
          version: SCHEMA_VERSION,
          baseUrl: `${url.origin}/api/v1`,
          fields: FIELDS,
          errors: ERROR_CATALOG,
        }, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
      }

      // =====================================================================
      // RUNNER — tous les endpoints sont AUTHENTIFIÉS
      // =====================================================================

      if (url.pathname.startsWith('/api/v1/runner/') || url.pathname.startsWith('/api/runner/')) {
        const authed = await requireRunnerAuth(request, env);
        if (!authed) {
          return json({ success: false, errorCode: 'UNAUTHORIZED', error: 'Token runner invalide ou absent.' }, 401, cors);
        }

        if (url.pathname.endsWith('/heartbeat')) {
          const body = await request.json<{ runnerId: string; status?: string; logs?: string[] }>().catch(() => null);
          if (!body) return json({ success: false, errorCode: 'INVALID_REQUEST', error: 'JSON invalide.' }, 400, cors);
          await doFetch('/heartbeat', { method: 'POST', body: JSON.stringify({ ...body, logs: (body.logs || []).slice(-20) }) });
          return json({ success: true, acknowledgedAt: Date.now() }, 200, cors);
        }

        if (url.pathname.endsWith('/next-job')) {
          const body = await request.json<{ runnerId: string }>().catch(() => ({ runnerId: 'unknown' }));
          const res = await doFetch('/claim', { method: 'POST', body: JSON.stringify(body) });
          const data = await res.json<Record<string, unknown>>();
          // On journalise l'identifiant MASQUÉ, jamais en clair.
          if (data.hasJob) {
            const job = data.job as { jobId: string; username: string };
            console.log(`[runner] job ${job.jobId} remis au runner (login ${maskLogin(job.username)})`);
          }
          return json(data, 200, cors);
        }

        if (url.pathname.endsWith('/job-result')) {
          const body = await request.json<{ jobId: string; payload: string; success: boolean; errorCode?: string }>().catch(() => null);
          if (!body || !body.jobId) {
            return json({ success: false, errorCode: 'INVALID_REQUEST', error: 'jobId manquant.' }, 400, cors);
          }
          const res = await doFetch('/result', {
            method: 'POST',
            body: JSON.stringify({
              jobId: body.jobId,
              success: body.success === true,
              payload: body.payload,
              errorCode: body.errorCode,
            }),
          });
          const data = await res.json<Record<string, unknown>>();
          // Diagnostic ASSAINI uniquement (ni mot de passe, ni note d'élève).
          if (env.GITHUB_FALLBACK_ISSUE) {
            ctx.waitUntil(postDiagnostic(env, {
              jobId: body.jobId,
              event: body.success ? 'extraction réussie' : 'extraction en échec',
              errorCode: body.errorCode,
            }));
          }
          return json(data, 200, cors);
        }

        /**
         * Relais de session : le runner arrivant en fin de vie demande son
         * remplaçant. Un SEUL point de déclenchement (l'ancien code appelait
         * deux API GitHub en parallèle, créant deux runs qui s'annulaient, et
         * le workflow en ajoutait un troisième via `curl`).
         */
        if (url.pathname.endsWith('/relay')) {
          const ok = await dispatchRunner(env, 'session_rotation');
          return json({ success: ok, dispatched: ok }, ok ? 200 : 502, cors);
        }

        return json({ success: false, errorCode: 'INVALID_REQUEST', error: 'Endpoint runner inconnu.' }, 404, cors);
      }

      // =====================================================================
      // CONSULTATION D'UN JOB
      // =====================================================================
      if (url.pathname.startsWith('/api/v1/job/') || url.pathname.startsWith('/api/job/')) {
        const jobId = url.pathname.split('/').pop() || '';
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(jobId)) {
          return json({ success: false, errorCode: 'INVALID_REQUEST', error: 'jobId invalide.' }, 400, cors);
        }

        const res = await doFetch(`/result?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json<{ status: string; result: string | null; errorCode: string | null }>();

        if (data.status === 'expired') {
          return json({ jobId, success: false, status: 'expired', errorCode: 'TIMEOUT', error: 'Job inconnu ou expiré.' }, 404, cors);
        }

        if ((data.status === 'done' || data.status === 'error') && data.result) {
          return new Response(data.result, {
            status: data.status === 'done' ? 200 : 502,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
          });
        }

        return json({
          jobId,
          success: false,
          status: data.status,
          error: 'Extraction en cours.',
        }, 202, { ...cors, 'Retry-After': '2' });
      }

      // =====================================================================
      // ENDPOINT PRINCIPAL
      // =====================================================================
      const isScrapeRoute =
        url.pathname === '/api/v1/scrape-pronote' ||
        url.pathname === '/api/v1/scrape' ||
        url.pathname === '/api/scrape-pronote' ||
        url.pathname === '/api/scrape' ||
        url.pathname === '/api/v1/scrape-pronote/html' ||
        url.pathname === '/api/scrape-pronote/html' ||
        url.pathname === '/html' ||
        url.pathname === '/html/';

      if (isScrapeRoute) {
        if (request.method !== 'POST') {
          return json({ success: false, errorCode: 'INVALID_REQUEST', error: 'Utilisez POST.' }, 405, cors);
        }

        // --- Authentification client (optionnelle mais recommandée) ---
        const apiAuth = await requireApiKey(request, env);
        if (!apiAuth.ok) {
          return json({ success: false, errorCode: apiAuth.code, error: apiAuth.error }, apiAuth.status, cors);
        }

        // --- Limitation de débit ---
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const rlRes = await doFetch('/ratelimit', { method: 'POST', body: JSON.stringify({ key: ip }) });
        const rl = await rlRes.json<{ allowed: boolean; remaining: number; resetAt: number }>();
        if (!rl.allowed) {
          return json({
            success: false, errorCode: 'RATE_LIMITED',
            error: 'Trop de requêtes. Réessayez dans une minute.',
          }, 429, { ...cors, 'Retry-After': '60', 'X-RateLimit-Remaining': '0' });
        }

        // --- Validation stricte (dont protection SSRF) ---
        const rawBody = await request.json<unknown>().catch(() => {
          return { __parseError: true };
        });
        if (rawBody && typeof rawBody === 'object' && '__parseError' in rawBody) {
          return json({ success: false, errorCode: 'INVALID_REQUEST', error: 'Corps JSON malformé.' }, 400, cors);
        }

        const validated = validateScrapeBody(rawBody, env);
        if (!validated.ok) {
          return json({ success: false, errorCode: 'INVALID_REQUEST', error: validated.error }, 400, cors);
        }

        const { username, password, format, noCache } = validated.value;
        const pronoteUrl = validated.value.pronoteUrl
          || env.DEFAULT_PRONOTE_URL
          || 'https://0771068t.index-education.net/pronote/eleve.html';
        const entUrl = validated.value.entUrl
          || env.DEFAULT_ENT_URL
          || 'https://ent.seine-et-marne.fr/';

        const jobId = crypto.randomUUID();
        const t0 = Date.now();

        await doFetch('/job', {
          method: 'POST',
          body: JSON.stringify({ jobId, username, password, pronoteUrl, entUrl, format }),
        });

        // --- Démarrage du runner si nécessaire (une seule fois) ---
        const healthRes = await doFetch('/health');
        const health = await healthRes.json<{ runnerOnline: boolean }>();
        if (!health.runnerOnline) {
          ctx.waitUntil(dispatchRunner(env, 'session_startup'));
        }

        // --- Attente synchrone bornée ---
        // Le Durable Object étant fortement cohérent, le résultat est visible
        // dès son écriture : plus de fenêtre de 60 s comme avec KV.
        const budget = Math.max(1_000, Number(env.SYNC_WAIT_MS ?? DEFAULT_SYNC_WAIT_MS));
        const deadline = Date.now() + budget;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

          if (noCache) { /* réservé : le cache n'est pas encore activé */ }

          const r = await doFetch(`/result?jobId=${encodeURIComponent(jobId)}`);
          const d = await r.json<{ status: string; result: string | null }>();

          if ((d.status === 'done' || d.status === 'error') && d.result) {
            const headers: Record<string, string> = {
              ...cors,
              'X-Job-Id': jobId,
              'X-RateLimit-Remaining': String(rl.remaining),
              'X-Execution-Time-Ms': String(Date.now() - t0),
            };
            if (format === 'html') headers['X-Format'] = 'html';
            return new Response(d.result, {
              status: d.status === 'done' ? 200 : 502,
              headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
            });
          }
        }

        // --- Pas de résultat dans le budget : 202 + jobId EXPLOITABLE ---
        // L'ancien code renvoyait un 504 sans aucun identifiant, rendant le
        // mode différé documenté totalement inutilisable.
        return json({
          jobId,
          success: false,
          status: 'running',
          errorCode: 'TIMEOUT',
          error: `L'extraction n'a pas abouti en ${Math.round(budget / 1000)} s. Le job ${jobId} continue en tâche de fond : interrogez GET /api/v1/job/${jobId} pour récupérer le résultat.`,
          statusUrl: `${url.origin}/api/v1/job/${jobId}`,
          retryAfterSeconds: 3,
        }, 202, { ...cors, 'Retry-After': '3', 'X-Job-Id': jobId });
      }

      // =====================================================================
      // DOCUMENTATION
      // =====================================================================
      const accept = (request.headers.get('accept') || '').toLowerCase();
      const wantsJson = accept.includes('application/json') && !accept.includes('text/html');
      const isDocPath =
        url.pathname === '/' || url.pathname === '/docs' || url.pathname === '/docs/' ||
        url.pathname === '/playground' || url.pathname === '/index.html';

      if (isDocPath && !wantsJson) {
        return new Response(renderDocs(url.origin), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            ...cors,
          },
        });
      }

      // Index JSON par défaut de l'API
      return json({
        service: 'Pronote API Gateway',
        version: SCHEMA_VERSION,
        architecture: 'Worker + Durable Object + Runner GitHub Actions',
        endpoints: {
          health: 'GET /api/v1/health',
          scrape: 'POST /api/v1/scrape-pronote',
          job: 'GET /api/v1/job/:jobId',
          schema: 'GET /api/v1/schema',
          docs: 'GET /docs',
        },
        errors: ERROR_CATALOG,
        sample: EXAMPLE.response,
      }, 200, cors);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur interne inconnue';
      console.error(`[worker] ${message}`);
      return json({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        error: message,
      }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

/**
 * Authentifie le runner. Sans `RUNNER_TOKEN` configuré, on REFUSE par défaut
 * (fail-closed) : l'ancienne version laissait ces endpoints totalement
 * ouverts, exposant les mots de passe ENT à quiconque appelait
 * `/api/runner/poll-job`.
 */
async function requireRunnerAuth(request: Request, env: Env): Promise<boolean> {
  const expected = env.RUNNER_TOKEN;
  if (!expected) {
    console.error('[auth] RUNNER_TOKEN non configuré : endpoints runner refusés (fail-closed).');
    return false;
  }
  const provided = extractBearer(request);
  if (!provided) return false;
  return safeEqual(provided, expected);
}

/** Authentifie le client si `API_KEYS` est configuré (liste séparée par des virgules). */
async function requireApiKey(
  request: Request,
  env: Env,
): Promise<{ ok: true } | { ok: false; status: number; code: ErrorCode; error: string }> {
  const configured = (env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length === 0) return { ok: true }; // non configuré = accès libre (voir README)

  const provided = extractBearer(request);
  if (!provided) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'Clé d\'API manquante (en-tête Authorization: Bearer … ou X-API-Key).' };
  }
  for (const key of configured) {
    if (await safeEqual(provided, key)) return { ok: true };
  }
  return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'Clé d\'API invalide.' };
}

export { cleanText };
