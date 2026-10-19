import {DEFAULT_SETTINGS,LISTS,getSettings,saveSettings,normalizeDomain,isAllowed,type Settings,type CustomList} from './shared';
import {compileList,parseNetwork,parseCosmetic} from '../scripts/compiler.mjs';

const dnr=chrome.declarativeNetRequest;
const BUILTIN_IDS=LISTS.map(x=>x.id);
const GLOBAL_PAUSE_ID=900000;
const CUSTOM_RULE_START=600000;
const SITE_RULE_START=700000;
const LIST_RULE_START=100000;
let queue=Promise.resolve<unknown>(undefined);
const serial=<T>(task:()=>Promise<T>):Promise<T>=>{const next=queue.then(task,task);queue=next.catch(()=>{});return next;};
const cosmeticCache=new Map<string,{global:string[];domains:Record<string,string[]>;exceptions:Record<string,string[]>}>();
const listRange=(index:number)=>LIST_RULE_START+index*5000;
async function refreshTabs(){
  const tabs=await chrome.tabs.query({url:['http://*/*','https://*/*']});
  await Promise.allSettled(tabs.filter(t=>t.id).map(t=>chrome.tabs.sendMessage(t.id!,{type:'REFRESH'})));
}
function cosmeticIndex(entries:{domains:string[];selector:string;exception:boolean}[]){
  const data:{global:string[];domains:Record<string,string[]>;exceptions:Record<string,string[]>}={global:[],domains:{},exceptions:{}};
  for(const item of entries)for(const domain of item.domains){
    if(item.exception)(data.exceptions[domain]??=[]).push(item.selector);
    else if(domain==='*')data.global.push(item.selector);
    else(data.domains[domain]??=[]).push(item.selector);
  }
  return data;
}

async function replaceRange(start:number,count:number,rules:chrome.declarativeNetRequest.Rule[]){
  const existing=await dnr.getDynamicRules();
  const removeRuleIds=existing.filter(r=>r.id>=start&&r.id<start+count).map(r=>r.id);
  await dnr.updateDynamicRules({removeRuleIds,addRules:rules});
}
async function fetchList(url:string):Promise<string>{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:')throw new Error('A lista precisa usar HTTPS.');
  const res=await fetch(parsed.href,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const text=await res.text();
  if(text.length<10||text.length>20_000_000)throw new Error('Tamanho de lista inválido (máximo 20 MB).');
  return text;
}
async function updateList(settings:Settings,id:string):Promise<Settings>{
  const builtin=LISTS.find(x=>x.id===id);
  const custom=settings.customLists.find(x=>x.id===id);
  if(!builtin&&!custom)throw new Error('Lista desconhecida.');
  const index=builtin?LISTS.findIndex(x=>x.id===id):LISTS.length+custom!.slot;
  if(index>=15)throw new Error('Limite de 10 listas personalizadas.');
  const range=listRange(index);
  try{
    const text=await fetchList((builtin||custom)!.url);
    const compiled=compileList(text,{maxRules:builtin?3500:1000,maxCosmetics:1500});
    if(compiled.rules.length===0)throw new Error('Nenhuma regra de rede compatível foi encontrada.');
    const rules=compiled.rules.map((r,i)=>({...r,id:range+i}) as chrome.declarativeNetRequest.Rule);
    await replaceRange(range,5000,rules);
    await chrome.storage.local.set({[`cosmetic_${id}`]:cosmeticIndex(compiled.cosmetic)});
    settings.listMeta[id]={updatedAt:Date.now(),ruleCount:rules.length,duplicates:compiled.stats.duplicates};
    if(custom){custom.updatedAt=Date.now();custom.ruleCount=rules.length;custom.error=undefined;}
    cosmeticCache.delete(id);
    await saveSettings(settings);
    await syncRules(settings);
    await refreshTabs();
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    settings.listMeta[id]={...settings.listMeta[id],error:message};
    if(custom)custom.error=message;
    await saveSettings(settings);
    throw error;
  }
  return settings;
}
async function syncRules(settings:Settings){
  const enabledStatic:string[]=BUILTIN_IDS.filter(id=>settings.lists[id] && !settings.listMeta[id]?.updatedAt);
  if(settings.youtube)enabledStatic.push('youtube');
  const current=await dnr.getEnabledRulesets();
  await dnr.updateEnabledRulesets({enableRulesetIds:enabledStatic.filter(id=>!current.includes(id)),disableRulesetIds:current.filter(id=>!enabledStatic.includes(id))});
  const currentDynamic=await dnr.getDynamicRules();
  const removeRuleIds=currentDynamic.filter(rule=>{
    if(rule.id>=LIST_RULE_START&&rule.id<CUSTOM_RULE_START){
      const idx=Math.floor((rule.id-LIST_RULE_START)/5000);
      const custom=idx<LISTS.length?undefined:settings.customLists.find(l=>l.slot===idx-LISTS.length);
      const id=idx<LISTS.length?LISTS[idx].id:custom?.id;
      return !id || (idx<LISTS.length?(!settings.lists[id as keyof Settings['lists']]||!settings.listMeta[id]?.updatedAt):!custom?.enabled);
    }
    return rule.id>=CUSTOM_RULE_START;
  }).map(rule=>rule.id);
  const addRules:chrome.declarativeNetRequest.Rule[]=[];
  if(!settings.enabled)addRules.push({id:GLOBAL_PAUSE_ID,priority:100000,action:{type:dnr.RuleActionType.ALLOW},condition:{urlFilter:'|http'}});
  settings.allowedSites.slice(0,100).forEach((domain,i)=>{
    addRules.push({id:SITE_RULE_START+i*2,priority:50000,action:{type:dnr.RuleActionType.ALLOW_ALL_REQUESTS},condition:{urlFilter:`||${domain}^`,resourceTypes:[dnr.ResourceType.MAIN_FRAME,dnr.ResourceType.SUB_FRAME]}});
    addRules.push({id:SITE_RULE_START+i*2+1,priority:50000,action:{type:dnr.RuleActionType.ALLOW},condition:{initiatorDomains:[domain]}});
  });
  settings.customNetwork.slice(0,500).forEach((line,i)=>{
    const parsed=parseNetwork(line);
    if(parsed)addRules.push({...parsed,id:CUSTOM_RULE_START+i,priority:parsed.action.type==='allow'?40000:200} as chrome.declarativeNetRequest.Rule);
  });
  await dnr.updateDynamicRules({removeRuleIds,addRules});
}
async function cosmeticsFor(host:string,settings:Settings){
  if(!settings.enabled||!settings.cosmetics||isAllowed(host,settings.allowedSites))return [];
  const domain=normalizeDomain(host);
  const domains:string[]=[];let part=domain;
  while(part.includes('.')){domains.push(part);part=part.slice(part.indexOf('.')+1);}
  const selectors=new Set<string>();const exceptions=new Set<string>();
  for(const list of [...LISTS.filter(l=>settings.lists[l.id]),...settings.customLists.filter(l=>l.enabled)]){
    let data=cosmeticCache.get(list.id);
    if(!data){
      try{
        if(settings.listMeta[list.id]?.updatedAt||list.id.startsWith('custom_'))data=(await chrome.storage.local.get(`cosmetic_${list.id}`))[`cosmetic_${list.id}`];
        else data=await (await fetch(chrome.runtime.getURL(`rules/${list.id}-cosmetic.json`))).json();
        if(!data)continue;cosmeticCache.set(list.id,data);
      }catch{continue;}
    }
    for(const selector of data!.global)selectors.add(selector);
    for(const d of domains){for(const selector of data!.domains[d]||[])selectors.add(selector);for(const selector of data!.exceptions[d]||[])exceptions.add(selector);}
    for(const selector of data!.exceptions['*']||[])exceptions.add(selector);
  }
  for(const selector of exceptions)selectors.delete(selector);
  for(const rule of settings.customRules)if(domains.includes(rule.domain))selectors.add(rule.selector);
  return [...selectors].slice(0,5000);
}
async function status(tabId?:number,url?:string){
  const settings=await getSettings();const domain=normalizeDomain(url||'');
  const {counts={},sessionTotal=0,debugSeen=false}=await chrome.storage.session.get(['counts','sessionTotal','debugSeen']);
  const {total=0,trackers=0}=await chrome.storage.local.get(['total','trackers']);
  const page=tabId===undefined?undefined:counts[tabId];
  let pageCount:number|null=null;
  if(tabId!==undefined&&page?.startedAt){
    try{
      if(!allowIdCache)allowIdCache=await (await fetch(chrome.runtime.getURL('rules/allow-ids.json'))).json();
      const matched=await dnr.getMatchedRules({tabId,minTimeStamp:page.startedAt});
      const dynamic=await dnr.getDynamicRules();const actions=new Map(dynamic.map(r=>[r.id,r.action.type]));
      pageCount=matched.rulesMatchedInfo.filter(x=>x.rule.rulesetId==='_dynamic'?actions.get(x.rule.ruleId)===dnr.RuleActionType.BLOCK:!(allowIdCache?.[x.rule.rulesetId]||[]).includes(x.rule.ruleId)).length;
    }catch{pageCount=null;}
  }
  return {settings,domain,siteAllowed:isAllowed(domain,settings.allowedSites),page:pageCount,session:debugSeen?sessionTotal:null,total:debugSeen?total:null,trackers:debugSeen?trackers:null,statsPartial:true,version:chrome.runtime.getManifest().version};
}
async function handle(message:any,sender:chrome.runtime.MessageSender){
  const settings=await getSettings();
  switch(message?.type){
    case 'STATUS': return status(message.tabId,message.url);
    case 'COSMETICS': return {selectors:await cosmeticsFor(message.host,settings),enabled:settings.enabled&&!isAllowed(message.host,settings.allowedSites),youtube:settings.youtube,cosmetics:settings.cosmetics,youtubeDebug:settings.youtubeDebug===true,aggressive:settings.level==='aggressive'};
    case 'SETTINGS': return settings;
    case 'SET':{
      const next={...settings,...message.patch};
      if(message.patch?.customNetwork){
        if(!Array.isArray(next.customNetwork)||next.customNetwork.length>500||next.customNetwork.some((line:unknown)=>typeof line!=='string'||!parseNetwork(line)))throw new Error('Regra de rede inválida ou limite de 500 regras atingido.');
      }
      await saveSettings(next);await syncRules(next);
      if(message.patch?.enabled===false)await chrome.tabs.query({}).then(tabs=>Promise.allSettled(tabs.filter(t=>t.id).map(t=>chrome.action.setBadgeText({tabId:t.id!,text:''}))));
      await refreshTabs();
      return next;
    }
    case 'TOGGLE_SITE':{
      const domain=normalizeDomain(message.domain);if(!domain)throw new Error('Domínio inválido.');
      const existing=settings.allowedSites.find(d=>domain===d||domain.endsWith(`.${d}`));
      if(!existing&&settings.allowedSites.length>=100)throw new Error('Limite de 100 sites permitidos.');
      settings.allowedSites=existing?settings.allowedSites.filter(d=>d!==existing):[...settings.allowedSites,domain];
      await saveSettings(settings);await syncRules(settings);
      await refreshTabs();
      return settings;
    }
    case 'TOGGLE_LIST':{
      const id=message.id as keyof Settings['lists'];if(!BUILTIN_IDS.includes(id))throw new Error('Lista inválida.');
      settings.lists[id]=!settings.lists[id];await saveSettings(settings);
      if(settings.lists[id]&&settings.listMeta[id]?.updatedAt){await updateList(settings,id);}else {await syncRules(settings);await refreshTabs();}
      return settings;
    }
    case 'UPDATE_LIST':return updateList(settings,String(message.id));
    case 'ADD_CUSTOM_LIST':{
      const url=new URL(String(message.url));if(url.protocol!=='https:')throw new Error('Use uma URL HTTPS.');
      if(settings.customLists.length>=10)throw new Error('Limite de 10 listas personalizadas.');
      const used=new Set(settings.customLists.map(l=>l.slot));let slot=0;while(used.has(slot))slot++;
      const item:CustomList={id:`custom_${Date.now()}`,slot,name:url.hostname,url:url.href,enabled:true};
      settings.customLists.push(item);await saveSettings(settings);await updateList(settings,item.id);return settings;
    }
    case 'TOGGLE_CUSTOM_LIST':{
      const item=settings.customLists.find(l=>l.id===message.id);if(!item)throw new Error('Lista não encontrada.');
      item.enabled=!item.enabled;await saveSettings(settings);
      if(item.enabled)await updateList(settings,item.id);else {await syncRules(settings);await refreshTabs();}
      return settings;
    }
    case 'REMOVE_CUSTOM_LIST':{
      const i=settings.customLists.findIndex(l=>l.id===message.id);if(i<0)throw new Error('Lista não encontrada.');
      await replaceRange(listRange(LISTS.length+settings.customLists[i].slot),5000,[]);
      await chrome.storage.local.remove(`cosmetic_${settings.customLists[i].id}`);
      cosmeticCache.delete(settings.customLists[i].id);
      settings.customLists.splice(i,1);await saveSettings(settings);await syncRules(settings);await refreshTabs();return settings;
    }
    case 'CUSTOM_RULE':{
      const domain=normalizeDomain(message.domain),selector=String(message.selector||'');
      if(!domain||!parseCosmetic(`${domain}##${selector}`))throw new Error('Regra inválida.');
      if(settings.customRules.length>=500)throw new Error('Limite de 500 regras cosméticas.');
      if(!settings.customRules.some(x=>x.domain===domain&&x.selector===selector))settings.customRules.push({domain,selector});
      await saveSettings(settings);await refreshTabs();return settings;
    }
    case 'PICK':{
      if(!sender.tab?.id && !message.tabId)throw new Error('Aba indisponível.');
      await chrome.tabs.sendMessage(message.tabId||sender.tab!.id!,{type:'START_PICK'});return {ok:true};
    }
    case 'RESET_STATS':{
      await chrome.storage.local.set({total:0,trackers:0});await chrome.storage.session.set({counts:{},sessionTotal:0});
      const tabs=await chrome.tabs.query({});await Promise.allSettled(tabs.filter(t=>t.id).map(t=>chrome.action.setBadgeText({tabId:t.id!,text:''})));
      return {ok:true};
    }
    case 'IMPORT':{
      const imported=message.settings;
      if(!imported||typeof imported!=='object')throw new Error('Configuração inválida.');
      const next:Settings={...DEFAULT_SETTINGS,enabled:imported.enabled!==false,level:imported.level==='aggressive'?'aggressive':'standard',youtube:imported.youtube!==false,cosmetics:imported.cosmetics!==false,
        youtubeDebug:imported.youtubeDebug===true,allowedSites:Array.isArray(imported.allowedSites)?imported.allowedSites.map(normalizeDomain).filter(Boolean).slice(0,100):[],
        customRules:Array.isArray(imported.customRules)?imported.customRules.filter((r:any)=>normalizeDomain(r.domain)&&typeof r.selector==='string'&&parseCosmetic(`${normalizeDomain(r.domain)}##${r.selector}`)).slice(0,500):[],
        customNetwork:Array.isArray(imported.customNetwork)?imported.customNetwork.filter((r:any)=>typeof r==='string'&&parseNetwork(r)).slice(0,500):[],
        lists:{...DEFAULT_SETTINGS.lists,...imported.lists},customLists:[],listMeta:{}};
      await saveSettings(next);await syncRules(next);await refreshTabs();return next;
    }
    default:throw new Error('Comando desconhecido.');
  }
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  serial(()=>handle(message,sender)).then(data=>sendResponse({ok:true,data})).catch(error=>sendResponse({ok:false,error:error instanceof Error?error.message:String(error)}));
  return true;
});
chrome.runtime.onInstalled.addListener(()=>{serial(async()=>{await syncRules(await getSettings());await chrome.alarms.create('lists',{periodInMinutes:24*60});await chrome.contextMenus.create({id:'pick',title:'Bloquear elemento com Noir Shield',contexts:['page','image','link']});}).catch(console.error);});
chrome.runtime.onStartup.addListener(()=>{serial(async()=>{await syncRules(await getSettings());await chrome.alarms.create('lists',{periodInMinutes:24*60});}).catch(console.error);});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='lists')serial(async()=>{const s=await getSettings();for(const list of LISTS)if(s.lists[list.id])try{await updateList(s,list.id);}catch(e){console.warn('List update failed',list.id,e);}}).catch(console.error);});
chrome.contextMenus.onClicked.addListener((info,tab)=>{if(info.menuItemId==='pick'&&tab?.id)chrome.tabs.sendMessage(tab.id,{type:'START_PICK'}).catch(()=>{});});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading'){const startedAt=Date.now();chrome.action.setBadgeText({tabId,text:''}).catch(()=>{});chrome.storage.session.get('counts').then(({counts={}})=>{counts[tabId]={count:0,trackers:0,startedAt};return chrome.storage.session.set({counts});}).catch(()=>{});}});
chrome.tabs.onRemoved.addListener(tabId=>{chrome.storage.session.get('counts').then(({counts={}})=>{delete counts[tabId];return chrome.storage.session.set({counts});}).catch(()=>{});});
let allowIdCache:Record<string,number[]>|undefined;
if(dnr.onRuleMatchedDebug && chrome.runtime.getManifest().permissions?.includes('declarativeNetRequestFeedback')){
  dnr.onRuleMatchedDebug.addListener(info=>{
    if(info.request.tabId<0)return;
    const tabId=info.request.tabId;
    serial(async()=>{
      if(!allowIdCache)allowIdCache=await (await fetch(chrome.runtime.getURL('rules/allow-ids.json'))).json();
      const matched=info.rule;
      if(matched.rulesetId==='_dynamic'){
        const rule=(await dnr.getDynamicRules()).find(r=>r.id===matched.ruleId);
        if(!rule||rule.action.type!==dnr.RuleActionType.BLOCK)return;
      }else if((allowIdCache?.[matched.rulesetId]||[]).includes(matched.ruleId))return;
      const {counts={}}=await chrome.storage.session.get('counts');
      const c=counts[tabId]||{count:0,trackers:0};c.count++;
      const tracker=info.rule.rulesetId==='easyprivacy'||info.rule.rulesetId==='adguard_tracking';
      if(tracker)c.trackers++;
      counts[tabId]=c;const {sessionTotal=0}=await chrome.storage.session.get('sessionTotal');await chrome.storage.session.set({counts,sessionTotal:sessionTotal+1,debugSeen:true});
      const stored=await chrome.storage.local.get(['total','trackers']);
      await chrome.storage.local.set({total:(stored.total||0)+1,trackers:(stored.trackers||0)+(tracker?1:0)});
      await chrome.action.setBadgeText({tabId,text:String(c.count)});
      await chrome.action.setBadgeBackgroundColor({tabId,color:'#5DC9A5'});
    }).catch(()=>{});
  });
}
