import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeEqual, extractBearer, validateScrapeUrl, stripSessionParams,
  cleanText, validateScrapeBody,
} from '../worker/security.ts';

// ===========================================================================
// Comparaison à temps constant
// ===========================================================================

test('safeEqual compare correctement', async () => {
  assert.equal(await safeEqual('secret', 'secret'), true);
  assert.equal(await safeEqual('secret', 'secreu'), false);
  assert.equal(await safeEqual('', ''), true);
  assert.equal(await safeEqual('a', ''), false);
  assert.equal(await safeEqual('court', 'beaucoup plus long'), false);
});

test('safeEqual gère les chaînes longues et non-ASCII', async () => {
  const long = 'x'.repeat(5000);
  assert.equal(await safeEqual(long, long), true);
  assert.equal(await safeEqual('clé-éàü', 'clé-éàü'), true);
  assert.equal(await safeEqual('clé-éàü', 'cle-eau'), false);
});

test('extractBearer lit Authorization et X-API-Key', () => {
  const a = new Request('https://x.test/', { headers: { Authorization: 'Bearer abc123' } });
  assert.equal(extractBearer(a), 'abc123');

  const b = new Request('https://x.test/', { headers: { 'X-API-Key': 'def456' } });
  assert.equal(extractBearer(b), 'def456');

  const c = new Request('https://x.test/', { headers: { Authorization: 'Basic zzz' } });
  assert.equal(extractBearer(c), null);

  assert.equal(extractBearer(new Request('https://x.test/')), null);
});

// ===========================================================================
// Protection SSRF
// ===========================================================================

test('refuse les schémas non HTTPS', () => {
  for (const bad of [
    'http://0771068t.index-education.net/pronote/',
    'file:///etc/passwd',
    'ftp://example.com/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ]) {
    assert.equal(validateScrapeUrl(bad, 'pronoteUrl').ok, false, `doit refuser : ${bad}`);
  }
});

test("refuse l'endpoint de métadonnées cloud et les adresses internes", () => {
  // L'ancien code passait l'URL du client directement à `page.goto()` sur la
  // VM du runner, puis renvoyait le HTML obtenu. Combiné à la saisie des
  // identifiants dans le formulaire de la page cible, c'était un vecteur
  // d'exfiltration et de lecture de ressources internes.
  const interdits = [
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/admin',
    'https://localhost/pronote',
    'https://10.0.0.1/',
    'https://192.168.1.1/',
    'https://172.16.0.1/',
    'https://[::1]/',
    'https://[fd00::1]/',
    'https://metadata.google.internal/',
    'https://serveur.local/',
  ];
  for (const url of interdits) {
    assert.equal(validateScrapeUrl(url, 'pronoteUrl').ok, false, `doit refuser : ${url}`);
  }
});

test('refuse les IP littérales et les ports non standard', () => {
  assert.equal(validateScrapeUrl('https://93.184.216.34/pronote/', 'pronoteUrl').ok, false);
  assert.equal(validateScrapeUrl('https://example.com:8443/', 'pronoteUrl').ok, false);
  assert.equal(validateScrapeUrl('https://example.com:443/', 'pronoteUrl').ok, true);
});

test('refuse les identifiants dans l\'URL', () => {
  const r = validateScrapeUrl('https://user:pass@example.com/', 'pronoteUrl');
  assert.equal(r.ok, false);
});

test('accepte une URL HTTPS légitime', () => {
  const r = validateScrapeUrl('https://0771068t.index-education.net/pronote/eleve.html', 'pronoteUrl');
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.url, /^https:\/\/0771068t\.index-education\.net/);
});

test('applique la liste d\'autorisation de domaines', () => {
  const suffixes = ['index-education.net', 'ent.seine-et-marne.fr'];
  assert.equal(validateScrapeUrl('https://0771068t.index-education.net/pronote/', 'pronoteUrl', suffixes).ok, true);
  assert.equal(validateScrapeUrl('https://ent.seine-et-marne.fr/', 'entUrl', suffixes).ok, true);
  // Domaine tiers refusé quand la liste est configurée.
  assert.equal(validateScrapeUrl('https://evil.example.com/', 'pronoteUrl', suffixes).ok, false);
  // Tentative de contournement par suffixe : « notindex-education.net »
  // ne doit PAS passer (la comparaison exige un point de séparation).
  assert.equal(validateScrapeUrl('https://notindex-education.net/', 'pronoteUrl', suffixes).ok, false);
  assert.equal(validateScrapeUrl('https://index-education.net.evil.com/', 'pronoteUrl', suffixes).ok, false);
});

// ===========================================================================
// Assainissement des sorties
// ===========================================================================

test('stripSessionParams retire tous les jetons de session', () => {
  // Les liens de fichiers Pronote embarquent `?session=…`. Les republier
  // reviendrait à publier une session ouverte sur le compte de l'élève.
  const out = stripSessionParams('https://x.net/f.pdf?session=abc&id=1&token=zzz&h=deadbeef');
  assert.ok(!out.includes('session='));
  assert.ok(!out.includes('token='));
  assert.ok(!out.includes('h='));
  assert.ok(out.includes('id=1'), 'les paramètres légitimes sont conservés');
});

test('stripSessionParams laisse intacte une URL sans session', () => {
  const url = 'https://x.net/f.pdf?a=1';
  assert.equal(stripSessionParams(url), url);
});

test('stripSessionParams ne lève pas sur une URL invalide', () => {
  assert.equal(stripSessionParams('pas une url'), 'pas une url');
});

test('cleanText retire les caractères de contrôle et borne la longueur', () => {
  assert.equal(cleanText('  espaces   multiples  '), 'espaces multiples');
  assert.equal(cleanText('a\u0000b\u0007c'), 'abc');
  assert.equal(cleanText('x'.repeat(500), 10).length, 10);
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText(42), '');
});

test("extractBearer n'accepte aucun secret dans l'URL ou les cookies", () => {
  // Les secrets ne doivent être lus que depuis les deux en-têtes prévus. Une
  // query string ou un cookie finirait facilement dans des journaux d'accès.
  const request = new Request('https://x.test/?token=secret-url', {
    headers: { Cookie: 'token=secret-cookie' },
  });
  assert.equal(extractBearer(request), null);
});

// ===========================================================================
// Validation du corps de requête
// ===========================================================================

test('validateScrapeBody exige username et password', () => {
  assert.equal(validateScrapeBody({}, {}).ok, false);
  assert.equal(validateScrapeBody({ username: 'a' }, {}).ok, false);
  assert.equal(validateScrapeBody({ password: 'b' }, {}).ok, false);
  assert.equal(validateScrapeBody(null, {}).ok, false);
  assert.equal(validateScrapeBody('chaîne', {}).ok, false);
});

test('validateScrapeBody borne la longueur des champs', () => {
  const r = validateScrapeBody({ username: 'a'.repeat(500), password: 'b' }, {});
  assert.equal(r.ok, false);
});

test('validateScrapeBody accepte une requête valide et normalise le format', () => {
  const r = validateScrapeBody({ username: 'u', password: 'p', format: 'HTML' }, {});
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.format, 'json', 'un format inconnu retombe sur json');
    assert.equal(r.value.noCache, false);
  }
});

test('validateScrapeBody bloque une URL Pronote malveillante', () => {
  const r = validateScrapeBody(
    { username: 'u', password: 'p', pronoteUrl: 'http://169.254.169.254/' },
    {},
  );
  assert.equal(r.ok, false);
});

test('validateScrapeBody applique la liste de domaines', () => {
  const env = { ALLOWED_HOST_SUFFIXES: 'index-education.net' };
  assert.equal(validateScrapeBody({ username: 'u', password: 'p', pronoteUrl: 'https://a.index-education.net/' }, env).ok, true);
  assert.equal(validateScrapeBody({ username: 'u', password: 'p', pronoteUrl: 'https://evil.com/' }, env).ok, false);
});
