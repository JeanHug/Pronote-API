import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { ApiError, assertNoCredentials, emptyData, safeFailure, VERSION, type Credentials, type ExtractionResult, type ModuleName, type ModuleReport, type Person, type PronoteData } from './contracts';
import { parseTimetable, parseGrades, parseAssignments, parseResources, parseEntries } from './parsers';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EMPTY_HINT = 'aucun(?:e)? (?:note|devoir|travail|cours|absence|retard|punition|sanction|evaluation|évaluation|information|menu|element|élément)|pas de (?:note|travail|cours|devoir)|aucun element|aucun élément';
const CORE: ModuleName[] = ['emploiDuTemps', 'notes', 'agenda', 'ressources'];
const allowedHost = (host: string) =>
  host === 'ent.seine-et-marne.fr' ||
  host === 'ent77.seine-et-marne.fr' ||
  host === 'educonnect.education.gouv.fr' ||
  host === 'assistance.phm.education.gouv.fr' ||
  /^[a-z0-9-]+\.index-education\.net$/i.test(host);

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

async function ensureBrowser(proxyUrl?: string): Promise<Browser> {
  if (sharedBrowser && !proxyUrl && Date.now() - sharedBrowserAt < 30 * 60_000) {
    try {
      await sharedBrowser.pages();
      return sharedBrowser;
    } catch { await closeSharedBrowser(); }
  }
  const args = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--mute-audio', '--no-first-run',
    '--disable-extensions', '--disable-component-update',
  ];
  if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`);
  const b = await puppeteer.launch({
    headless: true,
    timeout: 10000,
    args,
    defaultViewport: { width: 1280, height: 900 },
  });
  if (!proxyUrl) {
    sharedBrowser = b;
    sharedBrowserAt = Date.now();
  }
  return b;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

function extractPerson(user: Record<string, unknown>): Person {
  const firstName = typeof user.firstName === 'string' ? user.firstName : '';
  const lastName = typeof user.lastName === 'string' ? user.lastName : '';
  return {
    nomComplet: `${firstName} ${lastName}`.trim(),
    prenom: firstName,
    nom: lastName,
    classe: Array.isArray(user.classNames) && typeof user.classNames[0] === 'string' ? user.classNames[0] : null,
    etablissement: Array.isArray(user.structureNames) && typeof user.structureNames[0] === 'string' ? user.structureNames[0] : null,
  };
}

/** Fast HTTP requester with cookie jar */
function createHttpAgent(jar: CookieJar, signal: AbortSignal) {
  return async function request(url: string, init: RequestInit = {}): Promise<{ body: string; status: number; finalUrl: string }> {
    let currentUrl = url;
    for (let count = 0; count < 12; count++) {
      const target = new URL(currentUrl);
      if (target.protocol !== 'https:' || !allowedHost(target.hostname) || target.port) {
        throw new ApiError('UNSUPPORTED_REDIRECT', 502, 'ent', 'Redirection ENT hors des domaines autorisés.');
      }
      const headers = new Headers(init.headers);
      headers.set('User-Agent', UA);
      headers.set('Cookie', await jar.getCookieString(currentUrl));
      const response = await fetch(currentUrl, {
        ...init,
        headers,
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
      for (const cookie of response.headers.getSetCookie()) await jar.setCookie(cookie, currentUrl);
      const location = response.headers.get('location');
      if (location && response.status >= 300 && response.status < 400) {
        const next = new URL(location, currentUrl);
        if ([307, 308].includes(response.status) && next.origin !== target.origin && init.body) {
          throw new ApiError('UNSAFE_REDIRECT', 502, 'ent', 'Une redirection avec identifiants a été bloquée.');
        }
        currentUrl = next.href;
        if (![307, 308].includes(response.status)) init = {};
        await response.body?.cancel();
        continue;
      }
      const body = await response.text();
      return { body, status: response.status, finalUrl: currentUrl };
    }
    throw new ApiError('REDIRECT_LIMIT', 502, 'ent', 'Trop de redirections ENT.');
  };
}

/** Local ENT77 Authentication (fast, direct HTTP form) */
async function authenticateLocal(input: Credentials, signal: AbortSignal, jar: CookieJar): Promise<Person> {
  const request = createHttpAgent(jar, signal);
  await request('https://ent.seine-et-marne.fr/');
  await request('https://ent77.seine-et-marne.fr/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://ent.seine-et-marne.fr', Referer: 'https://ent.seine-et-marne.fr/' },
    body: new URLSearchParams({ email: input.username, password: input.password }),
  });
  const session = await request('https://ent77.seine-et-marne.fr/auth/oauth2/userinfo');
  let user: Record<string, unknown>;
  try { user = JSON.parse(session.body) as Record<string, unknown>; } catch {
    throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'La connexion ENT n’a pas été confirmée. Vérifiez vos identifiants.');
  }
  if (session.status !== 200 || !user.userId) {
    throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'Identifiant ou mot de passe ENT incorrect.');
  }
  if (user.forceChangePassword || user.needRevalidateTerms) {
    throw new ApiError('ENT_ACTION_REQUIRED', 409, 'ent', 'Une action est requise sur le portail ENT : mot de passe ou conditions d’utilisation.');
  }
  return extractPerson(user);
}

/** EduConnect SAML Authentication (supporting both student & parent profiles) */
async function authenticateEduConnect(input: Credentials, signal: AbortSignal, jar: CookieJar): Promise<Person> {
  const request = createHttpAgent(jar, signal);
  const isParent = input.authMode === 'educonnect_parent';
  const startEndpoint = isParent
    ? 'https://ent77.seine-et-marne.fr/auth/saml/authn/relative'
    : 'https://ent77.seine-et-marne.fr/auth/saml/authn/student';

  // 1. Initiate SAML Request on ENT77 -> redirects to EduConnect
  const samlInit = await request(startEndpoint);

  // Check if EduConnect WAF redirected to "assistance" (VPN / foreign / datacenter IP block)
  if (samlInit.finalUrl.includes('assistance.phm.education.gouv.fr') || samlInit.body.includes('accès perturbé') || samlInit.body.includes('difficultés techniques')) {
    throw new ApiError(
      'EDUCONNECT_GEOBLOCKED',
      403,
      'ent',
      'EduConnect a bloqué la connexion (accès perturbé : IP hébergeur/VPN détectée par le Ministère). Utilisez le mode local ENT77 ou fournissez vos cookies ENT dans sessionCookie.'
    );
  }

  // 2. Parse EduConnect login page HTML
  const $edu = cheerio.load(samlInit.body);
  const formAction = $edu('form').first().attr('action') || samlInit.finalUrl;
  const actionUrl = new URL(formAction, samlInit.finalUrl).href;

  // Extract hidden inputs (csrf_token, SAMLRequest, RelayState if present)
  const formFields: Record<string, string> = {};
  $edu('form input[type="hidden"]').each((_, el) => {
    const name = $edu(el).attr('name');
    const val = $edu(el).attr('value') || '';
    if (name) formFields[name] = val;
  });

  // EduConnect credential field names: j_username & j_password
  formFields['j_username'] = input.username;
  formFields['j_password'] = input.password;
  formFields['_eventId_proceed'] = '';

  // 3. Submit EduConnect credentials
  const eduLogin = await request(actionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: samlInit.finalUrl },
    body: new URLSearchParams(formFields),
  });

  if (eduLogin.finalUrl.includes('assistance.phm.education.gouv.fr')) {
    throw new ApiError('EDUCONNECT_GEOBLOCKED', 403, 'ent', 'EduConnect a bloqué la connexion suite au filtrage réseau PHM.');
  }

  // Check if login failed on EduConnect
  if (eduLogin.body.includes('Identifiant ou mot de passe incorrect') || eduLogin.body.includes('Erreur d\'authentification') || eduLogin.body.includes('j_username')) {
    throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'Identifiant ou mot de passe EduConnect incorrect.');
  }

  // 4. EduConnect returns a page with auto-submitting SAMLResponse form to ENT77 ACS
  const $samlResp = cheerio.load(eduLogin.body);
  const samlResponseVal = $samlResp('input[name="SAMLResponse"]').val();
  const relayStateVal = $samlResp('input[name="RelayState"]').val();
  const acsUrl = $samlResp('form').first().attr('action') || 'https://ent77.seine-et-marne.fr/auth/saml/post/sso/';

  if (!samlResponseVal) {
    throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'ent', 'EduConnect n’a pas retourné d’assertion SAML valide.');
  }

  // 5. Post SAMLResponse back to ENT77 Assertion Consumer Service
  await request(new URL(acsUrl, eduLogin.finalUrl).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: eduLogin.finalUrl },
    body: new URLSearchParams({
      SAMLResponse: String(samlResponseVal),
      ...(relayStateVal ? { RelayState: String(relayStateVal) } : {}),
    }),
  });

  // 6. Verify authenticated session on ENT77
  const session = await request('https://ent77.seine-et-marne.fr/auth/oauth2/userinfo');
  let user: Record<string, unknown>;
  try { user = JSON.parse(session.body) as Record<string, unknown>; } catch {
    throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'Session EduConnect non confirmée sur ENT77.');
  }
  if (session.status !== 200 || !user.userId) {
    throw new ApiError('ENT_AUTH_FAILED', 401, 'ent', 'Échec de finalisation de la session EduConnect sur ENT77.');
  }
  return extractPerson(user);
}

/** Unified Authenticator: supports Direct Cookies, Local ENT77, EduConnect and Auto-detection */
async function authenticate(input: Credentials, signal: AbortSignal): Promise<{ jar: CookieJar; person: Person; activeMode: Credentials['authMode'] }> {
  const jar = new CookieJar();

  // If caller provided session cookie directly: inject and skip login (instant ~100ms)
  if (input.sessionCookie) {
    const cookies = input.sessionCookie.split(';').map(s => s.trim()).filter(Boolean);
    for (const c of cookies) {
      await jar.setCookie(c, 'https://ent77.seine-et-marne.fr/').catch(() => {});
      await jar.setCookie(c, 'https://ent.seine-et-marne.fr/').catch(() => {});
    }
    const request = createHttpAgent(jar, signal);
    const session = await request('https://ent77.seine-et-marne.fr/auth/oauth2/userinfo').catch(() => null);
    if (session && session.status === 200) {
      try {
        const u = JSON.parse(session.body) as Record<string, unknown>;
        if (u.userId) return { jar, person: extractPerson(u), activeMode: input.authMode };
      } catch { /* proceed */ }
    }
  }

  // If explicit EduConnect requested
  if (input.authMode === 'educonnect' || input.authMode === 'educonnect_eleve' || input.authMode === 'educonnect_parent') {
    const person = await authenticateEduConnect(input, signal, jar);
    return { jar, person, activeMode: input.authMode };
  }

  // If explicit Local ENT77 requested
  if (input.authMode === 'local') {
    const person = await authenticateLocal(input, signal, jar);
    return { jar, person, activeMode: 'local' };
  }

  // Auto mode: try Local ENT77 first (instant), with fallback to EduConnect
  try {
    const person = await authenticateLocal(input, signal, jar);
    return { jar, person, activeMode: 'local' };
  } catch (localErr) {
    // If local failed with auth error, try EduConnect
    if (localErr instanceof ApiError && (localErr.code === 'ENT_AUTH_FAILED' || localErr.code === 'INVALID_CREDENTIALS')) {
      try {
        const person = await authenticateEduConnect(input, signal, jar);
        return { jar, person, activeMode: 'educonnect_eleve' };
      } catch (eduErr) {
        // If EduConnect was geoblocked, throw the clean geoblock notice; otherwise throw auth failed
        if (eduErr instanceof ApiError && eduErr.code === 'EDUCONNECT_GEOBLOCKED') throw eduErr;
        throw localErr;
      }
    }
    throw localErr;
  }
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

async function preparePage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setUserAgent(UA);
  await page.evaluateOnNewDocument('globalThis.__name = (fn) => fn;');
  const session = await page.createCDPSession();
  await session.send('Network.enable');
  await session.send('Network.setBlockedURLs', {
    urls: [
      '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.svg', '*.ico',
      '*.woff', '*.woff2', '*.ttf', '*.eot', '*.mp4', '*.mp3',
      '*analytics*', '*matomo*', '*google-analytics*', '*xiti*', '*doubleclick*'
    ]
  });
  return page;
}

async function waitPronoteReady(page: Page, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const w = window as unknown as { GApplication?: { parametresUtilisateur?: unknown }; GEtatUtilisateur?: { Identification?: unknown } };
      return !!w.GApplication?.parametresUtilisateur && !!w.GEtatUtilisateur?.Identification && document.querySelectorAll('.item-menu_niveau0').length >= 3;
    }, { timeout, polling: 50 });
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
  }, { timeout: timeoutMs, polling: 50 }, spec.selector, EMPTY_HINT).then(handle => handle.jsonValue() as Promise<'ready' | 'empty'>).catch(() => null);
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
  const authentication = { ent: false, pronote: false, authMode: input.authMode };
  const controller = new AbortController();
  let context: BrowserContext | undefined;
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); void context?.close().catch(() => {}); }, 35000);
  let stage = 'ent';
  try {
    progress('ent');
    // Fast path: HTTP authentication and browser instance prepare in parallel
    const [auth] = await Promise.all([
      authenticate(input, controller.signal),
      ensureBrowser(input.proxyUrl)
    ]);
    authentication.ent = true;
    authentication.authMode = auth.activeMode;
    stage = 'browser';
    progress(stage);

    const browser = await ensureBrowser(input.proxyUrl);
    context = await browser.createBrowserContext();
    await attachCookies(context, auth.jar);

    stage = 'pronote';
    progress(stage);

    const data = emptyData(auth.person);
    const reports = new Map<ModuleName, ModuleReport>();

    // Open parallel tabs (up to 4 concurrent pages) for lightning-fast multi-rubric extraction
    const parallelism = Math.min(4, Math.max(1, input.modules.length));
    const pages = await Promise.all(Array.from({ length: parallelism }, () => preparePage(context!)));

    try {
      // Parallel navigate to Pronote
      await Promise.all(pages.map(page => page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 8000 })));
      const ready = await Promise.all(pages.map(page => waitPronoteReady(page, 6000)));

      if (!ready.some(Boolean) || pages.every(page => new URL(page.url()).hostname !== new URL(input.pronoteUrl).hostname)) {
        throw new ApiError('PRONOTE_AUTH_FAILED', 401, 'pronote', 'La session ENT est valide mais l’espace élève Pronote n’a pas pu s’ouvrir.');
      }
      authentication.pronote = true;
      progress('modules');

      // Distribute modules across parallel pages
      const buckets: ModuleName[][] = Array.from({ length: parallelism }, () => []);
      input.modules.forEach((module, index) => buckets[index % parallelism].push(module));

      await Promise.all(buckets.map(async (mods, index) => {
        const page = pages[index];
        if (!ready[index]) {
          for (const module of mods) reports.set(module, failedReport(module, Date.now()));
          return;
        }
        for (const module of mods) {
          reports.set(module, await withTimeout(captureModule(page, module, data, input.pronoteUrl, 1200), 2200, failedReport(module, Date.now())));
        }
      }));

      // Rapid single-page fallback for any core module that raced
      const fallback = pages.find((_, index) => ready[index]);
      if (fallback) {
        for (const module of input.modules) {
          const report = reports.get(module);
          if (report && CORE.includes(module) && report.status === 'error') {
            reports.set(module, await withTimeout(captureModule(fallback, module, data, input.pronoteUrl, 1400), 2000, report));
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
      authentication,
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
      ? new ApiError('EXTRACTION_TIMEOUT', 504, stage, 'L’extraction a dépassé 35 secondes.')
      : error instanceof ApiError ? error : new ApiError('UPSTREAM_ERROR', 502, stage, 'Le traitement a été interrompu à cette étape. Aucun détail de connexion n’est exposé.');
    return safeFailure(err, Date.now() - started, authentication);
  } finally {
    clearTimeout(deadline);
    controller.abort();
    await context?.close().catch(() => {});
  }
}
