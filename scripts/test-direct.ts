import 'dotenv/config';
import { extractPronote } from '../src/pronote/engine';
import { validateCredentials, summarize } from '../src/pronote/contracts';
async function main() {
  if (!process.env.ENT_ID || !process.env.ENT_PASS) throw new Error('ENT_SECRETS_MISSING');
  const result = await extractPronote(validateCredentials({ username: process.env.ENT_ID, password: process.env.ENT_PASS }), stage => console.log(JSON.stringify({ stage })));
  console.log(JSON.stringify(summarize(result), null, 2));
  const ok = result.success && result.authentication.pronote && result.modules.some(m=>m.module==='emploiDuTemps'&&m.count>0) && result.modules.some(m=>m.module==='agenda'&&m.count>0);
  process.exitCode = ok ? 0 : 1;
}
main().catch(()=>{console.error('DIRECT_TEST_FAILED');process.exitCode=1;});
