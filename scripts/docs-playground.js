/* Playground de la documentation publique.
   Ce fichier est inliné tel quel dans docs/index.html par scripts/build-docs.ts.
   __BASE__ est remplacé par l'origine du Worker à la génération. */
(function () {
  "use strict";
  var BASE = "__BASE__";
  var SECTION_IDS = ["intro", "architecture", "auth", "endpoints", "request", "response", "fields", "modules", "errors", "limits", "playground"];

  var form = document.getElementById("pg");
  var userInput = document.getElementById("u");
  var passInput = document.getElementById("p");
  var keyInput = document.getElementById("k");
  var urlInput = document.getElementById("pu");
  var runBtn = document.getElementById("go");
  var stopBtn = document.getElementById("stop");
  var clearBtn = document.getElementById("clear");
  var statusBox = document.getElementById("status");
  var stCode = document.getElementById("st-code");
  var stText = document.getElementById("st-text");
  var stTime = document.getElementById("st-time");
  var outBox = document.getElementById("out");
  var tabs = document.getElementById("tabs");
  var panes = [].slice.call(document.querySelectorAll("#out pre"));
  var moduleBoxes = [].slice.call(document.querySelectorAll("#mods input"));

  var controller = null;
  var jobId = null;
  var jobToken = null;
  var startedAt = 0;
  var timer = null;
  var running = false;

  function show(code, text) {
    statusBox.hidden = false;
    stCode.textContent = code;
    stText.textContent = text;
  }
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pane(name, html) {
    var target = panes.filter(function (p) { return p.getAttribute("data-p") === name; })[0];
    if (target) target.innerHTML = html;
  }
  function pretty(obj) {
    return "<code>" + escapeHtml(JSON.stringify(obj, null, 2)) + "</code>";
  }
  function selectedModules() {
    return moduleBoxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
  }
  function requestHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (keyInput.value.trim()) headers["X-API-Key"] = keyInput.value.trim();
    if (jobToken) headers["X-Job-Token"] = jobToken;
    return headers;
  }
  function curlSnippet(mods) {
    var body = { username: "VOTRE_IDENTIFIANT", password: "VOTRE_MOT_DE_PASSE", modules: mods };
    if (urlInput.value.trim()) body.pronoteUrl = urlInput.value.trim();
    var lines = [
      "curl -X POST " + BASE + "/api/v1/scrape-pronote \\",
      '  -H "Content-Type: application/json" \\',
      '  -H "X-API-Key: <cle>" \\',
      "  -d '" + JSON.stringify(body) + "'"
    ];
    return "<code>" + escapeHtml(lines.join("\n")) + "</code>";
  }
  function jsSnippet(mods) {
    var body = { username: "VOTRE_IDENTIFIANT", password: "VOTRE_MOT_DE_PASSE", modules: mods };
    var lines = [
      'const base = "' + BASE + '";',
      "",
      "const res = await fetch(base + \"/api/v1/scrape-pronote\", {",
      '  method: "POST",',
      '  headers: { "Content-Type": "application/json" },',
      "  body: JSON.stringify(" + JSON.stringify(body) + ")",
      "});",
      "",
      "if (res.status === 202) {",
      "  const pending = await res.json();",
      "  // Conservez pending.jobToken cote serveur, jamais dans une URL.",
      "  await new Promise(r => setTimeout(r, 3000));",
      "",
      "  const done = await fetch(base + \"/api/v1/job/\" + pending.jobId, {",
      '    headers: { "X-Job-Token": pending.jobToken }',
      "  });",
      "",
      "  if (done.status === 202) { /* encore en cours : reessayez */ }",
      "  else {",
      "    const result = await done.json();",
      "    await fetch(base + \"/api/v1/job/\" + pending.jobId, {",
      '      method: "DELETE",',
      '      headers: { "X-Job-Token": pending.jobToken }',
      "    });",
      "  }",
      "}"
    ];
    return "<code>" + escapeHtml(lines.join("\n")) + "</code>";
  }
  function setRunning(value) {
    running = value;
    runBtn.disabled = value;
    stopBtn.disabled = !value;
    if (value) {
      startedAt = Date.now();
      timer = setInterval(function () {
        stTime.textContent = ((Date.now() - startedAt) / 1000).toFixed(0) + " s";
      }, 1000);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function call(path, init) {
    return fetch(BASE + path, init).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 400) }; }
        return { status: res.status, data: data };
      });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (running) return;

    var username = userInput.value.trim();
    var password = passInput.value;
    if (!username || !password) {
      show("400", "Identifiant et mot de passe requis.");
      return;
    }
    var mods = selectedModules();
    if (!mods.length) {
      show("400", "Selectionnez au moins une rubrique.");
      return;
    }

    outBox.hidden = false;
    pane("r", '<div class="placeholder">Extraction en cours…</div>');
    pane("c", curlSnippet(mods));
    pane("j", jsSnippet(mods));

    controller = new AbortController();
    jobId = null;
    jobToken = null;
    setRunning(true);
    show("…", "Connexion a la passerelle.");

    var payload = { username: username, password: password, modules: mods };
    if (urlInput.value.trim()) payload.pronoteUrl = urlInput.value.trim();

    // Le mot de passe quitte le champ des que la requete part, meme si elle echoue.
    passInput.value = "";

    var signal = controller.signal;
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function") {
      signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
    }

    call("/api/v1/scrape-pronote", {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(payload),
      signal: signal
    }).then(function (res) {
      if (res.data && typeof res.data.jobId === "string") jobId = res.data.jobId;
      if (res.data && typeof res.data.jobToken === "string") jobToken = res.data.jobToken;

      var attempts = 0;
      function poll() {
        if (res.status !== 202 || !jobId || attempts >= 90 || controller.signal.aborted) return res;
        attempts++;
        show("202", "Traitement en cours (" + jobId.slice(0, 8) + "…). Nouvelle tentative dans 3 s.");
        return new Promise(function (resolve) { setTimeout(resolve, 3000); }).then(function () {
          return call("/api/v1/job/" + encodeURIComponent(jobId), {
            headers: requestHeaders(),
            signal: controller.signal
          });
        }).then(function (next) {
          res = next;
          return poll();
        });
      }
      return poll();
    }).then(function (res) {
      pane("r", pretty(res.data));
      var label = res.data && res.data.status ? res.data.status : "sans statut";
      if (res.status === 200) show("200", "Extraction terminee — statut " + label + ".");
      else if (res.status === 202) show("202", "Delai du playground atteint. Interrogez le job avec le jeton.");
      else if (res.data && res.data.error) show(String(res.status), res.data.error.code + " — " + res.data.error.message);
      else show(String(res.status), "Reponse du serveur affichee ci-contre.");
    }).catch(function (error) {
      // Le detail technique reste dans la console du navigateur, jamais a l'ecran.
      console.error("[playground]", error && error.name, error && error.message);
      var name = error && error.name ? error.name : "Error";
      if (name === "AbortError") {
        show("—", "Suivi arrete. Le resultat serveur expire seul apres 5 minutes.");
      } else if (name === "TimeoutError") {
        show("timeout", "Delai de 120 s depasse sans reponse.");
        pane("r", '<div class="placeholder">Aucune reponse dans le delai imparti.</div>');
      } else if (name === "TypeError") {
        show("reseau", "Requete bloquee par le navigateur ou le reseau : CORS, bloqueur de publicite ou connexion interrompue. Verifiez la console.");
        pane("r", '<div class="placeholder">Requete bloquee avant d\\u2019atteindre la passerelle.</div>');
      } else {
        show("erreur", "Erreur inattendue dans le playground. Le detail est dans la console du navigateur.");
        pane("r", '<div class="placeholder">Erreur d\\u2019execution du playground.</div>');
      }
    }).then(function () { setRunning(false); });
  });

  stopBtn.addEventListener("click", function () { if (controller) controller.abort(); });
  clearBtn.addEventListener("click", function () {
    outBox.hidden = true;
    statusBox.hidden = true;
    jobId = null;
    jobToken = null;
    userInput.value = "";
    passInput.value = "";
  });

  tabs.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    [].slice.call(tabs.children).forEach(function (tab) { tab.classList.toggle("on", tab === button); });
    panes.forEach(function (paneEl) {
      paneEl.classList.toggle("on", paneEl.getAttribute("data-p") === button.getAttribute("data-t"));
    });
  });

  var burger = document.getElementById("burger");
  var side = document.getElementById("side");
  var scrim = document.getElementById("scrim");
  var navLinks = [].slice.call(document.querySelectorAll("aside a"));
  var sections = SECTION_IDS.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var toTop = document.getElementById("totop");

  function closeNav() {
    side.classList.remove("open");
    scrim.classList.remove("on");
  }
  burger.addEventListener("click", function () {
    side.classList.toggle("open");
    scrim.classList.toggle("on");
  });
  scrim.addEventListener("click", closeNav);
  navLinks.forEach(function (link) { link.addEventListener("click", closeNav); });

  window.addEventListener("scroll", function () {
    toTop.classList.toggle("on", window.scrollY > 500);
    var marker = window.scrollY + 110;
    var current = navLinks[0];
    sections.forEach(function (section, index) { if (section.offsetTop <= marker) current = navLinks[index]; });
    navLinks.forEach(function (link) { link.classList.toggle("active", link === current); });
  }, { passive: true });
})();
