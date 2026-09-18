# Pronote API v5

**Full documentation, exhaustive JSON reference and playground:** https://jeanhug.github.io/Pronote-API/

Complete replacement of the previous v4 gateway, DOM snapshots, runner, and workflows. An unofficial, read-only connector for **ENT77 and hosted Pronote student accounts**. Not affiliated with Index Éducation. Only use accounts you are authorized to access.

## Architecture

1. The Cloudflare Worker `pronote-api` validates HTTP requests and exposes documentation.
2. A new SQLite-backed Durable Object `Coordinator` retains AES-GCM encrypted pending requests and results. Credentials are cleared **when claimed**, not kept with results. A per-job random capability is needed to read or delete a result.
3. A GitHub Actions VM runs the new browser service. It authenticates against the actual ENT form endpoint, verifies `/auth/oauth2/userinfo`, transfers session cookies in memory into an isolated Chromium context, and navigates **one Pronote page** sequentially. It obtains real page content; no uncalled snapshot expression.
4. The Next.js console proxies user-supplied credentials to the Worker. PostgreSQL, accessed through Drizzle, stores **only safe verification metadata**. It never stores passwords, cookies, student names, individual grades or HTML.

There is no GitHub issue queue, no results published in issues, no Express server on the Actions VM, and no Cloudflare KV namespace. A Durable Object remains necessary for the outbound-only runner architecture. This version does not claim to use Pronote’s native protocol.

## Public API

- `GET /api/v1/health`: infrastructure state and last safe extraction summary. Not proof that scraping succeeds.
- `GET /api/v1/ready`: HTTP 503 unless a recent v5 runner heartbeat exists.
- `GET /api/v1/schema`: contract, modules, scope and retention.
- `POST /api/v1/scrape-pronote`: body requires `username` and `password`. Optional `modules`, `pronoteUrl`, `entUrl`.
- `GET /api/v1/job/:id`: requires `X-Job-Token`.
- `DELETE /api/v1/job/:id`: requires the same `X-Job-Token` and immediately deletes the record.
- `/docs`: human-readable documentation.

The legacy POST routes `/api/scrape-pronote`, `/api/scrape`, `/api/v1/scrape` are aliases, but the **v5 JSON contract is a breaking change**.

An extraction returns 200 if finished, or 202 with `jobId`, `jobToken`, and `statusUrl`. On 202 wait at least three seconds, then GET the job with `X-Job-Token`. Stop polling on any non-202 response. Never put a job token in a URL, log, or public report. A result may be `partial` when some rubrics are unavailable or failed. Inspect each module, not only `success`.

Modules: `emploiDuTemps`, `notes`, `agenda`, `ressources`, `vieScolaire`, `competences`, `actualites`, `cantine`.

### Scope and known limitations

- ENT77's local username/password login and Pronote **student** space only. EduConnect/MFA or a mandatory password/terms action returns an explicit error; those controls are not bypassed.
- Reads the timetable week, grades period and contents currently loaded by Pronote. **Not a guarantee of a full school year or of unloaded/virtualized records.**
- Grades with unavailable coefficients, missing dates or missing scales use `null`; no assumptions or invented averages.
- Some document buttons do not expose a direct download URL. Their names are retained with `url: null`; session cookies are never returned.
- Attendance, skills, news and menus currently expose rendered entries; absence of a menu is `unavailable`, not a fabricated empty collection.
- No homework completion, message-reading mutation or account-setting endpoint.
- A zero-data account is only reported empty when an empty state can be recognized. A live regression test requires nonempty timetable and homework for the configured test account.

## Security and lifecycle

- Five requests/minute/IP and at most twelve active jobs.
- Pending credential ciphertext has a three-minute deadline; periodic cleanup runs every minute. Expired requests cannot be claimed. Credentials are deleted immediately on claim. Interrupted jobs are explicitly failed, not silently replayed with stale secrets.
- Results have a five-minute deadline, encrypted at rest and protected by a separate 256-bit capability. Cleanup is periodic; use DELETE for immediate erasure.
- `RUNNER_TOKEN` is independent from the GitHub PAT. Runner requests require v5 protocol and successful results require a valid job lease.
- Only a credential-key-free, allowlisted summary is published in health/CI output. No HTML or full response artifact.
- `API_KEYS` can be configured as a comma-separated Cloudflare secret to restrict clients further. Without it the service accepts callers' own ENT credentials, with the stated abuse limits. CORS is same-origin unless an allowed origin is explicitly configured.
- Credentials are never supplied by a public 'test my environment account' endpoint.

## Workflows

### `release-v5.yml` — verify → deploy → test

PRs run type generation, Next.js and Worker TypeScript checks, unit tests, Next.js production build and Wrangler dry-run. Only main can proceed to deployment. The deployment then requests a fresh matching runner and executes **one real API test** using GitHub secrets. This test waits for readiness, checks validation and unauthenticated runner rejection, submits an extraction, follows 202 responses, validates actual data, checks unauthorized job access rejection, and deletes the result. It fails if the deployed API fails; a separate direct scrape cannot hide that failure.

### `runner-v5.yml` — browser service

Manual, `repository_dispatch` (`pronote_runner_v5`), or six-hour safety schedule. Installs Node and Chromium, uses a dedicated `RUNNER_TOKEN`, and serves jobs sequentially. The script has a 260-minute budget inside a 300-minute job budget. Heartbeats every twenty seconds, long-poll claim for twenty seconds. Relay is retried before shutdown. Rotation can cause a cold-start gap because the concurrency group retains one active runner. Changing source does not magically update an existing VM: the release workflow restarts it explicitly.

## Deployment and secrets

GitHub Actions: `CLOUDFLARE_TOKEN`, `CLOUDFLARE_ID`, `GH_TOKEN`, `RUNNER_TOKEN`, `DATA_KEY`, `ENT_ID`, `ENT_PASS` (and optional `API_KEY`). Cloudflare: `GITHUB_TOKEN`, `RUNNER_TOKEN`, `DATA_KEY` (and optional `API_KEYS`). The ENT account stays in GitHub secrets and is used only by private test processes.

Run Wrangler from `worker/` so its TypeScript configuration resolves correctly. `worker/wrangler.toml` includes a **destructive migration deleting the old JobStore** and creating the new Coordinator; old queued jobs and stored results are not carried over. Cron triggers from the old Worker are removed.

`node scripts/provision.mjs` is the one-time migration tool: generates independent keys, writes them to the local untracked `.env.local`, encrypts GitHub secrets using the repository public key, uploads Cloudflare secrets, and disables/cancels obsolete workflows. Do not rotate DATA_KEY while encrypted jobs must remain readable.

`node scripts/publish-source.mjs` replaces main's tree with the allowlisted new source using GitHub's Git Data API, scanning for known secrets and performing a non-force fast-forward. Prior commits remain in Git history for rollback; old application files are removed from main. It never uploads environment files or diagnostic captures.

## Local checks

Use Node.js 22. Install with npm ci. `npx tsx --test tests/core.test.ts` tests the contract, parsing and encryption. `npx tsx scripts/test-direct.ts` performs an explicitly requested private diagnostic using ENT environment secrets. `npx tsx scripts/test-api.ts --record` tests the deployed API and stores only its safe summary in the local PostgreSQL console. No test script prints credentials or school data.

The Next.js console is optional for the production API. Its health route verifies PostgreSQL; it is not the Cloudflare Worker health route.
