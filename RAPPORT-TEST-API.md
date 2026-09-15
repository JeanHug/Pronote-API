# Rapport de test — Pronote API v4

Date : 15 septembre 2026 (UTC)

## Résumé

| Vérification | Résultat |
|---|---:|
| TypeScript strict (`npm run typecheck`) | **0 erreur** |
| Tests hors ligne (`npm test`) | **73/73** |
| Smoke test Worker local (`scripts/smoke-test.sh`) | **37/37** |
| Bundle Worker (`wrangler deploy --dry-run`) | **94,89 Kio / 24,59 Kio gzip** |
| Audit npm | **0 vulnérabilité** |
| Cloudflare KV fonctionnel | **aucune dépendance** |
| Attente synchrone | **une requête `POST /wait` tenue ouverte** |
| Limitation de débit | **fenêtre fixe de 60 s** |
| Runner au repos | **long-poll `/next-job` de 25 s** |

## Correctif quota

Avant le correctif post-fusion, le Worker exécutait une lecture du Durable Object toutes les 200 ms pendant un budget de 25 secondes. Une extraction pouvait donc produire environ 128 requêtes DO. Avec une enveloppe de 100 000 requêtes/jour, ce comportement réduisait le plafond théorique à environ 781 extractions par jour.

Le nouveau chemin nominal est :

1. `POST /ratelimit` ;
2. `POST /job` ;
3. `GET /health` pour décider du démarrage du runner ;
4. `POST /wait`, gardé ouvert ;
5. `POST /claim` par le runner ;
6. `POST /result`, qui réveille `/wait`.

`/api/v1/health` expose le compteur persistant `requetesDO`. Les sondes de santé servant à lire ce compteur sont exclues du compteur afin que la différence avant/après mesure uniquement le flux observé.

## Correctif de limitation de débit

La table `hits` conserve :

- `n` : nombre d'appels de la fenêtre ;
- `ts` : début de la fenêtre, fixé au premier appel.

Tant que `now - ts < 60 000`, `ts` reste inchangé, y compris pour un appel refusé. À expiration, le compteur repart à 1 et `ts` prend le nouvel instant. Le Worker calcule `Retry-After` à partir de `resetAt - now`, au lieu d'annoncer systématiquement 60 secondes.

## Garde-fous automatisés

`tests/budget.test.ts` contient quatre tests :

- un seul `POST /wait` et aucune boucle dans la section d'attente ;
- réveil explicite des attentes par `POST /result` ;
- stabilité de la fenêtre après saturation et refus ;
- réinitialisation exacte à 60 secondes.

Le workflow CI exécute également :

```bash
npm run typecheck
npm test
npx wrangler deploy --dry-run
```

## Test live

Le test réel doit être lancé uniquement après déploiement de la v4. Le script refuse tout appel de scrape si `/api/v1/health` ne renvoie pas simultanément :

```json
{
  "version": "4.0.0",
  "storage": "Durable Object SQLite (KV supprimé)"
}
```

Le résultat de la campagne Actions et la mesure `requetesDO` seront consignés ici après le workflow `Pronote complet v4`.
