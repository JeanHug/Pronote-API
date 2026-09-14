/**
 * Génère la documentation statique depuis le schéma.
 * La documentation ne peut donc pas dériver de l'implémentation : elle est
 * produite à partir de `src/pronote/schema.ts`, que `tests/schema.test.ts`
 * vérifie contre la sortie réelle du parseur.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { renderDocs } from '../worker/docs.ts';

const base = process.env.API_BASE || 'https://pronote-api.hugdu77777.workers.dev';

mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', renderDocs(base), 'utf8');

console.log(`docs/index.html généré (base : ${base})`);
