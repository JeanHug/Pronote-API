import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { CookieJar } from 'tough-cookie';
import { ApiError, assertNoCredentials, emptyData, safeFailure, VERSION, type Credentials, type ExtractionResult, type ModuleName, type ModuleReport, type Person, type PronoteData } from './contracts';
import { parseTimetable, parseGrades, parseAssignments, parseResources, parseEntries } from './parsers';
import { loginEduConnect } from './educonnect';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EMPTY_HINT = 'aucun(?:e)? (?:note|devoir|travail|cours|absence|retard|punition|sanction|evaluation|évaluation|information|menu|element|élément)|pas de (?:note|travail|cours|devoir)|aucun element|aucun élément';
const CORE: ModuleName[] = ['emploiDuTemps', 'notes', 'agenda', 'ressources'];
const allowedHost = (host: string) => host === 'ent.seine-et-marne.fr' || host === 'ent77.seine-et-marne.fr' || /^[a-z0-9-]+\.index-education\.net$/i.test(host);

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

let sharedBrowser: Browser | undefined;
let sharedBrowserAt = 0;

export async function closeSharedBrowser(): Promise<void> {
  const current = sharedBrowser;
  sharedBrowser = undefined;
  sharedBrowserAt = 0;
  await current?.close().catch(() => {});
}

async function ensureBrowser(): Promise<Browser> {
  if (sharedBrowser && Date.now() - sharedBrowserAt < 25 * 60_000) {
    try {
      await sharedBrowser.pages();
      return sharedBrowser;
    } catch { await closeSharedBrowser(); }
  }
  sharedBrowser = await puppeteer.launch({
    headless: true,
    timeout: 12000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--mute-audio', '--no-first-run'],
    defaultViewport: { width: 1280, height: 900 },
  });
  sharedBrowserAt = Date.now();
  return sharedBrowser;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

async function authenticate(input: Credentials, signal: AbortSignal) {
  const jar = new CookieJar();
  async function request(url: string, init: RequestInit = {}): Promise<{ body: string; status: number }> {
    for (let count = 0; count < 10; count++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !allowedHost(target.hostname) || target.port) throw new ApiError('UNSUPPORTED_REDIRECT', 502, 'ent', 'Redirection ENT hors des domaines autorisés.');
      const headers = new Headers(init.headers);
      headers.set('User-Agent', UA);
      headers.set('Cookie', await jar.getCookieString(url));
      const response = await fetch(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
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
  await request('https://ent.seine-et-marne.fr/');
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
  return {
    jar,
    person: {
      nomComplet: `${firstName} ${lastName}`.trim(),
      prenom: firstName,
      nom: lastName,
      classe: Array.isArray(user.classNames) && typeof user.classNames[0] === 'string' ? user.classNames[0] : null,
      etablissement: Array.isArray(user.structureNames) && typeof user.structureNames[0] === 'string' ? user.structureNames[0] : null,
    } satisfies Person,
  };
}

async function attachCookies(context: BrowserContext, jar: CookieJar) {
  const seen = new Set<string>();
  const packed = [];
  for (const origin of ['https://ent77.seine-et-marne.fr/', 'https://ent.seine-et-marne.fr/']) {
    for (const cookie of await jar.getCookies(origin)) {
      const key = `${cookie.key}|${cookie.domain}|${cookie.path}`;
      if (seen.has(key) || !cookie.domain) continue;
      seen.add(key);
      packed.push({ name: cookie.key, value: cookie.value, domain: cookie.domain, path: cookie.path || '/', secure: cookie.secure, httpOnly: cookie.httpOnly });
    }
  }
  if (packed.length) await context.setCookie(...packed);
}

async function preparePage(context: BrowserContext, lean = true): Promise<Page> {
  const page = await context.newPage();
  await page.setUserAgent(UA);
  await page.evaluateOnNewDocument('globalThis.__name = (fn) => fn;');
  if (lean) {
    const session = await page.createCDPSession();
    await session.send('Network.enable');
    await session.send('Network.setBlockedURLs', { urls: ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.woff', '*.woff2', '*.ttf', '*.mp4', '*.mp3'] });
  }
  return page;
}

async function waitPronoteReady(page: Page, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const w = window as unknown as { GApplication?: { parametresUtilisateur?: unknown }; GEtatUtilisateur?: { Identification?: unknown } };
      return !!w.GApplication?.parametresUtilisateur && !!w.GEtatUtilisateur?.Identification && document.querySelectorAll('.item-menu_niveau0').length >= 3;
    }, { timeout });
    return true;
  } catch { return false; }
}

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

function applyHtml(module: ModuleName, html: string, data: PronoteData, pronoteUrl: string): number {
  const spec = navigation[module];
  if (module === 'emploiDuTemps') { const cours = parseTimetable(html); data.emploiDuTemps = { cours, totalCours: cours.length }; return cours.length; }
  if (module === 'notes') { const grades = parseGrades(html); data.notes = { ...grades, totalNotes: grades.evaluations.length }; return grades.evaluations.length; }
  if (module === 'agenda') { const devoirs = parseAssignments(html, pronoteUrl); data.agenda = { devoirs, totalDevoirs: devoirs.length }; return devoirs.length; }
  if (module === 'ressources') { const seances = parseResources(html, pronoteUrl); data.ressources = { seances, totalSeances: seances.length }; return seances.length; }
  const elements = parseEntries(html, spec.selector, module);
  data[module as 'vieScolaire' | 'competences' | 'actualites' | 'cantine'] = { elements };
  return elements.length;
}

function failedReport(module: ModuleName, started: number): ModuleReport {
  return { module, status: 'error', count: 0, durationMs: Date.now() - started, scope: navigation[module].scope, code: 'CONTENT_NOT_CONFIRMED' };
}

async function captureModule(page: Page, module: ModuleName, data: PronoteData, pronoteUrl: string, timeoutMs: number): Promise<ModuleReport> {
  const started = Date.now();
  const spec = navigation[module];
  if (!await selectModule(page, module)) {
    return { module, status: 'unavailable', count: 0, durationMs: Date.now() - started, scope: spec.scope, code: 'TAB_UNAVAILABLE' };
  }
  const state = await page.waitForFunction((selector: string, hint: string) => {
    if (document.querySelector(selector)) return 'ready';
    return new RegExp(hint, 'i').test(document.body?.innerText || '') ? 'empty' : false;
  }, { timeout: timeoutMs }, spec.selector, EMPTY_HINT).then(handle => handle.jsonValue() as Promise<'ready' | 'empty'>).catch(() => null);
  const html = await page.content();
  const count = applyHtml(module, html, data, pronoteUrl);
  const emptyHint = state === 'empty' || (count === 0 && await page.evaluate((hint: string) => new RegExp(hint, 'i').test(document.body?.innerText || ''), EMPTY_HINT));
  return {
    module,
    status: count > 0 ? 'ok' : emptyHint ? 'empty' : 'error',
    count,
    durationMs: Date.now() - started,
    scope: spec.scope,
    ...(count === 0 && !emptyHint ? { code: 'CONTENT_NOT_CONFIRMED' } : {}),
  };
}

export async function extractPronote(input: Credentials, progress: (stage: string) => void = () => {}): Promise<ExtractionResult> {
  const started = Date.now();
  const authentication: ExtractionResult['authentication'] = { ent: false, pronote: false, provider: input.provider };
  const controller = new AbortController();
  let context: BrowserContext | undefined;
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); void context?.close().catch(() => {}); }, 45000);
  let stage = 'ent';
  try {
    progress(input.provider);
    const browserReady = ensureBrowser();
    const entAuth = input.provider === 'educonnect' ? null : authenticate(input, controller.signal);
    await browserReady;
    const browser = await ensureBrowser();
    context = await browser.createBrowserContext();
    const session = context;
    let person: Person = { nomComplet: '', prenom: '', nom: '', classe: null, etablissement: null };
    if (input.provider === 'educonnect') {
      stage = 'educonnect';
      const login = await preparePage(session, false);
      try { person = await loginEduConnect(login, input); }
      finally { await login.close().catch(() => {}); }
    } else {
      stage = 'ent';
      const auth = await entAuth;
      if (!auth) throw new ApiError('INTERNAL_ERROR', 500, 'ent', 'Authentification ENT non préparée.');
      person = auth.person;
      await attachCookies(session, auth.jar);
    }
    authentication.ent = true;
    authentication.provider = input.provider;

    stage = 'pronote';
    progress(stage);
    const data = emptyData(person);
    const reports = new Map<ModuleName, ModuleReport>();
    const pages = await Promise.all(input.modules.map(() => preparePage(session)));
    try {
      await Promise.all(pages.map(page => page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })));
      const ready = await Promise.all(pages.map(page => waitPronoteReady(page, 7000)));
      if (!ready.some(Boolean) || pages.every(page => new URL(page.url()).hostname !== new URL(input.pronoteUrl).hostname)) {
        throw new ApiError('PRONOTE_AUTH_FAILED', 401, 'pronote', 'La session ENT est valide mais l’espace élève Pronote n’a pas été ouvert.');
      }
      authentication.pronote = true;
      progress('modules');
      await Promise.all(input.modules.map(async (module, index) => {
        const begun = Date.now();
        const page = pages[index];
        if (!ready[index]) {
          reports.set(module, failedReport(module, begun));
          return;
        }
        reports.set(module, await withTimeout(captureModule(page, module, data, input.pronoteUrl, 1600), 3500, failedReport(module, begun)));
      }));
      const fallback = pages.find((_, index) => ready[index]);
      if (fallback) {
        for (const module of input.modules) {
          const report = reports.get(module);
          if (report && CORE.includes(module) && report.status === 'error') {
            reports.set(module, await withTimeout(captureModule(fallback, module, data, input.pronoteUrl, 1600), 2500, report));
          }
        }
      }
    } finally {
      await Promise.all(pages.map(page => page.close().catch(() => {})));
    }

    const ordered = input.modules.map(module => reports.get(module)).filter((report): report is ModuleReport => Boolean(report));
    const extracted = ordered.some(m => m.status === 'ok');
    const readable = ordered.some(m => m.status === 'ok' || m.status === 'empty');
    const partial = ordered.some(m => m.status === 'error' || m.status === 'unavailable');
    const result: ExtractionResult = {
      version: VERSION,
      success: readable,
      status: readable ? (partial ? 'partial' : 'done') : 'error',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - started,
      authentication: { ...authentication, provider: input.provider },
      modules: ordered,
      data,
      ...(!readable ? { error: { code: 'EXTRACTION_EMPTY', message: 'Aucun module demandé n’a pu être lu de façon vérifiable.', stage: 'parsing' } } : {}),
    };
    if (!extracted && !ordered.some(m => m.status === 'empty')) result.success = false;
    assertNoCredentials(result);
    if (input.password.length >= 4 && JSON.stringify(result).includes(input.password)) throw new ApiError('UNSAFE_RESULT', 500, 'serialization', 'Un contenu sensible a été bloqué.');
    return result;
  } catch (error) {
    const err = timedOut
      ? new ApiError('EXTRACTION_TIMEOUT', 504, stage, 'L’extraction a dépassé 45 secondes.')
      : error instanceof ApiError ? error : new ApiError('UPSTREAM_ERROR', 502, stage, 'Le traitement a été interrompu à cette étape. Aucun détail de connexion n’est exposé.');
    return safeFailure(err, Date.now() - started, authentication);
  } finally {
    clearTimeout(deadline);
    controller.abort();
    await context?.close().catch(() => {});
  }
}
