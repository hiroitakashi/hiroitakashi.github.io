/* 小説の読書画面（本のようにページをめくる）
   - PDF を PDF.js（lib/pdfjs/）で1ページずつ描き、紙がめくれる動きをキャンバスに描く
   - 縦書き・右綴じの本なので、左から右へスワイプ（または左側をタップ・← キー）で次のページへ
   - 紙は真っ白ではなくアイボリー（PAPER）。PDF の白い地をこの色に置きかえる
   - 読みかけのページはブラウザに覚えておき、次に開いたときそこから
   - 横書きの本（opt.yoko）は左綴じなので向きが逆：右から左へスワイプで次へ（画面全体を左右反転して描き、ページの絵だけ戻す）
   使い方：BookReader.open(入れ物の要素, {src:"files/pdf-xxx.pdf", key:"xxx", title:"題名", yoko:false}) → {close()} */
(function(){
"use strict";
const PAPER=[248,241,222];               /* 紙の色（少し黄みのあるアイボリー） */
const PAPER_CSS="rgb("+PAPER.join(",")+")";
const LIB="lib/pdfjs/";
let libP=null;
function loadLib(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(libP)return libP;
  libP=new Promise((res,rej)=>{const s=document.createElement("script");s.src=LIB+"pdf.min.js";s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc=LIB+"pdf.worker.min.js";res(window.pdfjsLib)};s.onerror=()=>{libP=null;rej(new Error("pdf.js"))};document.head.append(s)});
  return libP;
}
const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

/* 多角形を半平面 f(q)>=0 で切り取る */
function clipPoly(poly,f){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);
    if(fa>=0)out.push(a);
    if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})}
  }
  return out;
}
function pathPoly(ctx,p){ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath()}
const easeOut=t=>1-Math.pow(1-t,3);
const easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

/* 白い地をアイボリーに。写真や絵のページ（四隅が白くない）はそのまま */
function tint(c){
  const x=c.getContext("2d",{willReadFrequently:true}),w=c.width,h=c.height;
  const im=x.getImageData(0,0,w,h),d=im.data,m=Math.max(2,Math.round(w*.01));
  const pts=[[m,m],[w-1-m,m],[m,h-1-m],[w-1-m,h-1-m]],bg=[0,0,0];
  for(const [px,py] of pts){const j=(py*w+px)*4;bg[0]+=d[j]/4;bg[1]+=d[j+1]/4;bg[2]+=d[j+2]/4}
  if(Math.min(bg[0],bg[1],bg[2])<225)return;
  const k0=PAPER[0]/bg[0],k1=PAPER[1]/bg[1],k2=PAPER[2]/bg[2];
  for(let j=0;j<d.length;j+=4){
    const n=(Math.random()-.5)*5;           /* 紙のかすかなざらつき */
    d[j]=d[j]*k0+n;d[j+1]=d[j+1]*k1+n;d[j+2]=d[j+2]*k2+n;
  }
  x.putImageData(im,0,0);
}

function open(box,opt){
  box.classList.add("book");
  const stage=mk("div","book-stage"),cv=mk("canvas"),msg=mk("div","book-msg","読み込み中…");
  cv.setAttribute("role","img");cv.setAttribute("aria-label","『"+(opt.title||"")+"』");
  stage.append(cv,msg);
  const foot=mk("div","book-foot");
  const LTR=!!opt.yoko;
  const bNext=mk("button","book-btn next",LTR?"次へ ›":"‹ 次へ"),bPrev=mk("button","book-btn prev",LTR?"‹ 前へ":"前へ ›");
  bNext.type=bPrev.type="button";
  const range=mk("input","book-range");range.type="range";range.min="1";range.value="1";range.dir=LTR?"ltr":"rtl";range.setAttribute("aria-label","ページ");
  const pg=mk("span","book-pg","");
  const tocSel=mk("select","book-toc");tocSel.setAttribute("aria-label","目次");tocSel.hidden=true;
  const mid=mk("div","book-mid");mid.append(range,pg,tocSel);
  if(LTR)foot.append(bPrev,mid,bNext);else foot.append(bNext,mid,bPrev);
  const hint=mk("div","book-hint",LTR?"右から左へスワイプで次のページ":"左から右へスワイプで次のページ");
  box.append(stage,foot,hint);
  setTimeout(()=>hint.classList.add("off"),3800);

  const ctx=cv.getContext("2d");
  const KEY="book:"+(opt.key||opt.src);
  let doc=null,N=0,ratio=594.96/420,closed=false;
  let spread=false,W=0,H=0,ox=0,oy=0,SW=0,SH=0,dpr=1,gen=0;
  let cur=parseInt(store.get(KEY)||"0",10)||0;
  const cache=new Map(),annots=new Map();
  let flip=null,anim=null,drag=null;
  const step=()=>spread?2:1;
  const norm=i=>{i=Math.max(0,Math.min(i,N-1));return spread?i-(i%2):i};

  /* ---- 大きさ ---- */
  function layout(){
    const r=stage.getBoundingClientRect();SW=Math.max(1,r.width);SH=Math.max(1,r.height);
    dpr=Math.min(2,window.devicePixelRatio||1);
    spread=SW>=760&&SW/SH>1.05;
    const pad=SW<600?6:22,cols=spread?2:1;
    const nW=Math.floor(Math.min((SW-pad*2)/cols,(SH-pad*2)/ratio));
    if(nW!==W){W=nW;gen++;cache.clear()}
    H=Math.round(W*ratio);
    ox=Math.round((SW-W*cols)/2);oy=Math.round((SH-H)/2);
    cv.width=Math.round(SW*dpr);cv.height=Math.round(SH*dpr);cv.style.width=SW+"px";cv.style.height=SH+"px";
    if(N)cur=norm(cur);
    draw();prefetch();
  }

  /* ---- ページの絵 ---- */
  function img(i){
    if(!doc||i<0||i>=N)return null;
    const e=cache.get(i);if(e)return e.c;
    render(i);return null;
  }
  async function render(i){
    const e={c:null},g=gen;cache.set(i,e);
    try{
      const p=await doc.getPage(i+1);
      const v0=p.getViewport({scale:1}),vp=p.getViewport({scale:W*dpr/v0.width});
      const c=document.createElement("canvas");c.width=Math.round(vp.width);c.height=Math.round(vp.height);
      const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
      await p.render({canvasContext:x,viewport:vp}).promise;
      tint(c);
      if(g!==gen||cache.get(i)!==e||closed)return;
      e.c=c;if(!anim)draw();
    }catch(err){if(cache.get(i)===e)cache.delete(i)}
  }
  function prefetch(){
    if(!doc)return;
    const s=step();
    [cur,cur+1,cur+2,cur+3,cur-1,cur-2,cur+4,cur+5].forEach(i=>{if(i>=0&&i<N)img(i)});
    for(const k of [...cache.keys()])if(k<cur-4*s||k>cur+6*s)cache.delete(k);
  }

  /* ページの絵を置く（横書きの本は画面全体を反転しているので、絵だけもう一度反転して正しい向きに） */
  function pic(c,x,y){if(!LTR){ctx.drawImage(c,x,y,W,H);return}ctx.save();ctx.translate(x+W,y);ctx.scale(-1,1);ctx.drawImage(c,0,0,W,H);ctx.restore()}
  function base(){ctx.setTransform(dpr,0,0,dpr,0,0);if(LTR){ctx.translate(SW,0);ctx.scale(-1,1)}}
  /* 紙1枚を描く（x,y は左上）。side: "L"=左ページ "R"=右ページ "S"=1ページ表示 */
  function paper(i,x,y,side,shadow){
    if(i<0||i>=N)return false;
    ctx.save();
    if(shadow){ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=22*dpr;ctx.shadowOffsetY=6*dpr}
    ctx.fillStyle=PAPER_CSS;ctx.fillRect(x,y,W,H);
    ctx.restore();
    const c=img(i);if(c)pic(c,x,y);
    /* 綴じ目（のど）の陰 */
    const g=side==="L"?ctx.createLinearGradient(x+W,0,x+W-W*.12,0):side==="R"?ctx.createLinearGradient(x,0,x+W*.12,0):ctx.createLinearGradient(x+W,0,x+W-W*.05,0);
    g.addColorStop(0,side==="S"?"rgba(60,40,10,.12)":"rgba(60,40,10,.22)");g.addColorStop(1,"rgba(60,40,10,0)");
    ctx.fillStyle=g;ctx.fillRect(x,y,W,H);
    return true;
  }

  function draw(){
    if(closed)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,SW,SH);base();
    if(!doc||!W)return;
    if(!spread){ctx.save();ctx.beginPath();ctx.rect(ox-30,oy-30,W+60,H+60);ctx.clip()}
    if(!flip){
      if(spread){paper(cur,ox+W,oy,"R",true);paper(cur+1,ox,oy,"L",true)}
      else paper(cur,ox,oy,"S",true);
    }else drawFlip();
    if(!spread)ctx.restore();
  }

  /* めくっている途中：b を起点に、左の紙（綴じ目は右側 x=W）をつまんで右へ返す。
     d は紙の角が今ある位置（紙の左上を原点とした座標） */
  function drawFlip(){
    const b=flip.b,cy=flip.cy,lx=ox,ty=oy;
    const front=spread?b+1:b,back=spread?b+2:-1,under=spread?b+3:b+1;
    if(spread){paper(b,lx+W,ty,"R",true);paper(under,lx,ty,"L",true)}
    else paper(under,lx,ty,"S",true);
    const d=clampD(flip.d,cy);
    const c0={x:0,y:cy};
    let nx=d.x-c0.x,ny=d.y-c0.y;const len=Math.hypot(nx,ny);
    ctx.save();ctx.translate(lx,ty);
    if(!spread){ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip()}
    if(len<.5){ctx.restore();if(spread)paper(front,lx,ty,"L",false);else paper(front,lx,ty,"S",false);return}
    nx/=len;ny/=len;
    const mx=(c0.x+d.x)/2,my=(c0.y+d.y)/2,k=mx*nx+my*ny;
    const f=q=>(q.x-mx)*nx+(q.y-my)*ny;
    const rect=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}];
    const keep=clipPoly(rect,f),free=clipPoly(rect,q=>-f(q));
    const refl=q=>{const s=2*(f(q));return{x:q.x-s*nx,y:q.y-s*ny}};
    const flap=free.map(refl);
    const prog=Math.min(1,len/(2*W));
    /* 1) 下から見えてきたページに落ちる影 */
    if(free.length>2){
      ctx.save();pathPoly(ctx,free);ctx.clip();
      const sw=Math.min(len*.5,W*.35)+8;
      const g=ctx.createLinearGradient(mx,my,mx-nx*sw,my-ny*sw);
      const a=.42*Math.sin(Math.PI*Math.min(1,prog*1.15))+.08;
      g.addColorStop(0,"rgba(30,20,5,"+a.toFixed(3)+")");g.addColorStop(.35,"rgba(30,20,5,"+(a*.35).toFixed(3)+")");g.addColorStop(1,"rgba(30,20,5,0)");
      ctx.fillStyle=g;ctx.fillRect(-W,-H,W*4,H*3);ctx.restore();
    }
    /* 2) めくっている紙の、まだ寝ている部分 */
    if(keep.length>2){
      ctx.save();pathPoly(ctx,keep);ctx.clip();
      ctx.fillStyle=PAPER_CSS;ctx.fillRect(0,0,W,H);
      const c=img(front);if(c)pic(c,0,0);
      const g=spread?ctx.createLinearGradient(W,0,W*.88,0):ctx.createLinearGradient(W,0,W*.95,0);
      g.addColorStop(0,spread?"rgba(60,40,10,.22)":"rgba(60,40,10,.12)");g.addColorStop(1,"rgba(60,40,10,0)");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      /* 持ち上がりかけた紙の丸み（折れ目の手前が少し暗い） */
      const sw2=Math.min(len*.3,W*.18)+4;
      const g2=ctx.createLinearGradient(mx,my,mx+nx*sw2,my+ny*sw2);
      g2.addColorStop(0,"rgba(30,20,5,.16)");g2.addColorStop(1,"rgba(30,20,5,0)");
      ctx.fillStyle=g2;ctx.fillRect(-W,-H,W*4,H*3);
      ctx.restore();
    }
    /* 3) 返っている紙（裏側）。まず紙の形の落ち影 */
    if(flap.length>2){
      ctx.save();
      ctx.shadowColor="rgba(20,12,0,.38)";ctx.shadowBlur=(10+20*Math.sin(Math.PI*prog))*dpr;
      ctx.shadowOffsetX=-nx*4*dpr;ctx.shadowOffsetY=3*dpr;
      pathPoly(ctx,flap);ctx.fillStyle=PAPER_CSS;ctx.fill();ctx.restore();
      ctx.save();pathPoly(ctx,flap);ctx.clip();
      /* 折れ線で鏡に映した座標系 */
      const a=1-2*nx*nx,bb=-2*nx*ny,dd=1-2*ny*ny;
      ctx.transform(a,bb,bb,dd,2*k*nx,2*k*ny);
      if(spread){
        const c=img(back);
        ctx.translate(W,0);ctx.scale(-1,1);           /* 裏面は左右が戻って正しく読める向き */
        if(c)pic(c,0,0);
        const g=ctx.createLinearGradient(0,0,W*.12,0);g.addColorStop(0,"rgba(60,40,10,.22)");g.addColorStop(1,"rgba(60,40,10,0)");
        ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      }else{
        /* 1ページ表示：裏は白紙に表の文字がうっすら透ける */
        const c=img(front);if(c){ctx.globalAlpha=.08;pic(c,0,0);ctx.globalAlpha=1}
      }
      base();ctx.translate(lx,ty);
      /* 紙の丸みの陰影：折れ目のきわは暗く、少し先が明るく、端に向かってまた陰る */
      const L=Math.max(len/2,1);
      const g=ctx.createLinearGradient(mx,my,mx+nx*L,my+ny*L);
      g.addColorStop(0,"rgba(30,20,5,.30)");
      g.addColorStop(.06,"rgba(30,20,5,.10)");
      g.addColorStop(.16,"rgba(255,252,240,.30)");
      g.addColorStop(.4,"rgba(255,252,240,.08)");
      g.addColorStop(.85,"rgba(30,20,5,.06)");
      g.addColorStop(1,"rgba(30,20,5,.16)");
      ctx.fillStyle=g;ctx.fillRect(-W,-H,W*4,H*3);
      ctx.restore();
      ctx.save();pathPoly(ctx,flap);ctx.strokeStyle="rgba(80,60,30,.18)";ctx.lineWidth=.6;ctx.stroke();ctx.restore();
    }
    ctx.restore();
  }

  /* 紙は綴じ目から離れられない（ちぎれない）ので、角の動ける範囲を制限 */
  function clampD(d,cy){
    let x=d.x,y=d.y;
    const s1={x:W,y:cy},s2={x:W,y:H-cy},R2=Math.hypot(W,H);
    let dx=x-s1.x,dy=y-s1.y,l=Math.hypot(dx,dy);
    if(l>W){x=s1.x+dx*W/l;y=s1.y+dy*W/l}
    dx=x-s2.x;dy=y-s2.y;l=Math.hypot(dx,dy);
    if(l>R2){x=s2.x+dx*R2/l;y=s2.y+dy*R2/l}
    return{x,y};
  }

  /* ---- めくる ---- */
  const canFwd=()=>doc&&cur+step()<N;
  const canBack=()=>doc&&cur-step()>=0;
  function begin(dir,cy){
    const s=step();
    flip={dir,cy,b:dir>0?cur:cur-s,d:dir>0?{x:0,y:cy}:{x:2*W,y:cy}};
  }
  function finishAnim(){if(anim){cancelAnimationFrame(anim.raf);const a=anim;anim=null;a.done()}}
  function animate(path,dur,ease,done){
    const t0=performance.now();
    anim={done,raf:0};
    const tick=now=>{
      const t=Math.min(1,(now-t0)/dur);
      flip.d=path(ease(t));draw();
      if(t<1)anim.raf=requestAnimationFrame(tick);else{const a=anim;anim=null;a.done()}
    };
    anim.raf=requestAnimationFrame(tick);
  }
  function settle(commit){
    const f=flip,s=step();
    const end=(f.dir>0)===commit?{x:2*W,y:f.cy}:{x:0,y:f.cy};
    const st=clampD(f.d,f.cy);
    const dist=Math.abs(end.x-st.x)/(2*W);
    animate(t=>({x:st.x+(end.x-st.x)*t,y:st.y+(end.y-st.y)*t}),180+380*dist,easeOut,()=>{
      if(commit)cur=f.dir>0?f.b+s:f.b;
      else cur=f.dir>0?f.b:f.b+s;
      flip=null;changed();
    });
  }
  function turn(dir){
    finishAnim();
    if(dir>0?!canFwd():!canBack()){bump(dir);return}
    begin(dir,H);
    const from=dir>0?0:2*W,to=dir>0?2*W:0,s=step(),b=flip.b;
    animate(t=>({x:from+(to-from)*t,y:H-Math.sin(Math.PI*t)*H*.16}),spread?820:700,easeInOut,()=>{cur=dir>0?b+s:b;flip=null;changed()});
  }
  function bump(dir){
    stage.classList.remove("bump-l","bump-r");void stage.offsetWidth;stage.classList.add((dir>0)!==LTR?"bump-l":"bump-r");
  }
  function jump(i){finishAnim();flip=null;cur=norm(i);changed()}
  function changed(){
    draw();prefetch();
    if(!N)return;
    store.set(KEY,String(cur));
    const a=cur+1,b=spread&&cur+2<=N?cur+2:0;
    pg.textContent=(b?a+"–"+b:a)+" / "+N;
    range.value=String(cur+1);
    cv.setAttribute("aria-label","『"+(opt.title||"")+"』 "+a+"ページ");
    bNext.disabled=!canFwd();bPrev.disabled=!canBack();
  }

  /* ---- 指・マウス ---- */
  cv.addEventListener("pointerdown",e=>{
    if(!doc||(e.button&&e.button!==0))return;
    finishAnim();
    const r=cv.getBoundingClientRect();
    const mx0=LTR?-e.clientX:e.clientX;
    drag={id:e.pointerId,x0:mx0,y0:e.clientY,lx:LTR?r.right-e.clientX:e.clientX-r.left,ly:e.clientY-r.top,on:false,pts:[{x:mx0,t:performance.now()}]};
    try{cv.setPointerCapture(e.pointerId)}catch(err){}
  });
  cv.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const ex=LTR?-e.clientX:e.clientX,dx=ex-drag.x0,dy=e.clientY-drag.y0;
    drag.pts.push({x:ex,t:performance.now()});if(drag.pts.length>8)drag.pts.shift();
    if(!drag.on){
      if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy))return;
      const dir=dx>0?1:-1;
      if(dir>0?!canFwd():!canBack()){drag.blocked=true;return}
      drag.on=true;
      const cy=drag.ly-oy<H*.45?0:H;
      begin(dir,cy);drag.k=spread?1:2;
    }
    if(drag.blocked)return;
    const base=flip.dir>0?0:2*W;
    flip.d={x:base+dx*drag.k,y:flip.cy+dy*(flip.cy?1:1)};
    draw();
  });
  const up=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const g=drag;drag=null;
    if(g.on&&flip){
      const p=g.pts,a=p[0],z=p[p.length-1],vx=(z.x-a.x)/Math.max(16,z.t-a.t);
      const pr=clampD(flip.d,flip.cy).x/(2*W);
      const commit=flip.dir>0?(vx>.3||(pr>.22&&vx>-.2)):(vx<-.3||(pr<.78&&vx<.2));
      settle(commit);return;
    }
    const ex=LTR?-e.clientX:e.clientX;
    if(g.blocked){bump(ex>g.x0?1:-1);return}
    if(e.type==="pointercancel")return;
    if(Math.hypot(ex-g.x0,e.clientY-g.y0)<10)tap(g.lx,g.ly);
  };
  cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);

  async function tap(x,y){
    /* 目次などのページ内リンク */
    const hit=spread?(x>=ox+W?{i:cur,px:x-ox-W}:{i:cur+1,px:x-ox}):{i:cur,px:x-ox};
    const py=y-oy;
    if(hit.i<N&&hit.px>=0&&hit.px<=W&&py>=0&&py<=H){
      const to=await linkAt(hit.i,LTR?1-hit.px/W:hit.px/W,py/H);
      if(to!=null){jump(to);return}
    }
    if(x<SW*.4)turn(1);else if(x>SW*.6)turn(-1);
  }
  async function linkAt(i,u,v){
    try{
      let a=annots.get(i);
      if(!a){const p=await doc.getPage(i+1);const vp=p.getViewport({scale:1});a={vp,list:(await p.getAnnotations()).filter(o=>o.subtype==="Link"&&o.dest)};annots.set(i,a)}
      const X=a.vp.viewBox[0]+u*a.vp.width,Y=a.vp.viewBox[3]-v*a.vp.height;
      const o=a.list.find(o=>{const r=o.rect;return X>=Math.min(r[0],r[2])-2&&X<=Math.max(r[0],r[2])+2&&Y>=Math.min(r[1],r[3])-2&&Y<=Math.max(r[1],r[3])+2});
      if(!o)return null;
      return await destIndex(o.dest);
    }catch(err){return null}
  }
  async function destIndex(dest){
    if(typeof dest==="string")dest=await doc.getDestination(dest);
    if(!Array.isArray(dest))return null;
    const ref=dest[0];
    return typeof ref==="number"?ref:await doc.getPageIndex(ref);
  }

  bNext.addEventListener("click",()=>turn(1));
  bPrev.addEventListener("click",()=>turn(-1));
  range.addEventListener("input",()=>{const i=norm(+range.value-1);const a=i+1,b=spread&&i+2<=N?i+2:0;pg.textContent=(b?a+"–"+b:a)+" / "+N});
  range.addEventListener("change",()=>jump(+range.value-1));
  tocSel.addEventListener("change",async()=>{const o=outline[+tocSel.value];tocSel.value="";if(!o)return;const i=await destIndex(o.dest).catch(()=>null);if(i!=null)jump(i)});
  const onKey=e=>{
    if(e.altKey||e.metaKey||e.ctrlKey||/^(INPUT|SELECT|TEXTAREA)$/.test((e.target&&e.target.tagName)||""))return;
    const nextK=LTR?"ArrowRight":"ArrowLeft",prevK=LTR?"ArrowLeft":"ArrowRight";
    if(e.key===nextK||e.key==="PageDown"||(e.key===" "&&!e.shiftKey)){e.preventDefault();turn(1)}
    else if(e.key===prevK||e.key==="PageUp"||(e.key===" "&&e.shiftKey)){e.preventDefault();turn(-1)}
    else if(e.key==="Home"){e.preventDefault();jump(0)}
    else if(e.key==="End"){e.preventDefault();jump(N-1)}
  };
  document.addEventListener("keydown",onKey);
  let rt=0;const onResize=()=>{clearTimeout(rt);rt=setTimeout(()=>{finishAnim();layout()},120)};
  window.addEventListener("resize",onResize);
  const ro=window.ResizeObserver?new ResizeObserver(onResize):null;if(ro)ro.observe(stage);

  /* ---- 読み込み ---- */
  let outline=[],task=null;
  loadLib().then(lib=>{
    if(closed)return;
    task=lib.getDocument({url:opt.src,isEvalSupported:false});
    return task.promise;
  }).then(async d=>{
    if(!d||closed)return;
    doc=d;N=d.numPages;range.max=String(N);
    const p=await d.getPage(1),v=p.getViewport({scale:1});ratio=v.height/v.width;
    msg.remove();W=0;layout();cur=norm(cur);changed();
    try{
      const ol=await d.getOutline();
      if(ol&&ol.length){
        const flat=[];const walk=(a,dep)=>a.forEach(o=>{if(o.dest)flat.push({t:"　".repeat(dep)+o.title,dest:o.dest});if(o.items&&dep<1)walk(o.items,dep+1)});walk(ol,0);
        outline=flat;
        const o0=mk("option",null,"目次");o0.value="";tocSel.append(o0);
        flat.forEach((o,i)=>{const op=mk("option",null,o.t);op.value=String(i);tocSel.append(op)});
        tocSel.hidden=!flat.length;
      }
    }catch(err){}
  }).catch(()=>{if(!closed){msg.textContent="読み込めませんでした。上の「PDFで開く」からお読みください。"}});
  requestAnimationFrame(layout);

  return{close(){
    closed=true;finishAnim();
    document.removeEventListener("keydown",onKey);window.removeEventListener("resize",onResize);if(ro)ro.disconnect();
    cache.clear();try{if(task)task.destroy()}catch(e){}
  }};
}
window.BookReader={open};
})();
