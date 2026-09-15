# Permissions nécessaires

Dernière mise à jour : 15 septembre 2026 (UTC)

Ce dépôt est public. Aucune commande d'inventaire des secrets n'est utilisée : les workflows vérifient seulement, dans leur environnement d'exécution, qu'une valeur requise est non vide. Ils n'affichent jamais une valeur de secret.

## GitHub

Le compte d'automatisation doit pouvoir :

- écrire le contenu de la branche de travail ;
- créer et fusionner une pull request vers `main` ;
- modifier `.github/workflows/` ;
- envoyer `repository_dispatch` ;
- écrire des commentaires sur l'issue #1 pour le résultat live explicitement autorisé.

Les workflows utilisent des permissions minimales :

| Workflow | Permissions |
|---|---|
| `ci.yml` | `contents: read` |
| `deploy-worker.yml` | `contents: read` |
| `pronote-runner.yml` | `contents: read` |
| `live-test.yml` | `contents: read`, `issues: write` |
| `pronote-live.yml` | `contents: read`, `issues: write` |
| `deploy-pages.yml` | `contents: read`, `pages: write`, `id-token: write` |

## Secrets consommés par Actions

| Nom | Usage | Requis |
|---|---|---|
| `CLOUDFLARE_TOKEN` | déployer le Worker | oui |
| `CLOUDFLARE_ID` | compte Cloudflare | oui |
| `GH_TOKEN` | permettre au Worker de déclencher le runner | oui |
| `ENT_ID` | authentification du test réel | test live |
| `ENT_PASS` | authentification du test réel | test live |
| `RUNNER_TOKEN` | authentification Worker ↔ runner | facultatif, repli sur `GH_TOKEN` |

`GITHUB_TOKEN` et `RUNNER_TOKEN` sont réinjectés comme secrets Wrangler après chaque déploiement. Le token Actions éphémère (`github.token`) sert uniquement à publier les commentaires du run courant.

## Cloudflare

`CLOUDFLARE_TOKEN` doit permettre l'édition de Workers Scripts pour le compte indiqué par `CLOUDFLARE_ID`. Le déploiement crée ou migre la classe SQLite `JobStore` déclarée dans `wrangler.toml`.

Cloudflare KV est interdit : aucun namespace ni binding KV ne doit être configuré ou consommé par le projet.

## Données personnelles

Le mode `publier_reponse=oui` publie la réponse API complète sur une issue publique. Il n'est acceptable qu'après un choix explicite du propriétaire. Le mode `non` publie un rapport assaini. Dans les deux modes, les identifiants ENT et les secrets d'infrastructure ne doivent jamais apparaître dans les logs, commentaires ou artefacts.
