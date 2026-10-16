import fs from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';

const shield=[[.5,.06],[.85,.2],[.85,.53],[.75,.77],[.5,.94],[.25,.77],[.15,.53],[.15,.2]];
const check=[[[.32,.51],[.45,.63]],[[.45,.63],[.70,.36]]];
const distance=(x,y,[ax,ay],[bx,by])=>{const t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));return Math.hypot(x-ax-t*(bx-ax),y-ay-t*(by-ay));};
function inside(x,y,points){let result=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)result=!result;}return result;}
export async function makeIcons(out){
  await fs.mkdir(out,{recursive:true});
  for(const size of [16,32,48,128]){
    const png=new PNG({width:size,height:size});
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      let r=0,g=0,b=0,a=0;
      for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
        const px=(x+(sx+.5)/4)/size,py=(y+(sy+.5)/4)/size;
        const inShield=inside(px,py,shield);
        const border=shield.some((p,i)=>distance(px,py,p,shield[(i+1)%shield.length])<.035);
        const tick=check.some(([p,q])=>distance(px,py,p,q)<.042);
        const color=tick||border?[142,224,191,255]:inShield?[15,29,25,255]:[0,0,0,0];
        r+=color[0];g+=color[1];b+=color[2];a+=color[3];
      }
      const i=(y*size+x)*4;png.data[i]=r/16;png.data[i+1]=g/16;png.data[i+2]=b/16;png.data[i+3]=a/16;
    }
    await fs.writeFile(path.join(out,`icon-${size}.png`),PNG.sync.write(png));
  }
}
