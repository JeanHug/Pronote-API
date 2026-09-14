import { FIELDS, ERROR_CATALOG, EXAMPLE, SCHEMA_VERSION } from '../src/pronote/schema.ts';

/**
 * DOCUMENTATION GÉNÉRÉE
 * =====================
 * La documentation est produite à partir de `schema.ts`, lui-même vérifié par
 * `tests/schema.test.ts` contre la sortie réelle du parseur.
 *
 * L'ancienne documentation était écrite à la main, décrivait 57 champs dont 4
 * seulement existaient, et annonçait « 10-12 secondes » en contradiction avec
 * un timeout client de 2 minutes. Elle ne peut plus dériver.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderDocs(origin: string): string {
  const categories = [...new Set(FIELDS.map((f) => f.category))];

  const rowsByCategory = categories.map((cat) => {
    const rows = FIELDS.filter((f) => f.category === cat).map((f) => `
      <tr class="border-t border-slate-100 align-top">
        <td class="py-2 pr-3"><code class="text-[11px] text-indigo-700 break-all">${esc(f.path)}</code></td>
        <td class="py-2 pr-3 whitespace-nowrap"><span class="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">${esc(f.type)}${f.nullable ? '<span class="text-amber-600">?</span>' : ''}</span></td>
        <td class="py-2 pr-3 text-slate-600 text-[11px]">${esc(f.description)}</td>
        <td class="py-2"><code class="text-[11px] text-emerald-700 break-all">${esc(f.example)}</code></td>
      </tr>`).join('');
    return `
      <section class="mb-8">
        <h3 class="text-sm font-bold text-slate-900 mb-2">${esc(cat)}</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400">
              <th class="pb-1 pr-3">Chemin</th><th class="pb-1 pr-3">Type</th>
              <th class="pb-1 pr-3">Description</th><th class="pb-1">Exemple</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }).join('');

  const errorRows = ERROR_CATALOG.map((e) => `
    <tr class="border-t border-slate-100">
      <td class="py-2 pr-3"><code class="text-[11px] text-rose-700">${esc(e.code)}</code></td>
      <td class="py-2 pr-3 text-[11px] text-slate-600">${e.http}</td>
      <td class="py-2 text-[11px] text-slate-600">${esc(e.description)}</td>
    </tr>`).join('');

  const sampleJson = esc(JSON.stringify({ ...EXAMPLE.response, data: EXAMPLE.data }, null, 2));

  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pronote API v${SCHEMA_VERSION} — Documentation</title>
<meta name="description" content="API REST pour Pronote : emploi du temps, notes, devoirs, ressources et vie scolaire, en JSON structuré.">
<style>
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --accent:#4f46e5; }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
  code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
  header{border-bottom:1px solid var(--line);position:sticky;top:0;background:#fff;z-index:10}
  .wrap{max-width:64rem;margin:0 auto;padding:0 1.25rem}
  main{max-width:64rem;margin:0 auto;padding:2rem 1.25rem 5rem}
  h1{font-size:1.6rem;margin:.5rem 0}
  h2{font-size:1.15rem;margin:2.5rem 0 .75rem;padding-bottom:.4rem;border-bottom:1px solid var(--line)}
  h3{font-size:.95rem;margin:0 0 .5rem}
  p,li{font-size:.875rem;color:#334155}
  table{width:100%;border-collapse:collapse}
  th{font-weight:600}
  pre{background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:.5rem;overflow:auto;font-size:.72rem;max-height:26rem}
  .pill{display:inline-block;font-size:.65rem;font-weight:700;padding:.15rem .45rem;border-radius:.3rem;background:#e0e7ff;color:#3730a3}
  .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:.75rem 0;background:#f8fafc}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.75rem}
  input,button{font:inherit}
  input{width:100%;padding:.5rem .6rem;border:1px solid #cbd5e1;border-radius:.375rem;font-size:.8rem}
  button{background:var(--accent);color:#fff;border:0;border-radius:.375rem;padding:.55rem 1rem;font-size:.8rem;font-weight:600;cursor:pointer}
  button:disabled{opacity:.6;cursor:progress}
  label{font-size:.72rem;font-weight:600;color:#334155;display:block;margin-bottom:.25rem}
  .hint{font-size:.72rem;color:var(--muted)}
  .err{color:#b91c1c}
  .ok{color:#047857}
</style>
</head>
<body>
<header><div class="wrap" style="height:3rem;display:flex;align-items:center;gap:.75rem">
  <strong style="font-size:.85rem">PRONOTE API</strong>
  <span class="pill">v${SCHEMA_VERSION}</span>
  <span class="hint" style="margin-left:auto">Documentation générée depuis le schéma</span>
</div></header>

<main>
  <h1>API REST Pronote</h1>
  <p>Extrait l'emploi du temps, les notes, les devoirs, les ressources et la vie scolaire d'un élève, sous forme de JSON structuré et documenté.</p>

  <div class="card">
    <strong style="font-size:.8rem">Architecture</strong>
    <p style="margin:.4rem 0 0">Cloudflare Worker (edge) → Durable Object à cohérence forte (file d'attente et résultats) → runner GitHub Actions (navigateur Puppeteer).</p>
    <p style="margin:.4rem 0 0" class="hint">Cloudflare KV a été retiré : sa cohérence à terme (jusqu'à 60 s de propagation) était la cause des temps de réponse de plusieurs minutes.</p>
  </div>

  <h2>Endpoints</h2>
  <table>
    <thead><tr class="text-[10px] uppercase text-slate-400"><th style="text-align:left" class="pb-1">Méthode</th><th style="text-align:left" class="pb-1">Chemin</th><th style="text-align:left" class="pb-1">Description</th></tr></thead>
    <tbody>
      <tr class="border-t border-slate-100"><td class="py-2 pr-3"><code>POST</code></td><td class="py-2 pr-3"><code>${esc(origin)}/api/v1/scrape-pronote</code></td><td class="py-2 text-[12px] text-slate-600">Extraction complète. Répond en 200, ou en 202 avec un <code>jobId</code> si le budget d'attente est dépassé.</td></tr>
      <tr class="border-t border-slate-100"><td class="py-2 pr-3"><code>GET</code></td><td class="py-2 pr-3"><code>${esc(origin)}/api/v1/job/:jobId</code></td><td class="py-2 text-[12px] text-slate-600">Récupère le résultat d'un job en différé. 202 tant que l'extraction est en cours.</td></tr>
      <tr class="border-t border-slate-100"><td class="py-2 pr-3"><code>GET</code></td><td class="py-2 pr-3"><code>${esc(origin)}/api/v1/health</code></td><td class="py-2 text-[12px] text-slate-600">État de la passerelle et du runner.</td></tr>
      <tr class="border-t border-slate-100"><td class="py-2 pr-3"><code>GET</code></td><td class="py-2 pr-3"><code>${esc(origin)}/api/v1/schema</code></td><td class="py-2 text-[12px] text-slate-600">Schéma machine (champs, types, codes d'erreur).</td></tr>
    </tbody>
  </table>

  <h2>Console de test</h2>
  <form id="f" class="card">
    <div class="grid2">
      <div><label for="u">Identifiant ENT</label><input id="u" placeholder="prenom.nom" autocomplete="username"></div>
      <div><label for="p">Mot de passe ENT</label><input id="p" type="password" placeholder="••••••••" autocomplete="current-password"></div>
    </div>
    <div style="margin-top:.75rem;display:flex;gap:1rem;align-items:center">
      <label style="display:flex;gap:.35rem;align-items:center;margin:0"><input type="radio" name="fmt" value="json" checked style="width:auto"> JSON</label>
      <label style="display:flex;gap:.35rem;align-items:center;margin:0"><input type="radio" name="fmt" value="html" style="width:auto"> HTML</label>
      <button type="submit" id="b" style="margin-left:auto">Lancer l'extraction</button>
    </div>
    <p class="hint" style="margin:.6rem 0 0">Les identifiants sont transmis au runner pour s'authentifier auprès de l'ENT, ne sont jamais journalisés, jamais publiés et jamais stockés au-delà de la durée de vie du job.</p>
  </form>
  <pre id="out" hidden></pre>

  <h2>Réponse complète (exemple)</h2>
  <pre>${sampleJson}</pre>

  <h2>Schéma des champs</h2>
  <p class="hint">${FIELDS.length} champs documentés. Chacun est vérifié automatiquement contre la sortie réelle du parseur.</p>
  ${rowsByCategory}

  <h2>Codes d'erreur</h2>
  <table>
    <thead><tr class="text-[10px] uppercase text-slate-400"><th style="text-align:left" class="pb-1">Code</th><th style="text-align:left" class="pb-1">HTTP</th><th style="text-align:left" class="pb-1">Signification</th></tr></thead>
    <tbody>${errorRows}</tbody>
  </table>

  <h2>Intégration</h2>
  <pre>curl -X POST "${esc(origin)}/api/v1/scrape-pronote" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "prenom.nom",
    "password": "VOTRE_MOT_DE_PASSE",
    "pronoteUrl": "https://0771068t.index-education.net/pronote/eleve.html",
    "entUrl": "https://ent.seine-et-marne.fr/"
  }'</pre>

  <h2>Limites</h2>
  <ul>
    <li>10 extractions par minute et par adresse IP.</li>
    <li>Budget d'attente synchrone par défaut : 25 s, puis réponse 202 avec <code>jobId</code>.</li>
    <li>Résultats conservés 1 heure, jobs en file 30 minutes.</li>
    <li>Les URL fournies sont validées (HTTPS, domaine autorisé si <code>ALLOWED_HOST_SUFFIXES</code> est configuré, adresses réseau internes refusées).</li>
  </ul>
</main>

<script>
(function () {
  var f = document.getElementById('f');
  var out = document.getElementById('out');
  var b = document.getElementById('b');

  function show(text, cls) {
    out.hidden = false;
    out.textContent = text;
  }

  async function poll(jobId, origin) {
    for (var i = 0; i < 60; i++) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      var res = await fetch(origin + '/api/v1/job/' + encodeURIComponent(jobId));
      if (res.status === 202) { show('Extraction en cours… (' + (i + 1) * 2 + ' s)'); continue; }
      return await res.json();
    }
    throw new Error('Délai dépassé côté client.');
  }

  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var origin = window.location.origin;
    var fmt = document.querySelector('input[name="fmt"]:checked').value;
    b.disabled = true;
    var t0 = Date.now();
    show('Extraction en cours…');
    try {
      var res = await fetch(origin + '/api/v1/scrape-pronote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('u').value.trim(),
          password: document.getElementById('p').value,
          format: fmt
        })
      });
      var data = await res.json();
      if (res.status === 202 && data.jobId) {
        data = await poll(data.jobId, origin);
      }
      var dt = ((Date.now() - t0) / 1000).toFixed(2);
      show(JSON.stringify(data, null, 2) + '\\n\\n// durée totale observée : ' + dt + ' s');
    } catch (err) {
      show('Erreur : ' + err.message);
    } finally {
      b.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}
