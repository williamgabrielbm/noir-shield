import {LISTS,type Settings} from './shared';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let tab:chrome.tabs.Tab|undefined;
let state:{settings:Settings;domain:string;siteAllowed:boolean;page:number|null;session:number|null;total:number|null;trackers:number|null;statsPartial:boolean}|undefined;
async function send(type:string,extra:Record<string,unknown>={}){
  const response=await chrome.runtime.sendMessage({type,...extra});if(!response?.ok)throw new Error(response?.error||'Falha de comunicação');return response.data;
}
function error(message:string){const node=$('error');node.textContent=message;node.hidden=false;setTimeout(()=>node.hidden=true,5000);}
async function render(){
  state=await send('STATUS',{tabId:tab?.id,url:tab?.url});
  const s=state!.settings;const on=s.enabled&&!state!.siteAllowed;
  $('domain').textContent=state!.domain||'Página sem domínio';
  $('page-count').textContent=state!.page===null?'—':String(state!.page);
  $('ads-count').textContent=state!.page===null?'Sem contagem':`${state!.page} nesta página`;
  $('trackers-count').textContent=state!.trackers===null?'Sem contagem':`${state!.trackers} no total*`;
  $('counter-note').textContent='* Contadores parciais: disponíveis apenas quando o navegador fornece eventos de depuração.';
  $('state-text').textContent=!s.enabled?'Proteção pausada':state!.siteAllowed?'Site permitido':'Navegação protegida';
  $('engine-state').textContent=on?'Motor DNR ativo':'Proteção pausada';
  $('power').classList.toggle('off',!s.enabled);
  $('site-toggle').classList.toggle('on',on);
  $('site-toggle').setAttribute('aria-label',on?'Pausar proteção no site':'Ativar proteção no site');
  $('youtube-state').textContent=s.youtube?'Ativo':'Desativado';
  $('filters-count').textContent=`${LISTS.filter(l=>s.lists[l.id]).length} listas ativas`;
  ($<HTMLSelectElement>('level')).value=s.level;
  $('level-note').textContent=s.level==='aggressive'?'Tenta acelerar anúncios de vídeo detectados; pode afetar alguns players.':'Bloqueia requisições e oculta elementos publicitários conhecidos.';
  $('pick').toggleAttribute('disabled',!on||!tab?.id);
  $('youtube-card').classList.toggle('off',!s.youtube);
}
async function action(task:()=>Promise<unknown>){try{await task();await render();}catch(e){error(e instanceof Error?e.message:String(e));}}
async function init(){
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  await render();
  $('power').addEventListener('click',()=>action(()=>send('SET',{patch:{enabled:!state!.settings.enabled}})));
  $('site-toggle').addEventListener('click',()=>action(()=>send('TOGGLE_SITE',{domain:state!.domain})));
  $('level').addEventListener('change',()=>action(()=>send('SET',{patch:{level:($<HTMLSelectElement>('level')).value}})));
  $('youtube-card').addEventListener('click',()=>action(()=>send('SET',{patch:{youtube:!state!.settings.youtube}})));
  for(const id of ['ads-card','trackers-card','filters-card','settings'])$(id).addEventListener('click',()=>chrome.runtime.openOptionsPage());
  $('pick').addEventListener('click',()=>action(async()=>{await send('PICK',{tabId:tab?.id});window.close();}));
}
init().catch(e=>error(e instanceof Error?e.message:String(e)));
