import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCredentialKey,
  assertNoCredentialKeys,
  FORBIDDEN_CREDENTIAL_KEYS,
} from '../src/pronote/credentials.ts';

// ===========================================================================
// Barrière de publication des identifiants ENT (scripts/publish-response.ts)
// ===========================================================================

test('bloque les clés d’identification attendues à la racine', () => {
  for (const key of ['username', 'password', 'pass', 'ent_id', 'ent_pass']) {
    assert.ok(FORBIDDEN_CREDENTIAL_KEYS.has(key), `clé absente du jeu interdit : ${key}`);
    assert.throws(
      () => assertNoCredentialKeys({ [key]: 'valeur- sensible' }),
      /Publication annulée/,
      `clé non bloquée : ${key}`,
    );
  }
});

test('bloque les variantes collées, la casse mixte et les espaces', () => {
  assert.throws(() => assertNoCredentialKeys({ USERNAME: 'x' }), /interdite/);
  assert.throws(() => assertNoCredentialKeys({ ' Ent_Pass ': 'x' }), /interdite/);
  assert.throws(() => assertNoCredentialKeys({ entid: 'x' }), /interdite/);
  assert.throws(() => assertNoCredentialKeys({ entpass: 'x' }), /interdite/);
});

test('bloque à n’importe quelle profondeur, tableaux inclus', () => {
  const doc = { a: { b: [{ c: 1 }, { Password: 'x' }] } };
  assert.equal(findCredentialKey(doc), 'Password');
  assert.throws(() => assertNoCredentialKeys(doc), /Publication annulée/);
});

test('ne signale que la clé, jamais la valeur', () => {
  let message = '';
  try {
    assertNoCredentialKeys({ password: 'S3cret-JAMAIS-dans-un-log' });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.match(message, /password/);
  assert.doesNotMatch(message, /S3cret/);
});

test('laisse passer les clés sans rapport avec un identifiant', () => {
  const ok = {
    apprenant: { nom: 'X', passeport: 'ok', passerelle: true },
    notes: [{ valeur: 12, bareme: 20 }],
    user_id: 7,
  };
  assert.equal(findCredentialKey(ok), null);
  assert.doesNotThrow(() => assertNoCredentialKeys(ok));
});

test('accepte les entrées non objet sans lever', () => {
  for (const value of [null, undefined, 'chaîne', 42, true]) {
    assert.equal(findCredentialKey(value), null);
  }
});
