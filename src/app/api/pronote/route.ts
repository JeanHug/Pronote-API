import { ApiError, safeFailure, validateCredentials } from '@/pronote/contracts';
import { isConsoleOriginAllowed } from '@/pronote/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  try{
    if(!isConsoleOriginAllowed(request))return Response.json({error:{code:'FORBIDDEN_ORIGIN'}},{status:403});
    const raw=await request.text();if(raw.length>8192)throw new ApiError('BODY_TOO_LARGE',413,'validation','Requête trop volumineuse.');
    let decoded:unknown;try{decoded=JSON.parse(raw);}catch{throw new ApiError('INVALID_JSON',400,'validation','JSON invalide.');}
    const input=validateCredentials(decoded);
    const headers:Record<string,string>={'Content-Type':'application/json'};
    const apiKey=request.headers.get('x-api-key');if(apiKey)headers['X-API-Key']=apiKey;
    const remote=await fetch('https://pronote-api.hugdu77777.workers.dev/api/v1/scrape-pronote',{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(35000)});
    return new Response(remote.body,{status:remote.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch(error){return Response.json(safeFailure(error),{status:error instanceof ApiError?error.status:502,headers:{'Cache-Control':'no-store'}});}
}
