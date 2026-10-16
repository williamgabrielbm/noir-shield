import {LISTS,normalizeDomain,validSelector,type Settings} from './shared';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let settings:Settings;
let packagedAt:string|undefined;
async function send(type:string,extra:Record<string,unknown>={}){const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw new Error(r?.error||'Erro');return r.data;}
function message(text:string){const n=$('message');n.textContent=text;n.hidden=false;setTimeout(()=>n.hidden=true,5000);}
function button(text:string,fn:()=>void,kind='btn small'){const b=document.createElement('button');b.type='button';b.className=kind;b.textContent=text;b.addEventListener('click',fn);return b;}
function row(title:string,description:string,actions:HTMLElement[]=[]){const line=document.createElement('div');line.className='list-row';const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;const small=document.createElement('small');small.textContent=description;left.append(strong,small);line.append(left,...actions);return line;}
async function perform(task:()=>Promise<unknown>){try{await task();await render();message('Alteração salva.');}catch(e){message(e instanceof Error?e.message:String(e));}}
async function render(){
  settings=await send('SETTINGS');
  for(const name of ['enabled','cosmetics','youtube'])($<HTMLInputElement>(name)).checked=settings[name as 'enabled'|'cosmetics'|'youtube'];
  ($<HTMLSelectElement>('level')).value=settings.level;
  $('version').textContent=`Versão ${chrome.runtime.getManifest().version}`;
  $('builtin-lists').replaceChildren(...LISTS.map(list=>{
    const meta=settings.listMeta[list.id];const checked=document.createElement('input');checked.type='checkbox';checked.checked=settings.lists[list.id];checked.setAttribute('aria-label',`Ativar ${list.name}`);
    checked.addEventListener('change',()=>perform(()=>send('TOGGLE_LIST',{id:list.id})));
    const update=button('Atualizar',()=>perform(()=>send('UPDATE_LIST',{id:list.id})));
    const detail=meta?.error?`Falha: ${meta.error}`:meta?.updatedAt?`${meta.ruleCount||0} regras · ${new Date(meta.updatedAt).toLocaleString('pt-BR')}`:packagedAt?`Pacote de ${new Date(packagedAt).toLocaleString('pt-BR')}`:'Versão incluída no pacote';
    return row(list.name,detail,[checked,update]);
  }));
  $('custom-lists').replaceChildren(...settings.customLists.map(list=>{
    const checked=document.createElement('input');checked.type='checkbox';checked.checked=list.enabled;checked.setAttribute('aria-label',`Ativar ${list.name}`);checked.addEventListener('change',()=>perform(()=>send('TOGGLE_CUSTOM_LIST',{id:list.id})));
    const update=button('Atualizar',()=>perform(()=>send('UPDATE_LIST',{id:list.id})));
    const remove=button('Excluir',()=>perform(()=>send('REMOVE_CUSTOM_LIST',{id:list.id})),'btn small danger');
    return row(list.name,list.error?`Falha: ${list.error}`:`${list.ruleCount||0} regras · ${list.url}`,[checked,update,remove]);
  }));
  $('site-list').replaceChildren(...settings.allowedSites.map(domain=>row(domain,'Bloqueio pausado para este domínio',[button('Remover',()=>perform(()=>send('TOGGLE_SITE',{domain})),'btn small danger')])));
  $('cosmetic-rules').replaceChildren(...settings.customRules.map((rule,index)=>row(rule.domain,rule.selector,[button('Desfazer',()=>perform(()=>send('SET',{patch:{customRules:settings.customRules.filter((_,i)=>i!==index)}})),'btn small danger')])));
  $('network-rules').replaceChildren(...settings.customNetwork.map((rule,index)=>row(rule,'Regra de rede personalizada',[button('Excluir',()=>perform(()=>send('SET',{patch:{customNetwork:settings.customNetwork.filter((_,i)=>i!==index)}})),'btn small danger')])));
  const s=await send('STATUS');
  $('stats-text').textContent=s.total===null?'Total acumulado indisponível neste navegador.':`${s.total} bloqueios registrados no total; ${s.trackers} identificados como rastreadores. Dados parciais.`;
  $('diagnostics').textContent=`Motor: declarativeNetRequest · ${LISTS.filter(l=>settings.lists[l.id]).length} listas incluídas ativas · ${settings.customRules.length} regras cosméticas pessoais · ${settings.customNetwork.length} regras de rede pessoais.`;
}
async function init(){
  try{packagedAt=(await (await fetch(chrome.runtime.getURL('rules/metadata.json'))).json()).builtAt;}catch{}
  await render();
  for(const name of ['enabled','cosmetics','youtube'])$(name).addEventListener('change',()=>perform(()=>send('SET',{patch:{[name]:($<HTMLInputElement>(name)).checked}})));
  $('level').addEventListener('change',()=>perform(()=>send('SET',{patch:{level:($<HTMLSelectElement>('level')).value}})));
  $('add-list').addEventListener('click',()=>perform(async()=>{await send('ADD_CUSTOM_LIST',{url:($<HTMLInputElement>('custom-list-url')).value});($<HTMLInputElement>('custom-list-url')).value='';}));
  $('add-site').addEventListener('click',()=>perform(async()=>{const domain=normalizeDomain(($<HTMLInputElement>('site-input')).value);if(!domain)throw new Error('Domínio inválido.');if(!settings.allowedSites.includes(domain))await send('TOGGLE_SITE',{domain});($<HTMLInputElement>('site-input')).value='';}));
  $('add-rule').addEventListener('click',()=>perform(async()=>{const domain=normalizeDomain(($<HTMLInputElement>('rule-domain')).value),selector=($<HTMLInputElement>('rule-selector')).value.trim();if(!domain||!validSelector(selector))throw new Error('Domínio ou seletor CSS inválido.');await send('CUSTOM_RULE',{domain,selector});($<HTMLInputElement>('rule-selector')).value='';}));
  $('add-network').addEventListener('click',()=>perform(async()=>{const rule=($<HTMLInputElement>('network-rule')).value.trim();if(!/^@@?\|\||^\|\|/.test(rule))throw new Error('Use uma regra iniciada por || ou @@||.');await send('SET',{patch:{customNetwork:[...settings.customNetwork,rule]}});($<HTMLInputElement>('network-rule')).value='';}));
  $('reset-stats').addEventListener('click',()=>perform(()=>send('RESET_STATS')));
  $('export').addEventListener('click',async()=>{const current=await send('SETTINGS');const data=JSON.stringify({format:'noir-shield-settings-v1',settings:current},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='noir-shield-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('import-file').addEventListener('change',()=>perform(async()=>{const file=($<HTMLInputElement>('import-file')).files?.[0];if(!file)throw new Error('Selecione um arquivo.');if(file.size>1_000_000)throw new Error('Arquivo muito grande.');const data=JSON.parse(await file.text());if(data.format!=='noir-shield-settings-v1')throw new Error('Formato inválido.');await send('IMPORT',{settings:data.settings});}));
}
init().catch(e=>message(e instanceof Error?e.message:String(e)));
