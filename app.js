const $=s=>document.querySelector(s),video=$('video'),img=$('img'),overlay=$('canvas'),ctx=overlay.getContext('2d');
const statusEl=$('#status'),stats=$('#stats'),cam=$('#cam'),stop=$('#stop'),file=$('#file'),rate=$('#rate');
const worker=new Worker('worker.js'+(location.search.includes('gpu=1')?'?gpu':''));
let generation=0,busy=false,timer,expiry,mode='',last=0,url='',backend='';
function reset(){
 generation++;clearTimeout(timer);clearTimeout(expiry);mode='';last=0;overlay.hidden=true;stats.textContent='';
 if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop());
 video.srcObject=null;video.hidden=true;img.hidden=true;
 if(url){URL.revokeObjectURL(url);url='';}stop.disabled=true;
}
function fail(e){reset();statusEl.textContent='Erreur : '+e;}
function schedule(delay){const id=generation;clearTimeout(timer);timer=setTimeout(()=>capture(id),delay);}
async function capture(id){
 if(id!==generation||!mode)return;
 if(busy){schedule(60);return;}
 busy=true;
 try{
   const pic=await createImageBitmap(mode==='photo'?img:video);
   if(id!==generation){pic.close();busy=false;return;}
   worker.postMessage({id,pic},[pic]);
 }catch(e){busy=false;if(id===generation)fail(e);}
}
worker.onmessage=({data:d})=>{
 if(d.ready){backend=d.ready;statusEl.textContent='Prêt • '+backend;file.disabled=cam.disabled=false;return;}
 busy=false;
 if(d.id!==undefined && d.id!==generation)return;
 if(d.error){fail(d.error);return;}
 overlay.width=d.w;overlay.height=d.h;overlay.hidden=false;
 const fs=Math.max(12,Math.round(d.w*.023));ctx.font='bold '+fs+'px system-ui';ctx.lineWidth=Math.max(2,d.w/320);
 for(const b of d.boxes){
   ctx.strokeStyle='#2fff9f';ctx.strokeRect(b.x,b.y,b.X-b.x,b.Y-b.y);
   const top=Math.max(fs+3,b.y);ctx.fillStyle='#112820';ctx.fillRect(b.x,top-fs-3,ctx.measureText(b.label).width+8,fs+4);
   ctx.fillStyle='white';ctx.fillText(b.label,b.x+4,top-2);
 }
 const now=performance.now(),fps=last?(1000/(now-last)).toFixed(1):'—';last=now;
 stats.textContent=backend+' · détection '+d.msDet+' ms · classification '+d.msCnn+' ms'+(mode==='camera'?' · '+fps+' analyses/s':'');
 statusEl.textContent=d.boxes.length+' panneau(x) détecté(s).';
 if(mode==='camera'){
  clearTimeout(expiry);expiry=setTimeout(()=>overlay.hidden=true,Math.max(750,1400/Number(rate.value)));
  schedule(Math.max(0,1000/Number(rate.value)-d.msDet-d.msCnn));
 }
};
worker.onerror=e=>fail(e.message);
cam.onclick=async()=>{
 reset();const id=generation;stop.disabled=false;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:960}}});
  if(id!==generation){stream.getTracks().forEach(t=>t.stop());return;}
  video.srcObject=stream;video.hidden=false;await video.play();if(id!==generation)return;
  mode='camera';statusEl.textContent='Analyse en cours…';schedule(0);
 }catch(e){if(id===generation)fail(e);}
};
file.onchange=async()=>{
 const f=file.files[0];if(!f)return;file.value='';reset();const id=generation;
 try{url=URL.createObjectURL(f);img.src=url;await img.decode();if(id!==generation)return;
 img.hidden=false;mode='photo';stop.disabled=false;statusEl.textContent='Analyse en cours…';schedule(0);}
 catch(e){if(id===generation)fail(e);}
};
stop.onclick=()=>{reset();statusEl.textContent='Arrêté.';};
document.addEventListener('visibilitychange',()=>{if(document.hidden && mode==='camera')stop.click();});
