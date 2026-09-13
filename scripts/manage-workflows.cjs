const https = require('https');

const owner = process.env.GITHUB_OWNER || 'JeanHug';
const repo = process.env.GITHUB_REPO || 'Pronote-API';
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error("Erreur: GITHUB_TOKEN manquant");
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Pronote-API-Manager'
};

function makeRequest(path, method, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch(e) {
            resolve(data);
          }
        } else {
          reject(new Error(`GitHub API error on ${method} ${path}: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  try {
    console.log(`Recherche des runs de workflow actifs pour ${owner}/${repo}...`);
    // Récupérer les runs en cours (status: in_progress, queued)
    const runsData = await makeRequest(`/repos/${owner}/${repo}/actions/runs?status=in_progress`, 'GET');
    const queuedData = await makeRequest(`/repos/${owner}/${repo}/actions/runs?status=queued`, 'GET');
    
    const allRuns = [...(runsData.workflow_runs || []), ...(queuedData.workflow_runs || [])];
    console.log(`Trouvé ${allRuns.length} run(s) actif(s).`);

    for (const run of allRuns) {
      console.log(`Annulation du run #${run.id} (${run.name || 'Workflow'})...`);
      try {
        await makeRequest(`/repos/${owner}/${repo}/actions/runs/${run.id}/cancel`, 'POST');
        console.log(`Run #${run.id} annulé avec succès.`);
      } catch (err) {
        console.error(`Impossible d'annuler le run #${run.id}: ${err.message}`);
      }
    }

    console.log("Déclenchement du nouveau workflow via repository dispatch (start_runner)...");
    await makeRequest(`/repos/${owner}/${repo}/dispatches`, 'POST', {
      event_type: 'start_runner',
      client_payload: {
        reason: "manual_update",
        requestedAt: Date.now()
      }
    });
    console.log("Nouveau workflow déclenché avec succès !");
  } catch (err) {
    console.error("Une erreur est survenue lors de la gestion des workflows :", err.message);
    process.exit(1);
  }
}

run();
