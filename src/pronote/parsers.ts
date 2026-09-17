import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { Attachment, Assignment, Entry, Grade, Lesson, Resource } from './contracts';

export function text(value: string | undefined | null): string { return (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
const months = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
export function normalized(value: string): string { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function dateFromLabel(value: string, reference = new Date()): string | null {
  const s = normalized(value);
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(s);
  if (iso) return iso[0];
  const words = /\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/.exec(s);
  const digits = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d{2}|\d{2}))?\b/.exec(s);
  if (!words && !digits) return null;
  const day = Number(words?.[1] || digits?.[1]);
  const month = words ? months.indexOf(words[2]) + 1 : Number(digits?.[2]);
  const rawYear = words?.[3] || digits?.[3];
  let year = rawYear ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear) : reference.getUTCFullYear();
  if (!rawYear) { const d = Date.UTC(year,month-1,day)-reference.getTime(); if(d>183*86400000)year--; if(d< -183*86400000)year++; }
  const date = new Date(Date.UTC(year,month-1,day));
  if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return date.toISOString().slice(0,10);
}
function num(s: string): number | null { const n=Number(text(s).replace(',','.'));return text(s)&&Number.isFinite(n)?n:null; }
function id(prefix: string, index: number): string { return `${prefix}-${index+1}`; }
function files($: CheerioAPI, node: AnyNode, base: string): Attachment[] {
  const rows: Attachment[]=[];
  $(node).find('.piece-jointe a, .chips-pj a, a[href*="FichiersExternes"]').each((_,el)=>{
    const nom=text($(el).text());if(!nom)return;
    let url: string|null=null;
    try { const u=new URL($(el).attr('href')||'',base); if($(el).attr('href')&&u.protocol==='https:'&&u.hostname===new URL(base).hostname&&!/[?&](ticket|token|session|password)=/i.test(u.href))url=u.href; }catch{}
    if(!rows.some(r=>r.nom===nom&&r.url===url))rows.push({nom,url});
  });return rows;
}
export function parseTimetable(html: string, ref=new Date()): Lesson[] {
  const $=load(html);const out:Lesson[]=[];
  $('.cours-simple').each((i,el)=>{
    const label=text($(el).attr('aria-label'));const rows=$(el).find('.content_cours [role="listitem"]').toArray().map(e=>text($(e).text())).filter(Boolean);
    if(!rows.length)return;
    const times=[...normalized(label).matchAll(/\b(\d{1,2})\s*(?:heures?|h|:)\s*(\d{1,2})?/g)].map(m=>`${m[1].padStart(2,'0')}:${(m[2]||'0').padStart(2,'0')}`);
    const salle=rows.slice(1).find(r=>/^(?:\d{1,4}[A-Z]?|[A-Z]\d{2,3}|salle\b|gymnase|cdi|stade|piscine|labo)/i.test(r))||null;
    const professeur=rows.slice(1).find(r=>r!==salle&&/^(?:M\.|Mme|Mlle|M |[A-ZÀ-Ÿ-]+\s+[A-Z]\.)/.test(r))||null;
    out.push({id:id('cours',i),matiere:rows[0],professeur,salle,date:dateFromLabel(label,ref),heureDebut:times[0]||null,heureFin:times[1]||null,annule:/annul|absent/i.test($(el).text()),libelle:label});
  });return out;
}
export function parseGrades(html: string, ref=new Date()): {evaluations:Grade[];periode:string|null;moyenneGenerale:number|null} {
  const $=load(html);const evaluations:Grade[]=[];
  $('.liste_contenu_cellule_contenu').each((i,el)=>{
    const mark=$(el).find('.note-devoir').first();if(!mark.length)return;
    const label=text(mark.text());const match=/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/.exec(label);
    const subject=text($(el).find('.titre-principal').first().text());if(!subject)return;
    const coefficient=/coef(?:ficient)?\.?\s*:?\s*(\d+(?:[.,]\d+)?)/i.exec($(el).text());
    const details=text($(el).find('.infos-supp').text());
    evaluations.push({id:id('note',i),matiere:subject,titre:details||null,date:dateFromLabel($(el).find('time').text(),ref),valeur:match?num(match[1]):/^\d+(?:[.,]\d+)?$/.test(label)?num(label):null,sur:match?num(match[2]):null,coefficient:coefficient?num(coefficient[1]):null,libelle:label});
  });
  const periodText=$('[role="combobox"],.ibe_combo').toArray().map(e=>text($(e).text())).find(t=>/trimestre|semestre|annee/i.test(normalized(t)))||null;
  const avg=/moyenne generale\s*:?\s*(\d+(?:[.,]\d+)?)/.exec(normalized($('body').text()));
  return {evaluations,periode:periodText,moyenneGenerale:avg?num(avg[1]):null};
}
function surroundingDate($:CheerioAPI,node:AnyNode,ref:Date):string|null {
  let current=$(node);
  for(let depth=0;depth<6&&current.length;depth++){
    const own=text(current.attr('data-date'));const siblings=current.prevAll('h1,h2,h3,h4,.titre-date,.titre-jour,.entete-date,.titre-semaine').first();
    const header=current.children('h1,h2,h3,h4,.titre-date,.titre-jour,.entete-date,.titre-semaine').first();
    const d=dateFromLabel(own||text(siblings.text())||text(header.text()),ref);if(d)return d;
    current=current.parent();
  }return null;
}
export function parseAssignments(html:string,base:string,ref=new Date()):Assignment[]{
  const $=load(html);const out:Assignment[]=[];
  $('.conteneur-item').each((i,el)=>{
    const matiere=text($(el).find('.titre-matiere').first().text());
    const description=text($(el).find('.description,.conteneur-descriptif .tiny-view').first().text());
    if(!matiere||!description)return;
    const checkbox=$(el).find('.cb-termine,input[type="checkbox"]').first();
    const fait=$(el).find('.est-fait,.is-checked,input[checked]').length>0?true:checkbox.length?false:null;
    const explicit=text($(el).attr('data-deadline'));const pourLe=dateFromLabel(explicit,ref)||surroundingDate($,el,ref);
    out.push({id:id('devoir',i),matiere,pourLe,description,fait,fichiers:files($,el,base)});
  });return out;
}
export function parseResources(html:string,base:string,ref=new Date()):Resource[]{
  const $=load(html);const out:Resource[]=[];
  $('.conteneur-item').each((i,el)=>{
    const matiere=text($(el).find('.titre-matiere').first().text());
    const description=text($(el).find('.description,.tiny-view').first().text());
    const titre=text($(el).find('.titre-seance,.titre-element,h4').first().text())||null;
    if(!matiere||(!description&&!titre))return;
    out.push({id:id('seance',i),matiere,date:surroundingDate($,el,ref),titre,description,fichiers:files($,el,base)});
  });return out;
}
export function parseEntries(html:string,selectors:string,prefix:string):Entry[]{
  const $=load(html);const seen=new Set<string>();const out:Entry[]=[];
  $(selectors).each((_,el)=>{const t=text($(el).text());if(!t||seen.has(t)||t.length>10000)return;seen.add(t);out.push({id:id(prefix,out.length),texte:t});});return out;
}
