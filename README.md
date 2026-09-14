# Pronote API

API REST qui extrait l'emploi du temps, les notes, les devoirs, les ressources et la vie scolaire d'un élève Pronote, et les renvoie en JSON structuré et documenté.

**Architecture :** Cloudflare Worker (edge) → Durable Object à cohérence forte → runner GitHub Actions (navigateur Puppeteer).

---

## Ce qui a changé (v4)

Cette version corrige 103 problèmes identifiés dans l'audit (`AUDIT-PRONOTE-API.md`). Les décisions structurantes :

| Avant | Après | Pourquoi |
|---|---|---|
| **Cloudflare KV** comme file d'attente et bus de résultats | **Durable Object SQLite** | KV est *eventually consistent* : jusqu'à **60 s** de propagation, alors que la boucle d'attente était plafonnée à 50 s. L'API ne pouvait structurellement pas répondre — d'où les ~2 minutes observées. Un Durable Object est mono-thread et fortement cohérent. |
| **Deux implémentations** du scraping, c'est la mauvaise qui tournait | **Une seule**, conforme au schéma | `pronoteExtractor.ts` (808 lignes, produisant les vraies données) n'était **importé par personne**. Le parseur exécuté décrivait 57 champs documentés dont 4 seulement existaient. |
| Documentation écrite à la main | **Générée depuis le schéma** | La doc annonçait « 10-12 s » et un mode différé inutilisable. Désormais `tests/schema.test.ts` échoue si un champ documenté disparaît. |
| Aucun test | **69 tests** | `tsc` et le build passaient : aucun des 103 bugs n'était détectable automatiquement. |
| Endpoints runner ouverts au public | **Authentifiés (fail-closed)** | `GET /api/runner/poll-job` distribuait les mots de passe ENT à quiconque appelait l'URL. |
| Identifiants publiés en commentaire d'issue publique | **Plus jamais transmis hors du runner** | Chaque requête postait `{"username":…,"password":…}` sur l'issue #1, sur un dépôt public. |
| CORS `*` sur tous les endpoints | **Origines restreintes** | Les `jobId` étant prédictibles et `/api/job/:jobId` non authentifié, n'importe quel site pouvait lire les notes des élèves. |
| PAT GitHub en clair dans `worker.js` | **Secret Wrangler uniquement** | Le token était « obfusqué » par un `.join("_")` — reconstituable en une ligne, et dans l'historique git. |

### Latences supprimées

| Source | Gain |
|---|---|
| Propagation KV (job et résultat) | **0 à 120 s → quelques ms** |
| `html` + `rawHtml` dupliqués dans la réponse JSON | plusieurs Mo par requête |
| 4 × `setTimeout(900)` fixes | → attentes conditionnelles |
| 8 s + 7 s d'attentes sur timeout | → échec rapide et explicite |
| Parcours `$('*')` de tout le DOM pour les devoirs | → sélecteur ciblé |
| Boot du runner (22 s mesurés) | atténué par le relais de session |

---

## Démarrage

```bash
npm install
npm run check          # typecheck strict + 69 tests
npm run dev            # wrangler dev (Worker en local)
npm run deploy         # wrangler deploy
npm run build:docs     # génère docs/index.html depuis le schéma
```

### Secrets à configurer

**Secrets du dépôt GitHub** (Settings → Secrets and variables → Actions) :

| Secret | Rôle | Requis |
|---|---|---|
| `CLOUDFLARE_TOKEN` | Déploiement du Worker (permissions *Workers Scripts: Edit*) | oui |
| `CLOUDFLARE_ID` | Account ID Cloudflare | oui |
| `GH_TOKEN` | Permet au Worker de déclencher le runner | oui |
| `RUNNER_TOKEN` | Secret partagé Worker ↔ runner (repli sur `GH_TOKEN`) | recommandé |
| `ENT_ID` / `ENT_PASS` | Test live uniquement | pour `live-test` |

**Secrets du Worker** (`wrangler secret put NOM`) — configurés automatiquement par le workflow `Deploy Worker`. Voir `.env.example`.

---

## API

| Méthode | Chemin | Description |
|---|---|---|
| `POST` | `/api/v1/scrape-pronote` | Extraction complète |
| `GET` | `/api/v1/job/:jobId` | Résultat d'un job (202 tant qu'il tourne) |
| `GET` | `/api/v1/health` | État de la passerelle et du runner |
| `GET` | `/api/v1/schema` | Schéma machine (champs, codes d'erreur) |
| `GET` | `/docs` | Documentation générée |

### Exemple

```bash
curl -X POST "https://pronote-api.hugdu77777.workers.dev/api/v1/scrape-pronote" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "prenom.nom",
    "password": "VOTRE_MOT_DE_PASSE",
    "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl": "https://ent.seine-et-marne.fr/"
  }'
```

### Réponse

```jsonc
{
  "jobId": "3f8a2c10-9b4e-4a7d-8c1f-2e5b9d0a7c34",
  "success": true,
  "status": "done",
  "executionTimeMs": 11340,
  "timestamp": "2026-09-14T16:02:11.482Z",
  "extraction": {
    "hasData": true,
    "modules": [
      { "module": "emploiDuTemps", "status": "ok", "itemCount": 26 },
      { "module": "menuCantine",   "status": "empty", "itemCount": 0 }
    ],
    "missingModules": ["menuCantine"],
    "timingsMs": { "ent": 1180, "authentification": 2100, "emploiDuTemps": 340, "total": 11340 },
    "engineVersion": "4.0.0"
  },
  "data": {
    "eleve":          { "nom": "DUPONT", "prenom": "Lucas", "classe": "3EME6", "…": "…" },
    "emploiDuTemps":  { "anneeScolaire": "2026-2027", "totalCours": 26, "semaines": ["…"] },
    "notes":          { "moyenneGenerale": 15.82, "moyennesParMatiere": ["…"], "…": "…" },
    "agenda":         { "totalDevoirs": 9, "totalDevoirsAFaire": 5, "devoirs": ["…"] },
    "contenusEtRessources": { "totalRessources": 34, "parMatiere": ["…"] },
    "vieScolaire":    { "totalAbsences": 2, "…": "…" },
    "evaluationsEtCompetences": { "…": "…" },
    "messagerieEtActualites":   { "…": "…" },
    "menuCantine":    { "semaine": ["…"] },
    "meta":           { "scrapedAt": "…", "depuisCache": false }
  }
}
```

Le détail complet des champs est sur `/docs` ou `/api/v1/schema`.

### Quand l'extraction dépasse le budget d'attente

L'API répond **`202 Accepted`** avec un `jobId` **exploitable** :

```jsonc
{
  "jobId": "3f8a2c10-…",
  "success": false,
  "status": "running",
  "errorCode": "TIMEOUT",
  "statusUrl": "https://…/api/v1/job/3f8a2c10-…",
  "retryAfterSeconds": 3
}
```

Il suffit d'interroger `statusUrl` jusqu'à obtenir un `200` (ou `502` en cas d'échec réel). L'ancienne version renvoyait un `504` **sans aucun identifiant**, rendant le mode différé documenté totalement inutilisable.

### Codes d'erreur

`INVALID_REQUEST`, `INVALID_CREDENTIALS`, `ENT_AUTH_FAILED`, `PRONOTE_AUTH_FAILED`, `ENT_UNREACHABLE`, `PRONOTE_UNREACHABLE`, `NAVIGATION_TIMEOUT`, `EXTRACTION_EMPTY`, `EXTRACTION_PARTIAL`, `RATE_LIMITED`, `UNAUTHORIZED`, `FORBIDDEN_HOST`, `NO_RUNNER_AVAILABLE`, `TIMEOUT`, `INTERNAL_ERROR`.

`EXTRACTION_EMPTY` remplace l'ancien comportement qui renvoyait `success: true` avec des données vides — impossible pour un client de distinguer « cet élève n'a aucune note » de « l'extraction a échoué ».

---

## Tests

```bash
npm test                          # 69 tests
npm run typecheck                 # tsc --noEmit, strict
npx tsx --test tests/parse.test.ts  # un fichier en particulier
```

Les tests s'exécutent **hors ligne**, sur des fixtures HTML anonymisées. C'est possible parce que le parseur `src/pronote/parse.ts` est une **fonction pure** : HTML en entrée, `PronoteData` en sortie, sans navigateur ni réseau.

| Fichier | Ce qu'il vérifie |
|---|---|
| `tests/dates.test.ts` | Inférence d'année scolaire, semaine ISO, parsing des heures |
| `tests/parse.test.ts` | Extraction complète sur fixtures, et **non-régression** des bugs corrigés |
| `tests/schema.test.ts` | Chaque champ documenté existe réellement dans la sortie |
| `tests/security.test.ts` | SSRF, assainissement des sessions, comparaison à temps constant |

Le test le plus important est dans `schema.test.ts` : il résout chaque chemin documenté dans une réponse réelle. C'est ce qui rend impossible la dérive doc ↔ implémentation qui avait produit 53 champs fantômes.

---

## Confidentialité

Cette API manipule des données personnelles de mineurs. Trois garde-fous :

- **Les identifiants ENT ne sortent jamais du runner.** Ils ne sont ni journalisés, ni publiés, ni stockés au-delà de la durée de vie du job (30 min en file, 1 h pour les résultats).
- **Le rapport de test live est assaini sur dépôt public.** Les logs et artefacts d'un dépôt public sont lisibles par tout le monde : `scripts/live-test.ts` n'écrit la réponse intégrale que si le dépôt est privé.
- **Aucune donnée d'élève n'est publiée sur GitHub.** Les diagnostics éventuellement postés en commentaire d'issue sont limités à `{ jobId, statut, code d'erreur, durée }`.

---

## Structure

```
src/pronote/            Moteur d'extraction — sans navigateur, testable hors ligne
  types.ts              Contrat de données (source de vérité)
  schema.ts             Schéma exécutable + exemples (génère la doc)
  parse.ts              Parseur : HTML → PronoteData (fonctions pures)
  dates.ts              Inférence d'années scolaires, semaines ISO
  report.ts             Rapport de complétude des modules

worker/                 Passerelle Cloudflare
  index.ts              Routage, authentification, validation
  jobstore.ts           Durable Object : file d'attente et résultats
  security.ts           SSRF, CORS, assainissement, comparaison constante
  github.ts             Déclenchement du runner via l'API GitHub
  docs.ts               Génération de la documentation

pronote-standalone-runner/
  runner.ts             Boucle de session (~5 h)
  scraper.ts            Puppeteer : ENT → Pronote → captures DOM

tests/                  69 tests + fixtures HTML anonymisées
scripts/                Test live, génération de la doc
```

---

## Limites

- **10 extractions/minute/IP.** File d'attente de 30 minutes, résultats conservés 1 heure.
- **Le scraping est intrinsèquement lent** (~10-15 s) : il ouvre un navigateur et authentifie un SSO. La latence perçue dépend surtout de la disponibilité du runner.
- **Un seul établissement par défaut.** `pronoteUrl` et `entUrl` sont paramétrables, mais la connexion ENT est écrite pour Seine-et-Marne (Alpine.js, `input[name=email]`). Un autre ENT demande un adaptateur.
- **Pas de cache.** Un cache par `hash(username + pronoteUrl)` avec un TTL de 10 minutes réduirait fortement le coût, mais exposerait des données scolaires en mémoire partagée — décision à prendre explicitement.

## Licence

Aucune licence déclarée. Ce code interagit avec un service tiers (Pronote / Index Éducation) ; vérifiez les conditions d'utilisation applicables avant tout usage autre que personnel.
