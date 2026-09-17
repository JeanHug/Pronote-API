import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
const require=createRequire(import.meta.url);const sodium=require('libsodium-wrappers');
const repo='JeanHug/Pronote-API';
async function gh(path,method='GET',value){const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{method,headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Pronote-v5-provision'},body:value?JSON.stringify(value):undefined});if(!r.ok)throw new Error(`GITHUB_${r.status}`);return r.status===204?null:r.json();}
async function cf(path,method,value){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ID}${path}`,{method,headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(value)});const j=await r.json();if(!r.ok||!j.success)throw new Error(`CLOUDFLARE_${r.status}`);return j.result;}
async function main(){
 for(const key of ['GH_TOKEN','CLOUDFLARE_TOKEN','CLOUDFLARE_ID'])if(!process.env[key])throw new Error(`MISSING_${key}`);
 let local='';try{local=await readFile('.env.local','utf8');}catch{}
 const existing=dotenv.parse(local);
 const secrets={RUNNER_TOKEN:existing.RUNNER_TOKEN||randomBytes(32).toString('hex'),DATA_KEY:existing.DATA_KEY||randomBytes(32).toString('hex')};
 for(const [name,value]of Object.entries(secrets))if(!existing[name])local+=`\n${name}="${value}"\n`;
 await writeFile('.env.local',local,{mode:0o600});
 await sodium.ready;
 const pub=await gh('/actions/secrets/public-key');
 for(const [name,value]of Object.entries(secrets)){
  const encrypted=sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(value),sodium.from_base64(pub.key,sodium.base64_variants.ORIGINAL)),sodium.base64_variants.ORIGINAL);
  await gh(`/actions/secrets/${name}`,'PUT',{encrypted_value:encrypted,key_id:pub.key_id});
  await cf('/workers/scripts/pronote-api/secrets','PUT',{name,type:'secret_text',text:value});
  console.log(JSON.stringify({secret:name,github:true,cloudflare:true}));
 }
 await cf('/workers/scripts/pronote-api/secrets','PUT',{name:'GITHUB_TOKEN',type:'secret_text',text:process.env.GH_TOKEN});
 const workflows=await gh('/actions/workflows');
 for(const w of workflows.workflows.filter(w=>['ci.yml','deploy-worker.yml','deploy-pages.yml','pronote-runner.yml','pronote-live.yml','live-test.yml'].some(name=>w.path.endsWith('/'+name)))){await gh(`/actions/workflows/${w.id}/disable`,'PUT');console.log(JSON.stringify({disabled:w.name}));}
 const runs=await gh('/actions/runs?per_page=100');
 for(const r of runs.workflow_runs.filter(r=>r.status!=='completed')){await gh(`/actions/runs/${r.id}/cancel`,'POST').catch(()=>{});console.log(JSON.stringify({cancelled:r.id}));}
 console.log('PROVISIONING_COMPLETE');
}
main().catch(e=>{console.error(/^(GITHUB_|CLOUDFLARE_|MISSING_)/.test(e.message)?e.message:'PROVISIONING_FAILED');process.exitCode=1;});
