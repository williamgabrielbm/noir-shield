// TypeScript ES2022, file: src/youtube-lab.ts, target: Chrome/Edge Manifest V3.
export {};
type Layer='network'|'player'|'skip'|'cosmetics'|'probes';
type Lab=Record<Layer,boolean>;
type Settings={enabled:boolean;youtube:boolean;cosmetics:boolean;youtubeLab?:Partial<Lab>};
const legacy:Lab={network:true,player:true,skip:true,cosmetics:true,probes:false};
const defaults:Lab={...legacy,probes:true};
const presets:{label:string;hint:string;flags:Lab}[]=[
 {label:'Equilíbrio experimental',hint:'Mantém o bloqueio de anúncios sem cortar duas sondagens de status observadas; desativa cliques automáticos',flags:{...defaults,skip:false}},
 {label:'Preservar somente player',hint:'Desliga DNR para o YouTube, mantém sanitização de anúncios e filtros visuais',flags:{...defaults,network:false,skip:false}},
 {label:'Com pulo automático',hint:'Usa o botão nativo de pular quando ele aparece',flags:{...defaults}},
 {label:'Original sem exceções',hint:'Equivalente ao comportamento de rede do Noir Shield anterior',flags:{...legacy}},
 {label:'Isolar alteração do player',hint:'Desativa hooks para checar se a detecção está no JavaScript',flags:{...defaults,player:false,skip:false}},
 {label:'Compatibilidade total',hint:'Controle para comparar: no YouTube, anúncios podem aparecer',flags:{network:false,player:false,skip:false,cosmetics:false,probes:false}}
];
let active:Lab={...defaults},busy=false;
const status=document.getElementById('status')!;
const globalState=document.getElementById('global-state')!;
const checks=[...document.querySelectorAll<HTMLInputElement>('[data-flag]')];
function announce(msg:string,error=false){status.textContent=msg;status.classList.toggle('error',error);}
function render(){for(const x of checks){x.checked=active[x.dataset.flag as Layer];x.disabled=busy;}for(const b of document.querySelectorAll<HTMLButtonElement>('button'))b.disabled=busy;}
async function request<T>(message:object):Promise<T>{
 const response=await chrome.runtime.sendMessage(message);
 if(!response?.ok)throw new Error(response?.error||'Falha ao obter resposta do service worker');
 return response.data as T;
}
async function globalInfo(settings?:Settings){
 const s=settings||await request<Settings>({type:'SETTINGS'});
 globalState.textContent=(!s.enabled?'Proteção geral DESLIGADA. ':'')+(!s.youtube?'Módulo YouTube DESLIGADO. ':'')+(!s.cosmetics?'CSS geral DESLIGADO. ':'')||'Proteção geral, módulo YouTube e CSS global ligados.';
}
async function update(next:Lab){
 if(busy)return;
 busy=true;render();
 try{
  const s=await request<Settings>({type:'SET',patch:{youtubeLab:next}});
  active={...defaults,...s.youtubeLab};
  await globalInfo(s);
  announce('Perfil aplicado. Feche e reabra as abas do YouTube para comparar com a sessão anterior.');
 }catch(e){announce((e as Error).message,true);}finally{busy=false;render();}
}
for(const input of checks)input.addEventListener('change',()=>{const key=input.dataset.flag as Layer;void update({...active,[key]:input.checked});});
for(const preset of presets){
 const b=document.createElement('button');b.textContent=preset.label;b.title=preset.hint;
 b.addEventListener('click',()=>void update({...preset.flags}));document.getElementById('presets')!.append(b);
}
document.getElementById('restore')!.addEventListener('click',()=>void update({...defaults}));
document.getElementById('open')!.addEventListener('click',()=>{void chrome.tabs.create({url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'});});
document.getElementById('reload')!.addEventListener('click',async()=>{
 try{
  const tabs=await chrome.tabs.query({url:['*://youtube.com/*','*://*.youtube.com/*']});
  const responses=await Promise.allSettled(tabs.filter((t:{id?:number})=>typeof t.id==='number').map((t:{id?:number})=>chrome.tabs.reload(t.id!)));
  const failed=responses.filter(r=>r.status==='rejected').length;
  announce(`Atualizadas ${tabs.length-failed} aba(s); ${failed} falha(s). Para a comparação definitiva, feche e abra uma nova aba do YouTube.`,failed>0);
 }catch(e){announce((e as Error).message,true);}
});
(async()=>{
 try{
  const settings=await request<Settings>({type:'SETTINGS'});
  active={...defaults,...settings.youtubeLab};
  await globalInfo(settings);
  announce('Experimento pronto. Comece pelo perfil “Equilíbrio experimental” e abra uma aba nova do YouTube.');
 }catch(e){announce((e as Error).message,true);}render();
})();
