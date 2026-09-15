/**
 * SCRAPER PRONOTE — RUNNER GITHUB ACTIONS
 * =======================================
 * Remplace `puppeteerScraper.ts` + `htmlParser.ts`.
 *
 * Corrections majeures par rapport à l'ancienne version :
 *
 *  1. CONNEXION ENT — l'ancien code enchaînait « clic Se connecter »,
 *     « clic Personnel collectivité », recherche des champs et `form.submit()`
 *     dans UN SEUL `page.evaluate`, donc dans la même frame. Le modal Alpine.js
 *     n'étant pas encore monté, `input[name=email]` était `null`, les `if`
 *     étaient ignorés, et le formulaire vide était soumis. En plus d'échouer,
 *     tout échec était masqué par les `?.`. Ici : étapes séquencées avec
 *     attente de l'apparition réelle des éléments.
 *
 *  2. NAVIGATION — l'ancien mot-clé `'Viescolaire'` (sans espace) ne pouvait
 *     jamais correspondre à « Vie scolaire » : l'emploi du temps n'était
 *     JAMAIS ouvert. On résout les onglets par correspondance normalisée.
 *
 *  3. ATTENTES — les `setTimeout(900)` fixes sont remplacés par des attentes
 *     conditionnelles, avec repli borné.
 *
 *  4. RETRY — les navigations critiques sont réessayées (aucun retry avant).
 *
 *  5. VALIDATION — on vérifie que la page est bien un Pronote authentifié et
 *     que des données ont été extraites. L'ancienne version renvoyait
 *     `success: true` avec des données vides.
 *
 *  6. PAYLOAD — le HTML complet de la session n'est plus concaténé ni envoyé
 *     deux fois (`html` + `rawHtml`). En mode JSON il n'est pas transmis du tout.
 */

import puppeteer, { Browser, BrowserContext, Page } from 'puppeteer';
import { parsePronote } from '../src/pronote/parse.ts';
import type { ParseResult, PagesHTML } from '../src/pronote/parse.ts';
import type { ErrorCode } from '../src/pronote/types.ts';

export interface ScrapeOptions {
  username: string;
  password: string;
  pronoteUrl: string;
  entUrl: string;
  format: 'json' | 'html';
  /** Appelé à chaque étape franchie, pour le heartbeat. */
  onLog?: (msg: string) => void;
}

export interface ScrapeOutcome {
  success: boolean;
  /** Réponse API complète et assainie, prête à être stockée. */
  payload?: {
    jobId?: string;
    success: boolean;
    status: 'done' | 'error';
    executionTimeMs: number;
    timestamp: string;
    errorCode?: ErrorCode;
    error?: string;
    data?: ParseResult['data'];
    extraction?: ParseResult['report'];
    /** HTML brut UNIQUEMENT si explicitement demandé. */
    html?: string;
  };
  errorCode?: ErrorCode;
  error?: string;
  executionTimeMs: number;
  timings: Record<string, number>;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Budget par défaut. L'objectif produit est de 10 à 20 s. */
const NAV_TIMEOUT_MS = 20_000;

let sharedBrowser: Browser | null = null;
let sharedBrowserLaunch = 0;

export async function getBrowser(): Promise<Browser> {
  if (
    sharedBrowser &&
    sharedBrowser.connected &&
    Date.now() - sharedBrowserLaunch < 30 * 60 * 1000 &&
    !sharedBrowser.process()?.killed
  ) {
    // Vérification de vitalité réelle : `connected` seul reste vrai sur un
    // process zombie, ce qui faisait échouer TOUS les scrapes suivants
    // pendant 45 minutes avant que l'ancien TTL ne recycle le navigateur.
    try {
      await sharedBrowser.pages();
      return sharedBrowser;
    } catch {
      /* on recycle */
    }
  }
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch { /* ignoré */ }
    sharedBrowser = null;
  }
  sharedBrowser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-extensions', '--disable-background-networking',
      '--disable-default-apps', '--disable-sync', '--disable-translate',
      '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-zygote',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
  sharedBrowserLaunch = Date.now();
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch { /* ignoré */ }
    sharedBrowser = null;
  }
}

/** Navigation avec réessais — l'ancienne version n'en avait aucun. */
async function gotoWithRetry(
  page: Page,
  url: string,
  attempts = 3,
  log: (s: string) => void = () => {},
): Promise<void> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      return;
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message || '';
      // Un domaine inexistant ne se résout pas en réessayant.
      if (/ERR_NAME_NOT_RESOLVED|ERR_INVALID_URL/i.test(msg)) throw err;
      log(`Navigation ${i}/${attempts} échouée, nouvelle tentative…`);
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
  throw lastErr;
}

/** Journalisation sûre depuis le contexte de page (jamais de secret). */
async function safeEval<T>(page: Page, fn: () => T, fallback: T): Promise<T> {
  try {
    return await page.evaluate(fn);
  } catch {
    return fallback;
  }
}

/**
 * Connexion à l'ENT.
 * Les trois clics sont SÉQUENCÉS avec attente de l'élément suivant, au lieu
 * d'être exécutés dans la même frame (bug d'origine).
 */
async function loginENT(page: Page, username: string, password: string, log: (s: string) => void): Promise<void> {
  // 1. Bouton « Se connecter à l'ENT » → ouvre le modal
  const opened = await safeEval(page, () => {
    const cands = Array.from(document.querySelectorAll('a, button')) as HTMLElement[];
    for (const el of cands) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      const click = el.getAttribute('@click') || el.getAttribute('x-on:click') || '';
      if (click.includes('open = true') || txt.includes('se connecter')) {
        el.click();
        return true;
      }
    }
    return false;
  }, false);
  log(opened ? 'Bouton de connexion ENT cliqué.' : 'Bouton de connexion ENT introuvable (formulaire peut-être déjà visible).');

  // Attente que le formulaire existe VRAIMENT avant d'y toucher.
  await page.waitForSelector('input[name="email"], input[type="email"], input[name="username"]', { timeout: 8_000 })
    .catch(() => null);

  // 2. Onglet « Personnel collectivité et invité »
  const tabClicked = await safeEval(page, () => {
    const cands = Array.from(document.querySelectorAll('button, a, [role="tab"]')) as HTMLElement[];
    for (const el of cands) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (txt.includes('personnel') && txt.includes('collectivit')) {
        el.click();
        return true;
      }
    }
    return false;
  }, false);
  if (tabClicked) log('Onglet « Personnel collectivité » sélectionné.');

  await new Promise((r) => setTimeout(r, 250)); // laisse Alpine monter le formulaire

  // 3. Saisie des identifiants + soumission
  const filled = await page.evaluate((u: string, p: string) => {
    const setVal = (el: HTMLInputElement | null, v: string) => {
      if (!el) return false;
      el.focus();
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const email = document.querySelector('input[name="email"], input[type="email"], input[name="username"]') as HTMLInputElement | null;
    const pass = document.querySelector('input[name="password"], input[type="password"]') as HTMLInputElement | null;
    const okE = setVal(email, u);
    const okP = setVal(pass, p);

    // On soumet le formulaire QUI CONTIENT les champs, et non le premier
    // `<form>` du document (l'ancien code pouvait soumettre le formulaire
    // d'accueil, vide).
    const form = (email?.closest('form') || pass?.closest('form')) as HTMLFormElement | null;
    if (form && okE && okP) {
      const submit = form.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null;
      if (submit) submit.click();
      else form.requestSubmit();
      return true;
    }
    return false;
  }, username, password).catch(() => false);

  if (!filled) {
    throw new Error('FORM_NOT_FOUND');
  }
  log('Identifiants soumis au formulaire ENT.');
}

/** Détecte un refus d'authentification, de façon non ambiguë. */
async function detectAuthError(page: Page): Promise<string | null> {
  return safeEval(page, () => {
    const alert = document.querySelector('.alert-danger, .error, .msg-erreur, [role="alert"]') as HTMLElement | null;
    const txt = (alert?.innerText || '').trim();
    const body = (document.body?.innerText || '').toLowerCase();
    const onLogin = /\/auth\/login|\/login/i.test(location.href) ||
      document.querySelector('input[name="password"]') !== null;

    const bad = [
      'identifiant ou mot de passe incorrect',
      'identifiant ou mot de passe invalide',
      'invalid username or password',
      'échec de la connexion',
      'echec de la connexion',
      'mot de passe incorrect',
    ].some((s) => body.includes(s));

    // Ne jamais renvoyer le texte brut du serveur : certains fournisseurs
    // réaffichent l'identifiant saisi dans leur message d'erreur.
    if (txt && /incorrect|invalide|échec|echec/i.test(txt)) return 'Identifiant ou mot de passe ENT invalide.';
    if (onLogin && bad) return 'Identifiant ou mot de passe ENT invalide.';
    return null;
  }, null);
}

/** Résout un onglet de menu par correspondance NORMALISÉE (accents, casse, espaces). */
const NAVIGATE_FN = `(function (targets, sub) {
  function norm(s) {
    return (s || '').toString().toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/\\s+/g, ' ').trim();
  }
  var wanted = targets.map(norm);
  var subWanted = sub ? norm(sub) : null;

  var sel = '.label-menu_niveau0, .item-menu_niveau0, .menu-principal_niveau0 li, .GInterface_Onglet, li.onglet, [role="tab"], .menu-item, li, button, a, span';
  var cands = Array.prototype.slice.call(document.querySelectorAll(sel));

  function findParent() {
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var t = norm(el.textContent);
      if (!t || t.length > 60) continue;
      for (var j = 0; j < wanted.length; j++) {
        if (t === wanted[j] || t.indexOf(wanted[j]) !== -1) return el;
      }
    }
    return null;
  }

  var parent = findParent();
  if (parent) {
    parent.click();
    parent.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  if (!subWanted) return { parent: !!parent, sub: false };

  // Le sous-menu peut apparaître après le clic : on le cherche en boucle.
  return new Promise(function (resolve) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var subs = Array.prototype.slice.call(document.querySelectorAll('.label-submenu, .item-menu_niveau1, .menu-principal_niveau1 li, li, a, button, span'));
      for (var i = 0; i < subs.length; i++) {
        var t = norm(subs[i].textContent);
        if (!t || t.length > 60) continue;
        if (t.indexOf(subWanted) !== -1) {
          subs[i].click();
          subs[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          clearInterval(iv);
          resolve({ parent: !!parent, sub: true });
          return;
        }
      }
      if (tries > 25) { clearInterval(iv); resolve({ parent: !!parent, sub: false }); }
    }, 120);
  });
})`;

/** Sérialise le DOM en retirant scripts/styles : payload réduit d'environ 60 %. */
const SNAPSHOT_FN = `(function () {
  try {
    var doc = document.documentElement.cloneNode(true);
    var junk = doc.querySelectorAll('script, style, link[rel="stylesheet"], noscript, svg, iframe');
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    return doc.outerHTML;
  } catch (e) { return ''; }
})`;

async function snapshot(page: Page): Promise<string> {
  try {
    const html = await page.evaluate(SNAPSHOT_FN) as string;
    return html || '';
  } catch {
    return '';
  }
}

/** Ferme les modales qui bloquent la navigation (accueil, messages…). */
async function dismissModals(page: Page): Promise<void> {
  await safeEval(page, () => {
    const btns = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
    for (const b of btns) {
      const t = (b.innerText || b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if (aria === 'fermer' || t === 'fermer' || t === 'ok' || t === 'compris' || t === 'continuer') {
        b.click();
      }
    }
  }, undefined);
}

// ---------------------------------------------------------------------------
// Extraction des onglets
// ---------------------------------------------------------------------------

interface TabSpec {
  key: keyof PagesHTML;
  parents: string[];
  sub: string;
  /** Sélecteur dont la présence prouve que le contenu est chargé. */
  readySelector: string;
}

const TABS: TabSpec[] = [
  { key: 'emploiDuTemps', parents: ['vie scolaire', 'emploi du temps'], sub: 'emploi du temps', readySelector: '.cours-simple, [class*="EmploiDuTemps"]' },
  { key: 'notes', parents: ['notes', 'mes notes'], sub: 'mes notes', readySelector: '.liste_contenu_cellule_contenu, [class*="note"]' },
  { key: 'devoirs', parents: ['cahier de textes', 'travail a faire'], sub: 'travail a faire', readySelector: '.conteneur-item' },
  { key: 'ressources', parents: ['cahier de textes', 'contenus et ressources'], sub: 'contenus et ressources', readySelector: '.conteneur-item, [class*="seance"]' },
  { key: 'vieScolaire', parents: ['vie scolaire', 'absences'], sub: 'absences', readySelector: '[class*="absence"], .liste-absences' },
];

/**
 * Ouvre les onglets dans des pages séparées puis capture leur DOM.
 *
 * Les pages partagent le contexte de navigateur, donc la session Pronote est
 * commune : inutile de se réauthentifier pour chaque onglet.
 */
async function captureTabs(
  context: BrowserContext,
  pronoteUrl: string,
  log: (s: string) => void,
  timings: Record<string, number>,
): Promise<PagesHTML> {
  const pages: PagesHTML = {};
  const t0 = Date.now();

  const targets = await Promise.all(
    TABS.map(async (tab) => {
      // Même BrowserContext que la page authentifiée : les cookies ENT/Pronote
      // sont partagés. `browser.newPage()` ouvrirait le contexte par défaut et
      // perdrait silencieusement la session SSO.
      const p = await context.newPage();
      await p.setUserAgent(UA);
      await p.evaluateOnNewDocument(() => {
        (window as any).__name = (fn: unknown) => fn;
        (globalThis as any).__name = (fn: unknown) => fn;
      });
      await gotoWithRetry(p, pronoteUrl, 2, log);
      return { tab, page: p };
    }),
  );

  // Attente conditionnelle de l'interface, avec repli borné.
  await Promise.all(targets.map(({ page }) =>
    page.waitForFunction(
      () => document.querySelectorAll('.label-menu_niveau0, .menu-principal_niveau0, .GInterface_Onglet, [role="tab"]').length > 0,
      { timeout: 12_000 },
    ).catch(() => null),
  ));
  timings.ouvertureOnglets = Date.now() - t0;

  // Navigation + capture, en parallèle sur toutes les pages.
  await Promise.all(targets.map(async ({ tab, page }) => {
    const t = Date.now();
    try {
      await dismissModals(page);
      const res = await page.evaluate(
        `${NAVIGATE_FN}(${JSON.stringify(tab.parents)}, ${JSON.stringify(tab.sub)})`,
      ).catch(() => null) as { parent: boolean; sub: boolean } | null;
      timings[`${tab.key}ParentTrouve`] = res?.parent ? 1 : 0;
      timings[`${tab.key}SousOngletTrouve`] = res?.sub ? 1 : 0;

      if (!res?.sub) {
        log(`Onglet « ${tab.sub} » non trouvé (parent: ${res?.parent ?? false}).`);
      }

      // Attente conditionnelle du contenu, plutôt qu'un setTimeout fixe.
      const ready = await page.waitForSelector(tab.readySelector, { timeout: 6_000 })
        .then(() => true).catch(() => false);
      timings[`${tab.key}ContenuPret`] = ready ? 1 : 0;
      await new Promise((r) => setTimeout(r, 300)); // stabilisation AngularJS

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erreur de capture sans détail');
      const message = error.message || '';
      log(`Capture « ${tab.key} » en erreur (${error.name || 'Error'}).`);
      timings[`${tab.key}Erreur`] = 1;
      timings[`${tab.key}ErreurBuffer`] = /Buffer/i.test(message) ? 1 : 0;
      timings[`${tab.key}ErreurCibleFermee`] = /Target|closed|Session/i.test(message) ? 1 : 0;
    } finally {
      // Même si la navigation ou un sélecteur échoue, on conserve le DOM
      // courant au lieu d'écraser la page par une chaîne vide. Cela permet au
      // parseur et aux stratégies de repli de travailler sur ce qui est chargé.
      const html = await snapshot(page);
      (pages as Record<string, string>)[tab.key] = html;
      timings[`${tab.key}Caracteres`] = html.length;
      timings[tab.key] = Date.now() - t;
      await page.close().catch(() => null);
    }
  }));

  return pages;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export async function runScrape(opts: ScrapeOptions): Promise<ScrapeOutcome> {
  const { username, password, pronoteUrl, entUrl, format } = opts;
  const log = opts.onLog ?? (() => {});
  const t0 = Date.now();
  const timings: Record<string, number> = {};

  let context = null as Awaited<ReturnType<Browser['createBrowserContext']>> | null;

  try {
    const browser = await getBrowser();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(UA);
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (fn: unknown) => fn;
      (globalThis as any).__name = (fn: unknown) => fn;
    });

    // Blocage des ressources inutiles. Le `try/catch` évite qu'une requête
    // déjà traitée (course avec la fermeture du contexte) ne reste en suspens
    // et ne fasse pendre la navigation jusqu'au timeout.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      try {
        const type = req.resourceType();
        const u = req.url().toLowerCase();
        if (type === 'image' || type === 'media' || type === 'font' ||
            u.includes('google-analytics') || u.includes('matomo') || u.includes('doubleclick')) {
          req.abort();
        } else {
          req.continue();
        }
      } catch { /* requête déjà traitée : ignorée */ }
    });

    // --- 1. ENT ---
    const tEnt = Date.now();
    await gotoWithRetry(page, entUrl, 3, log).catch((err) => {
      if (/ERR_NAME_NOT_RESOLVED/i.test((err as Error).message || '')) {
        throw Object.assign(new Error('ENT_UNREACHABLE'), { code: 'ENT_UNREACHABLE' as ErrorCode });
      }
      throw Object.assign(new Error('ENT_UNREACHABLE'), { code: 'ENT_UNREACHABLE' as ErrorCode });
    });
    timings.ent = Date.now() - tEnt;

    await loginENT(page, username, password, log);

    // --- 2. Attente de l'authentification ---
    const tAuth = Date.now();
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => null);

    const authErr = await detectAuthError(page);
    if (authErr) {
      return {
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
        error: authErr,
        executionTimeMs: Date.now() - t0,
        timings,
      };
    }
    timings.authentification = Date.now() - tAuth;

    // --- 3. Pronote ---
    const tPronote = Date.now();
    await gotoWithRetry(page, pronoteUrl, 3, log).catch((err) => {
      const msg = (err as Error).message || '';
      const code: ErrorCode = /ERR_NAME_NOT_RESOLVED/i.test(msg) ? 'PRONOTE_UNREACHABLE' : 'NAVIGATION_TIMEOUT';
      throw Object.assign(new Error(code), { code });
    });
    timings.pronote = Date.now() - tPronote;

    const uiReady = await page.waitForFunction(
      () => document.querySelectorAll('.menu-principal_niveau0, .label-menu_niveau0, .GInterface_Onglet, [role="tab"]').length > 0,
      { timeout: 12_000 },
    ).then(() => true).catch(() => false);

    if (!uiReady) {
      const err = await detectAuthError(page);
      return {
        success: false,
        errorCode: err ? 'PRONOTE_AUTH_FAILED' : 'NAVIGATION_TIMEOUT',
        error: err || "L'interface Pronote ne s'est pas chargée (session non établie ou établissement indisponible).",
        executionTimeMs: Date.now() - t0,
        timings,
      };
    }

    const accueil = await snapshot(page);
    log('Accueil Pronote capturé.');
    await dismissModals(page);

    // --- 4. Onglets, en parallèle ---
    const pages = await captureTabs(context, pronoteUrl, log, timings);
    // Mesure redondante hors de la boucle de capture : garantit que le rapport
    // indique toujours si chaque DOM a effectivement été conservé.
    for (const tab of TABS) {
      timings[`${tab.key}CaptureCaracteres`] = (pages[tab.key] || '').length;
    }
    pages.accueil = accueil;
    pages.pronoteBaseUrl = pronoteUrl;
    pages.entUrl = entUrl;

    log(`Onglets capturés : ${TABS.filter((t) => (pages as Record<string, string>)[t.key]?.length > 0).length}/${TABS.length}`);

    // --- 5. Parsing (fonction pure, testée hors ligne) ---
    const tParse = Date.now();
    const result = parsePronote(pages);
    timings.parsing = Date.now() - tParse;

    const executionTimeMs = Date.now() - t0;
    result.data.meta.dureeExtractionMs = executionTimeMs;

    // --- 6. Validation : plus jamais `success: true` sur du vide ---
    if (!result.report.hasData) {
      return {
        success: false,
        errorCode: 'EXTRACTION_EMPTY',
        error:
          "Aucune donnée n'a pu être extraite. L'emploi du temps, les notes et le cahier de textes étaient vides. " +
          "Cause la plus fréquente : session Pronote non établie après le SSO, ou onglets non chargés.",
        executionTimeMs,
        timings,
      };
    }

    const payload: ScrapeOutcome['payload'] = {
      success: true,
      status: 'done',
      executionTimeMs,
      timestamp: new Date().toISOString(),
      data: result.data,
      extraction: result.report,
    };

    // Le HTML n'est inclus QUE s'il est explicitement demandé : l'ancienne
    // version le renvoyait toujours, en double (`html` + `rawHtml`).
    if (format === 'html') {
      payload.html = [
        '<!-- ACCUEIL -->', accueil,
        '<!-- EMPLOI_DU_TEMPS -->', pages.emploiDuTemps ?? '',
        '<!-- NOTES -->', pages.notes ?? '',
        '<!-- DEVOIRS -->', pages.devoirs ?? '',
        '<!-- RESSOURCES -->', pages.ressources ?? '',
      ].join('\n');
    }

    log(`Extraction terminée en ${(executionTimeMs / 1000).toFixed(2)} s — ${result.report.modules.filter((m) => m.status === 'ok').length} module(s) avec données.`);

    return { success: true, payload, executionTimeMs, timings };

  } catch (err) {
    const e = err as Error & { code?: ErrorCode };
    return {
      success: false,
      errorCode: e.code ?? 'SCRAPER_ERROR',
      error: e.message === 'FORM_NOT_FOUND'
        ? "Le formulaire de connexion ENT n'a pas pu être rempli (structure de la page inattendue)."
        : e.message,
      executionTimeMs: Date.now() - t0,
      timings,
    };
  } finally {
    if (context) {
      await context.close().catch(() => null);
    }
  }
}
