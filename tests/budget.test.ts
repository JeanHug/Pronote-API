import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  advanceRateLimit,
  MAX_JOBS_PER_WINDOW,
  RATE_WINDOW_MS,
} from '../worker/jobstore.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const workerSource = readFileSync(join(root, 'worker', 'index.ts'), 'utf8');
const storeSource = readFileSync(join(root, 'worker', 'jobstore.ts'), 'utf8');

/**
 * Garde-fous du quota Workers Free (100 000 requêtes/jour).
 *
 * Le flux nominal consomme six requêtes DO : ratelimit, création, santé,
 * attente, claim et résultat. La régression corrigée interrogeait /result toutes
 * les 200 ms pendant 25 s, soit jusqu'à 128 requêtes par extraction et seulement
 * ~781 extractions/jour. Ces tests doivent échouer si une boucle de scrutation
 * réapparaît.
 */

test('le Worker attend le résultat avec un unique POST /wait', () => {
  const start = workerSource.indexOf('// --- Attente synchrone bornée, SANS SCRUTATION ---');
  const end = workerSource.indexOf('// --- Pas de résultat dans le budget', start);
  assert.ok(start >= 0 && end > start, "la section d'attente doit rester identifiable");

  const section = workerSource.slice(start, end);
  assert.equal((section.match(/doFetch\('\/wait'/g) ?? []).length, 1);
  assert.doesNotMatch(section, /while\s*\(/, 'aucune boucle de scrutation dans le chemin synchrone');
  assert.doesNotMatch(section, /setTimeout\s*\(/, 'aucun réveil périodique côté Worker');
  assert.doesNotMatch(section, /doFetch\([^\n]*\/result/, 'le Worker ne doit pas interroger /result pendant son attente');
});

test('le Durable Object réveille /wait lors de POST /result', () => {
  assert.match(storeSource, /case 'POST \/wait'/);
  assert.match(storeSource, /private async waitForResult/);
  assert.match(storeSource, /for \(const notify of listeners\) notify\(state\)/);
  assert.match(storeSource, /requetesDO: this\.requestCount\(\)/);
});

test('la fenêtre de débit reste ancrée au premier appel, même après un refus', () => {
  const t0 = 1_000_000;
  let state = advanceRateLimit(undefined, t0);
  for (let i = 1; i < MAX_JOBS_PER_WINDOW; i++) {
    state = advanceRateLimit(state, t0 + i * 100);
  }
  assert.equal(state.allowed, true);
  assert.equal(state.ts, t0);
  assert.equal(state.resetAt, t0 + RATE_WINDOW_MS);

  const refused = advanceRateLimit(state, t0 + 5_000);
  assert.equal(refused.allowed, false);
  assert.equal(refused.ts, t0, 'un refus ne doit pas repousser le début de fenêtre');
  assert.equal(refused.resetAt, t0 + RATE_WINDOW_MS, 'Retry-After doit garder la même échéance');
});

test('la limitation de débit repart proprement après 60 secondes', () => {
  const t0 = 2_000_000;
  const saturated = { n: MAX_JOBS_PER_WINDOW + 50, ts: t0 };
  const next = advanceRateLimit(saturated, t0 + RATE_WINDOW_MS);
  assert.deepEqual(next, {
    n: 1,
    ts: t0 + RATE_WINDOW_MS,
    allowed: true,
    remaining: MAX_JOBS_PER_WINDOW - 1,
    resetAt: t0 + RATE_WINDOW_MS * 2,
  });
});
