# Reprise — Pronote API v4

Dernière mise à jour : 15 septembre 2026 (UTC)

## État de référence

La v4 remplace définitivement Cloudflare KV par un Durable Object SQLite. Le moteur unique est dans `src/pronote/`, le navigateur dans `pronote-standalone-runner/`, et le contrat public est généré depuis `src/pronote/schema.ts`.

Deux correctifs postérieurs à la PR v4 initiale sont verrouillés ici :

1. **Quota : attente sans scrutation.** Le Worker ouvre une seule requête `POST /wait` vers le Durable Object. `POST /result` la réveille immédiatement. La boucle de lecture toutes les 200 ms, qui pouvait coûter 128 requêtes DO par extraction, est supprimée.
2. **Débit : fenêtre fixe.** L'horodatage reste celui du premier appel de la fenêtre de 60 secondes. Un appel refusé ne repousse jamais la fin de fenêtre ; `Retry-After` indique les secondes réellement restantes.

Le runner utilise également un long-poll de 25 secondes pour réclamer le prochain job : au repos, il ne sollicite plus la passerelle toutes les 300 ms.

## Vérifications hors ligne

```bash
npm ci
npm run typecheck
npm test                         # 73/73
npx wrangler deploy --dry-run
bash scripts/smoke-test.sh       # Worker local
```

`tests/budget.test.ts` est le garde-fou principal du quota. Il échoue si une boucle de scrutation réapparaît dans le chemin synchrone.

## Déploiement complet

Le workflow `.github/workflows/pronote-live.yml` est l'unique orchestration du test de bout en bout :

1. vérification de la présence des secrets, sans afficher leur valeur ;
2. installation, typecheck et 73 tests ;
3. déploiement du Worker v4 ;
4. injection de `GITHUB_TOKEN` et `RUNNER_TOKEN` dans le Worker ;
5. preuve de la signature `4.0.0` + `Durable Object SQLite (KV supprimé)` ;
6. extraction ENT réelle, puis appel de l'API v4 ;
7. publication de la réponse choisie sur l'issue #1.

Déclenchement :

```bash
gh api repos/JeanHug/Pronote-API/dispatches -f event_type=pronote_complet
```

`repository_dispatch` n'utilise que le workflow présent sur la branche par défaut : la PR contenant ces fichiers doit donc être fusionnée avant ce déclenchement.

## Publication du test live

- `publier_reponse=oui` : la réponse API exacte est découpée en commentaires numérotés. C'est une publication publique de données scolaires, réservée à une autorisation explicite.
- `publier_reponse=non` : seul `rapport-public.json` est publié ; il contient statuts, compteurs et durées, sans donnée d'élève.
- Les artefacts Actions ne contiennent jamais la réponse complète.
- Aucun identifiant ENT n'est affiché, même tronqué, masqué ou haché.

## Workflows attendus

- `ci.yml`
- `deploy-worker.yml`
- `deploy-pages.yml`
- `live-test.yml`
- `pronote-live.yml`
- `pronote-runner.yml`

## Garde-fou de migration

`scripts/live-test.ts` vérifie la version et le stockage via `/api/v1/health` **avant** tout `POST /api/v1/scrape-pronote`. Si la signature v4 n'est pas exacte, le script s'arrête : l'ancienne v3 ne doit jamais recevoir d'identifiants.
