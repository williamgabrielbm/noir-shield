// Conservative ABP subset. No procedural filters, regex or remote JavaScript.
export const TYPE_MAP={script:'script',image:'image',stylesheet:'stylesheet',xmlhttprequest:'xmlhttprequest',subdocument:'sub_frame',font:'font',media:'media',ping:'ping',websocket:'websocket',other:'other'};
export function parseNetwork(line){
  let allow=false; if(line.startsWith('@@')){allow=true;line=line.slice(2)}
  if(!line.startsWith('||') || line.includes('##') || line.includes('#@#')) return null;
  const [pattern,optText='']=line.split('$',2);
  if(!/^\|\|[a-z\d.-]+(?:\^|\/|\|)/i.test(pattern) || pattern.length>512) return null;
  const domain=pattern.slice(2).split(/[\^/|]/)[0];
  if(!domain.includes('.') || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return null;
  const condition={urlFilter:pattern}; const types=[]; let included=[];let excluded=[];
  for(const option of optText.split(',').filter(Boolean)){
    if(option==='third-party') condition.domainType='thirdParty';
    else if(option==='~third-party') condition.domainType='firstParty';
    else if(TYPE_MAP[option]) types.push(TYPE_MAP[option]);
    else if(option.startsWith('domain=')){
      for(const d of option.slice(7).split('|')){
        if(!/^~?[a-z\d.-]+$/i.test(d)) return null;
        (d.startsWith('~')?excluded:included).push(d.replace(/^~/,''));
      }
    } else return null;
  }
  if(types.length) condition.resourceTypes=[...new Set(types)];
  if(included.length) condition.initiatorDomains=[...new Set(included)];
  if(excluded.length) condition.excludedInitiatorDomains=[...new Set(excluded)];
  return {priority:allow?2:1,action:{type:allow?'allow':'block'},condition};
}
export function parseCosmetic(line){
  const match=line.match(/^([a-z\d.,-]*)(##|#@#)(.+)$/i); if(!match) return null;
  const [,domains,marker,selector]=match;
  if(!selector || selector.length>240 || /[{};\r\n]/.test(selector) || /:(?:has|contains|matches-css|xpath|upward|remove)\b/i.test(selector)) return null;
  if(!/^[a-z\d .#\[\]="'_*^$|>+~():,-]+$/i.test(selector)) return null;
  const domainList=domains?domains.split(','):['*'];
  if(domainList.some(d=>d!=='*' && !/^[a-z\d.-]+$/i.test(d))) return null;
  return {domains:domainList,selector,exception:marker==='#@#'};
}
export function compileList(text,{maxRules=4500,maxCosmetics=3000,seen=new Set()}={}){
  const rules=[],cosmetic=[],stats={networkSkipped:0,cosmeticSkipped:0,duplicates:0};
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line || line.startsWith('!') || line.startsWith('[')) continue;
    if(line.includes('##') || line.includes('#@#')){
      if(cosmetic.length>=maxCosmetics) continue;
      const c=parseCosmetic(line);if(c)cosmetic.push(c);else stats.cosmeticSkipped++;
      continue;
    }
    const r=parseNetwork(line);if(!r){stats.networkSkipped++;continue;}
    const key=JSON.stringify(r);if(seen.has(key)){stats.duplicates++;continue;}seen.add(key);
    rules.push(r);
  }
  const score=r=>{
    const url=r.condition.urlFilter;
    if(r.action.type==='allow')return 100;
    if(/doubleclick|googlesyndication|googleadservices|adnxs|taboola|outbrain|amazon-adsystem|criteo|pubmatic|rubiconproject|scorecardresearch|youtube\.com\/pagead/i.test(url))return 90;
    if(/adserver|adsystem|advertis|tracker|tracking|analytics|pixel/i.test(url))return 15;
    return 0;
  };
  const hash=r=>{let n=2166136261;for(const c of r.condition.urlFilter){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};
  const selected=rules.sort((a,b)=>score(b)-score(a)||hash(a)-hash(b)).slice(0,maxRules);
  selected.forEach((r,i)=>r.id=i+1);
  return {rules:selected,cosmetic,stats};
}
