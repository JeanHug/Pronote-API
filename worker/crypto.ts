const encoder = new TextEncoder();
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(value:string):Promise<string> { const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''); }
export async function equalSecret(a:string,b:string):Promise<boolean> { const x=await digest(a),y=await digest(b);let n=0;for(let i=0;i<x.length;i++)n|=x.charCodeAt(i)^y.charCodeAt(i);return n===0; }
function bytes(hex:string):Uint8Array<ArrayBuffer> { if(!/^[0-9a-f]{64}$/i.test(hex))throw new Error('INVALID_ENCRYPTION_KEY');return new Uint8Array(hex.match(/../g)!.map(v=>parseInt(v,16))); }
async function key(secret:string) {return crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(value:unknown,secret:string):Promise<string>{const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),encoder.encode(JSON.stringify(value)));return JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(encrypted))});}
export async function unseal<T>(value:string,secret:string):Promise<T>{const packed=JSON.parse(value) as {iv:number[];data:number[]};const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(packed.iv)},await key(secret),new Uint8Array(packed.data));return JSON.parse(new TextDecoder().decode(clear)) as T;}
