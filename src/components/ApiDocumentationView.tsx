import React, { useState, useEffect } from 'react';
import { Menu, X, Copy, Check, Shield, Server, Zap, BookOpen, Clock, CheckCircle, Code, Search, FileText, Play } from 'lucide-react';

const ChronoDisplay: React.FC<{ isTesting: boolean; finalTime: string | null }> = ({ isTesting, finalTime }) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isTesting) {
      if (!finalTime) {
        setElapsedMs(0);
      }
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);
    return () => clearInterval(interval);
  }, [isTesting, finalTime]);

  if (!isTesting && !finalTime) return null;

  let formatted = "";
  if (finalTime) {
    formatted = finalTime;
  } else {
    const totalSecs = elapsedMs / 1000;
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toFixed(1).padStart(4, '0');
    formatted = `${mins}:${secs}s`;
  }

  return (
    <div className="px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-md font-mono text-xs font-bold text-slate-800 flex items-center gap-2 shrink-0">
      <span className={`w-2.5 h-2.5 rounded-full ${isTesting ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></span>
      <span>{isTesting ? 'Temps écoulé : ' : 'Temps final : '}</span>
      <span className="text-slate-900 font-extrabold text-sm">{formatted}</span>
    </div>
  );
};

export const ApiDocumentationView: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<'curl' | 'js' | 'python' | 'php' | 'go'>('curl');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Live Playground State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pronoteUrl, setPronoteUrl] = useState('');
  const [entUrl, setEntUrl] = useState('');
  const [format, setFormat] = useState<'json' | 'html' | 'raw_html'>('json');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [resultTag, setResultTag] = useState<string>('');
  const [finalTime, setFinalTime] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const codeSnippets = {
    curl: `curl -X POST "https://pronote-api.hugdu77777.workers.dev/api/scrape-pronote" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "prenom.nom@ent.fr",
    "password": "MonMotDePasseSecret123!",
    "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl": "https://ent.seine-et-marne.fr/",
    "format": "json"
  }'`,
    js: `async function getPronoteData() {
  const GATEWAY = "https://pronote-api.hugdu77777.workers.dev";
  const response = await fetch(\`\${GATEWAY}/api/scrape-pronote\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "prenom.nom@ent.fr",
      password: "MonMotDePasseSecret123!",
      pronoteUrl: "https://0771068t.index-education.net/pronote/eleve.html",
      entUrl: "https://ent.seine-et-marne.fr/",
      format: "json"
    })
  });
  
  const result = await response.json();
  if (response.ok && result.success) {
    console.log("Élève :", result.data.eleve.nom, result.data.eleve.classe);
    console.log("Emploi du temps :", result.data.emploiDuTemps.tousLesCours.length, "cours");
    console.log("Moyenne Générale :", result.data.notes.moyenneGenerale, "/ 20");
    return result.data;
  }
  
  throw new Error(result.error || "Erreur d'extraction Pronote");
}

getPronoteData().then(console.log).catch(console.error);`,
    python: `import requests

GATEWAY = "https://pronote-api.hugdu77777.workers.dev"

def get_pronote():
    payload = {
        "username": "prenom.nom@ent.fr",
        "password": "MonMotDePasseSecret123!",
        "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
        "entUrl": "https://ent.seine-et-marne.fr/",
        "format": "json"
    }
    
    res = requests.post(f"{GATEWAY}/api/scrape-pronote", json=payload)
    data = res.json()
    
    if res.status_code == 200 and data.get("success"):
        return data["data"]
        
    raise Exception(data.get("error", "Erreur d'extraction Pronote"))

print(get_pronote())`,
    php: `<?php
$gateway = "https://pronote-api.hugdu77777.workers.dev";
$payload = json_encode([
    "username" => "prenom.nom@ent.fr",
    "password" => "MonMotDePasseSecret123!",
    "pronoteUrl" => "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl" => "https://ent.seine-et-marne.fr/",
    "format" => "json"
]);

$ch = curl_init("$gateway/api/scrape-pronote");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);

if ($httpCode === 200 && !empty($data['success'])) {
    print_r($data['data']);
} else {
    echo "Erreur : " . ($data['error'] ?? 'Échec de connexion');
}
?>`,
    go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	gateway := "https://pronote-api.hugdu77777.workers.dev"
	payload, _ := json.Marshal(map[string]string{
		"username":   "prenom.nom@ent.fr",
		"password":   "MonMotDePasseSecret123!",
		"pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
		"entUrl":     "https://ent.seine-et-marne.fr/",
		"format":     "json",
	})

	resp, err := http.Post(gateway+"/api/scrape-pronote", "application/json", bytes.NewBuffer(payload))
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println("Données Pronote :", string(body))
}`
  };

  const fullSampleJson = `{
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
}`;

  const handleLiveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setIsTesting(true);
    setFinalTime(null);
    setResultTag('Connexion...');
    setTestResult('Lancement de la requête à la passerelle Cloudflare...');

    const startTime = Date.now();

    const computeFinalTimeStr = () => {
      const totalSecs = (Date.now() - startTime) / 1000;
      const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
      const secs = (totalSecs % 60).toFixed(1).padStart(4, '0');
      return `${mins}:${secs}s`;
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 120000); // Timeout max de 2 minutes

    try {
      const bodyPayload: any = { 
        username: username.trim(), 
        password: password.trim(),
        format
      };
      if (pronoteUrl.trim()) bodyPayload.pronoteUrl = pronoteUrl.trim();
      if (entUrl.trim()) bodyPayload.entUrl = entUrl.trim();

      const res = await fetch('https://pronote-api.hugdu77777.workers.dev/api/scrape-pronote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      let data = await res.json();

      const exactDuration = computeFinalTimeStr();
      setFinalTime(exactDuration);

      if (data.success) {
        setResultTag('⚡ Succès');
        setTestResult(JSON.stringify(data, null, 2));
      } else {
        setResultTag('❌ Erreur');
        setTestResult(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const exactDuration = computeFinalTimeStr();
      setFinalTime(exactDuration);
      if (err.name === 'AbortError') {
        setResultTag('⏱️ Timeout (2 min)');
        setTestResult(JSON.stringify({
          success: false,
          error: "Délai limite de 2 minutes atteint. L'extraction a été interrompue.",
          timeoutMs: 120000,
          timestamp: new Date().toISOString()
        }, null, 2));
      } else {
        setResultTag('❌ Erreur réseau');
        setTestResult('Erreur: ' + (err.message || 'Echec de connexion'));
      }
    } finally {
      clearTimeout(timeoutId);
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white min-h-screen text-slate-900 font-sans max-w-full overflow-x-hidden">
      {/* Top Bar Minimaliste: PRONOTE API */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 w-full max-w-full shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className="p-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition md:hidden"
              aria-label="Menu"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 tracking-tight text-base">PRONOTE API</span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full uppercase tracking-wider">v2.4 Rest</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
               <Search className="w-3.5 h-3.5 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Rechercher une clé JSON..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="bg-transparent border-none focus:outline-none w-48 text-xs text-slate-800 placeholder-slate-400"
               />
            </div>
            <a href="#playground" className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition flex items-center gap-1.5">
              <Play className="w-3 h-3 fill-current text-emerald-400" />
              <span>Console de Test</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto flex w-full max-w-full">
        {/* Mobile Backdrop */}
        {isMenuOpen && (
          <div 
            onClick={() => setIsMenuOpen(false)} 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
          />
        )}

        {/* Left Drawer / Navigation Sidebar */}
        <aside className={`
          fixed md:sticky top-14 left-0 z-50 md:z-20 w-72 h-[calc(100vh-56px)] bg-white border-r border-slate-200 p-5 overflow-y-auto transform transition-transform duration-200 ease-out shrink-0 text-xs shadow-xl md:shadow-none
          ${isMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
            <span className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">Table des matières</span>
            <button onClick={() => setIsMenuOpen(false)} className="p-1 rounded text-slate-500 hover:text-slate-900 md:hidden">
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="space-y-1.5 text-slate-700">
            <a href="#vue-densemble" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>1. Vue d'ensemble</span>
            </a>
            <a href="#quickstart" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>2. Démarrage Rapide</span>
            </a>
            <a href="#authentification" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>3. Sécurité & RGPD</span>
            </a>
            <a href="#endpoints" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <Code className="w-3.5 h-3.5 text-blue-600" />
              <span>4. Endpoints REST & Status</span>
            </a>
            <a href="#dictionnaire" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>5. Dictionnaire JSON Exhaustif</span>
            </a>
            <a href="#exemple-json" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
              <span>6. Exemple Réel Complet (200)</span>
            </a>
            <a href="#ent-compatibles" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <Server className="w-3.5 h-3.5 text-purple-600" />
              <span>7. Liste des ENT Compatibles</span>
            </a>
            <a href="#architecture" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 font-medium transition">
              <Clock className="w-3.5 h-3.5 text-rose-600" />
              <span>8. Architecture 24/7/365</span>
            </a>
            <a href="#playground" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md font-bold text-slate-900 bg-slate-100 border border-slate-200 mt-4 transition">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>9. Playground & Chrono</span>
            </a>
          </nav>

          <div className="mt-8 p-3 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-900">Spécifications API</div>
            <div>Format : JSON UTF-8</div>
            <div>Auth : SSO ENT (Sans stockage)</div>
            <div>Performance : ~15s à 20s</div>
          </div>
        </aside>

        {/* Documentation Body Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-8 space-y-12 max-w-4xl text-sm leading-relaxed overflow-x-hidden w-full">
          
          {/* Section 1: Vue d'ensemble */}
          <section id="vue-densemble" className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Documentation Technique</span>
              <span>•</span>
              <span className="text-emerald-600">Statut: Opérationnel 24/7</span>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight border-b border-slate-200 pb-3">
              1. Vue d'ensemble & Passerelle REST
            </h1>
            <p className="text-slate-700 leading-relaxed text-base">
              L'<strong>API REST Pronote</strong> est une passerelle autonome universelle qui permet d'extraire de manière exhaustive et structurée l'ensemble des données scolaires d'un élève (profil, emploi du temps dynamique, contrôles, notes, moyennes générales/de classe, cahier de textes, devoirs et ressources de cours) à partir d'un compte ENT (Espace Numérique de Travail).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-900 text-xs mb-1 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Extraction Directe</span>
                </div>
                <p className="text-xs text-slate-600">Analyse le DOM Pronote/WLangage en temps réel via un moteur Chromium headless haute performance.</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-900 text-xs mb-1 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Éphémère & RGPD</span>
                </div>
                <p className="text-xs text-slate-600">Aucune persistance de mot de passe ou identifiant. Sessions volatilement détruites après usage.</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-900 text-xs mb-1 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-600" />
                  <span>Haute Disponibilité</span>
                </div>
                <p className="text-xs text-slate-600">Passerelle Edge Cloudflare Worker couplée à un runner de secours auto-déclenché 24/7/365.</p>
              </div>
            </div>

            <div className="p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div>
                <div className="text-slate-400 text-[10px] font-sans font-bold uppercase tracking-wider mb-1">URL de Base en Production</div>
                <span className="font-bold text-emerald-400 text-sm break-all select-all">https://pronote-api.hugdu77777.workers.dev</span>
              </div>
              <button 
                onClick={() => copyText('https://pronote-api.hugdu77777.workers.dev', 'base')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-sans font-semibold text-xs shrink-0 flex items-center gap-1.5 transition"
              >
                {copiedKey === 'base' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'base' ? 'Copié !' : 'Copier l\'URL'}</span>
              </button>
            </div>
          </section>

          {/* Section 2: Démarrage Rapide */}
          <section id="quickstart" className="space-y-4 max-w-full">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2">
              2. Démarrage Rapide (Code Snippets)
            </h2>
            <p className="text-slate-700">
              Envoyez une requête HTTP <code className="font-bold bg-slate-100 px-1 py-0.5 rounded text-slate-900">POST</code> au format JSON avec les identifiants de l'élève. L'API gère le mode synchrone (200 OK) ou le mode asynchrone (202 Accepted avec polling automatique).
            </p>

            <div className="border border-slate-300 rounded-lg overflow-hidden max-w-full shadow-xs">
              <div className="bg-slate-100 border-b border-slate-300 px-4 py-2 flex items-center justify-between text-xs font-semibold">
                <div className="flex gap-3">
                  {(['curl', 'js', 'python', 'php', 'go'] as const).map((lang) => (
                    <button 
                      key={lang}
                      onClick={() => setActiveLang(lang)} 
                      className={`uppercase tracking-wider transition ${activeLang === lang ? 'font-black text-slate-900 border-b-2 border-slate-900 pb-0.5' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => copyText(codeSnippets[activeLang], 'code')}
                  className="text-xs text-slate-700 hover:text-black flex items-center gap-1 transition"
                >
                  {copiedKey === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'code' ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-w-full whitespace-pre-wrap break-all leading-relaxed">
                <code>{codeSnippets[activeLang]}</code>
              </pre>
            </div>
          </section>

          {/* Section 3: Authentification & Sécurité */}
          <section id="authentification" className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2">
              3. Authentification & Conformité RGPD
            </h2>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2 text-emerald-950">
              <div className="font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                <span>Garantie de Confidentialité & Sécurité des Données</span>
              </div>
              <ul className="list-disc list-inside text-xs space-y-1.5 text-emerald-900">
                <li><strong>Chiffrement TLS 1.3 :</strong> Tous les échanges entre votre application et la passerelle transitent sur des canaux HTTPS chiffrés de bout en bout.</li>
                <li><strong>Zero Password Storage :</strong> Le mot de passe ENT est utilisé exclusivement dans la mémoire volatile de l'instance Chromium headless et est immédiatement détruit après le succès de l'authentification.</li>
                <li><strong>Purge KV Éphémère :</strong> Les résultats JSON sont temporairement conservés en mémoire cache pendant 10 minutes avec une clé aléatoire anonyme (<code className="font-mono text-emerald-800">jobId</code>) puis purgés définitivement.</li>
              </ul>
            </div>
          </section>

          {/* Section 4: Endpoints REST */}
          <section id="endpoints" className="space-y-6 max-w-full">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2">
              4. Spécification des Endpoints REST
            </h2>

            {/* Endpoint 1: POST /api/scrape-pronote */}
            <div className="space-y-3 bg-slate-50 p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-slate-900 text-white font-mono font-bold text-xs rounded">POST</span>
                <code className="font-bold text-slate-900 text-base">/api/scrape-pronote</code>
              </div>
              <p className="text-xs text-slate-600">Lance la procédure d'extraction SSO ENT et parse le DOM Pronote complet.</p>

              <div className="font-bold text-xs text-slate-800 mt-2">Corps de la Requête (JSON) :</div>
              <div className="overflow-x-auto w-full max-w-full border border-slate-200 rounded-md bg-white">
                <table className="w-full text-xs text-left border-collapse min-w-[550px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold">
                      <th className="p-2 border-r border-slate-200">Champ</th>
                      <th className="p-2 border-r border-slate-200">Type</th>
                      <th className="p-2 border-r border-slate-200">Requis</th>
                      <th className="p-2">Description & Exemple</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">username</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2 font-bold text-rose-700 border-r border-slate-200">Oui</td>
                      <td className="p-2">Identifiant ENT (ex: <code className="bg-slate-100 px-1">lucas.dupont@ent.fr</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">password</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2 font-bold text-rose-700 border-r border-slate-200">Oui</td>
                      <td className="p-2">Mot de passe du compte ENT</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">pronoteUrl</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2 text-slate-500 border-r border-slate-200">Optionnel</td>
                      <td className="p-2">URL directe de l'espace élève Pronote (ex: <code className="bg-slate-100 px-1">https://0771068t.index-education.net/pronote/eleve.html</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">entUrl</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2 text-slate-500 border-r border-slate-200">Optionnel</td>
                      <td className="p-2">URL du portail ENT (ex: <code className="bg-slate-100 px-1">https://ent.seine-et-marne.fr/</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">format</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2 text-slate-500 border-r border-slate-200">Optionnel</td>
                      <td className="p-2"><code className="bg-slate-100 px-1">"json"</code> (défaut), <code className="bg-slate-100 px-1">"html"</code> (interface stylisée avec CSS Pronote) ou <code className="bg-slate-100 px-1">"raw_html"</code> (DOM brut).</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">forceAsync</td>
                      <td className="p-2 font-mono border-r border-slate-200">boolean</td>
                      <td className="p-2 text-slate-500 border-r border-slate-200">Optionnel</td>
                      <td className="p-2">Si <code className="bg-slate-100 px-1">true</code>, force la réponse immédiate 202 avec jobId.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Endpoint 2: GET /api/job/:jobId */}
            <div className="space-y-3 bg-slate-50 p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-emerald-700 text-white font-mono font-bold text-xs rounded">GET</span>
                <code className="font-bold text-slate-900 text-base">/api/job/:jobId</code>
              </div>
              <p className="text-xs text-slate-600">Interroge l'état d'un traitement asynchrone différé.</p>
            </div>

            {/* Endpoint 3: GET /api/health */}
            <div className="space-y-3 bg-slate-50 p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-emerald-700 text-white font-mono font-bold text-xs rounded">GET</span>
                <code className="font-bold text-slate-900 text-base">/api/health</code>
              </div>
              <p className="text-xs text-slate-600">Retourne un statut HTTP 200 avec la disponibilité des runners GitHub Actions.</p>
            </div>

            {/* Tableau des Codes de Réponse HTTP */}
            <div className="space-y-2">
              <div className="font-bold text-xs text-slate-900 uppercase tracking-wider">Codes de Statut HTTP Renvoyés :</div>
              <div className="overflow-x-auto w-full max-w-full border border-slate-200 rounded-md bg-white">
                <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold">
                      <th className="p-2 border-r border-slate-200">Code HTTP</th>
                      <th className="p-2 border-r border-slate-200">Signification</th>
                      <th className="p-2">Explication</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2 font-mono font-bold text-emerald-700 border-r border-slate-200">200 OK</td>
                      <td className="p-2 font-bold border-r border-slate-200">Succès Synchrone</td>
                      <td className="p-2">Extraction achevée en direct. Le corps contient l'objet <code className="bg-slate-100 px-1">data</code>.</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold text-rose-700 border-r border-slate-200">400 Bad Request</td>
                      <td className="p-2 font-bold border-r border-slate-200">Paramètres Invalides</td>
                      <td className="p-2"><code className="bg-slate-100 px-1">username</code> ou <code className="bg-slate-100 px-1">password</code> manquant dans le JSON.</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold text-rose-700 border-r border-slate-200">401 Unauthorized</td>
                      <td className="p-2 font-bold border-r border-slate-200">Échec SSO ENT</td>
                      <td className="p-2">Identifiants de connexion incorrects ou portail ENT en maintenance.</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold text-amber-700 border-r border-slate-200">504 Gateway Timeout</td>
                      <td className="p-2 font-bold border-r border-slate-200">Délai dépassé</td>
                      <td className="p-2">Le runner Pronote a mis plus de 50 secondes à extraire le DOM (dépassement du temps imparti).</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold text-rose-700 border-r border-slate-200">500 Server Error</td>
                      <td className="p-2 font-bold border-r border-slate-200">Erreur Serveur</td>
                      <td className="p-2">Erreur inattendue ou structure DOM Pronote altérée.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 5: Dictionnaire JSON Exhaustif */}
          <section id="dictionnaire" className="space-y-6 max-w-full">
            <div className="border-b border-slate-200 pb-2">
              <h2 className="text-2xl font-bold text-slate-900">
                5. Dictionnaire JSON Ultra-Exhaustif
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Description exhaustive de la totalité des propriétés et sous-objets renvoyés par l'API :
              </p>
            </div>

            {/* 1. Racine & Élève */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-blue-700">
                1. Racine du JSON & Objet <code className="bg-blue-50 px-1 py-0.5 rounded">data.eleve</code>
              </h3>
              <div className="overflow-x-auto w-full max-w-full border border-slate-200 rounded-md bg-white">
                <table className="w-full text-xs text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold">
                      <th className="p-2 border-r border-slate-200">Propriété JSON</th>
                      <th className="p-2 border-r border-slate-200">Type</th>
                      <th className="p-2">Description Métier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">jobId</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Identifiant unique du traitement d'extraction (ex: <code className="bg-slate-100 px-1">job_17891584_x8k</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">success</td>
                      <td className="p-2 font-mono border-r border-slate-200">boolean</td>
                      <td className="p-2"><code className="bg-slate-100 px-1">true</code> si l'extraction a réussi sans erreur</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">executionTimeMs</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Durée totale du scraping en millisecondes (ex: <code className="bg-slate-100 px-1">18420</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">timestamp</td>
                      <td className="p-2 font-mono border-r border-slate-200">string (ISO)</td>
                      <td className="p-2">Horodatage de l'extraction en UTC</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.nom</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Nom et prénom complets de l'élève (ex: <code className="bg-slate-100 px-1">DUPONT Lucas</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.classe</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Classe active de l'élève (ex: <code className="bg-slate-100 px-1">3EME6</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.etablissement</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Nom du collège / lycée (ex: <code className="bg-slate-100 px-1">COLLEGE ROSA BONHEUR</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.periodeActuelle</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Période scolaire en cours (ex: <code className="bg-slate-100 px-1">1er Trimestre</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.derniereConnexion</td>
                      <td className="p-2 font-mono border-r border-slate-200">string (ISO)</td>
                      <td className="p-2">Horodatage de la dernière connexion enregistrée sur Pronote</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.regime</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Régime de l'élève (ex: <code className="bg-slate-100 px-1">Demi-pensionnaire</code>, <code className="bg-slate-100 px-1">Externe</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200 text-blue-800">data.eleve.ine</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Numéro INE national de l'élève</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Emploi du Temps */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-emerald-700">
                2. Emploi du Temps (<code className="bg-emerald-50 px-1 py-0.5 rounded">data.emploiDuTemps</code>)
              </h3>
              <div className="overflow-x-auto w-full max-w-full border border-slate-200 rounded-md bg-white">
                <table className="w-full text-xs text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold">
                      <th className="p-2 border-r border-slate-200">Propriété JSON</th>
                      <th className="p-2 border-r border-slate-200">Type</th>
                      <th className="p-2">Description Métier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.anneeScolaire</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Année scolaire de référence (ex: <code className="bg-slate-100 px-1">2025-2026</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.totalCours</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Nombre total de créneaux de cours extraits</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].numeroSemaine</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Numéro de semaine du calendrier scolaire (ex: <code className="bg-slate-100 px-1">37</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].matiere</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Intitulé épuré de la matière (ex: <code className="bg-slate-100 px-1">MATHEMATIQUES</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].professeur</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Nom de l'enseignant (ex: <code className="bg-slate-100 px-1">M. LECLERC</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].salle</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Salle de classe attribuée (ex: <code className="bg-slate-100 px-1">Salle 204</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].heureDebut</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Heure de début au format 24h <code className="bg-slate-100 px-1">HH:mm</code> (ex: <code className="bg-slate-100 px-1">08:30</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].heureFin</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Heure de fin au format 24h <code className="bg-slate-100 px-1">HH:mm</code> (ex: <code className="bg-slate-100 px-1">09:25</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].estAnnule</td>
                      <td className="p-2 font-mono border-r border-slate-200">boolean</td>
                      <td className="p-2"><code className="bg-slate-100 px-1">true</code> si le cours est barré, annulé ou prof absent</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.emploiDuTemps.semaines[].cours[].statut</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Statut spécifique du cours (<code className="bg-slate-100 px-1">Normal</code>, <code className="bg-slate-100 px-1">Prof. absent</code>, <code className="bg-slate-100 px-1">TP Groupe 1</code>)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Notes & Moyennes */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-amber-700">
                3. Notes & Moyennes (<code className="bg-amber-50 px-1 py-0.5 rounded">data.notes</code>)
              </h3>
              <div className="overflow-x-auto w-full max-w-full border border-slate-200 rounded-md bg-white">
                <table className="w-full text-xs text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold">
                      <th className="p-2 border-r border-slate-200">Propriété JSON</th>
                      <th className="p-2 border-r border-slate-200">Type</th>
                      <th className="p-2">Description Métier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.moyenneGenerale</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Moyenne générale pondérée de l'élève (ex: <code className="bg-slate-100 px-1">15.82</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.moyenneClasse</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Moyenne générale de la classe entière (ex: <code className="bg-slate-100 px-1">13.45</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.moyenneMin / moyenneMax</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Moyennes minimale et maximale enregistrées dans la classe</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.toutesLesNotes[].valeur</td>
                      <td className="p-2 font-mono border-r border-slate-200">number | string</td>
                      <td className="p-2">Valeur chiffrée de la note (ex: <code className="bg-slate-100 px-1">17.5</code>) ou statut (<code className="bg-slate-100 px-1">Abs</code>, <code className="bg-slate-100 px-1">Disp</code>, <code className="bg-slate-100 px-1">NonNoté</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.toutesLesNotes[].sur</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Barème de notation (ex: <code className="bg-slate-100 px-1">20</code>, <code className="bg-slate-100 px-1">10</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.toutesLesNotes[].coefficient</td>
                      <td className="p-2 font-mono border-r border-slate-200">number</td>
                      <td className="p-2">Coefficient attribué au contrôle (ex: <code className="bg-slate-100 px-1">2.0</code>)</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.toutesLesNotes[].titre</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Intitulé ou sujet de l'évaluation</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.notes.toutesLesNotes[].typeDevoir</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Nature de l'évaluation (<code className="bg-slate-100 px-1">Devoir surveillé</code>, <code className="bg-slate-100 px-1">Interrogation</code>, <code className="bg-slate-100 px-1">TP</code>)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Agenda & Devoirs */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-purple-700">
                4. Agenda & Devoirs à faire (<code className="bg-purple-50 px-1 py-0.5 rounded">data.agenda</code>)
              </h3>
              <div className="overflow-x-auto w-full max-w-full border border-slate-200 rounded-md bg-white">
                <table className="w-full text-xs text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold">
                      <th className="p-2 border-r border-slate-200">Propriété JSON</th>
                      <th className="p-2 border-r border-slate-200">Type</th>
                      <th className="p-2">Description Métier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.agenda.devoirs[].pourLe</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Date d'échéance du devoir au format <code className="bg-slate-100 px-1">YYYY-MM-DD</code></td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.agenda.devoirs[].matiere</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Matière concernée par le devoir</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.agenda.devoirs[].titre / description</td>
                      <td className="p-2 font-mono border-r border-slate-200">string</td>
                      <td className="p-2">Consigne synthétique et explications détaillées du professeur</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.agenda.devoirs[].fait</td>
                      <td className="p-2 font-mono border-r border-slate-200">boolean</td>
                      <td className="p-2"><code className="bg-slate-100 px-1">true</code> si l'élève a coché le travail comme réalisé</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-bold border-r border-slate-200">data.agenda.devoirs[].avecRendu</td>
                      <td className="p-2 font-mono border-r border-slate-200">boolean</td>
                      <td className="p-2">Indique si un travail en ligne ou physique est demandé</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 6: Exemple Réel Complet */}
          <section id="exemple-json" className="space-y-4 max-w-full">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-2xl font-bold text-slate-900">
                6. Exemple Réel Complet JSON (200 OK)
              </h2>
              <button 
                onClick={() => copyText(fullSampleJson, 'fulljson')}
                className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-3 py-1 rounded hover:bg-slate-200 transition flex items-center gap-1.5"
              >
                {copiedKey === 'fulljson' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'fulljson' ? 'Copié !' : 'Copier JSON Complet'}</span>
              </button>
            </div>

            <p className="text-slate-700">
              Voici le schéma JSON exhaustif tel qu'il est renvoyé en cas de succès par l'API :
            </p>

            <div className="border border-slate-300 rounded-lg overflow-hidden max-w-full shadow-xs">
              <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto max-h-[500px] whitespace-pre-wrap break-all leading-relaxed">
                <code>{fullSampleJson}</code>
              </pre>
            </div>
          </section>

          {/* Section 7: Liste des ENT Compatibles */}
          <section id="ent-compatibles" className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2">
              7. Portail ENT Compatibles & Testés
            </h2>
            <p className="text-slate-700">
              L'API prend en charge le SSO (Single Sign-On) de la vaste majorité des portails ENT nationaux et académiques français :
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900"> Seine-et-Marne (77) & Île-de-France</div>
                <div className="text-slate-600">ENT Seine-et-Marne, MonLycée.net, Paris PCN</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900"> Auvergne-Rhône-Alpes & Grand-Est</div>
                <div className="text-slate-600">MaClasseEnAuvergneRhoneAlpes, Mon Bureau Numérique</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900"> Hauts-de-France & Normandie</div>
                <div className="text-slate-600">ENT NEO HDF, L'Educ de Normandie</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900"> Occitanie, Nouvelle-Aquitaine & Accès Direct</div>
                <div className="text-slate-600">ENT Occitanie, Lycée Connecté, Pronote Direct (Sans ENT)</div>
              </div>
            </div>
          </section>

          {/* Section 8: Architecture 24/7/365 */}
          <section id="architecture" className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2">
              8. Architecture 2 Briques Haute Performance (~15s)
            </h2>
            <p className="text-slate-700 leading-relaxed">
              Pour garantir une extraction ultra-rapide (divisée par 2, passant de 35s à <strong>~15 secondes</strong>) et contourner les blocages sans proxies payants, l'API utilise une architecture en <strong>2 briques synchrones avec extraction multi-onglets parallèle</strong> :
            </p>

            <div className="p-4 bg-slate-900 text-slate-200 rounded-lg text-xs space-y-3 leading-relaxed">
              <div className="font-bold text-emerald-400 text-sm">Schéma du Flux Parallèle & Relais Double Canal :</div>
              <ol className="list-decimal list-inside space-y-2 text-slate-300">
                <li><strong>Passerelle Edge Cloudflare Worker :</strong> Reçoit la requête <code className="text-emerald-400">POST /api/scrape-pronote</code>, crée un job instantané et ouvre la surveillance simultanée sur Cloudflare KV et GitHub Issues.</li>
                <li><strong>Sondage Sub-seconde (800ms) :</strong> Le runner GitHub Actions (16 Go RAM / 4 cœurs) intercepte la tâche en moins de 800 millisecondes.</li>
                <li><strong>Extraction Parallèle en 5 Onglets Dédiés :</strong> Une fois le SSO ENT authentifié, Chromium ouvre simultanément 5 onglets isolés :
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-slate-400">
                    <li><strong className="text-slate-200">Onglet 1 :</strong> Profil élève & classe (<code className="text-emerald-300">eleve</code>)</li>
                    <li><strong className="text-slate-200">Onglet 2 :</strong> Emploi du temps complet (<code className="text-emerald-300">emploiDuTemps.tousLesCours[]</code>)</li>
                    <li><strong className="text-slate-200">Onglet 3 :</strong> Évaluations, barèmes, moyennes matières & générale (<code className="text-emerald-300">notes</code>)</li>
                    <li><strong className="text-slate-200">Onglet 4 :</strong> Cahier de textes & devoirs à faire (<code className="text-emerald-300">devoirs[]</code>)</li>
                    <li><strong className="text-slate-200">Onglet 5 :</strong> Contenus de cours & ressources jointes (<code className="text-emerald-300">ressources[]</code>)</li>
                  </ul>
                </li>
                <li><strong>Relais Double Canal & Clôture Synchrone :</strong> Le runner publie immédiatement le résultat sur Cloudflare KV et via l'API GitHub Issues en parallèle. La passerelle réceptionne la réponse dès le premier canal disponible et renvoie un <code className="text-emerald-400">HTTP 200 OK</code> en ~15s.</li>
              </ol>
            </div>
          </section>

          {/* Section 9: Playground & Chronomètre figé */}
          <section id="playground" className="space-y-4 pt-6 border-t-2 border-slate-200 max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">
                  9. Console de Test en Direct (Playground)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Testez la passerelle API avec vos identifiants réels. Le chronomètre se fige une fois le résultat final réceptionné.
                </p>
              </div>
              
              {/* Chronomètre Badge Figé */}
              <ChronoDisplay isTesting={isTesting} finalTime={finalTime} />
            </div>

            <form onSubmit={handleLiveTest} className="space-y-4 bg-slate-50 border border-slate-200 p-5 rounded-lg shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Identifiant ENT <span className="text-rose-600">*</span></label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required 
                    placeholder="prenom.nom@ent.fr" 
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Mot de passe ENT <span className="text-rose-600">*</span></label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                    placeholder="••••••••••••" 
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">URL Pronote directe (Optionnel)</label>
                  <input 
                    type="url" 
                    value={pronoteUrl}
                    onChange={(e) => setPronoteUrl(e.target.value)}
                    placeholder="https://0771068t.index-education.net/pronote/eleve.html" 
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-600 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">URL Portail ENT (Optionnel)</label>
                  <input 
                    type="url" 
                    value={entUrl}
                    onChange={(e) => setEntUrl(e.target.value)}
                    placeholder="https://ent.seine-et-marne.fr/" 
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-600 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Format Selection */}
              <div className="flex flex-wrap items-center gap-4 text-xs pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-800">Format de sortie :</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="radio" 
                    name="format" 
                    value="json" 
                    checked={format === 'json'} 
                    onChange={() => setFormat('json')}
                    className="accent-slate-900"
                  />
                  <span>JSON Structuré (<code className="font-mono text-[11px] text-emerald-700 font-bold">format: "json"</code>)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="radio" 
                    name="format" 
                    value="html" 
                    checked={format === 'html'} 
                    onChange={() => setFormat('html')}
                    className="accent-slate-900"
                  />
                  <span>HTML Stylisé Pronote (<code className="font-mono text-[11px] text-blue-700 font-bold">format: "html"</code>)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="radio" 
                    name="format" 
                    value="raw_html" 
                    checked={format === 'raw_html'} 
                    onChange={() => setFormat('raw_html')}
                    className="accent-slate-900"
                  />
                  <span>DOM Brut WLangage (<code className="font-mono text-[11px] text-purple-700 font-bold">format: "raw_html"</code>)</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button 
                  type="submit" 
                  disabled={isTesting}
                  className="px-6 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-md hover:bg-slate-800 transition cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                  <span>{isTesting ? 'Extraction en cours (~15s)...' : 'Lancer l\'extraction Pronote'}</span>
                </button>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  ⚡ Performance mesurée : ~15s (5 onglets parallèles)
                </span>
              </div>
            </form>

            {testResult && (
              <div className="space-y-2 max-w-full">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Résultat JSON :</span>
                  {resultTag && <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{resultTag}</span>}
                </div>
                <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto max-h-[450px] whitespace-pre-wrap break-all leading-relaxed shadow-sm">
                  <code>{testResult}</code>
                </pre>
              </div>
            )}
          </section>

        </main>
      </div>
    </div>
  );
};
