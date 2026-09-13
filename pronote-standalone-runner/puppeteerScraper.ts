import puppeteer, { Browser, Page } from 'puppeteer';
import { parsePronoteHtml } from './htmlParser.ts';
import type { PronoteFullData } from './htmlParser.ts';

export interface ScrapeResult {
  success: boolean;
  format?: string;
  data?: PronoteFullData;
  html?: {
    accueil: string;
    emploiDuTemps: string;
    notes: string;
    devoirs: string;
    ressources: string;
  };
  rawHtml?: string;
  error?: string;
  executionTimeMs: number;
  timestamp: string;
}

let sharedBrowser: Browser | null = null;
let sharedBrowserLaunchTime = 0;

export async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected && Date.now() - sharedBrowserLaunchTime < 45 * 60 * 1000) {
    return sharedBrowser;
  }
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch (_) {}
    sharedBrowser = null;
  }
  sharedBrowser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-zygote',
      '--window-size=1280,800'
    ]
  });
  sharedBrowserLaunchTime = Date.now();
  return sharedBrowser;
}

export async function runPronotePuppeteerScrape(
  username: string,
  password: string,
  rawPronoteUrl: string = 'https://0771068t.index-education.net/pronote/eleve.html',
  entUrl: string = 'https://ent.seine-et-marne.fr/',
  format: string = 'json'
): Promise<ScrapeResult> {
  const startTime = Date.now();
  let pronoteUrl = rawPronoteUrl.trim().replace(/[?&]login=true/gi, '');
  if (!pronoteUrl.startsWith('http://') && !pronoteUrl.startsWith('https://')) {
    pronoteUrl = `https://${pronoteUrl}`;
  }

  let context: any = null;

  try {
    const browser = await getSharedBrowser();
    context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );

    // Block heavy media to keep bandwidth and CPU focused on DOM & JS
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      const url = req.url().toLowerCase();
      if (
        type === 'image' ||
        type === 'media' ||
        type === 'font' ||
        url.includes('google-analytics') ||
        url.includes('matomo')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`[FastEngine] Step 1: Navigating to ENT (${Date.now() - startTime}ms)`);
    await page.goto(entUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Submit ENT login form
    await page.evaluate((u, p) => {
      (Array.from(document.querySelectorAll('a, button')).find(el => (el.textContent || '').includes('Se connecter')) as HTMLElement)?.click();
      (Array.from(document.querySelectorAll('button, a')).find(el => (el.textContent || '').toLowerCase().includes('personnel collectivité')) as HTMLElement)?.click();
      const email = document.querySelector('input[name="email"]') as HTMLInputElement;
      const pass = document.querySelector('input[name="password"]') as HTMLInputElement;
      if (email) { email.value = u; email.dispatchEvent(new Event('input', { bubbles: true })); }
      if (pass) { pass.value = p; pass.dispatchEvent(new Event('input', { bubbles: true })); }
      const form = document.querySelector('form') as HTMLFormElement;
      form?.submit();
    }, username, password);

    console.log(`[FastEngine] Step 2: Waiting ENT auth (${Date.now() - startTime}ms)`);
    
    // Race between navigation or fast invalid credentials detection
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }),
      page.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return (
          text.includes('incorrect') ||
          text.includes('invalide') ||
          text.includes('Échec') ||
          text.includes('Erreur de connexion') ||
          document.querySelector('.alert-danger, .error, .msg-erreur') !== null
        );
      }, { timeout: 3500 }).then(async () => {
        const errorText = await page.evaluate(() => {
          return document.querySelector('.alert-danger, .error, .msg-erreur')?.textContent || 'Identifiant ou mot de passe incorrect.';
        });
        throw new Error(errorText.trim());
      })
    ]).catch((err) => {
      if (err.message.includes('incorrect') || err.message.includes('invalide') || err.message.includes('Échec') || err.message.includes('Erreur')) {
        throw err;
      }
    });

    console.log(`[FastEngine] Step 3: Navigating to Pronote (${Date.now() - startTime}ms)`);
    await page.goto(pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait until Pronote UI is ready
    const isReady = await page.waitForFunction(() => {
      return document.querySelectorAll('.menu-principal_niveau0, .label-menu_niveau0, .ObjetBouton, #GInterface').length > 0;
    }, { timeout: 7000 }).then(() => true).catch(() => false);

    if (!isReady) {
      const isError = await page.evaluate(() => {
        const txt = document.body?.innerText || '';
        return txt.includes('authentification') || txt.includes('Session') || txt.includes('Erreur');
      }).catch(() => false);
      if (isError) {
        throw new Error('Authentification ENT refusée par le serveur Pronote.');
      }
    }

    console.log(`[FastEngine] Step 4: Pronote UI ready (${Date.now() - startTime}ms). Capturing Accueil...`);
    const htmlAccueil = await page.content();

    // Helper to navigate tabs with precise sub-menu timing
    const navigateTab = async (parentKw: string, subKw?: string) => {
      await page.evaluate((parent) => {
        const items = Array.from(document.querySelectorAll('li, div, span, button'));
        for (const item of items) {
          if (item.children.length === 0 && (item.textContent || '').toLowerCase().includes(parent.toLowerCase())) {
            (item as HTMLElement).click();
            item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            break;
          }
        }
      }, parentKw);

      if (subKw) {
        await new Promise(r => setTimeout(r, 180));
        await page.evaluate((sub) => {
          const subs = Array.from(document.querySelectorAll('li, div, span, button'));
          for (const s of subs) {
            if (s.children.length === 0 && (s.textContent || '').toLowerCase().includes(sub.toLowerCase())) {
              (s as HTMLElement).click();
              s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              break;
            }
          }
        }, subKw);
      }
    };

    // 1. EDT
    console.log(`[FastEngine] Step 5.1: EDT (${Date.now() - startTime}ms)`);
    await navigateTab('Viescolaire', 'Emploi du temps');
    await new Promise(r => setTimeout(r, 900));
    const htmlEdt = await page.content();

    // 2. Notes
    console.log(`[FastEngine] Step 5.2: Notes (${Date.now() - startTime}ms)`);
    await navigateTab('Notes', 'Mes notes');
    await new Promise(r => setTimeout(r, 900));
    const htmlNotes = await page.content();

    // 3. Devoirs
    console.log(`[FastEngine] Step 5.3: Devoirs (${Date.now() - startTime}ms)`);
    await navigateTab('Cahier', 'Travail à faire');
    await new Promise(r => setTimeout(r, 900));
    const htmlDevoirs = await page.content();

    // 4. Ressources
    console.log(`[FastEngine] Step 5.4: Ressources (${Date.now() - startTime}ms)`);
    await navigateTab('Cahier', 'Contenus et ressources');
    await new Promise(r => setTimeout(r, 900));
    const htmlRessources = await page.content();

    if (context) {
      await context.close().catch(() => null);
      context = null;
    }

    console.log(`[FastEngine] Step 6: Parsing HTML (${Date.now() - startTime}ms)`);
    const parsedData = parsePronoteHtml({
      accueil: htmlAccueil,
      emploiDuTemps: htmlEdt,
      notes: htmlNotes,
      devoirs: htmlDevoirs,
      ressources: htmlRessources,
      pronoteBaseUrl: pronoteUrl
    });

    const isHtml = format === 'html';
    const executionTimeMs = Date.now() - startTime;
    console.log(`[FastEngine] 🏁 Total Scrape Execution: ${executionTimeMs}ms (${(executionTimeMs / 1000).toFixed(2)}s)`);

    return {
      success: true,
      format: isHtml ? 'html' : 'json',
      data: parsedData,
      html: {
        accueil: htmlAccueil,
        emploiDuTemps: htmlEdt,
        notes: htmlNotes,
        devoirs: htmlDevoirs,
        ressources: htmlRessources
      },
      rawHtml: `<!-- ACCUEIL -->\n${htmlAccueil}\n<!-- EMPLOI_DU_TEMPS -->\n${htmlEdt}\n<!-- NOTES -->\n${htmlNotes}\n<!-- DEVOIRS -->\n${htmlDevoirs}\n<!-- RESSOURCES -->\n${htmlRessources}`,
      executionTimeMs,
      timestamp: new Date().toISOString()
    };

  } catch (err: any) {
    if (context) {
      await context.close().catch(() => null);
    }
    return {
      success: false,
      error: err?.message || 'Erreur lors du scraping Pronote',
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}
