const CDN="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
importScripts(CDN+'ort.all.min.js');
ort.env.wasm.wasmPaths=CDN;
ort.env.wasm.numThreads=1;
let det,cnn;
async function sessions(ep){
  const d=await ort.InferenceSession.create('./detecteur.onnx',{executionProviders:[ep]});
  try { const c=await ort.InferenceSession.create('./classifieur.onnx',{executionProviders:[ep]});det=d;cnn=c; }
  catch(e){await d.release();throw e;}
}
async function init(){
  let backend='wasm';
  if(new URL(self.location.href).searchParams.has('gpu')){
    try{await sessions('webgpu');backend='webgpu';}catch(e){await sessions('wasm');}
  }else await sessions('wasm');
  postMessage({ready:backend});
}
const labels=["Triangle rouge", "Cercle rouge", "Cercle bleu", "Carr\u00e9 / rectangle bleu", "STOP"];
function rgb(canvas,chw){
  const {width:w,height:h}=canvas,n=w*h;
  const bytes=canvas.getContext('2d').getImageData(0,0,w,h).data, data=new Float32Array(3*n);
  for(let i=0;i<n;i++)for(let c=0;c<3;c++){
    if(chw)data[c*n+i]=bytes[4*i+c]/255;else data[3*i+c]=bytes[4*i+c];
  }
  return new ort.Tensor('float32',data,chw?[1,3,h,w]:[1,h,w,3]);
}
function fit(pic,box,size,bg){
  const canvas=new OffscreenCanvas(size,size),ctx=canvas.getContext('2d');
  const [x,y,w,h]=box,r=Math.min(size/w,size/h),dw=Math.max(1,Math.round(w*r)),dh=Math.max(1,Math.round(h*r));
  const dx=Math.floor((size-dw)/2),dy=Math.floor((size-dh)/2);
  ctx.fillStyle=bg;ctx.fillRect(0,0,size,size);ctx.drawImage(pic,x,y,w,h,dx,dy,dw,dh);
  return {canvas,dx,dy,sx:dw/w,sy:dh/h};
}
function iou(a,b){
 const area=p=>(p.X-p.x)*(p.Y-p.y);
 const v=Math.max(0,Math.min(a.X,b.X)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.Y,b.Y)-Math.max(a.y,b.y));
 return v/(area(a)+area(b)-v);
}
async function infer(pic){
 const w=pic.width,h=pic.height,t=performance.now(),d=fit(pic,[0,0,w,h],640,'rgb(114,114,114)');
 const out=await det.run({[det.inputNames[0]]:rgb(d.canvas,true)});
 const raw=out[det.outputNames[0]], a=raw.data,n=raw.dims[2],candidates=[];
 for(let i=0;i<n;i++){
   const score=a[4*n+i];if(score<.25)continue;
   const x=Math.max(0,Math.floor((a[i]-a[2*n+i]/2-d.dx)/d.sx)),X=Math.min(w,Math.ceil((a[i]+a[2*n+i]/2-d.dx)/d.sx));
   const y=Math.max(0,Math.floor((a[n+i]-a[3*n+i]/2-d.dy)/d.sy)),Y=Math.min(h,Math.ceil((a[n+i]+a[3*n+i]/2-d.dy)/d.sy));
   if(X>x && Y>y)candidates.push({x,y,X,Y,score});
 }
 const boxes=[];for(const b of candidates.sort((a,b)=>b.score-a.score)){
   if(boxes.every(p=>iou(p,b)<=.7))boxes.push(b);
   if(boxes.length===300)break;
 }
 const split=performance.now();
 for(const b of boxes){
   const d=fit(pic,[b.x,b.y,b.X-b.x,b.Y-b.y],64,'black');
   const out=await cnn.run({[cnn.inputNames[0]]:rgb(d.canvas,false)});
   const scores=out[cnn.outputNames[0]].data;b.label=labels[scores.indexOf(Math.max(...scores))];
 }
 return {boxes,w,h,msDet:Math.round(split-t),msCnn:Math.round(performance.now()-split)};
}
self.onmessage=async e=>{
 const {pic,id}=e.data;
 try{postMessage({id,...await infer(pic)});}catch(err){postMessage({id,error:String(err)});}finally{pic.close();}
};
init().catch(e=>postMessage({error:String(e)}));
