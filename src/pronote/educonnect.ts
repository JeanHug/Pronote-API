import type { Page } from 'puppeteer';
import { ApiError, type AccountKind, type Person } from './contracts';

const STUDENT_START = 'https://ent77.seine-et-marne.fr/auth/saml/authn/student';
const PARENT_START = 'https://ent77.seine-et-marne.fr/auth/saml/authn/relative';
const USER_SELECTOR = 'input[name="j_username"], input[name="username"], input#username, input[type="email"], input[name="email"]';
const PASSWORD_SELECTOR = 'input[name="j_password"], input[name="password"], input#password, input[type="password"]';
const BLOCK_HOST = 'assistance.phm.education.gouv.fr';

function blocked(text: string): boolean {
  return /accès perturbé|acces perturbe|difficultés techniques|difficultes techniques|service rencontre/i.test(text);
}

function host(page: Page): string {
  try { return new URL(page.url()).hostname; } catch { return ''; }
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

/**
 * Network filtering by the Ministry: EduConnect answers 302 -> assistance.phm.education.gouv.fr
 * ("Accès perturbé") for datacenter / VPN / non-French egress. It happens BEFORE any form is shown,
 * so credentials are never evaluated. This must be reported as an infrastructure condition, never as
 * an authentication failure.
 */
async function guard(page: Page): Promise<void> {
  const text = await textOf(page);
  if (host(page) === BLOCK_HOST || blocked(text)) {
    throw new ApiError(
      'EDUCONNECT_NETWORK_BLOCKED',
      503,
      'educonnect',
      'EduConnect refuse cette connexion depuis le réseau du moteur (« Accès perturbé » : filtrage des IP hébergeur/VPN par le Ministère). Vos identifiants n’ont pas été évalués. Le moteur doit sortir par une IP résidentielle française (EDUCONNECT_PROXY).'
    );
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
  let stage = 'start';
  try {
    // 1) Open the official EduConnect SAML entry for the selected profile. Do not pre-load Pronote:
    //    its own SSO redirect chain would race with this navigation and mask the real cause.
    stage = 'saml';
    await page.goto(input.account === 'parent' ? PARENT_START : STUDENT_START, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(
      (blockHost: string) => location.hostname === blockHost || location.hostname.includes('education.gouv.fr') || !!document.querySelector('input[type="password"]'),
      { timeout: 15000 },
      BLOCK_HOST,
    ).catch(() => {});
    await guard(page);

    // 2) Walk the EduConnect screens (profile choice, username, password).
    stage = 'form';
    for (let step = 0; step < 6; step++) {
      await guard(page);
      const h = host(page);
      if (h.endsWith('index-education.net')) break;
      if (h.endsWith('seine-et-marne.fr') && !page.url().includes('/auth/')) break;
      if (!h.includes('education.gouv.fr')) break;
      const hasUser = await page.$(USER_SELECTOR);
      const hasPassword = await page.$(PASSWORD_SELECTOR);
      if (!hasUser && !hasPassword) {
        const moved = await page.evaluate((account: string) => {
          const pattern = account === 'parent' ? /parent|responsable/i : /élève|eleve/i;
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

    // 3) Session established on ENT77: bounce through the CAS service to open Pronote.
    stage = 'pronote';
    const cas = `https://ent77.seine-et-marne.fr/cas/login?service=${encodeURIComponent(input.pronoteUrl)}`;
    if (!host(page).endsWith('index-education.net')) {
      await page.goto(cas, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    if (!host(page).endsWith('index-education.net')) {
      await page.goto(input.pronoteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await guard(page);
    if (!host(page).endsWith('index-education.net')) {
      throw new ApiError('EDUCONNECT_AUTH_FAILED', 401, 'educonnect', 'La session EduConnect n’a pas ouvert l’espace Pronote.');
    }
    return { nomComplet: '', prenom: '', nom: '', classe: null, etablissement: null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Map a navigation failure that landed on the block page to the real cause.
    if (host(page) === BLOCK_HOST) {
      throw new ApiError('EDUCONNECT_NETWORK_BLOCKED', 503, 'educonnect', 'EduConnect refuse cette connexion depuis le réseau du moteur (« Accès perturbé »). Vos identifiants n’ont pas été évalués.');
    }
    throw new ApiError('EDUCONNECT_NAVIGATION', 502, 'educonnect', `Navigation EduConnect interrompue (étape : ${stage}).`);
  }
}
