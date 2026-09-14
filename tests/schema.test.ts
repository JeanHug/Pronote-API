import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePronote } from '../src/pronote/parse.ts';
import { FIELDS, EXAMPLE, ERROR_EXAMPLE, ERROR_CATALOG, resolvePath, SCHEMA_VERSION } from '../src/pronote/schema.ts';
import { emptyData } from '../src/pronote/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(here, 'fixtures', n), 'utf8');
const REF = new Date('2026-09-14T12:00:00Z');

const PAGES = {
  accueil: fx('accueil.html'),
  emploiDuTemps: fx('edt.html'),
  notes: fx('notes.html'),
  devoirs: fx('devoirs.html'),
  ressources: fx('ressources.html'),
  pronoteBaseUrl: 'https://0771068t.index-education.net/pronote/eleve.html',
};

const { data, report } = parsePronote(PAGES, REF);

/**
 * C'EST LE TEST LE PLUS IMPORTANT DU PROJET.
 *
 * La documentation précédente décrivait 57 champs, dont 4 seulement
 * correspondaient à la sortie réelle du parseur. Le reste était absent, renommé
 * ou rempli de valeurs constantes présentées comme extraites.
 *
 * Ici, chaque chemin documenté est RÉSOLU dans une sortie réelle. Si un champ
 * documenté disparaît de l'implémentation, ce test échoue.
 */

/**
 * Une réponse en succès ET une réponse en erreur : `errorCode` et `error`
 * n'existent que dans le second cas. Un champ documenté doit être résoluble
 * dans L'UN des deux — c'est la définition d'un contrat tenable.
 */
const enveloppeSucces = {
  jobId: 'test',
  success: true,
  status: 'done',
  executionTimeMs: 1,
  timestamp: new Date().toISOString(),
  extraction: report,
  data,
};
const enveloppeErreur = { ...ERROR_EXAMPLE };

test('tous les chemins documentés se résolvent dans une réponse réelle', () => {
  const manquants: string[] = [];
  for (const field of FIELDS) {
    if (resolvePath(enveloppeSucces, field.path) === undefined &&
        resolvePath(enveloppeErreur, field.path) === undefined) {
      manquants.push(field.path);
    }
  }

  assert.deepEqual(
    manquants,
    [],
    `Champs documentés absents de toute réponse réelle :\n  - ${manquants.join('\n  - ')}`,
  );
});

test("seuls errorCode et error sont propres à la réponse d'erreur", () => {
  // Garde-fou : si un nouveau champ n'existe QUE dans l'exemple d'erreur, c'est
  // le signe qu'il a été ajouté au schéma sans être implémenté côté succès.
  const propres: string[] = [];
  for (const field of FIELDS) {
    const enSucces = resolvePath(enveloppeSucces, field.path) !== undefined;
    const enErreur = resolvePath(enveloppeErreur, field.path) !== undefined;
    if (!enSucces && enErreur) propres.push(field.path);
  }
  assert.deepEqual(propres, ['errorCode', 'error']);
});

test("l'exemple documenté est cohérent avec le schéma", () => {
  const exemplaires = [
    { ...EXAMPLE.response, data: EXAMPLE.data },
    { ...ERROR_EXAMPLE },
  ];
  const manquants: string[] = [];
  for (const field of FIELDS) {
    if (exemplaires.every((e) => resolvePath(e, field.path) === undefined)) manquants.push(field.path);
  }
  assert.deepEqual(manquants, [], `Exemple incomplet pour : ${manquants.join(', ')}`);
});

test('chaque champ documenté respecte sa nullabilité déclarée', () => {
  const enveloppe = { ...EXAMPLE.response, data: EXAMPLE.data };
  const violations: string[] = [];

  for (const field of FIELDS) {
    const v = resolvePath(enveloppe, field.path);
    if (v === undefined) continue;
    if (v === null && !field.nullable) {
      violations.push(`${field.path} est null alors qu'il est déclaré non-nullable`);
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});

test('chaque champ documenté respecte le type déclaré', () => {
  const enveloppe = { ...EXAMPLE.response, data: EXAMPLE.data };
  const attendu: Record<string, (v: unknown) => boolean> = {
    'string': (v) => typeof v === 'string',
    'number': (v) => typeof v === 'number',
    'boolean': (v) => typeof v === 'boolean',
    'string[]': (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    'object[]': (v) => Array.isArray(v),
    'null': (v) => v === null,
    'object': (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  };

  const violations: string[] = [];
  for (const field of FIELDS) {
    const v = resolvePath(enveloppe, field.path);
    if (v === undefined || v === null) continue;
    const check = attendu[field.type];
    if (check && !check(v)) {
      violations.push(`${field.path} : attendu ${field.type}, reçu ${typeof v}`);
    }
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});

test('aucun chemin documenté n\'est un doublon', () => {
  const paths = FIELDS.map((f) => f.path);
  assert.equal(new Set(paths).size, paths.length, 'chemins dupliqués dans le schéma');
});

test('les champs à valeur constante sont explicitement documentés comme tels', () => {
  // Ces champs étaient des constantes (coefficient: 1, noteMin: null…) tout en
  // étant présentés comme extraits. Ils sont désormais soit réellement extraits,
  // soit documentés comme pouvant valoir null.
  const maths = data.notes.toutesLesNotes.find((n) => n.matiere === 'MATHEMATIQUES')!;
  assert.notEqual(maths.coefficient, null);
  assert.notEqual(maths.noteMin, null);
  assert.notEqual(maths.noteMax, null);
  assert.match(maths.titre, /Contrôle/, 'le titre est extrait, plus fabriqué');
});

test('le schéma vide reste structurellement conforme', () => {
  const vide = emptyData({
    scrapedAt: new Date().toISOString(),
    urlEtablissement: 'https://example.invalid/',
    urlENT: '',
    versionPronote: 'test',
    dureeExtractionMs: 0,
    depuisCache: false,
  });
  const enveloppe = { jobId: 'x', success: false, status: 'error', executionTimeMs: 0, timestamp: '', data: vide };

  // Les chemins d'enveloppe d'erreur n'existent pas : on ne vérifie que `data.`.
  const manquants = FIELDS
    .filter((f) => f.path.startsWith('data.'))
    .filter((f) => resolvePath(enveloppe, f.path) === undefined)
    .map((f) => f.path);

  assert.deepEqual(manquants, [], `Schéma vide incohérent : ${manquants.join(', ')}`);
});

test('le catalogue des erreurs est complet et cohérent', () => {
  const codes = ERROR_CATALOG.map((e) => e.code);
  assert.equal(new Set(codes).size, codes.length, 'codes d\'erreur dupliqués');
  for (const e of ERROR_CATALOG) {
    assert.ok(e.http >= 200 && e.http < 600, `${e.code} : statut HTTP invalide (${e.http})`);
    assert.ok(e.description.length > 10, `${e.code} : description trop courte`);
  }
  // Les codes utilisés par le moteur d'extraction doivent être catalogués.
  for (const requis of ['INVALID_CREDENTIALS', 'EXTRACTION_EMPTY', 'TIMEOUT', 'RATE_LIMITED']) {
    assert.ok(codes.includes(requis), `${requis} doit figurer dans le catalogue`);
  }
});

test('le schéma est versionné', () => {
  assert.match(SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
});

test('resolvePath ne lève jamais sur un chemin inexistant', () => {
  assert.equal(resolvePath({ a: 1 }, 'a.b.c'), undefined);
  assert.equal(resolvePath(null, 'a'), undefined);
  assert.equal(resolvePath({ a: [{ b: 2 }] }, 'a[].b'), 2);

  // Tableau vide : le parent EXISTE, il n'a simplement aucun élément. On
  // retourne le tableau vide (et non `undefined`) pour que la vérification de
  // schéma distingue « champ absent » de « tableau sans élément ».
  assert.deepEqual(resolvePath({ a: [] }, 'a[].b'), []);
  assert.deepEqual(resolvePath({ a: [] }, 'a[]'), []);

  // Segment intermédiaire non-tableau là où un tableau est attendu.
  assert.equal(resolvePath({ a: { b: 1 } }, 'a[].b'), undefined);
  assert.equal(resolvePath({ a: null }, 'a[].b'), undefined);
});
