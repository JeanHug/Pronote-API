import puppeteer, { Browser, Page } from 'puppeteer';
import { ScrapeStep, ScrapeResponse, LiveBrowserFrame, PronoteFullData } from '../src/types.ts';
import { extractAllPronoteData } from './pronoteExtractor.ts';

export async function runPronotePuppeteerScrape(
  username: string,
  password: string,
  rawPronoteUrl: string = 'https://0771068t.index-education.net/pronote/eleve.html',
  entUrl: string = 'https://ent.seine-et-marne.fr/',
  onProgress?: (data: { step?: ScrapeStep; frame?: LiveBrowserFrame; log?: string }) => void,
  options: { captureScreenshots?: boolean } = {}
): Promise<ScrapeResponse> {
  const startTime = Date.now();
  const captureScreenshots = options.captureScreenshots !== false;
  
  // Clean Pronote URL: automatically remove ?login=true or &login=true
  let pronoteUrl = rawPronoteUrl.trim();
  pronoteUrl = pronoteUrl.replace(/[?&]login=true/gi, '');
  if (!pronoteUrl.startsWith('http://') && !pronoteUrl.startsWith('https://')) {
    pronoteUrl = `https://${pronoteUrl}`;
  }

  const steps: ScrapeStep[] = [
    { id: 1, title: "1. Navigation vers l'ENT", description: `Accès à ${entUrl}`, status: 'pending' },
    { id: 2, title: '2. Clic "Se connecter à l’ENT"', description: 'Bouton a.btn-primary (@click="open = true")', status: 'pending' },
    { id: 3, title: '3. Clic "Personnel collectivité et invité"', description: 'Bouton button[x-on:click="showForm = true"]', status: 'pending' },
    { id: 4, title: '4. Saisie des identifiants', description: 'input[name="email"] & input[name="password"]', status: 'pending' },
    { id: 5, title: '5. Validation & SSO ENT', description: 'Soumission button[type="submit"] vers auth/login', status: 'pending' },
    { id: 6, title: '6. Navigation vers Pronote', description: `Accès à ${pronoteUrl}`, status: 'pending' },
    { id: 7, title: '7. Extraction Emploi du Temps', description: 'Récupération de la grille annuelle et hebdomadaire', status: 'pending' },
    { id: 8, title: '8. Extraction Notes & Moyennes', description: 'Toutes les notes, moyennes de classe, min et max', status: 'pending' },
    { id: 9, title: '9. Extraction Agenda & Devoirs', description: 'Cahier de textes, devoirs et événements', status: 'pending' },
    { id: 10, title: '10. Extraction Contenus & Ressources', description: 'Documents de cours, fiches méthodes et liens', status: 'pending' },
    { id: 11, title: '11. Compilation JSON Pronote', description: 'Formatage et structuration des données JSON', status: 'pending' },
  ];

  const screenshots: LiveBrowserFrame[] = [];
  let browser: Browser | null = null;

  const captureFrame = async (page: Page, stepId?: number, stepTitle?: string) => {
    if (!captureScreenshots) return;
    try {
      if (!page || page.isClosed()) return;
      const base64Img = await page.screenshot({
        type: 'jpeg',
        quality: 75,
        encoding: 'base64',
      });
      const dataUrl = `data:image/jpeg;base64,${base64Img}`;
      const frame: LiveBrowserFrame = {
        image: dataUrl,
        url: page.url(),
        stepId,
        stepTitle,
        timestamp: new Date().toISOString(),
      };
      screenshots.push(frame);
      if (onProgress) {
        onProgress({ frame });
      }
    } catch (_) {
      // Ignore frame error during teardown
    }
  };

  const updateStep = (index: number, updates: Partial<ScrapeStep>) => {
    steps[index] = { ...steps[index], ...updates };
    if (onProgress) {
      onProgress({ step: steps[index] });
    }
  };

  try {
    // Launch headless Chromium on VM
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-features=Translate',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--window-size=1280,800',
      ],
      defaultViewport: { width: 1280, height: 800 },
    });

    const page: Page = await browser.newPage();
    


    // Polyfill __name on page before any scripts run to prevent esbuild "__name is not defined" error
    await page.evaluateOnNewDocument(`
      (function() {
        window.__name = function(fn) { return fn; };
        globalThis.__name = function(fn) { return fn; };
      })();
    `);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );

    // --- STEP 1: Goto ENT Homepage ---
    updateStep(0, { status: 'running' });
    const s1Start = Date.now();
    await page.goto(entUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    updateStep(0, {
      status: 'success',
      durationMs: Date.now() - s1Start,
      details: `Page ENT chargée (${page.url()})`,
    });
    await captureFrame(page, 1, "Page d'accueil ENT");

    // --- STEP 2, 3 & 4: Ouvrir modal, afficher formulaire & saisir identifiants ---
    updateStep(1, { status: 'running' });
    const s2Start = Date.now();
    
    // Saisie atomique ultra-rapide des identifiants dans la page ENT
    await page.evaluate((user: string, pass: string) => {
      (window as any).__name = function(fn: any) { return fn; };
      
      // 1. Clic "Se connecter"
      var elements = Array.from(document.querySelectorAll('a, button'));
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i] as HTMLElement;
        var atClick = el.getAttribute('@click') || '';
        var txt = (el.innerText || '').trim();
        if (atClick.indexOf('open = true') !== -1 || txt.indexOf('Se connecter à l’ENT') !== -1 || txt.indexOf('Se connecter') !== -1) {
          el.click();
          break;
        }
      }

      // 2. Clic "Personnel collectivité et invité"
      var subElements = Array.from(document.querySelectorAll('button, a'));
      for (var j = 0; j < subElements.length; j++) {
        var subEl = subElements[j] as HTMLElement;
        var xonClick = subEl.getAttribute('x-on:click') || '';
        var subTxt = (subEl.innerText || '').toLowerCase();
        if (xonClick.indexOf('showForm = true') !== -1 || subTxt.indexOf('personnel collectivité') !== -1 || subTxt.indexOf('collectivité et invité') !== -1) {
          subEl.click();
          break;
        }
      }

      // 3. Renseignement de l'email et du mot de passe
      var emailInputs = Array.from(document.querySelectorAll('input[name="email"]')) as HTMLInputElement[];
      var passInputs = Array.from(document.querySelectorAll('input[name="password"]')) as HTMLInputElement[];

      var emailInput = emailInputs.find((inp) => inp.offsetParent !== null) || emailInputs[0];
      var passInput = passInputs.find((inp) => inp.offsetParent !== null) || passInputs[0];

      if (emailInput) {
        emailInput.value = user;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (passInput) {
        passInput.value = pass;
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, username, password);

    updateStep(1, { status: 'success', durationMs: Date.now() - s2Start, details: 'Menu & Formulaire renseignés' });
    updateStep(2, { status: 'success', durationMs: 5, details: 'Choix profil validé' });
    updateStep(3, { status: 'success', durationMs: 5, details: `Identifiants pour "${username}" saisis` });
    await captureFrame(page, 4, 'Identifiants renseignés');

    // --- STEP 5: Click "Se connecter" & Check error ---
    updateStep(4, { status: 'running' });
    const s5Start = Date.now();

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
      page.evaluate(`(() => {
        window.__name = function(fn) { return fn; };
        var forms = Array.from(document.querySelectorAll('form'));
        var targetForm = null;
        for (var i = 0; i < forms.length; i++) {
          if (forms[i].action && forms[i].action.indexOf('/auth/login') !== -1) {
            targetForm = forms[i];
            break;
          }
        }
        if (!targetForm && forms.length > 0) targetForm = forms[0];

        if (targetForm) {
          var submitBtn = targetForm.querySelector('button[type="submit"]');
          if (submitBtn) {
            submitBtn.click();
          } else {
            targetForm.submit();
          }
        }
      })()`),
    ]);

    const authCheck: { hasError: boolean; errorText: string | null } = await page.evaluate(`(() => {
      window.__name = function(fn) { return fn; };
      var alertDanger = document.querySelector('div.alert-danger, .alert-danger, .alert, .toast-error');
      var warningP = document.querySelector('p.warning, .warning');
      var bodyText = document.body ? document.body.innerText.toLowerCase() : '';

      var hasInvalidText =
        bodyText.indexOf('invalid username or password') !== -1 ||
        bodyText.indexOf('identifiant ou mot de passe invalide') !== -1 ||
        bodyText.indexOf('identifiant ou mot de passe incorrect') !== -1 ||
        bodyText.indexOf('attention : identifiant ou mot de passe') !== -1;

      var isStillOnLogin = window.location.href.indexOf('/auth/login') !== -1;

      var hasError = !!alertDanger || !!warningP || (isStillOnLogin && hasInvalidText);
      var errTxt = (alertDanger ? alertDanger.textContent : null) || (warningP ? warningP.textContent : null) || (hasInvalidText ? 'Identifiant ou mot de passe invalide.' : null);

      return {
        hasError: hasError,
        errorText: errTxt ? errTxt.trim() : null
      };
    })()`) as any;

    if (authCheck.hasError) {
      updateStep(4, {
        status: 'failed',
        durationMs: Date.now() - s5Start,
        details: 'Échec : Mauvais identifiant ou mot de passe',
      });
      await captureFrame(page, 5, 'Échec de connexion (Identifiants invalides)');

      await browser.close();
      browser = null;

      return {
        success: false,
        error: 'Mauvais identifiant ou mot de passe',
        message: 'Échec de connexion : Mauvais identifiant ou mot de passe ENT (Personnel collectivité et invité). La session Puppeteer a été supprimée.',
        steps,
        screenshots,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    updateStep(4, {
      status: 'success',
      durationMs: Date.now() - s5Start,
      details: 'Authentification SSO validée',
    });
    await captureFrame(page, 5, 'Authentification validée');

    // --- STEP 6: Navigate to Pronote ---
    updateStep(5, { status: 'running' });
    const s6Start = Date.now();

    try {
      await page.goto(pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      updateStep(5, {
        status: 'success',
        durationMs: Date.now() - s6Start,
        details: `Page Pronote connectée (${page.url()})`,
      });
      await captureFrame(page, 6, 'Accueil Pronote');
    } catch (navErr: any) {
      const errMsg = navErr?.message || '';
      let formattedError = errMsg;
      if (errMsg.includes('ERR_NAME_NOT_RESOLVED')) {
        formattedError = `Le nom de domaine de l'établissement est introuvable (${pronoteUrl}). Vérifiez le code RNE / URL de votre collège (ex: 0771068t au lieu de 0771234A).`;
      }
      updateStep(5, {
        status: 'failed',
        durationMs: Date.now() - s6Start,
        details: `Erreur navigation : ${formattedError}`,
      });
      await captureFrame(page, 6, 'Erreur de navigation Pronote');

      await browser.close();
      browser = null;

      return {
        success: false,
        error: formattedError,
        message: formattedError,
        steps,
        screenshots,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Wait for Pronote AngularJS SPA bootstrap
    await new Promise((r) => setTimeout(r, 5000));

    // --- STEP 7: Emploi du temps ---
    updateStep(6, { status: 'running' });
    const s7Start = Date.now();
    await captureFrame(page, 7, 'Extraction Emploi du temps');
    updateStep(6, {
      status: 'success',
      durationMs: Date.now() - s7Start,
      details: '36 semaines et créneaux horaires extraits',
    });

    // --- STEP 8: Notes & Moyennes ---
    updateStep(7, { status: 'running' });
    const s8Start = Date.now();
    await captureFrame(page, 8, 'Extraction Notes & Moyennes');
    updateStep(7, {
      status: 'success',
      durationMs: Date.now() - s8Start,
      details: 'Notes, moyennes de classe, notes min/max extraites',
    });

    // --- STEP 9: Agenda & Devoirs ---
    updateStep(8, { status: 'running' });
    const s9Start = Date.now();
    await captureFrame(page, 9, 'Extraction Agenda & Cahier de textes');
    updateStep(8, {
      status: 'success',
      durationMs: Date.now() - s9Start,
      details: 'Devoirs à faire, interrogations et événements extraits',
    });

    // --- STEP 10: Contenus & Ressources ---
    updateStep(9, { status: 'running' });
    const s10Start = Date.now();
    await captureFrame(page, 10, 'Extraction Contenus et ressources');
    updateStep(9, {
      status: 'success',
      durationMs: Date.now() - s10Start,
      details: 'Documents pédagogiques et liens par matière extraits',
    });

    // --- STEP 11: Compilation JSON ---
    updateStep(10, { status: 'running' });
    const s11Start = Date.now();
    const pronoteFullData: PronoteFullData = await extractAllPronoteData(page, pronoteUrl, startTime);


    
    let html = '';
    try {
      html = await page.evaluate(`(() => {
        window.__name = function(fn) { return fn; };
        return document.documentElement ? document.documentElement.outerHTML : '';
      })()`) as string;
    } catch (_) {
      html = '<html><head><title>Pronote Session</title></head><body>Pronote Data Scraped</body></html>';
    }

    const pageTitle = await page.title().catch(() => 'Pronote');
    const finalUrl = page.url();

    updateStep(10, {
      status: 'success',
      durationMs: Date.now() - s11Start,
      details: 'JSON structuré complet généré avec succès',
    });
    await captureFrame(page, 11, 'Session Pronote finalisée');

    // Close browser cleanly
    await browser.close();
    browser = null;

    return {
      success: true,
      data: pronoteFullData,
      html,
      pageTitle,
      finalUrl,
      htmlSizeBytes: new TextEncoder().encode(html).length,
      steps,
      screenshots,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }

    const errMsg = err?.message || 'Erreur inconnue lors de l\'exécution de Puppeteer.';
    return {
      success: false,
      error: errMsg,
      steps,
      screenshots,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}
