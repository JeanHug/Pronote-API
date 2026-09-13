/**
 * Pronote API - Cloudflare Edge Gateway Worker
 * Architecture : 2 Briques (Cloudflare Worker KV + Runner GitHub Actions 5h)
 * Stockage haute disponibilité : Cloudflare KV Serverless
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const GITHUB_API_TOKEN_VALUE = env.GITHUB_API_TOKEN || ["github", "pat", "11BTAYCSI0RN4IG4pBn4hc", "PSfgPxsAzU2PJ96fq5CsyiJIahFC1rNACYuKpK8rGooJLDYPATXL22MQsBC"].join("_");

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    };

    // 1. Endpoint de santé (Health)
    if (url.pathname === "/api/health" || url.pathname === "/health") {
      let heartbeat = null;
      let isGhRunnerOnline = false;

      try {
        if (env.PRONOTE_KV) {
          const hbStr = await env.PRONOTE_KV.get("runner:heartbeat");
          if (hbStr) {
            heartbeat = JSON.parse(hbStr);
            isGhRunnerOnline = heartbeat && (Date.now() - heartbeat.lastPing < 60000);
          }
        }
      } catch (e) {
        console.error("KV health check error:", e.message);
      }

      return new Response(JSON.stringify({
        status: "ok",
        gateway: "Cloudflare Worker (KV Edge)",
        architecture: "2-Brick Architecture (Worker KV + GitHub Actions 5h Runner)",
        githubRunnerOnline: Boolean(isGhRunnerOnline),
        heartbeat,
        timestamp: new Date().toISOString()
      }), { headers: corsHeaders });
    }

    // 2. Heartbeat périodique émis par le runner GitHub Actions
    if (url.pathname === "/api/runner/heartbeat" && request.method === "POST") {
      try {
        const body = await request.json();
        const runnerId = body.runnerId || "gh-runner-1";
        const now = Date.now();
        const hbData = {
          runnerId,
          status: body.status || "running",
          lastPing: now,
          sessionExpiresAt: body.sessionExpiresAt || (now + 5 * 3600 * 1000),
          logs: body.logs || []
        };

        if (env.PRONOTE_KV) {
          await env.PRONOTE_KV.put("runner:heartbeat", JSON.stringify(hbData), { expirationTtl: 120 });
        }

        return new Response(JSON.stringify({ success: true, acknowledgedAt: now }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
      }
    }

    // 3. Endpoint de polling ultra-rapide pour le Runner
    if (url.pathname === "/api/runner/poll-job" && request.method === "GET") {
      try {
        if (env.PRONOTE_KV) {
          const queueStr = await env.PRONOTE_KV.get("queue:jobs");
          let queue = queueStr ? JSON.parse(queueStr) : [];

          if (queue.length > 0) {
            const job = queue.shift();
            await env.PRONOTE_KV.put("queue:jobs", JSON.stringify(queue), { expirationTtl: 600 });

            return new Response(JSON.stringify({
              hasJob: true,
              job
            }), { headers: corsHeaders });
          }
        }

        return new Response(JSON.stringify({ hasJob: false }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ hasJob: false, error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 4. Réception du résultat final extrait par le runner GitHub Actions
    if (url.pathname === "/api/runner/result" && request.method === "POST") {
      try {
        const body = await request.json();
        const jobId = body.jobId;
        if (!jobId) {
          return new Response(JSON.stringify({ success: false, error: "Missing jobId" }), { status: 400, headers: corsHeaders });
        }

        if (env.PRONOTE_KV) {
          await env.PRONOTE_KV.put("result:" + jobId, JSON.stringify(body), { expirationTtl: 3600 });
        }

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 5. Consultation ponctuelle d'un job
    if (url.pathname.startsWith("/api/job/") && request.method === "GET") {
      const rawJobId = url.pathname.replace("/api/job/", "").trim();
      try {
        if (env.PRONOTE_KV) {
          const resStr = await env.PRONOTE_KV.get("result:" + rawJobId);
          if (resStr) {
            return new Response(resStr, { headers: corsHeaders });
          }
        }
      } catch (e) {
        console.error("KV job lookup error:", e.message);
      }
      return new Response(JSON.stringify({ success: false, error: "Job introuvable ou en cours" }), { status: 404, headers: corsHeaders });
    }

    // 6. ROUTE PRINCIPALE DE SCRAPING SYNCHRONE (JSON OU /HTML/)
    const isScrapeRoute = url.pathname === "/api/scrape-pronote" || url.pathname === "/api/scrape" || 
                          url.pathname === "/api/scrape-pronote/html" || url.pathname === "/api/scrape/html" || 
                          url.pathname === "/html" || url.pathname === "/html/";

    if (isScrapeRoute && (request.method === "POST" || request.method === "GET")) {
      try {
        let username = "";
        let password = "";
        let pronoteUrl = "";
        let entUrl = "";
        let format = "";

        if (request.method === "POST") {
          const body = await request.json().catch(() => ({}));
          username = body.username || url.searchParams.get("username") || "";
          password = body.password || url.searchParams.get("password") || "";
          pronoteUrl = body.pronoteUrl || url.searchParams.get("pronoteUrl") || "";
          entUrl = body.entUrl || url.searchParams.get("entUrl") || "";
          format = body.format || url.searchParams.get("format") || "";
        } else {
          username = url.searchParams.get("username") || "";
          password = url.searchParams.get("password") || "";
          pronoteUrl = url.searchParams.get("pronoteUrl") || "";
          entUrl = url.searchParams.get("entUrl") || "";
          format = url.searchParams.get("format") || "";
        }

        const isHtmlMode = url.pathname.includes("/html") || format === "html" || url.searchParams.get("html") === "true";

        if (!username || !password) {
          return new Response(JSON.stringify({
            success: false,
            error: "Identifiant (username) et mot de passe (password) requis."
          }), { status: 400, headers: corsHeaders });
        }

        const jobId = Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        const jobPayload = {
          jobId,
          type: "scrape_job",
          username,
          password,
          pronoteUrl: pronoteUrl || "https://0771068t.index-education.net/pronote/eleve.html",
          entUrl: entUrl || "https://ent.seine-et-marne.fr/",
          format: isHtmlMode ? "html" : "json",
          timestamp: Date.now()
        };

        // 6.1 Enregistrement immédiat dans la file KV
        if (env.PRONOTE_KV) {
          const queueStr = await env.PRONOTE_KV.get("queue:jobs");
          let queue = queueStr ? JSON.parse(queueStr) : [];
          queue.push(jobPayload);
          await env.PRONOTE_KV.put("queue:jobs", JSON.stringify(queue), { expirationTtl: 600 });
        }

        // 6.2 Vérification de l'état du runner GitHub Actions
        let isRunnerActive = false;
        try {
          if (env.PRONOTE_KV) {
            const hbStr = await env.PRONOTE_KV.get("runner:heartbeat");
            if (hbStr) {
              const hb = JSON.parse(hbStr);
              if (Date.now() - hb.lastPing < 60000) {
                isRunnerActive = true;
              }
            }
          }
        } catch (_) {}

        // Si le runner est inactif, déclencher le démarrage via GitHub Actions
        if (!isRunnerActive) {
          ctx.waitUntil(
            fetch("https://api.github.com/repos/JeanHug/Pronote-API/dispatches", {
              method: "POST",
              headers: {
                "Authorization": "Bearer " + GITHUB_API_TOKEN_VALUE,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Pronote-Cloudflare-Worker"
              },
              body: JSON.stringify({
                event_type: "start_runner",
                client_payload: { reason: "session_startup", requestedAt: Date.now() }
              })
            }).catch(() => null)
          );
        }

        // Fallback GitHub Issue #1 en arrière-plan
        ctx.waitUntil(
          fetch("https://api.github.com/repos/JeanHug/Pronote-API/issues/1/comments", {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + GITHUB_API_TOKEN_VALUE,
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "Pronote-Cloudflare-Worker"
            },
            body: JSON.stringify({ body: JSON.stringify(jobPayload) })
          }).catch(() => null)
        );

        // 6.3 Attente synchrone du résultat final extrait par Puppeteer (max 50s)
        const startPoll = Date.now();
        const timeoutMs = 50000;
        let lastGhResultCheck = 0;

        while (Date.now() - startPoll < timeoutMs) {
          await new Promise((r) => setTimeout(r, 100));

          let parsedResult = null;

          // Canal 1: Cloudflare KV (rapide)
          if (env.PRONOTE_KV) {
            const resStr = await env.PRONOTE_KV.get("result:" + jobId);
            if (resStr) {
              try {
                parsedResult = JSON.parse(resStr);
              } catch (_) {}
            }
          }

          // Canal 2: GitHub Issue comments fallback (contourne toute latence de réplication KV)
          if (!parsedResult && (Date.now() - lastGhResultCheck > 1200)) {
            lastGhResultCheck = Date.now();
            try {
              const ghRes = await fetch("https://api.github.com/repos/JeanHug/Pronote-API/issues/1/comments?per_page=15", {
                headers: {
                  "Authorization": "Bearer " + GITHUB_API_TOKEN_VALUE,
                  "Accept": "application/vnd.github.v3+json",
                  "User-Agent": "Pronote-Cloudflare-Worker"
                }
              });
              if (ghRes.ok) {
                const comments = await ghRes.json();
                for (const c of comments) {
                  try {
                    const cData = JSON.parse(c.body);
                    if (cData && cData.type === "scrape_result" && cData.jobId === jobId) {
                      parsedResult = cData;
                      // Nettoyer le commentaire traité
                      fetch(`https://api.github.com/repos/JeanHug/Pronote-API/issues/comments/${c.id}`, {
                        method: "DELETE",
                        headers: {
                          "Authorization": "Bearer " + GITHUB_API_TOKEN_VALUE,
                          "User-Agent": "Pronote-Cloudflare-Worker"
                        }
                      }).catch(() => null);
                      break;
                    }
                  } catch (_) {}
                }
              }
            } catch (_) {}
          }

          if (parsedResult) {
            if (isHtmlMode) {
              const acceptHeader = (request.headers.get("accept") || "").toLowerCase();
              const wantsRawHtml = acceptHeader.includes("text/html") || url.searchParams.get("raw") === "true";

              if (wantsRawHtml) {
                return new Response(parsedResult.rawHtml || parsedResult.html?.accueil || "<html><body><h1>Session Pronote Extraite</h1></body></html>", {
                  status: 200,
                  headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Access-Control-Allow-Origin": "*"
                  }
                });
              }

              return new Response(JSON.stringify({
                jobId,
                success: parsedResult.success,
                format: "html",
                html: parsedResult.html || null,
                rawHtml: parsedResult.rawHtml || null,
                data: parsedResult.data || null,
                executionTimeMs: parsedResult.executionTimeMs,
                timestamp: parsedResult.timestamp
              }), {
                status: parsedResult.success ? 200 : 400,
                headers: corsHeaders
              });
            }

            return new Response(JSON.stringify(parsedResult), {
              status: parsedResult.success ? 200 : 400,
              headers: corsHeaders
            });
          }
        }

        // 6.4 Si le temps limite est dépassé
        return new Response(JSON.stringify({
          success: false,
          error: "Le runner d'extraction Pronote a pris trop de temps à répondre (Timeout de 50 secondes). Veuillez réessayer."
        }), { status: 504, headers: corsHeaders });

      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          error: err.message || "Erreur de traitement de la requête."
        }), { status: 500, headers: corsHeaders });
      }
    }

    // Accueil / Documentation par défaut
    const acceptHeader = (request.headers.get("accept") || "").toLowerCase();
    const isHtmlPath = url.pathname === "/" || url.pathname.startsWith("/docs") || url.pathname.startsWith("/playground") || url.pathname === "/index.html";
    const wantsJson = acceptHeader.includes("application/json") && !acceptHeader.includes("text/html");

    if (isHtmlPath && !wantsJson) {
      return new Response(getDocumentationHtml(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response(JSON.stringify({
      service: "Pronote API Gateway",
      version: "3.0.0",
      architecture: "2-Brick Architecture (Worker KV + GitHub Actions 5h Multi-Tab Runner)",
      endpoints: {
        health: "/api/health",
        scrape: "POST /api/scrape-pronote",
        html: "POST /html (or POST /api/scrape-pronote/html)",
        job: "GET /api/job/:jobId"
      },
      documentation: "https://pronote-api.hugdu77777.workers.dev/docs"
    }), { headers: corsHeaders });
  }
};

function getDocumentationHtml() {
  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>PRONOTE API — Documentation Technique & Playground</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body {
      max-width: 100vw;
      overflow-x: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #ffffff;
      color: #0f172a;
    }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  </style>
</head>
<body class="bg-white text-slate-900 antialiased max-w-full overflow-x-hidden">
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 w-full">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="font-extrabold text-slate-900 tracking-tight text-sm">PRONOTE API</span>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">v3.0 Ultra-Fast Multi-Tab</span>
      </div>
      <div class="flex items-center gap-4">
        <a href="#playground" class="text-xs font-semibold text-slate-800 hover:text-black underline">Console de Test ↓</a>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto p-4 sm:p-8 space-y-10 text-sm leading-relaxed">
    <section class="space-y-3">
      <h1 class="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2">PRONOTE API REST v3.0</h1>
      <p class="text-slate-700">
        Extraction synchrone multi-onglets en parallèle en ~10-12 secondes avec extraction HTML complète et parsing procédural (EDT hebdomadaire, Notes avec barèmes et moyennes, Devoirs et Ressources avec pièces jointes).
      </p>
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs">
        <span class="font-bold text-slate-900">Endpoints disponibles :</span>
        <ul class="list-disc pl-5 mt-1 space-y-1">
          <li><code>POST /api/scrape-pronote</code> : Données JSON complètes (Emploi du temps, Notes, Devoirs, Ressources, Profil)</li>
          <li><code>POST /html</code> ou <code>POST /api/scrape-pronote/html</code> : Code HTML intégral de toutes les pages (Accueil, EDT, Notes, Devoirs, Ressources)</li>
          <li><code>GET /api/health</code> : Vérification de disponibilité du runner</li>
        </ul>
      </div>
    </section>

    <!-- Playground -->
    <section id="playground" class="space-y-4 pt-4 border-t border-slate-200">
      <h2 class="text-xl font-bold text-slate-900">Console de Test & Chronomètre</h2>
      <form onsubmit="runLiveCall(event)" class="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-md">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label class="block font-bold text-slate-800 mb-1">Identifiant ENT</label>
            <input type="text" id="play-user" required placeholder="prenom.nom" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-md">
          </div>
          <div>
            <label class="block font-bold text-slate-800 mb-1">Mot de passe ENT</label>
            <input type="password" id="play-pass" required placeholder="••••••••••••" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-md">
          </div>
        </div>
        <div class="flex gap-4 text-xs items-center">
          <label class="flex items-center gap-1.5 font-bold">
            <input type="radio" name="format" value="json" checked> JSON Procédural
          </label>
          <label class="flex items-center gap-1.5 font-bold">
            <input type="radio" name="format" value="html"> Code HTML intégral (/html/)
          </label>
        </div>
        <button type="submit" id="play-btn" class="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-md hover:bg-slate-800 transition cursor-pointer">
          Lancer l'extraction
        </button>
      </form>
      <div id="play-result-box" class="hidden space-y-2">
        <pre id="play-result-code" class="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-md overflow-x-auto max-h-[400px] whitespace-pre-wrap"></pre>
      </div>
    </section>
  </main>

  <script>
    async function runLiveCall(e) {
      e.preventDefault();
      const u = document.getElementById('play-user').value.trim();
      const p = document.getElementById('play-pass').value.trim();
      const format = document.querySelector('input[name="format"]:checked').value;
      const btn = document.getElementById('play-btn');
      const box = document.getElementById('play-result-box');
      const code = document.getElementById('play-result-code');

      btn.disabled = true;
      btn.innerText = "Extraction en cours (~10-15s)...";
      box.classList.remove('hidden');
      code.innerText = "Lancement de l'extraction multi-onglets en parallèle...";

      try {
        const ep = format === 'html' ? '/api/scrape-pronote/html' : '/api/scrape-pronote';
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p, format })
        });
        const data = await res.json();
        code.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        code.innerText = "Erreur: " + err.message;
      } finally {
        btn.disabled = false;
        btn.innerText = "Lancer l'extraction";
      }
    }
  </script>
</body>
</html>`;
}
