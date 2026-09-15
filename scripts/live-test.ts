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
 *  2. `reponse-complete.json` — la réponse API intégrale, octet pour octet.
 *     Écrit uniquement si le dépôt est privé OU si `PUBLIER_REPONSE=oui` a été
 *     choisi explicitement. Sur un dépôt public, ce choix rend les données
 *     scolaires visibles publiquement : le workflow dédié l'annonce avant de
 *     publier, et ne journalise jamais leur contenu.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { runScrape, closeBrowser } from '../pronote-standalone-runner/scraper.ts';
import type { ParseResult } from '../src/pronote/parse.ts';

const ENT_ID = process.env.ENT_ID?.trim() || '';
const ENT_PASS = process.env.ENT_PASS || '';
const PRONOTE_URL = process.env.PRONOTE_URL?.trim() || 'https://0771068t.index-education.net/pronote/eleve.html';
const ENT_URL = process.env.ENT_URL?.trim() || 'https://ent.seine-et-marne.fr/';
const API_BASE = process.env.API_BASE?.trim() || '';
const PUBLIER_REPONSE = (process.env.PUBLIER_REPONSE || '').trim().toLowerCase() === 'oui';

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
    // Le message brut peut provenir du SSO et réafficher l'identifiant. Le
    // rapport public conserve uniquement le fait qu'un détail était présent.
    messageErreur: error ? 'Détail d’erreur masqué dans le rapport public.' : null,
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
  let apiReponseBrute: string | null = null;
  let resultatDirect: Awaited<ReturnType<typeof runScrape>> | null = null;

  // -------------------------------------------------------------------------
  // 1. Extraction directe (navigateur → ENT → Pronote → parseur)
  // -------------------------------------------------------------------------
  console.log('── Extraction directe ─────────────────────────────');
  console.log(`Cible établissement : ${new URL(PRONOTE_URL).hostname}`);
  // Aucun identifiant n'est affiché, même tronqué, masqué ou haché.
  console.log('Identifiants       : fournis par l’environnement sécurisé (non affichés)');
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
  // Le détail d'erreur peut provenir d'un fournisseur SSO et n'est jamais
  // journalisé : certains réaffichent l'identifiant saisi.
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

    const base = API_BASE.replace(/\/$/, '');

    // GARDE-FOU CRITIQUE : la v3 publiait le job complet, mot de passe inclus,
    // dans un commentaire d'issue publique. Aucun POST /scrape n'est effectué
    // tant que la signature v4 + Durable Object n'est pas prouvée.
    const healthRes = await fetch(`${base}/api/v1/health`);
    const healthText = await healthRes.text();
    let health: { version?: string; storage?: string } = {};
    try { health = JSON.parse(healthText) as typeof health; } catch { /* contrôlé ci-dessous */ }
    if (
      !healthRes.ok ||
      health.version !== '4.0.0' ||
      health.storage !== 'Durable Object SQLite (KV supprimé)'
    ) {
      throw new Error('API_NON_V4 : appel /scrape interdit pour empêcher toute publication d’identifiants par l’ancienne passerelle.');
    }
    console.log('Passerelle vérifiée : v4.0.0, stockage Durable Object SQLite.');

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);

      const res = await fetch(`${base}/api/v1/scrape-pronote`, {
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

      apiReponseBrute = await res.text();
      apiReponse = JSON.parse(apiReponseBrute) as unknown;

      // En cas de 202, on suit le job jusqu'à obtention du résultat.
      const r = apiReponse as { status?: string; jobId?: string };
      if (res.status === 202 && r.jobId) {
        console.log('Job API en cours, suivi automatique…');
        let termine = false;
        for (let i = 0; i < 300; i++) {
          await new Promise((x) => setTimeout(x, 3000));
          const jr = await fetch(`${base}/api/v1/job/${encodeURIComponent(r.jobId)}`);
          if (jr.status !== 202) {
            apiReponseBrute = await jr.text();
            apiReponse = JSON.parse(apiReponseBrute) as unknown;
            console.log(`Résultat obtenu après ${i + 1} interrogation(s).`);
            termine = true;
            break;
          }
        }
        if (!termine) throw new Error('Le job API est resté en cours pendant 15 minutes.');
      }
    } catch (err) {
      console.log(`Appel API impossible : ${(err as Error).message}`);
      apiReponse = { erreur: (err as Error).message };
      apiReponseBrute = JSON.stringify(apiReponse, null, 2);
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
    JSON.stringify({ ...rapport, reponseApi: apiReponse ? assainirReponseApi(apiReponse) : null }, null, 2),
    'utf8',
  );

  const prive = await repoEstPrive();
  if (prive || PUBLIER_REPONSE) {
    // Le fichier contient EXACTEMENT la réponse de l'API déployée, sans
    // enveloppe ni reformulation. Il n'est jamais envoyé comme artefact public :
    // le workflow le découpe directement en commentaires si cela a été autorisé.
    const contenuComplet = apiReponseBrute
      ?? JSON.stringify(apiReponse ?? resultatDirect.payload ?? null, null, 2);
    writeFileSync('rapports/reponse-complete.json', contenuComplet, 'utf8');
    console.log('');
    console.log(prive
      ? 'Réponse API complète écrite (dépôt privé).'
      : '⚠️  Publication publique explicitement autorisée : réponse API complète prête à être publiée.');
  } else {
    console.log('');
    console.log('Dépôt public : seule la version assainie est produite (PUBLIER_REPONSE ≠ oui).');
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
    error: r.error ? 'Détail d’erreur masqué dans le rapport public.' : null,
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
