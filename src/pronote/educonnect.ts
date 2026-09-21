import type { Page } from 'puppeteer';
import { ApiError, type AccountKind, type Person } from './contracts';

const USER_SELECTOR = 'input[name="j_username"], input[name="username"], input#username, input[type="email"], input[name="email"]';
const PASSWORD_SELECTOR = 'input[name="j_password"], input[name="password"], input#password, input[type="password"]';

function blocked(text: string): boolean {
  return /accès perturbé|acces perturbe|difficultés techniques|difficultes techniques|service rencontre/i.test(text);
}

async function textOf(page: Page): Promise<string> {
  return page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500)).catch(() => '');
}

async function fill(page: Page, selector: string, value: string): Promise<boolean> {
  const found = await page.$(selector);
  if (!found) return false;
  await page.$eval(selector, (el, next) => {
    const input = el as HTMLInputElement;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, next);
    else input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  return true;
}

async function clickSubmit(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const form = document.querySelector('form');
    const candidates = Array.from((form || document).querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]'));
    const target = candidates.find(el => {
      const text = (el.innerText || (el as HTMLInputElement).value || el.getAttribute('name') || '').toLowerCase();
      return el.getAttribute('type') === 'submit' || /valider|continuer|se connecter|connexion|suivant|_eventid_proceed/.test(text);
    });
    if (target) { target.click(); return true; }
    if (form) { (form as HTMLFormElement).requestSubmit(); return true; }
    return false;
  });
}

async function chooseAccount(page: Page, account: AccountKind): Promise<boolean> {
  return page.evaluate((kind: string) => {
    const wanted = kind === 'parent' ? /responsable|parent|représentant|representant/i : /élève|eleve|enfant|collégien|collegien|lycéen|lyceen/i;
    const target = Array.from(document.querySelectorAll<HTMLElement>('a,button,[role="button"]')).find(el => wanted.test(el.innerText || el.getAttribute('aria-label') || ''));
    if (!target) return false;
    target.click();
    return true;
  }, account);
}

async function openFromEstablishment(page: Page, input: { pronoteUrl: string; account: AccountKind }): Promise<void> {
  await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const wanted = input.account === 'parent' ? 'relative' : 'student';
  const clicked = await page.evaluate((kind: string) => {
    const link = document.querySelector<HTMLAnchorElement>(`a[href*="saml/authn/${kind}"]`)
      || document.querySelector<HTMLAnchorElement>('a[href*="educonnect"], a[href*="EduConnect"]');
    if (link) { link.click(); return true; }
    const button = Array.from(document.querySelectorAll<HTMLElement>('a,button')).find(el => /educonnect/i.test(el.innerText || el.getAttribute('aria-label') || ''));
    if (button) { button.click(); return true; }
    return false;
  }, wanted);
  if (!clicked) {
    const hub = `https://hubeduconnect.index-education.net/EduConnect/cas/login?service=${encodeURIComponent(input.pronoteUrl)}`;
    await page.goto(hub, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } else {
    await page.waitForFunction(() => location.hostname.includes('education.gouv.fr') || !!document.querySelector('input[type="password"], input[name="username"]'), { timeout: 12000 }).catch(() => {});
  }
  const text = await textOf(page);
  if (blocked(text) || page.url().includes('assistance.phm.education.gouv.fr')) {
    throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'EduConnect refuse actuellement cette connexion. Réessayez plus tard.');
  }
  if (/n'est pas une url de confiance|pas une url de confiance/i.test(text)) {
    throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'Cet établissement ne propose pas EduConnect pour cet espace Pronote.');
  }
}

async function assertProgress(page: Page): Promise<'done' | 'continue'> {
  const text = await textOf(page);
  if (blocked(text) || page.url().includes('assistance.phm.education.gouv.fr')) {
    throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'EduConnect est temporairement indisponible.');
  }
  if (/code (?:de )?vérification|double authentification|authentification forte|saisissez le code/i.test(text)) {
    throw new ApiError('EDUCONNECT_MFA_REQUIRED', 409, 'educonnect', 'EduConnect demande une validation supplémentaire. Cette étape n’est pas contournée.');
  }
  if (/changer (?:votre |le )?mot de passe|conditions d’utilisation|conditions d'utilisation|activer (?:votre |mon )?compte/i.test(text)) {
    throw new ApiError('EDUCONNECT_ACTION_REQUIRED', 409, 'educonnect', 'Une action est requise sur EduConnect avant de pouvoir ouvrir Pronote.');
  }
  if (/identifiant ou mot de passe|mot de passe incorrect|identifiants? invalides?|échec de l.?authentification|authentication failed/i.test(text)) {
    throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'educonnect', 'Identifiant ou mot de passe EduConnect refusé.');
  }
  const host = new URL(page.url()).hostname;
  if (host.endsWith('index-education.net') && !host.startsWith('hubeduconnect.')) return 'done';
  return 'continue';
}

export async function loginEduConnect(page: Page, input: { username: string; password: string; pronoteUrl: string; account: AccountKind }): Promise<Person> {
  try {
    await openFromEstablishment(page, input);
    for (let step = 0; step < 8; step++) {
      if (await assertProgress(page) === 'done') break;
      const hasPassword = await page.$(PASSWORD_SELECTOR);
      const hasUser = await page.$(USER_SELECTOR);
      if (!hasPassword && !hasUser) {
        if (await chooseAccount(page, input.account)) {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
          continue;
        }
        if (await clickSubmit(page)) {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
          continue;
        }
        break;
      }
      if (hasUser) await fill(page, USER_SELECTOR, input.username);
      if (hasPassword) await fill(page, PASSWORD_SELECTOR, input.password);
      await clickSubmit(page);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      await page.waitForSelector(`${PASSWORD_SELECTOR}, ${USER_SELECTOR}`, { timeout: 2500 }).catch(() => {});
    }
    if (!new URL(page.url()).hostname.endsWith('index-education.net') || new URL(page.url()).hostname.startsWith('hubeduconnect.')) {
      const cas = `https://ent77.seine-et-marne.fr/cas/login?service=${encodeURIComponent(input.pronoteUrl)}`;
      await page.goto(cas, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
    }
    if (!new URL(page.url()).hostname.endsWith('index-education.net')) {
      await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
    }
    const current = new URL(page.url());
    if (!current.hostname.endsWith('index-education.net') || current.hostname.startsWith('hubeduconnect.')) {
      const hint = await page.evaluate(() => ({
        password: !!document.querySelector('input[type="password"]'),
        buttons: [...document.querySelectorAll('button,a')].map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(text => text && text.length < 32).slice(0, 4),
      })).catch(() => ({ password: false, buttons: [] }));
      throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'educonnect', `EduConnect n’a pas ouvert Pronote (${current.hostname}${current.pathname}; mot de passe affiché: ${hint.password ? 'oui' : 'non'}).`);
    }
    return { nomComplet: '', prenom: '', nom: '', classe: null, etablissement: null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('EDUCONNECT_NAVIGATION', 502, 'educonnect', 'Navigation EduConnect interrompue.');
  }
}
