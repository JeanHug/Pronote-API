import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { CookieJar } from 'tough-cookie';
import { ApiError, assertNoCredentials, emptyData, safeFailure, VERSION, type Credentials, type ExtractionResult, type ModuleName, type ModuleReport, type Person } from './contracts';
import { parseTimetable, parseGrades, parseAssignments, parseResources, parseEntries } from './parsers';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const allowedHost = (host: string) => host === 'ent.seine-et-marne.fr' || host === 'ent77.seine-et-marne.fr' || /^[a-z0-9-]+\.index-education\.net$/i.test(host);
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Extraire toutes les rubriques demandées EN PARALLÈLE.
 *
 * Chaque rubrique obtient SON propre contexte navigateur (Son propre espace de
 * session Pronote). Toutes les pages Pronote s'ouvrent donc en même temps, la
 * latence totale tend vers le module le plus lent au lieu de la somme des huit.
 * Les contextes sont indépendants : les sessions AngularJS ne se bloquent pas
 * mutuellement, contrairement à des onglets parallèles partageant une session.
 */

async function authenticate(input: Credentials, signal: AbortSignal) {
  const jar = new CookieJar();
  async function request(url: string, init: RequestInit = {}): Promise<{ body: string; status: number }> {
    for (let count = 0; count < 10; count++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !allowedHost(target.hostname) || target.port) throw new ApiError('UNSUPPORTED_REDIRECT', 502, 'ent', 'Redirection ENT hors des domaines autorisés.');
      const headers = new Headers(init.headers);
      headers.set('User-Agent', UA);
      headers.set('Cookie', await jar.getCookieString(url));
      const response = await fetch(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
      for (const cookie of response.headers.getSetCookie()) await jar.setCookie(cookie, url);
      const location = response.headers.get('location');
      if (location && response.status >= 300 && response.status < 400) {
        const next = new URL(location, url);
        if ([307, 308].includes(response.status) && next.origin !== target.origin && init.body) throw new ApiError('UNSAFE_REDIRECT', 502, 'ent', 'Une redirection avec identifiants a été bloquée.');
        url = next.href;
        if (![307, 308].includes(response.status)) init = {};
        await response.body?.cancel();
        continue;
      }
      const body = await response.text();
      if (body.length > 2_000_000) throw new ApiError('UPSTREAM_TOO_LARGE', 502, 'ent', 'Réponse ENT anormalement volumineuse.');
      return { body, status: response.status };
    }
    throw new ApiError('REDIRECT_LIMIT', 502, 'ent', 'Trop de redirections ENT.');
  }
  // Pas de pré-lecture de la page d'accueil ENT : le formulaire POSTé ne
  // requiert aucun cookie ni jeton CSRF. Un aller-retour HTTP économisé.
  await request('https://ent77.seine-et-marne.fr/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://ent.seine-et-marne.fr', Referer: 'https://ent.seine-et-marne.fr/' },
    body: new URLSearchParams({ email: input.username, password: input.password }),
  });
  const session = await request('https://ent77.seine-et-marne.fr/auth/oauth2/userinfo');
  let user: Record<string, unknown>;
  try { user = JSON.parse(session.body) as Record<string, unknown>; } catch { throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'La connexion ENT n’a pas été confirmée. Vérifiez les identifiants ou les exigences de double authentification.'); }
  if (session.status !== 200 || !user.userId) throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'L’ENT n’a pas accepté cette connexion.');
  if (user.forceChangePassword || user.needRevalidateTerms) throw new ApiError('ENT_ACTION_REQUIRED', 409, 'ent', 'Une action est requise sur le portail ENT : mot de passe ou conditions d’utilisation.');
  const firstName = typeof user.firstName === 'string' ? user.firstName : '';
  const lastName = typeof user.lastName === 'string' ? user.lastName : '';
  const person: Person = { nomComplet: `${firstName} ${lastName}`.trim(), prenom: firstName, nom: lastName, classe: Array.isArray(user.classNames) && typeof user.classNames[0] === 'string' ? user.classNames[0] : null, etablissement: Array.isArray(user.structureNames) && typeof user.structureNames[0] === 'string' ? user.structureNames[0] : null };
  return { jar, person };
}

const navigation: Record<ModuleName, { parent: string[]; sub: string[]; selector: string; scope: string }> = {
  emploiDuTemps: { parent: ['Vie scolaire', 'Emploi du temps'], sub: ['Emploi du temps'], selector: '.cours-simple', scope: 'Semaine affichée par Pronote' },
  notes: { parent: ['Notes'], sub: ['Mes notes'], selector: '.note-devoir', scope: 'Période sélectionnée par Pronote' },
  agenda: { parent: ['Cahier de textes'], sub: ['Travail à faire'], selector: '.conteneur-item .titre-matiere', scope: 'Travail à faire chargé dans la vue Pronote' },
  ressources: { parent: ['Cahier de textes'], sub: ['Contenus et ressources'], selector: '.conteneur-item', scope: 'Séances chargées dans la vue Pronote' },
  vieScolaire: { parent: ['Vie scolaire'], sub: ['Carnet', 'Absences'], selector: '.liste_contenu_cellule_contenu,.conteneur-item', scope: 'Carnet affiché par Pronote' },
  competences: { parent: ['Compétences'], sub: ['Mes évaluations'], selector: '.liste_contenu_cellule_contenu,.conteneur-item', scope: 'Évaluations affichées par Pronote' },
  actualites: { parent: ['Communication'], sub: ['Informations & sondages', 'Informations et sondages'], selector: '.conteneur-item,.liste_contenu_cellule_contenu', scope: 'Liste des informations, sans marquage de lecture' },
  cantine: { parent: ['Vie scolaire', 'Informations personnelles'], sub: ['Menus', 'Menu de la cantine'], selector: '.conteneur-item,[class*="menu-repas"]', scope: 'Menus affichés par Pronote' },
};

/** Marqueurs d'état vide REELLEMENT affichés par Pronote. */
// Restreint aux formulations d'état vide de listes Pronote — les bandeaux
// « Pas de cours aujourd'hui » de l'accueil ne doivent PAS provoquer un faux
// « empty » sur un onglet en cours de chargement.
const EMPTY_RE = /aucun(?:e)?\s+(?:note|devoir|travail|cours|absence|retard|punition|sanction|[eé]valuation|actualit[eé]|information|r[eé]sultat)|aucun\s+[eé]l[eé]ment|aucune\s+donn[eé]e/i;

async function selectModule(page: Page, module: ModuleName): Promise<boolean> {
  const spec = navigation[module];
  return page.evaluate(({ parent, sub }) => {
    const norm = (s: string | null) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '').toLowerCase();
    const roots = Array.from(document.querySelectorAll<HTMLElement>('.item-menu_niveau0'));
    const root = roots.find(el => parent.some(name => norm(el.querySelector('.label-menu_niveau0')?.textContent || '') === norm(name)));
    if (!root) return false;
    const child = Array.from(root.querySelectorAll<HTMLElement>('.label-submenu')).find(el => sub.some(name => norm(el.textContent) === norm(name)));
    if (!child) return false;
    child.click();
    return true;
  }, { parent: spec.parent, sub: spec.sub });
}

interface InjectionCookie { name: string; value: string; domain: string; path: string; secure?: boolean; httpOnly?: boolean }

async function preparePage(context: BrowserContext, input: Credentials): Promise<Page> {
  const page = await context.newPage();
  await page.setUserAgent(UA);
  await page.evaluateOnNewDocument('globalThis.__name = (fn) => fn;');
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.isInterceptResolutionHandled()) return;
    try {
      const url = new URL(request.url());
      const blocked = (url.protocol !== 'https:' && url.protocol !== 'data:' && url.protocol !== 'blob:') || (url.protocol === 'https:' && !allowedHost(url.hostname)) || ['image', 'media', 'font'].includes(request.resourceType());
      void (blocked ? request.abort() : request.continue()).catch(() => {});
    } catch { void request.abort().catch(() => {}); }
  });
  await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  // Dès que le menu applicatif est rendu, la navigation par libellé est
  // possible : inutile d'attendre l'initialisation complète de la SPA.
  await page.waitForFunction(() => document.querySelectorAll('.item-menu_niveau0').length >= 3, { timeout: 10000, polling: 100 });
  return page;
}

type ModuleOutcome = {
  module: ModuleName; report: ModuleReport;
  html: string | null;
};

async function captureModule(browser: Browser, module: ModuleName, input: Credentials, cookies: InjectionCookie[], signal: AbortSignal): Promise<ModuleOutcome> {
  const spec = navigation[module];
  const started = Date.now();
  let context: BrowserContext | undefined;
  signal.throwIfAborted();
  try {
    context = await browser.createBrowserContext();
    if (cookies.length) await context.setCookie(...cookies);
    const page = await preparePage(context, input);
    if (!await selectModule(page, module)) {
      return { module, report: { module, status: 'unavailable', count: 0, durationMs: Date.now() - started, scope: spec.scope, code: 'TAB_UNAVAILABLE' }, html: null };
    }
    // Attente STRICTEMENT séquentielle en deux temps : d'abord le contenu, et
    // seulement ensuite (en repli) la recherche d'un état vide. Cela élimine la
    // course où un message de l'écran précédent provoque un faux « empty ».
    const foundItems = await page.waitForSelector(spec.selector, { timeout: 3500 })
      .then(() => true)
      .catch(() => false);

    if (foundItems) {
      await pause(150); // stabilisation minimale du DOM
      const html = await page.content();
      const count = await page.evaluate((sel: string) => document.querySelectorAll(sel).length, spec.selector);
      if (count > 0) {
        return { module, report: { module, status: 'ok', count, durationMs: Date.now() - started, scope: spec.scope }, html };
      }
    }

    // Repli : la rubrique est vide SEULEMENT si le message d'état vide est
    // explicitement affiché après navigation
    const empty = await page.evaluate((re: string) => {
      const txt = (document.body?.innerText || '').slice(0, 50000);
      return new RegExp(re, 'i').test(txt);
    }, EMPTY_RE.source);

    const html = await page.content();
    if (empty) {
      return { module, report: { module, status: 'empty', count: 0, durationMs: Date.now() - started, scope: spec.scope }, html: null };
    }
    return { module, report: { module, status: 'error', count: 0, durationMs: Date.now() - started, scope: spec.scope, code: 'CONTENT_NOT_CONFIRMED' }, html };
  } finally {
    await context?.close().catch(() => {});
  }
}

async function bounded<T>(ms: number, code: string, run: () => Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new ApiError(code, 504, 'bounded', 'Délai dépassé pour cette étape.')), ms);
      }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}

export async function extractPronote(input: Credentials, progress: (stage: string) => void = () => {}): Promise<ExtractionResult> {
  const started = Date.now();
  const authentication = { ent: false, pronote: false };
  const controller = new AbortController();
  let browser: Browser | undefined;
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); void browser?.close().catch(() => {}); }, 90000);
  let stage = 'ent';
  try {
    // Authentification ENT et démarrage du navigateur EN PARALLÈLE :
    // les deux sont indépendants jusqu'à l'injection des cookies.
    progress('ent+browser');
    const [auth, launched] = await Promise.all([
      authenticate(input, controller.signal),
      puppeteer.launch({
        headless: true,
        timeout: 20000,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--disable-background-timer-throttling', '--no-first-run', '--hide-scrollbars'],
        defaultViewport: { width: 1440, height: 1050 },
      }),
    ]);
    const { jar, person } = auth;
    browser = launched;
    authentication.ent = true;

    // Les cookies ENT sont injectés dans CHAQUE contexte : chaque page ouvre
    // sa propre session SSO, donc toutes peuvent charger Pronote simultanément.
    const rawCookies = await jar.getCookies('https://ent77.seine-et-marne.fr/');
    const cookies: InjectionCookie[] = rawCookies.map(c => ({ name: c.key, value: c.value, domain: c.domain || '.ent77.seine-et-marne.fr', path: c.path || '/', secure: c.secure, httpOnly: c.httpOnly }));

    stage = 'pronote-parallel';
    progress(stage);

    const fullData = emptyData(person);
    const outcomes = await Promise.all(input.modules.map(module =>
      bounded(60000, 'MODULE_TIMEOUT', () => captureModule(browser!, module, input, cookies, controller.signal))
        .catch((err): ModuleOutcome => ({
          module,
          report: { module, status: 'error', count: 0, durationMs: Date.now() - started, scope: navigation[module].scope, code: err instanceof ApiError ? err.code : 'MODULE_FAILED' },
          html: null,
        }))
    ));
    authentication.pronote = outcomes.some(o => o.report.status !== 'unavailable' || o.html !== null);

    const reports: ModuleReport[] = [];
    for (const outcome of outcomes) {
      const { module, report, html } = outcome;
      let count = 0;
      if (module === 'emploiDuTemps') { const parsed = html ? parseTimetable(html) : []; fullData.emploiDuTemps = { cours: parsed, totalCours: parsed.length }; count = parsed.length; }
      else if (module === 'notes') { const parsed = html ? parseGrades(html) : { evaluations: [], periode: null, moyenneGenerale: null }; fullData.notes = { ...parsed, totalNotes: parsed.evaluations.length }; count = parsed.evaluations.length; }
      else if (module === 'agenda') { const parsed = html ? parseAssignments(html, input.pronoteUrl) : []; fullData.agenda = { devoirs: parsed, totalDevoirs: parsed.length }; count = parsed.length; }
      else if (module === 'ressources') { const parsed = html ? parseResources(html, input.pronoteUrl) : []; fullData.ressources = { seances: parsed, totalSeances: parsed.length }; count = parsed.length; }
      else if (['vieScolaire', 'competences', 'actualites', 'cantine'].includes(module)) {
        const parsed = html ? parseEntries(html, navigation[module].selector, module) : [];
        fullData[module as 'vieScolaire' | 'competences' | 'actualites' | 'cantine'] = { elements: parsed };
        count = parsed.length;
      }
      // Le statut réel vient du PARSING, pas seulement de la présence du sélecteur.
      let status = report.status;
      if (count > 0) status = 'ok';
      else if (status === 'ok') status = report.code ? 'error' : 'error';
      reports.push({ ...report, status, count });
    }

    const extracted = reports.some(m => m.status === 'ok');
    const readable = reports.some(m => m.status === 'ok' || m.status === 'empty');
    const success = readable;
    const partial = reports.some(m => m.status === 'error' || m.status === 'unavailable');
    const result: ExtractionResult = {
      version: VERSION,
      success,
      status: success ? (partial ? 'partial' : 'done') : 'error',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - started,
      authentication,
      modules: reports,
      data: fullData,
      ...(!success ? { error: { code: 'EXTRACTION_EMPTY', message: 'Aucun module demandé n’a pu être lu de façon vérifiable.', stage: 'parsing' } } : {}),
    };
    if (!extracted && !reports.some(m => m.status === 'empty')) result.success = false;
    assertNoCredentials(result);
    if (input.password.length >= 4 && JSON.stringify(result).includes(input.password)) throw new ApiError('UNSAFE_RESULT', 500, 'serialization', 'Un contenu sensible a été bloqué.');
    return result;
  } catch (error) {
    const err = timedOut
      ? new ApiError('EXTRACTION_TIMEOUT', 504, stage, 'L’extraction a dépassé 90 secondes.')
      : error instanceof ApiError
        ? error
        : new ApiError('UPSTREAM_ERROR', 502, stage, 'Le traitement a été interrompu à cette étape. Aucun détail de connexion n’est exposé.');
    return safeFailure(err, Date.now() - started, authentication);
  } finally {
    clearTimeout(deadline);
    controller.abort();
    await browser?.close().catch(() => {});
  }
}
