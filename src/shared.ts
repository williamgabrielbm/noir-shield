export const LISTS = [
  {id:'easylist', name:'EasyList', url:'https://easylist.to/easylist/easylist.txt', defaultOn:true, kind:'ads'},
  {id:'easyprivacy', name:'EasyPrivacy', url:'https://easylist.to/easylist/easyprivacy.txt', defaultOn:true, kind:'trackers'},
  {id:'adguard_base', name:'AdGuard Base', url:'https://filters.adtidy.org/extension/chromium/filters/2.txt', defaultOn:false, kind:'ads'},
  {id:'adguard_tracking', name:'AdGuard Tracking Protection', url:'https://filters.adtidy.org/extension/chromium/filters/3.txt', defaultOn:false, kind:'trackers'},
  {id:'adguard_pt', name:'AdGuard Spanish/Portuguese', url:'https://filters.adtidy.org/extension/chromium/filters/9.txt', defaultOn:true, kind:'ads'}
] as const;
export type ListId = typeof LISTS[number]['id'];
export type CustomRule = {domain:string; selector:string};
export type CustomList = {id:string; slot:number; name:string; url:string; enabled:boolean; updatedAt?:number; error?:string; ruleCount?:number};
export type Settings = {
  enabled:boolean; level:'standard'|'aggressive'; youtube:boolean; cosmetics:boolean;
  allowedSites:string[]; customRules:CustomRule[]; customNetwork:string[];
  lists:Record<ListId,boolean>; customLists:CustomList[];
  listMeta:Record<string,{updatedAt?:number; error?:string; ruleCount?:number; duplicates?:number}>;
};
export const DEFAULT_SETTINGS:Settings = {
  enabled:true,level:'standard',youtube:true,cosmetics:true,allowedSites:[],customRules:[],customNetwork:[],
  lists:{easylist:true,easyprivacy:true,adguard_base:false,adguard_tracking:false,adguard_pt:true},customLists:[],listMeta:{}
};
export function normalizeDomain(input:string):string {
  try { const url = new URL(input.includes('://')?input:`https://${input}`); return url.hostname.toLowerCase().replace(/^www\./,''); }
  catch { return ''; }
}
export function isAllowed(host:string, allowed:string[]):boolean {
  const domain=normalizeDomain(host);
  return allowed.some(item=>domain===item || domain.endsWith(`.${item}`));
}
export async function getSettings():Promise<Settings> {
  const {settings}=await chrome.storage.local.get('settings');
  if (!settings) return structuredClone(DEFAULT_SETTINGS);
  return {...structuredClone(DEFAULT_SETTINGS),...settings, lists:{...DEFAULT_SETTINGS.lists,...settings.lists},listMeta:settings.listMeta||{}};
}
export async function saveSettings(settings:Settings):Promise<void> { await chrome.storage.local.set({settings}); }
export function validSelector(selector:string):boolean {
  if (!selector || selector.length>240 || /[{};\n\r]/.test(selector) || /:(?:has|contains|matches-css|xpath|upward|remove)\b/i.test(selector)) return false;
  try { document.querySelector(selector); return true; } catch { return false; }
}
