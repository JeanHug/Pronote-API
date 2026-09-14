/**
 * TEST LIVE — extraction réelle via l'ENT
 * =======================================
 * Ce script s'exécute DANS un runner GitHub Actions, où les secrets `ENT_ID` et
 * `ENT_PASS` sont disponibles en variables d'environnement. Il ne les affiche
 * jamais, ne les journalise jamais et ne les transmet jamais.
 *
 * Il produit deux rapports :
 *
 *  1. `rapport-public.json` — ASSAINI : statuts des modules, compteurs, durées,
 *     codes d'erreur. Aucun nom, aucune note, aucune URL d'établissement.
 *     Publiable sans risque, y compris sur un dépôt public.
 *
 *  2. `reponse-complete.json` — la réponse API intégrale. Écrit uniquement si le
 *     dépôt est PRIVÉ. Sur un dépôt public, les logs et les artefacts de
 *     workflow sont visibles par tout le monde : y déposer les notes et le nom
 *     d'un élève mineur serait une fuite de données personnelles.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { runScrape, closeBrowser } from '../pronote-standalone-runner/scraper.ts';
import type { ParseResult } from '../src/pronote/parse.ts';

const ENT_ID = process.env.ENT_ID?.trim() || '';
const ENT_PASS = process.env.ENT_PASS || '';
const PRONOTE_URL = process.env.PRONOTE_URL?.trim() || 'https://0771068t.index-education.net/pronote/eleve.html';
const ENT_URL = process.env.ENT_URL?.trim() || 'https://ent.seine-et-marne.fr/';
const API_BASE = process.env.API_BASE?.trim() || '';

function fail(msg: string): never {
  console.error(`ERREUR : ${msg}`);
  process.exit(1);
}

if (!ENT_ID || !ENT_PASS) {
  fail("Les secrets ENT_ID et ENT_PASS doivent être définis dans les secrets du dépôt (Settings → Secrets and variables → Actions).");
}

/**
 * Détermine si le dépôt est privé.
 * Sur un dépôt public, les logs de workflow sont lisibles par n'importe qui.
 */
async function repoEstPrive(): Promise<boolean> {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GITHUB_TOKEN || '';
  if (!repo) return false;

  // `github.event.repository.private` est transmis directement par le workflow.
  if (process.env.REPO_PRIVATE === 'true') return true;
  if (process.env.REPO_PRIVATE === 'false') return false;

  if (!token) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return false;
    const data = await res.json<{ private?: boolean }>();
    return data.private === true;
  } catch {
    return false;
  }
}

/** Rapport ASSAINI : aucune donnée personnelle. */
function rapportPublic(
  success: boolean,
  executionTimeMs: number,
  timings: Record<string, number>,
  data: ParseResult['data'] | undefined,
  report: ParseResult['report'] | undefined,
  errorCode?: string,
  error?: string,
) {
  return {
    horodatage: new Date().toISOString(),
    succes: success,
    dureeTotaleMs: executionTimeMs,
    codeErreur: errorCode ?? null,
    messageErreur: error ?? null,
    modules: (report?.modules ?? []).map((m) => ({
      module: m.module,
      statut: m.status,
      elements: m.itemCount,
    })),
    // Compteurs de volume : utile pour valider que l'extraction est complète,
    // sans révéler aucun contenu personnel.
    volumes: data ? {
      cours: data.emploiDuTemps.totalCours,
      semaines: data.emploiDuTemps.semaines.length,
      notes: data.notes.totalNotes,
      notesComptees: data.notes.totalNotesComptees,
      matieresAvecMoyenne: data.notes.moyennesParMatiere.length,
      devoirs: data.agenda.totalDevoirs,
      devoirsFaits: data.agenda.totalDevoirsFaits,
      devoirsAFaire: data.agenda.totalDevoirsAFaire,
      seances: data.contenusEtRessources.totalRessources,
      matieresAvecRessources: data.contenusEtRessources.parMatiere.length,
      absences: data.vieScolaire.totalAbsences,
      retards: data.vieScolaire.totalRetards,
      evenements: data.agenda.evenements.length,
      competences: data.evaluationsEtCompetences.totalCompetences,
    } : null,
    timingsMs: timings,
  };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  let apiReponse: unknown = null;
  let apiDeployee: { url: string; version: string | null; interface: string } | null = null;
  let resultatDirect: Awaited<ReturnType<typeof runScrape>> | null = null;

  // -------------------------------------------------------------------------
  // 1. Extraction directe (navigateur → ENT → Pronote → parseur)
  // -------------------------------------------------------------------------
  console.log('── Extraction directe ─────────────────────────────');
  console.log(`Cible établissement : ${new URL(PRONOTE_URL).hostname}`);
  console.log(`Identifiant        : ${ENT_ID.slice(0, 2)}${'*'.repeat(Math.min(Math.max(ENT_ID.length - 2, 0), 10))} (masqué)`);
  console.log('');

  resultatDirect = await runScrape({
    username: ENT_ID,
    password: ENT_PASS,
    pronoteUrl: PRONOTE_URL,
    entUrl: ENT_URL,
    format: 'json',
    onLog: (m) => console.log(`  · ${m}`),
  });

  const rapport = rapportPublic(
    resultatDirect.success,
    resultatDirect.executionTimeMs,
    resultatDirect.timings,
    resultatDirect.payload?.data,
    resultatDirect.payload?.extraction,
    resultatDirect.errorCode,
    resultatDirect.error,
  );

  console.log('');
  console.log(`Résultat : ${rapport.succes ? 'SUCCÈS' : 'ÉCHEC'} en ${(rapport.dureeTotaleMs / 1000).toFixed(2)} s`);
  if (rapport.codeErreur) console.log(`Code d'erreur : ${rapport.codeErreur}`);
  if (rapport.messageErreur) console.log(`Message : ${rapport.messageErreur}`);
  console.log('');
  console.log('Modules extraits :');
  for (const m of rapport.modules) {
    const marque = m.statut === 'ok' ? '[ok]  ' : m.statut === 'empty' ? '[vide]' : '[ÉCHEC]';
    console.log(`  ${marque} ${m.module.padEnd(28)} ${m.elements} élément(s)`);
  }

  // -------------------------------------------------------------------------
  // 2. Appel de l'API déployée (si une URL est fournie)
  // -------------------------------------------------------------------------
  if (API_BASE) {
    console.log('');
    console.log('── Appel de l\'API déployée ───────────────────────');
    try {
      const base = API_BASE.replace(/\/$/, '');

      // Quelle version est réellement en ligne ? Le déploiement peut être en
      // retard sur le code : taper sur /api/v1/ d'une API restée en v3 renvoie
      // un 404 trompeur, qui laisserait croire à un bug du client.
      const sonder = async (chemin: string) => {
        try {
          const r = await fetch(`${base}${chemin}`, { signal: AbortSignal.timeout(15_000) });
          return r.ok ? await r.json() as { version?: string } : null;
        } catch { return null; }
      };
      const santeV4 = await sonder('/api/v1/health');
      const santeV3 = santeV4 ? null : await sonder('/api/health');
      const version = santeV4?.version ?? santeV3?.version ?? null;
      const prefixe = santeV4 ? '/api/v1' : '';
      apiDeployee = {
        url: base,
        version,
        interface: santeV4 ? 'v4 (Durable Object)' : santeV3 ? 'v3 (KV, obsolète)' : 'inconnue',
      };
      console.log(`Version en ligne : ${version ?? 'inconnue'} — ${apiDeployee.interface}`);
      if (santeV3) {
        console.log('⚠️  L\'API déployée est une version ANTÉRIEURE au correctif :');
        console.log('   elle utilise encore Cloudflare KV. Les mesures ci-dessous ne');
        console.log('   portent donc PAS sur le code de ce dépôt.');
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);

      const res = await fetch(`${base}${prefixe}/scrape-pronote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Le corps n'est jamais journalisé.
        body: JSON.stringify({
          username: ENT_ID,
          password: ENT_PASS,
          pronoteUrl: PRONOTE_URL,
          entUrl: ENT_URL,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      console.log(`HTTP ${res.status} — durée mesurée côté client : ${((Date.now() - t0) / 1000).toFixed(2)} s`);

      apiReponse = await res.json();

      // En cas de 202, on suit le job jusqu'à obtention du résultat.
      const r = apiReponse as { status?: string; jobId?: string };
      if (res.status === 202 && r.jobId) {
        console.log(`Job ${r.jobId} en cours, suivi automatique…`);
        for (let i = 0; i < 60; i++) {
          await new Promise((x) => setTimeout(x, 3000));
          const jr = await fetch(`${base}${prefixe}/job/${encodeURIComponent(r.jobId)}`, {
            signal: AbortSignal.timeout(20_000),
          });
          if (jr.status !== 202) {
            apiReponse = await jr.json();
            console.log(`Résultat obtenu après ${i + 1} interrogation(s).`);
            break;
          }
        }
      }
    } catch (err) {
      console.log(`Appel API impossible : ${(err as Error).message}`);
      apiReponse = { erreur: (err as Error).message };
    }
  } else {
    console.log('');
    console.log("API_BASE non fourni : test limité à l'extraction directe.");
  }

  // -------------------------------------------------------------------------
  // 3. Écriture des rapports
  // -------------------------------------------------------------------------
  mkdirSync('rapports', { recursive: true });

  writeFileSync(
    'rapports/rapport-public.json',
    JSON.stringify({
      ...rapport,
      apiDeployee,
      reponseApi: apiReponse ? assainirReponseApi(apiReponse) : null,
    }, null, 2),
    'utf8',
  );

  const prive = await repoEstPrive();
  if (prive) {
    writeFileSync(
      'rapports/reponse-complete.json',
      JSON.stringify({
        apiDeployee,
        reponseApi: apiReponse,
        extractionDirecte: resultatDirect.payload ?? null,
      }, null, 2),
      'utf8',
    );
    console.log('');
    console.log('Rapport complet écrit (dépôt privé).');
  } else {
    console.log('');
    console.log('⚠️  Dépôt public : le rapport complet n\'est PAS écrit.');
    console.log('   Les logs et artefacts de workflow d\'un dépôt public sont visibles par tout le monde.');
    console.log('   Pour récupérer la réponse intégrale, passez le dépôt en privé, ou lancez le runner en local.');
  }

  console.log('');
  console.log(`Test terminé en ${((Date.now() - t0) / 1000).toFixed(2)} s.`);

  await closeBrowser();
  process.exit(resultatDirect.success ? 0 : 1);
}

/** Retire toute donnée d'élève d'une réponse API avant publication. */
function assainirReponseApi(reponse: unknown): unknown {
  if (!reponse || typeof reponse !== 'object') return reponse;
  const r = reponse as Record<string, any>;
  const out: Record<string, any> = {
    jobId: r.jobId ?? null,
    success: r.success ?? null,
    status: r.status ?? null,
    executionTimeMs: r.executionTimeMs ?? null,
    errorCode: r.errorCode ?? null,
    error: r.error ?? null,
    statusUrl: r.statusUrl ?? null,
  };
  if (r.extraction) {
    out.extraction = {
      hasData: r.extraction.hasData,
      modules: (r.extraction.modules ?? []).map((m: any) => ({
        module: m.module, status: m.status, itemCount: m.itemCount,
      })),
      missingModules: r.extraction.missingModules ?? [],
      timingsMs: r.extraction.timingsMs ?? {},
      engineVersion: r.extraction.engineVersion ?? null,
    };
  }
  if (r.data) {
    out.volumes = {
      cours: r.data.emploiDuTemps?.totalCours ?? 0,
      notes: r.data.notes?.totalNotes ?? 0,
      devoirs: r.data.agenda?.totalDevoirs ?? 0,
      seances: r.data.contenusEtRessources?.totalRessources ?? 0,
    };
  }
  return out;
}

main().catch(async (err) => {
  console.error(`Échec du test : ${err.message}`);
  await closeBrowser().catch(() => null);
  process.exit(1);
});
