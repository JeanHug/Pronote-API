import 'dotenv/config';
import puppeteer from 'puppeteer';
import { loginEduConnect } from '../src/pronote/educonnect';

const username = process.env.ENT_ID || '';
const password = process.env.ENT_PASS || '';
async function main() {
  if (!username || !password) throw new Error('ENT_SECRETS_MISSING');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const started = Date.now();
  try {
    await loginEduConnect(page, {
      username,
      password,
      account: 'student',
      pronoteUrl: 'https://0771068t.index-education.net/pronote/eleve.html',
    });
    const current = new URL(page.url());
    const ready = current.hostname.endsWith('index-education.net') && !current.hostname.startsWith('hubeduconnect.');
    console.log(JSON.stringify({ event: ready ? 'EDUCONNECT_REACHED_PRONOTE' : 'EDUCONNECT_SESSION_OPEN', host: current.hostname, path: current.pathname, elapsedMs: Date.now() - started }));
    process.exitCode = ready ? 0 : 1;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : 'EDUCONNECT_ERROR';
    const message = error instanceof Error ? error.message.replaceAll(password, '[REDACTED]').slice(0, 180) : 'unknown';
    console.log(JSON.stringify({ event: 'EDUCONNECT_CHECK', code, name: error instanceof Error ? error.name : 'unknown', message, elapsedMs: Date.now() - started }));
    process.exitCode = code === 'EDUCONNECT_UNAVAILABLE' ? 2 : 1;
  } finally {
    await browser.close().catch(() => {});
  }
}
main().catch(() => { console.log(JSON.stringify({ event: 'EDUCONNECT_CHECK', code: 'PROBE_FAILED' })); process.exitCode = 1; });
