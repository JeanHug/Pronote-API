import puppeteer, { type Browser, type Page } from 'puppeteer';
import { CookieJar } from 'tough-cookie';
import { ApiError, assertNoCredentials, emptyData, safeFailure, VERSION, type Credentials, type ExtractionResult, type ModuleName, type ModuleReport, type Person } from './contracts';
import { parseTimetable, parseGrades, parseAssignments, parseResources, parseEntries } from './parsers';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const allowedHost = (host: string) => host === 'ent.seine-et-marne.fr' || host === 'ent77.seine-et-marne.fr' || /^[a-z0-9-]+\.index-education\.net$/i.test(host);
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

export async function extractPronote(input: Credentials, progress: (stage: string) => void = () => {}): Promise<ExtractionResult> {
  const started = Date.now();
  const authentication = { ent: false, pronote: false };
  const controller = new AbortController();
  let browser: Browser | undefined;
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); void browser?.close().catch(() => {}); }, 150000);
  let stage = 'ent';
  try {
    progress('ent');
    const { jar, person } = await authenticate(input, controller.signal);
    authentication.ent = true;
    stage = 'browser';
    progress(stage);
    browser = await puppeteer.launch({ headless: true, timeout: 20000, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling'], defaultViewport: { width: 1440, height: 1050 } });
    const context = await browser.createBrowserContext();
    const cookies = await jar.getCookies('https://ent77.seine-et-marne.fr/');
    await context.setCookie(...cookies.map(c => ({ name: c.key, value: c.value, domain: c.domain!, path: c.path || '/', secure: c.secure, httpOnly: c.httpOnly })));
    const page = await context.newPage();
    await page.setUserAgent(UA);
    // tsx/esbuild can reference __name in serialized functions; never depend on page globals.
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
    stage = 'pronote'; progress(stage);
    await page.goto(input.pronoteUrl, { waitUntil: 'networkidle2', timeout: 40000 });
    await page.waitForFunction(() => {
      const w = window as unknown as { GApplication?: { parametresUtilisateur?: unknown }; GEtatUtilisateur?: { Identification?: unknown } };
      return !!w.GApplication?.parametresUtilisateur && !!w.GEtatUtilisateur?.Identification && document.querySelectorAll('.item-menu_niveau0').length >= 3;
    }, { timeout: 15000 }).catch(() => { throw new ApiError('PRONOTE_AUTH_FAILED', 401, 'pronote', 'La session ENT est valide mais l’espace élève Pronote n’a pas été ouvert.'); });
    if (new URL(page.url()).hostname !== new URL(input.pronoteUrl).hostname) throw new ApiError('PRONOTE_AUTH_FAILED', 401, 'pronote', 'La redirection SSO n’a pas abouti sur Pronote.');
    authentication.pronote = true;
    const data = emptyData(person);
    const reports: ModuleReport[] = [];
    for (const module of input.modules) {
      controller.signal.throwIfAborted();
      stage = module; progress(stage);
      const t = Date.now(); const spec = navigation[module];
      if (!await selectModule(page, module)) {
        reports.push({ module, status: 'unavailable', count: 0, durationMs: Date.now()-t, scope: spec.scope, code: 'TAB_UNAVAILABLE' }); continue;
      }
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 3000 }).catch(() => {});
      await pause(650);
      await page.waitForSelector(spec.selector, { timeout: 4000 }).catch(() => {});
      // REAL DOM serialization. No uncalled function strings, screenshots, or persisted HTML.
      const html = await page.content();
      let count = 0;
      if (module === 'emploiDuTemps') { const cours = parseTimetable(html); data.emploiDuTemps = { cours, totalCours: cours.length }; count=cours.length; }
      if (module === 'notes') { const grades=parseGrades(html); data.notes={...grades,totalNotes:grades.evaluations.length};count=grades.evaluations.length; }
      if (module === 'agenda') { const devoirs=parseAssignments(html,input.pronoteUrl);data.agenda={devoirs,totalDevoirs:devoirs.length};count=devoirs.length; }
      if (module === 'ressources') { const seances=parseResources(html,input.pronoteUrl);data.ressources={seances,totalSeances:seances.length};count=seances.length; }
      if (['vieScolaire','competences','actualites','cantine'].includes(module)) {
        const elements=parseEntries(html,spec.selector,module);
        data[module as 'vieScolaire'|'competences'|'actualites'|'cantine']={elements}; count=elements.length;
      }
      const emptyConfirmed = count === 0 && await page.evaluate(() => /aucun(?:e)? (?:note|devoir|travail|cours|absence|retard|punition|sanction|evaluation|évaluation|information|menu|element|élément)|pas de (?:note|travail|cours|devoir)|aucun element|aucun élément/i.test(document.body.innerText));
      reports.push({ module, status: count>0?'ok':emptyConfirmed?'empty':'error', count, durationMs:Date.now()-t, scope:spec.scope, ...(count===0&&!emptyConfirmed?{code:'CONTENT_NOT_CONFIRMED'}:{}) });
    }
    const extracted = reports.some(m=>m.status==='ok');
    const readable = reports.some(m=>m.status==='ok'||m.status==='empty');
    const success = readable;
    const partial = reports.some(m=>m.status==='error'||m.status==='unavailable');
    const result: ExtractionResult = { version:VERSION,success,status:success?(partial?'partial':'done'):'error',timestamp:new Date().toISOString(),durationMs:Date.now()-started,authentication,modules:reports,data,...(!success?{error:{code:'EXTRACTION_EMPTY',message:'Aucun module demandé n’a pu être lu de façon vérifiable.',stage:'parsing'}}:{}) };
    if (!extracted && !reports.some(m=>m.status==='empty')) result.success=false;
    assertNoCredentials(result);
    // Do not permit an upstream echo of the submitted password in a result.
    if (input.password.length >= 4 && JSON.stringify(result).includes(input.password)) throw new ApiError('UNSAFE_RESULT',500,'serialization','Un contenu sensible a été bloqué.');
    return result;
  } catch (error) {
    const err = timedOut ? new ApiError('EXTRACTION_TIMEOUT',504,stage,'L’extraction a dépassé 150 secondes.') : error instanceof ApiError ? error : new ApiError('UPSTREAM_ERROR',502,stage,'Le traitement a été interrompu à cette étape. Aucun détail de connexion n’est exposé.');
    return safeFailure(err,Date.now()-started,authentication);
  } finally {
    clearTimeout(deadline);controller.abort();
    await browser?.close().catch(()=>{});
  }
}
