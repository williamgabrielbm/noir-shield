import {YoutubeEngine,YOUTUBE_SELECTORS} from './youtube/engine';
import {getSettings,isAllowed,normalizeDomain,validSelector} from './shared';

const domain=normalizeDomain(location.hostname);
const STYLE_ID='noir-shield-cosmetic';
const YT_STYLE_ID='noir-shield-youtube';
const youtubeEngine = new YoutubeEngine(()=>{removeStyle(STYLE_ID);removeStyle(YT_STYLE_ID);stopPicker();});
let protectedPage=false;
let refreshVersion=0;
let configVersion=0;
async function earlyYoutubeConfig(){
  const version=++configVersion;
  try{
    const settings=await getSettings();
    if(version!==configVersion)return;
    youtubeEngine.configure(settings.enabled&&settings.youtube&&!isAllowed(domain,settings.allowedSites)&&/(^|\.)youtube\.com$/.test(domain),settings.level==='aggressive',settings.youtubeDebug===true);
  }catch{youtubeEngine.stop();}
}

function style(id:string,text:string){
  let node=document.getElementById(id) as HTMLStyleElement|null;
  if(!node){node=document.createElement('style');node.id=id;(document.head||document.documentElement).append(node);}
  node.textContent=text;
}
function removeStyle(id:string){document.getElementById(id)?.remove();}
async function refresh(){
  const version=++refreshVersion;
  try{
    const response=await chrome.runtime.sendMessage({type:'COSMETICS',host:domain});
    if(version!==refreshVersion)return;
    if(!response?.ok)throw new Error(response?.error||'Sem resposta');
    const data=response.data as {selectors:string[];enabled:boolean;youtube:boolean;aggressive:boolean;cosmetics:boolean;youtubeDebug:boolean};
    protectedPage=data.enabled;
    const youtubeEnabled=data.enabled&&data.youtube&&/(^|\.)youtube\.com$/.test(domain);

    const safe=data.selectors.filter(validSelector);
    if(protectedPage&&safe.length){
      const chunks:string[]=[];
      for(let i=0;i<safe.length;i+=100)chunks.push(`${safe.slice(i,i+100).join(',')} { display: none !important; }`);
      style(STYLE_ID,chunks.join('\n'));
    }else removeStyle(STYLE_ID);
    youtubeEngine.configure(youtubeEnabled,data.aggressive,data.youtubeDebug);
    if(youtubeEnabled&&data.cosmetics)style(YT_STYLE_ID,`${YOUTUBE_SELECTORS.join(',')} { display:none !important; }`);
    else removeStyle(YT_STYLE_ID);
  }catch{if(version!==refreshVersion)return;removeStyle(STYLE_ID);removeStyle(YT_STYLE_ID);youtubeEngine.stop();}
}
let picker:{overlay:HTMLDivElement;toolbar:HTMLDivElement;target:Element|null;move:(e:MouseEvent)=>void;click:(e:MouseEvent)=>void;key:(e:KeyboardEvent)=>void}|undefined;
function selectorFor(element:Element):string{
  const segments:string[]=[];let current:Element|null=element;
  for(let depth=0;current&&depth<5;depth++,current=current.parentElement){
    let segment=current.localName;
    const id=current.id;
    if(id&&!/\d{5,}|[a-f\d]{8,}/i.test(id)){
      segment=`#${CSS.escape(id)}`;segments.unshift(segment);break;
    }
    const classes=[...current.classList].filter(c=>/^[a-z][a-z\d_-]{2,40}$/i.test(c)&&!/(active|selected|hover|focus|open|visible)/i.test(c)).slice(0,2);
    if(classes.length)segment+=classes.map(c=>`.${CSS.escape(c)}`).join('');
    const siblings=current.parentElement?[...current.parentElement.children].filter(x=>x.localName===current!.localName):[];
    if(siblings.length>1)segment+=`:nth-of-type(${siblings.indexOf(current)+1})`;
    segments.unshift(segment);
    const result=segments.join(' > ');
    try{if(document.querySelectorAll(result).length===1)break;}catch{}
  }
  return segments.join(' > ');
}
function highlight(target:Element|null){
  if(!picker)return;picker.target=target;
  if(!target){picker.overlay.style.display='none';return;}
  const box=target.getBoundingClientRect();
  Object.assign(picker.overlay.style,{display:'block',left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
}
function stopPicker(){
  if(!picker)return;
  document.removeEventListener('mousemove',picker.move,true);
  document.removeEventListener('click',picker.click,true);
  document.removeEventListener('keydown',picker.key,true);
  picker.overlay.remove();picker.toolbar.remove();picker=undefined;
}
function startPicker(){
  if(picker||!protectedPage)return;
  const overlay=document.createElement('div');
  Object.assign(overlay.style,{position:'fixed',zIndex:'2147483646',pointerEvents:'none',boxSizing:'border-box',border:'2px solid #78e2bf',background:'rgba(58,211,160,.20)',borderRadius:'4px'});
  const toolbar=document.createElement('div');
  toolbar.setAttribute('role','dialog');toolbar.setAttribute('aria-label','Bloquear elemento');
  Object.assign(toolbar.style,{position:'fixed',zIndex:'2147483647',left:'50%',top:'16px',transform:'translateX(-50%)',background:'rgba(13,16,17,.96)',color:'#f5f7f5',padding:'12px 16px',border:'1px solid #55645c',borderRadius:'14px',font:'13px system-ui',boxShadow:'0 12px 40px #0008',display:'flex',alignItems:'center',gap:'12px'});
  const label=document.createElement('span');label.textContent='Clique no elemento desejado';
  const save=document.createElement('button');save.textContent='Bloquear';save.disabled=true;
  const cancel=document.createElement('button');cancel.textContent='Cancelar';
  for(const button of [save,cancel])Object.assign(button.style,{background:'#26302c',border:'1px solid #55645c',borderRadius:'8px',padding:'7px 10px',color:'#fff',cursor:'pointer'});
  toolbar.append(label,save,cancel);document.documentElement.append(overlay,toolbar);
  const move=(event:MouseEvent)=>{const target=document.elementFromPoint(event.clientX,event.clientY);if(target&&!toolbar.contains(target)&&target!==overlay)highlight(target);};
  const click=(event:MouseEvent)=>{if(toolbar.contains(event.target as Node))return;event.preventDefault();event.stopImmediatePropagation();highlight(document.elementFromPoint(event.clientX,event.clientY));save.disabled=false;label.textContent='Confirme o bloqueio';};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')stopPicker();};
  picker={overlay,toolbar,target:null,move,click,key};
  document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
  cancel.addEventListener('click',stopPicker);
  save.addEventListener('click',async()=>{
    const target=picker?.target;if(!target)return;
    const selector=selectorFor(target);
    if(!validSelector(selector)){label.textContent='Não foi possível criar uma regra segura';return;}
    try{const response=await chrome.runtime.sendMessage({type:'CUSTOM_RULE',domain,selector});if(!response.ok)throw new Error(response.error);stopPicker();await refresh();}
    catch(error){label.textContent=error instanceof Error?error.message:'Erro ao salvar';}
  });
}
chrome.runtime.onMessage.addListener(message=>{if(message?.type==='REFRESH')refresh();if(message?.type==='START_PICK')startPicker();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.settings){earlyYoutubeConfig();refresh();}});
earlyYoutubeConfig();
refresh();
