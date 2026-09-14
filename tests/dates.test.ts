import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferYear, isoDate, parsePronoteDate, parseHeure, jourDepuisDate,
  numeroSemaineISO, lundiDeLaSemaine, dimancheDeLaSemaine, anneeScolaire, dureeMinutes,
} from '../src/pronote/dates.ts';

/**
 * Ces tests couvrent la cause racine du bug de dates : l'ancienne
 * implémentation écrivait `${dayNum}/${monthNum}/2026` — l'année était CODÉE EN
 * DUR, et la regex d'extraction ne la capturait même pas. Toutes les dates
 * produites en dehors de 2026 étaient donc fausses.
 */

test("infère l'année scolaire correctement (août → juillet)", () => {
  // En septembre 2026 : l'année scolaire a commencé en 2026.
  const sept = new Date('2026-09-14T12:00:00Z');
  assert.equal(inferYear(9, sept), 2026);
  assert.equal(inferYear(12, sept), 2026);
  // Janvier-mai appartiennent à l'année scolaire suivante.
  assert.equal(inferYear(1, sept), 2027);
  assert.equal(inferYear(5, sept), 2027);
  assert.equal(inferYear(7, sept), 2027);
  // Août bascule sur la nouvelle année scolaire.
  assert.equal(inferYear(8, sept), 2026);

  // En mars 2027 : l'année scolaire a commencé en 2026.
  const mars = new Date('2027-03-10T12:00:00Z');
  assert.equal(inferYear(3, mars), 2027);
  assert.equal(inferYear(9, mars), 2026);
  assert.equal(inferYear(12, mars), 2026);
});

test('isoDate ne subit aucun décalage de fuseau', () => {
  assert.equal(isoDate(2026, 1, 5), '2026-01-05');
  assert.equal(isoDate(2026, 12, 31), '2026-12-31');
});

test('parsePronoteDate accepte les formats Pronote', () => {
  const ref = new Date('2026-09-14T12:00:00Z');
  assert.equal(parsePronoteDate('7 septembre', ref), '2026-09-07');
  assert.equal(parsePronoteDate('07/09/2026', ref), '2026-09-07');
  assert.equal(parsePronoteDate('2026-09-07', ref), '2026-09-07');
  assert.equal(parsePronoteDate('lundi 7 septembre', ref), '2026-09-07');
  assert.equal(parsePronoteDate('sept. 7', ref), '2026-09-07');
  assert.equal(parsePronoteDate('7/09', ref), '2026-09-07');
  // Janvier d'une date de septembre → année suivante.
  assert.equal(parsePronoteDate('15 janvier', ref), '2027-01-15');
  // Non parsable → null, sans lever d'exception.
  assert.equal(parsePronoteDate('', ref), null);
  assert.equal(parsePronoteDate('bientôt', ref), null);
});

test('parseHeure normalise les écritures Pronote', () => {
  assert.equal(parseHeure('8 heures 30'), '08:30');
  assert.equal(parseHeure('09:25'), '09:25');
  assert.equal(parseHeure('9h25'), '09:25');
  assert.equal(parseHeure('14 heures'), '14:00');
  assert.equal(parseHeure('10h'), '10:00');
  assert.equal(parseHeure('25h00'), null);
  assert.equal(parseHeure('12:99'), null);
});

test('jourDepuisDate est calculé, jamais déduit du CSS', () => {
  // 7 septembre 2026 est un lundi.
  assert.equal(jourDepuisDate('2026-09-07'), 'Lundi');
  assert.equal(jourDepuisDate('2026-09-08'), 'Mardi');
  assert.equal(jourDepuisDate('2026-09-12'), 'Samedi');
  assert.equal(jourDepuisDate('2026-09-13'), 'Dimanche');
  // Une date invalide ne doit pas produire un jour arbitraire silencieusement.
  assert.equal(jourDepuisDate('n/a'), 'Non spécifié');
});

test('numéro de semaine ISO est calculé, plus figé à 37', () => {
  assert.equal(numeroSemaineISO('2026-09-07'), 37);
  assert.equal(numeroSemaineISO('2026-01-01'), 1);   // jeudi de la semaine 1
  assert.equal(numeroSemaineISO('2026-12-31'), 53);
});

test('bornes de semaine', () => {
  assert.equal(lundiDeLaSemaine('2026-09-10'), '2026-09-07');
  assert.equal(dimancheDeLaSemaine('2026-09-10'), '2026-09-13');
  // Le lundi reste le lundi.
  assert.equal(lundiDeLaSemaine('2026-09-07'), '2026-09-07');
});

test('anneeScolaire respecte la bascule août/juillet', () => {
  assert.equal(anneeScolaire(new Date('2026-09-14T12:00:00Z')), '2026-2027');
  assert.equal(anneeScolaire(new Date('2027-03-14T12:00:00Z')), '2026-2027');
  assert.equal(anneeScolaire(new Date('2027-08-01T12:00:00Z')), '2027-2028');
});

test('dureeMinutes gère les créneaux normaux et les franchissements de minuit', () => {
  assert.equal(dureeMinutes('08:30', '09:25'), 55);
  assert.equal(dureeMinutes('10:40', '12:35'), 115);
  assert.equal(dureeMinutes('23:30', '00:30'), 60);
  assert.equal(dureeMinutes('invalide', '09:00'), 0);
});
