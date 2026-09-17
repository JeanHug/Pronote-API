import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const repository='JeanHug/Pronote-API';
const api=`https://api.github.com/repos/${repository}`;
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Pronote-v5-rebuild','X-GitHub-Api-Version':'2022-11-28'};
async function call(p,method='GET',body){const r=await fetch(api+p,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`GITHUB_${r.status}`);return r.status===204?null:r.json();}
async function collect(dir){const entries=await readdir(dir,{withFileTypes:true});const files=[];for(const entry of entries){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())files.push(...await collect(file));else files.push(file);}return files;}
try{
 if(!process.env.GH_TOKEN)throw new Error('GH_TOKEN_MISSING');
 const files=['package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts','postcss.config.mjs','eslint.config.mjs','drizzle.config.json','.gitignore','.env.example','README.md',...await collect('src'),...await collect('worker'),...await collect('tests'),...await collect('.github'),...await collect('scripts')]
 .filter(f=>!f.includes('/.wrangler/')&&!f.includes('/node_modules/')&&!f.endsWith('.tsbuildinfo')&&!f.endsWith('probe-ent.mjs')&&!f.endsWith('.log'));
 const tree=[];
 const sensitive=['GH_TOKEN','CLOUDFLARE_TOKEN','ENT_ID','ENT_PASS','DATA_KEY','RUNNER_TOKEN'].map(k=>process.env[k]).filter(v=>v&&v.length>5);
 for(const file of [...new Set(files)].sort()){
  const content=await readFile(file,'utf8');
  if(sensitive.some(secret=>content.includes(secret)))throw new Error('SECRET_SCAN_BLOCKED');
  if(/(?:github_pat_|ghp_|cfat_)[A-Za-z0-9_]{15,}/.test(content))throw new Error('SECRET_PATTERN_BLOCKED');
  tree.push({path:file,mode:'100644',type:'blob',content});
 }
 const head=await call('/git/ref/heads/main');
 const built=await call('/git/trees','POST',{tree});
 const commit=await call('/git/commits','POST',{message:'Rebuild Pronote API v5: verified ENT session, encrypted jobs, real E2E tests',tree:built.sha,parents:[head.object.sha]});
 // Non-force fast-forward: if main changed during this rebuild, do not overwrite it.
 await call('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
 console.log(JSON.stringify({event:'SOURCE_REPLACED',repository,commit:commit.sha,files:tree.length,previousCommit:head.object.sha}));
}catch(e){console.error(/^[A-Z_0-9]+$/.test(e.message)?e.message:'PUBLISH_FAILED');process.exitCode=1;}
