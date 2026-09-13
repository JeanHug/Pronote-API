# 🎓 Pronote REST API (Connexion ENT Automatisée)

> **La première API REST autonome, ultra-rapide (~15s) et sans serveur résidentiel pour Pronote via ENT (Seine-et-Marne 77 & national).**  
> Extraction complète en direct par **5 onglets parallèles** : **Profil Élève, Emploi du temps, Notes & Moyennes, Cahier de textes (Devoirs) et Ressources de cours** sous forme de JSON structuré propre et réel.

[![Status](https://img.shields.io/badge/Status-Op%C3%A9rationnel%2024%2F7-emerald?style=flat-square)](#)
[![Performance](https://img.shields.io/badge/Performance-~15s%20(5%20onglets%20parall%C3%A8les)-blue?style=flat-square)](#)
[![Architecture](https://img.shields.io/badge/Architecture-Double%20Canal%20(KV%20%2B%20Issues)-purple?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-slate?style=flat-square)](#)

---

## 🌐 Endpoints Officiels & URL de Production

| Service | URL | Méthode | Description |
| :--- | :--- | :--- | :--- |
| **Passerelle Principale** | `https://pronote-api.hugdu77777.workers.dev/api/scrape-pronote` | `POST` | Extraction Pronote directe synchrone (~15s) |
| **Sondage de Job** | `https://pronote-api.hugdu77777.workers.dev/api/job/:jobId` | `GET` | Récupération du résultat si la requête a basculé en différé |
| **Santé & Heartbeat** | `https://pronote-api.hugdu77777.workers.dev/api/health` | `GET` | État de la passerelle Cloudflare et du runner 5h |
| **Documentation & Playground Web** | `https://jeanhug.github.io/Pronote-API/` | `GET` | Interface graphique avec testeur en direct et schéma JSON |

---

## 🚀 Comment faire un appel à l'API ?

### 1. Avec cURL
```bash
curl -X POST "https://pronote-api.hugdu77777.workers.dev/api/scrape-pronote" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "mon.identifiant.ent",
    "password": "MonMotDePasseSecret!",
    "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl": "https://ent.seine-et-marne.fr/",
    "format": "json"
  }'
```

---

### 2. Avec JavaScript / TypeScript (Node.js & Navigateur)
```javascript
async function getPronoteData(username, password) {
  const GATEWAY = "https://pronote-api.hugdu77777.workers.dev";

  const res = await fetch(`${GATEWAY}/api/scrape-pronote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      pronoteUrl: "https://0771068t.index-education.net/pronote/eleve.html",
      entUrl: "https://ent.seine-et-marne.fr/",
      format: "json"
    })
  });

  const json = await res.json();

  // Mode Synchrone (Résultat reçu en direct en ~15s)
  if (res.status === 200 && json.success) {
    console.log("Élève :", json.data.eleve.nom, json.data.eleve.classe);
    console.log("Emploi du temps :", json.data.emploiDuTemps.tousLesCours.length, "cours");
    console.log("Moyenne Générale :", json.data.notes.moyenneGenerale, "/ 20");
    return json.data;
  }

  // Mode Asynchrone (202 Accepted) -> Polling toutes les 1.5s
  if (res.status === 202 && json.jobId) {
    console.log(`Traitement en cours... Suivi du job ${json.jobId}`);
    while (true) {
      await new Promise(r => setTimeout(r, 1500));
      const pollRes = await fetch(`${GATEWAY}/api/job/${json.jobId}`);
      const pollData = await pollRes.json();
      if (pollData.success && pollData.data) {
        return pollData.data;
      }
      if (pollData.error) throw new Error(pollData.error);
    }
  }

  throw new Error(json.error || "Erreur de scraping");
}
```

---

### 3. Avec Python 3 (`requests`)
```python
import requests
import time

GATEWAY = "https://pronote-api.hugdu77777.workers.dev"

def fetch_pronote(username, password):
    payload = {
        "username": username,
        "password": password,
        "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
        "entUrl": "https://ent.seine-et-marne.fr/",
        "format": "json"
    }

    res = requests.post(f"{GATEWAY}/api/scrape-pronote", json=payload)

    if res.status_code == 200:
        return res.json()["data"]

    elif res.status_code == 202:
        job_id = res.json().get("jobId")
        print(f"Polling job {job_id}...")
        for _ in range(40):
            time.sleep(1.5)
            poll = requests.get(f"{GATEWAY}/api/job/{job_id}").json()
            if poll.get("success") and "data" in poll:
                return poll["data"]

    raise Exception(f"Erreur ({res.status_code}): {res.text}")
```

---

## 📋 Exemple Réel du JSON Renvoyé (100% Validé)

```json
{
  "jobId": "job_1789294245192_w7x9a",
  "success": true,
  "executionTimeMs": 15420,
  "timestamp": "2026-09-13T10:10:48.000Z",
  "data": {
    "eleve": {
      "nom": "FLAVIGNARD Emilien",
      "classe": "3EME6",
      "etablissement": "COLLEGE ROSA BONHEUR",
      "photoUrl": "https://0771068t.index-education.net/pronote/DocEleve/photo.jpg",
      "periodeActuelle": "1er Trimestre"
    },
    "emploiDuTemps": {
      "tousLesCours": [
        {
          "jour": "Lundi",
          "date": "07/09/2026",
          "heureDebut": "09h25",
          "heureFin": "10h20",
          "matiere": "ALLEMAND LV2",
          "professeur": "MOREAU F.",
          "salle": "203",
          "groupe": "3EMES-1-2-ALL2",
          "statut": "Normal"
        },
        {
          "jour": "Mardi",
          "date": "08/09/2026",
          "heureDebut": "08h30",
          "heureFin": "09h25",
          "matiere": "MATHEMATIQUES",
          "professeur": "LECLERC M.",
          "salle": "204",
          "groupe": "Classe entière",
          "statut": "Normal"
        }
      ]
    },
    "notes": {
      "moyenneGenerale": "20.00",
      "moyenneGeneraleClasse": "15.24",
      "evaluations": [
        {
          "date": "10 sept",
          "matiere": "FRANCAIS",
          "titre": "Évaluation FRANCAIS - Lecture & Compréhension",
          "note": "10.00",
          "sur": "10",
          "coefficient": 1,
          "moyenneClasse": "7.62",
          "noteMin": null,
          "noteMax": null
        },
        {
          "date": "11 sept",
          "matiere": "MATHEMATIQUES",
          "titre": "Contrôle N°1 - Calcul littéral",
          "note": "20.00",
          "sur": "20",
          "coefficient": 2,
          "moyenneClasse": "14.50",
          "noteMin": "06.00",
          "noteMax": "20.00"
        }
      ]
    },
    "devoirs": [
      {
        "pourLe": "15/09/2026",
        "matiere": "FRANCAIS",
        "titre": "Lecture chapitre 3",
        "description": "Lire attentivement le chapitre 3 et répondre aux questions 1 à 4 page 56.",
        "fait": false,
        "avecRendu": false
      }
    ],
    "ressources": [
      {
        "matiere": "HISTOIRE-GEOGRAPHIE",
        "titre": "Carte de l'Europe en 1914",
        "description": "Document de cours projeté lors de la séance du 10 septembre.",
        "url": "https://0771068t.index-education.net/pronote/fichiers/carte_1914.pdf",
        "type": "document"
      }
    ]
  }
}
```

---

## 📖 Dictionnaire des Paramètres & Formats

| Paramètre | Type | Requis | Description |
| :--- | :--- | :--- | :--- |
| `username` | String | Oui | Identifiant de connexion ENT |
| `password` | String | Oui | Mot de passe de connexion ENT |
| `pronoteUrl` | String | Optionnel | URL directe de l'espace élève Pronote |
| `entUrl` | String | Optionnel | URL du portail ENT |
| `format` | String | Optionnel | `"json"` (défaut), `"html"` (interface stylisée avec CSS Pronote) ou `"raw_html"` |
| `forceAsync` | Boolean | Optionnel | Si `true`, force la réponse 202 immédiate avec `jobId` |

---

## ⚙️ Architecture Nouvelle Génération (~15s)

1. **Passerelle Edge Cloudflare Worker** : Reçoit la requête en HTTPS mondialement et surveille les résultats en double canal.
2. **Runner GitHub Actions (16 Go RAM / 4 cœurs)** : Polling sub-seconde (800ms) pour intercepter le travail instantanément.
3. **Extraction Simultanée en 5 Onglets** : Une fois la session SSO validée, Chromium scrape simultanément l'accueil, l'emploi du temps, les notes, les devoirs et les contenus de cours.
4. **Relais Double Canal KV + GitHub Issues** : Les données sont publiées en parallèle sur Cloudflare KV et via l'API GitHub Issues, garantissant une transmission instantanée sans latence de réplication.

---

## 📄 Licence & Mentions Légales
Ce projet est développé à des fins d'interopérabilité et d'automatisation personnelle. Pronote et Index Éducation sont des marques déposées de Docaposte / La Poste.
