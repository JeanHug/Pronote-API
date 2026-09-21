import type { Page } from 'puppeteer';
import { ApiError, type AccountKind, type Person } from './contracts';

const STUDENT_START = 'https://ent77.seine-et-marne.fr/auth/saml/authn/student';
const PARENT_START = 'https://ent77.seine-et-marne.fr/auth/saml/authn/relative';

function blocked(text: string): boolean {
  return /accès perturbé|acces perturbe|difficultés techniques|difficultes techniques/i.test(text);
}

async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2000));
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

async function clickSubmit(page: Page): Promise<void> {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]'));
    const target = candidates.find(el => {
      const text = (el.innerText || (el as HTMLInputElement).value || '').toLowerCase();
      return el.getAttribute('type') === 'submit' || /valider|continuer|se connecter|connexion|suivant/.test(text);
    });
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) {
    const form = await page.$('form');
    if (form) await page.evaluate(() => { const form = document.querySelector('form'); if (form) (form as HTMLFormElement).requestSubmit(); });
  }
}

async function openLogin(page: Page, account: AccountKind, pronoteUrl: string): Promise<void> {
  const direct = account === 'parent' ? PARENT_START : STUDENT_START;
  await page.goto(direct, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('input[type="password"], input[name="username"], input#username, input[type="email"]', { timeout: 12000 }).catch(() => {});
  let text = await pageText(page);
  if (!blocked(text) && !page.url().includes('assistance.phm.education.gouv.fr')) {
    const hasForm = await page.$('input[type="password"], input[name="username"], input#username, input[type="email"]');
    if (hasForm) return;
    const fields = await page.evaluate(() => [...document.querySelectorAll('input')].slice(0, 8).map(input => `${input.type}:${input.name || input.id || 'unnamed'}`));
    throw new ApiError('EDUCONNECT_FORM', 502, 'educonnect', `Formulaire EduConnect inattendu (${fields.join(', ') || 'aucun champ'}).`);
  }
  // Some establishments expose EduConnect only from the Pronote/ENT screen.
  await page.goto(pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const clicked = await page.evaluate((kind: string) => {
    const wanted = kind === 'parent' ? 'relative' : 'student';
    const link = document.querySelector<HTMLAnchorElement>(`a[href*="saml/authn/${wanted}"], a[href*="educonnect"]`);
    if (link) { link.click(); return true; }
    const button = Array.from(document.querySelectorAll<HTMLElement>('a,button')).find(el => /educonnect/i.test(el.innerText || el.getAttribute('aria-label') || ''));
    if (button) { button.click(); return true; }
    return false;
  }, account);
  if (!clicked) throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'EduConnect est momentanément inaccessible ou non proposé par cet établissement.');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
  text = await pageText(page);
  if (blocked(text) || page.url().includes('assistance.phm.education.gouv.fr')) {
    throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'Le service EduConnect refuse actuellement cette connexion (maintenance ou réseau filtré). Réessayez plus tard.');
  }
}

export async function loginEduConnect(page: Page, input: { username: string; password: string; pronoteUrl: string; account: AccountKind }): Promise<Person> {
  try {
  await openLogin(page, input.account, input.pronoteUrl);
  for (let step = 0; step < 5; step++) {
    const text = await pageText(page);
    if (blocked(text)) throw new ApiError('EDUCONNECT_UNAVAILABLE', 503, 'educonnect', 'Le service EduConnect est temporairement indisponible.');
    if (/code (?:de )?vérification|double authentification|authentification forte|saisissez le code/i.test(text)) {
      throw new ApiError('EDUCONNECT_MFA_REQUIRED', 409, 'educonnect', 'EduConnect demande une validation supplémentaire. Cette étape n’est pas contournée.');
    }
    if (/identifiant ou mot de passe|mot de passe incorrect|identifiants? invalides?|échec de l.?authentification/i.test(text)) {
      throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'educonnect', 'Identifiant ou mot de passe EduConnect refusé.');
    }
    const host = new URL(page.url()).hostname;
    if (host.endsWith('index-education.net')) break;
    if (host.endsWith('seine-et-marne.fr') && !page.url().includes('/auth/')) break;
    const hasPassword = await page.$('input[type="password"]');
    const hasUser = await page.$('input[name="username"], input#username, input[name="j_username"], input[type="email"], input[name="email"]');
    if (!hasPassword && hasUser) {
      await fill(page, 'input[name="username"], input#username, input[name="j_username"], input[type="email"], input[name="email"]', input.username);
      await clickSubmit(page);
      await page.waitForSelector('input[type="password"]', { timeout: 8000 }).catch(() => {});
      continue;
    }
    if (hasPassword) {
      if (hasUser) await fill(page, 'input[name="username"], input#username, input[name="j_username"], input[type="email"], input[name="email"]', input.username);
      await fill(page, 'input[type="password"]', input.password);
      await clickSubmit(page);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
      continue;
    }
    const advanced = await page.evaluate(() => {
      const next = Array.from(document.querySelectorAll<HTMLElement>('a,button')).find(el => /continuer|accéder|acceder|élève|eleve|valider/i.test(el.innerText || ''));
      if (!next) return false;
      next.click();
      return true;
    });
    if (!advanced) break;
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
  }
  if (!new URL(page.url()).hostname.endsWith('index-education.net')) {
    await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }
  return { nomComplet: '', prenom: '', nom: '', classe: null, etablissement: null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const host = (() => { try { return new URL(page.url()).hostname; } catch { return 'unknown'; } })();
    throw new ApiError('EDUCONNECT_NAVIGATION', 502, 'educonnect', `Navigation EduConnect interrompue sur ${host}.`);
  }
}
