import type { Page } from 'puppeteer';
import { ApiError, type AccountKind, type Person } from './contracts';

const STUDENT_START = 'https://ent77.seine-et-marne.fr/auth/saml/authn/student';
const PARENT_START = 'https://ent77.seine-et-marne.fr/auth/saml/authn/relative';
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

async function submit(page: Page): Promise<void> {
  const clicked = await page.evaluate(() => {
    const form = document.querySelector('form');
    const scope = form || document;
    const target = Array.from(scope.querySelectorAll<HTMLElement>('button, input[type="submit"]')).find(el => {
      const text = (el.innerText || (el as HTMLInputElement).value || '').toLowerCase();
      return el.getAttribute('type') === 'submit' || /valider|continuer|se connecter|connexion|suivant/.test(text);
    });
    if (target) { target.click(); return true; }
    if (form) { (form as HTMLFormElement).requestSubmit(); return true; }
    return false;
  });
  if (!clicked) await page.keyboard.press('Enter').catch(() => {});
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
}

async function guard(page: Page): Promise<void> {
  const text = await textOf(page);
  if (blocked(text) || page.url().includes('assistance.phm.education.gouv.fr')) {
    throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'EduConnect est temporairement indisponible.');
  }
  if (/code (?:de )?vérification|double authentification|authentification forte|saisissez le code/i.test(text)) {
    throw new ApiError('EDUCONNECT_MFA_REQUIRED', 409, 'educonnect', 'EduConnect demande une validation supplémentaire. Cette étape n’est pas contournée.');
  }
  if (/changer (?:votre |le )?mot de passe|activer (?:votre |mon )?compte/i.test(text)) {
    throw new ApiError('EDUCONNECT_ACTION_REQUIRED', 409, 'educonnect', 'Une action est requise sur EduConnect avant de pouvoir ouvrir Pronote.');
  }
  if (/identifiant ou mot de passe|mot de passe incorrect|identifiants? invalides?|échec de l.?authentification|authentication failed/i.test(text)) {
    throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'educonnect', 'Identifiant ou mot de passe EduConnect refusé.');
  }
}

export async function loginEduConnect(page: Page, input: { username: string; password: string; pronoteUrl: string; account: AccountKind }): Promise<Person> {
  try {
    // Load the establishment callback first so the ENT can return to Pronote,
    // then open the official EduConnect SAML entry for the selected profile.
    await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.goto(input.account === 'parent' ? PARENT_START : STUDENT_START, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => location.hostname.includes('education.gouv.fr') || !!document.querySelector('input[type="password"]'), { timeout: 15000 }).catch(() => {});
    await guard(page);

    for (let step = 0; step < 6; step++) {
      await guard(page);
      const host = new URL(page.url()).hostname;
      if (host.endsWith('index-education.net')) break;
      if (!host.includes('education.gouv.fr')) break;
      const hasUser = await page.$(USER_SELECTOR);
      const hasPassword = await page.$(PASSWORD_SELECTOR);
      if (!hasUser && !hasPassword) {
        const moved = await page.evaluate((account: string) => {
          const pattern = account === 'parent' ? /parent|responsable/i : /élève|eleve/;
          const choice = Array.from(document.querySelectorAll<HTMLElement>('a,button')).find(el => pattern.test(el.innerText || ''));
          if (!choice) return false;
          choice.click();
          return true;
        }, input.account);
        if (!moved) break;
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
        continue;
      }
      if (hasUser) await fill(page, USER_SELECTOR, input.username);
      if (hasPassword) await fill(page, PASSWORD_SELECTOR, input.password);
      await submit(page);
    }

    await guard(page);
    const cas = `https://ent77.seine-et-marne.fr/cas/login?service=${encodeURIComponent(input.pronoteUrl)}`;
    if (!new URL(page.url()).hostname.endsWith('index-education.net')) {
      await page.goto(cas, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    if (!new URL(page.url()).hostname.endsWith('index-education.net')) {
      await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    const finalHost = new URL(page.url()).hostname;
    if (!finalHost.endsWith('index-education.net')) {
      throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'educonnect', 'La session EduConnect n’a pas ouvert l’espace Pronote.');
    }
    return { nomComplet: '', prenom: '', nom: '', classe: null, etablissement: null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('EDUCONNECT_NAVIGATION', 502, 'educonnect', 'Navigation EduConnect interrompue.');
  }
}
