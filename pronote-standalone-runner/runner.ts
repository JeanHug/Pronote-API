import express from 'express';
import cors from 'cors';
import { runPronotePuppeteerScrape } from './puppeteerScraper.ts';

const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GH_RUNNER_TOKEN || process.env.GITHUB_TOKEN || '';
const REPO_OWNER = process.env.OWNE || process.env.OWNER || process.env.GITHUB_OWNER || 'JeanHug';
const REPO_NAME = process.env.REPO || process.env.GITHUB_REPO || 'Pronote-API';
const ISSUE_NUMBER = 1;
const WORKER_URL = 'https://pronote-api.hugdu77777.workers.dev';

const SESSION_MAX_DURATION_MS = 5 * 60 * 60 * 1000 - 4 * 60 * 1000; // ~4h56m total session duration
const RELAY_TRIGGER_LEAD_TIME_MS = 5 * 60 * 1000; // Trigger next runner 5 minutes before expiration
const sessionStartTime = Date.now();
const sessionExpiresAt = sessionStartTime + SESSION_MAX_DURATION_MS;
let relayTriggered = false;

const recentLogs: string[] = [];
function log(msg: string) {
  const line = `[${new Date().toISOString().substring(11, 19)}] ${msg}`;
  console.log(line);
  recentLogs.push(line);
  if (recentLogs.length > 50) recentLogs.shift();
}

log('----------------------------------------------------');
log('🚀 PRONOTE ACTIONS 5H CONTINUOUS RUNNER STARTED');
log(`⏱ Maximum Session Duration: 5 Hours`);
log(`🎯 Target Worker: ${WORKER_URL}`);
log('----------------------------------------------------');

// Initialize local express health server
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'online',
    runnerId: process.env.GITHUB_RUN_ID || 'standalone-gh-runner',
    uptimeMs: Date.now() - sessionStartTime,
    expiresInMs: sessionExpiresAt - Date.now(),
    logs: recentLogs.slice(-20)
  });
});

app.listen(3000, () => {
  log('📡 Runner health server listening on port 3000');
});

// Send periodic Heartbeat to Cloudflare Worker
async function sendHeartbeat() {
  try {
    await fetch(`${WORKER_URL}/api/runner/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'running',
        runnerId: process.env.GITHUB_RUN_ID || 'standalone-gh-runner',
        startedAt: sessionStartTime,
        sessionExpiresAt,
        lastPing: Date.now(),
        logs: recentLogs.slice(-15)
      })
    });
  } catch (err: any) {
    console.error('Heartbeat error:', err?.message);
  }
}

// Trigger replacement 5h runner VM via GitHub REST API
async function triggerNextRunnerRelay() {
  if (relayTriggered) return;
  relayTriggered = true;
  log('🔄 [5h Relay] Triggering next GitHub Actions 5-hour runner VM before current session expires...');

  try {
    const wfRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/pronote-runner.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronote-Runner-5h'
      },
      body: JSON.stringify({ ref: 'main' })
    });

    if (wfRes.ok || wfRes.status === 204) {
      log('✅ [5h Relay] Replacement runner successfully dispatched via workflow_dispatch!');
    }

    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronote-Runner-5h'
      },
      body: JSON.stringify({
        event_type: 'start_runner',
        client_payload: { reason: '5h_session_rotation', triggeredAt: Date.now() }
      })
    });

    if (res.ok || res.status === 204) {
      log('✅ [5h Relay] Replacement runner successfully dispatched via repository_dispatch!');
    }
  } catch (err: any) {
    log(`❌ [5h Relay] Network error triggering replacement runner: ${err?.message}`);
  }
}

sendHeartbeat();
setInterval(sendHeartbeat, 12000);

// Job tracking
const processedJobIds = new Set<string>();
let lastGithubCheckMs = 0;
let activeJobsCount = 0;
const MAX_CONCURRENT_JOBS = 3;

// High-speed job polling & session lifecycle manager
async function pollJobQueue() {
  if (activeJobsCount >= MAX_CONCURRENT_JOBS) {
    return;
  }

  const now = Date.now();
  const timeRemainingMs = sessionExpiresAt - now;

  if (timeRemainingMs <= RELAY_TRIGGER_LEAD_TIME_MS && !relayTriggered) {
    await triggerNextRunnerRelay();
  }

  if (now >= sessionExpiresAt && activeJobsCount === 0) {
    log('⏳ 5-Hour session completed. Gracefully exiting current runner VM.');
    process.exit(0);
  }

  // 1. Fast polling directly from Cloudflare Worker KV (<50ms latency)
  try {
    const kvRes = await fetch(`${WORKER_URL}/api/runner/poll-job`, {
      headers: { 'User-Agent': 'Pronote-Runner-5h' }
    });
    if (kvRes.ok) {
      const kvData = await kvRes.json() as any;
      if (kvData && kvData.hasJob && kvData.job && kvData.job.jobId) {
        if (!processedJobIds.has(kvData.job.jobId)) {
          processedJobIds.add(kvData.job.jobId);
          log(`⚡ [Instant KV Intercept] Job received: ${kvData.job.jobId} for ${kvData.job.username}`);
          handleScrapeJob(kvData.job).catch((e) => log(`Job error: ${e?.message}`));
          return;
        }
      }
    }
  } catch (_) {
    // Continue
  }

  // 2. Fallback check on GitHub Issue comments (Every 800ms)
  if (now - lastGithubCheckMs > 800) {
    lastGithubCheckMs = now;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pronote-Runner-5h'
        }
      });

      if (res.status === 200) {
        const comments = await res.json() as any[];
        for (const comment of comments) {
          let jobPayload: any = null;
          try {
            jobPayload = JSON.parse(comment.body);
          } catch (_) {
            continue;
          }

          if (jobPayload && jobPayload.jobId && jobPayload.type === 'scrape_job') {
            if (processedJobIds.has(jobPayload.jobId)) continue;
            processedJobIds.add(jobPayload.jobId);

            log(`⚡ [Instant Issue Intercept] Job received: ${jobPayload.jobId} for ${jobPayload.username}`);
            
            fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${comment.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'User-Agent': 'Pronote-Runner-5h'
              }
            }).catch(() => null);

            handleScrapeJob(jobPayload).catch((e) => log(`Job error: ${e?.message}`));
            break;
          }
        }
      }
    } catch (_) {
      // Continue
    }
  }
}

// Job processing with isolated browser context
async function handleScrapeJob(job: any) {
  const { jobId, username, password, pronoteUrl, entUrl, format } = job;
  log(`[${jobId}] Lancement du scraping (${format || 'json'}) pour ${username}...`);
  const t0 = Date.now();
  activeJobsCount++;

  try {
    const result = await runPronotePuppeteerScrape(
      username,
      password,
      pronoteUrl || 'https://0771068t.index-education.net/pronote/eleve.html',
      entUrl || 'https://ent.seine-et-marne.fr/',
      format || 'json'
    );

    const elapsed = Date.now() - t0;
    log(`[${jobId}] Extraction achevée en ${elapsed}ms (${(elapsed/1000).toFixed(2)}s) - Succès: ${result.success}`);

    const resultPayload = {
      type: 'scrape_result',
      jobId,
      success: result.success,
      format: format || 'json',
      data: result.data,
      html: result.html,
      rawHtml: result.rawHtml,
      error: result.error,
      executionTimeMs: elapsed,
      timestamp: new Date().toISOString()
    };

    // Push on both channels concurrently without blocking
    await Promise.allSettled([
      fetch(`${WORKER_URL}/api/runner/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultPayload)
      }),
      fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pronote-Runner-5h'
        },
        body: JSON.stringify({ body: JSON.stringify(resultPayload) })
      })
    ]);

    log(`[${jobId}] Résultat transmis instantanément sur les 2 canaux (Worker KV + Issue).`);
  } catch (scrapeErr: any) {
    const elapsed = Date.now() - t0;
    log(`[${jobId}] Erreur scraping (${elapsed}ms): ${scrapeErr?.message}`);
    const errPayload = {
      type: 'scrape_result',
      jobId,
      success: false,
      error: scrapeErr?.message || 'Erreur inconnue lors du scraping',
      executionTimeMs: elapsed,
      timestamp: new Date().toISOString()
    };

    await Promise.allSettled([
      fetch(`${WORKER_URL}/api/runner/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errPayload)
      }),
      fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pronote-Runner-5h'
        },
        body: JSON.stringify({ body: JSON.stringify(errPayload) })
      })
    ]);
  } finally {
    activeJobsCount--;
  }
}

// Boucle récursive cadencée à 250ms
async function runSequentialPollingLoop() {
  try {
    await pollJobQueue();
  } catch (_) {}
  setTimeout(runSequentialPollingLoop, 250);
}

runSequentialPollingLoop();
