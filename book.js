/* 小説の読書画面（本のようにページをめくる）
   - PDF を PDF.js（lib/pdfjs/）で1ページずつ描き、紙がめくれる動きをキャンバスに描く
   - 縦書き・右綴じの本なので、左から右へスワイプ（または左側をタップ・← キー）で次のページへ
   - 紙は真っ白ではなくアイボリー（PAPER）。PDF の白い地をこの色に置きかえる
   - 読みかけのページはブラウザに覚えておき、次に開いたときそこから
   - 老眼の方のために拡大縮小できる（右下の＋−、2本指で広げる・つまむ、真ん中をダブルタップ、Ctrl＋ホイール、＋/−キー）。
     拡大中は指（マウス）でずらして読み、ページは左右の端のタップ・ボタン・キーでめくる。めくると次のページの書き出し（右上）へ。
     倍率はブラウザが覚える
   使い方：BookReader.open(入れ物の要素, {src:"files/pdf-xxx.pdf", key:"xxx", title:"題名"}) → {close()} */
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
  const bNext=mk("button","book-btn next","‹ 次へ"),bPrev=mk("button","book-btn prev","前へ ›");
  bNext.type=bPrev.type="button";
  const range=mk("input","book-range");range.type="range";range.min="1";range.value="1";range.dir="rtl";range.setAttribute("aria-label","ページ");
  const pg=mk("span","book-pg","");
  const tocSel=mk("select","book-toc");tocSel.setAttribute("aria-label","目次");tocSel.hidden=true;
  const mid=mk("div","book-mid");mid.append(range,pg,tocSel);
  foot.append(bNext,mid,bPrev);
  const hint=mk("div","book-hint","左から右へスワイプで次のページ");
  /* 拡大・縮小のボタン（大きめ） */
  const zoomBox=mk("div","book-zoom"),zIn=mk("button","zin","＋"),zVal=mk("button","zval","100%"),zOut=mk("button","zout","－");
  zIn.type=zVal.type=zOut.type="button";
  zIn.setAttribute("aria-label","拡大");zOut.setAttribute("aria-label","縮小");zVal.setAttribute("aria-label","元の大きさに戻す");
  zIn.title="拡大";zOut.title="縮小";zVal.title="元の大きさに戻す";
  zoomBox.append(zIn,zVal,zOut);stage.append(zoomBox);
  box.append(stage,foot,hint);
  let hintT=0;
  const say=(t,ms)=>{hint.textContent=t;hint.classList.remove("off");clearTimeout(hintT);hintT=setTimeout(()=>hint.classList.add("off"),ms||3800)};
  say("左から右へスワイプで次のページ　＋で拡大",4200);

  const ctx=cv.getContext("2d");
  const KEY="book:"+(opt.key||opt.src);
  let doc=null,N=0,ratio=594.96/420,closed=false;
  let spread=false,W=0,H=0,ox=0,oy=0,SW=0,SH=0,dpr=1,gen=0;
  let cur=parseInt(store.get(KEY)||"0",10)||0;
  const cache=new Map(),annots=new Map();
  let flip=null,anim=null,drag=null;
  const ZMIN=1,ZMAX=3,ZSTEPS=[1,1.25,1.5,1.75,2,2.5,3];
  let Z=Math.min(ZMAX,Math.max(ZMIN,parseFloat(store.get("book:zoom"))||1)),TX=0,TY=0,shownCur=-1,toldZoom=false;
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
    if(Z>1)clampPan();else TX=TY=0;
    draw();prefetch();
  }

  /* ---- ページの絵 ---- */
  /* 描く細かさ：拡大したら細かく描き直す（ただし1ページの画素数に上限。スマホのメモリのため） */
  const wantQ=()=>Math.max(1,Math.min(Z,Math.sqrt(4.5e6/Math.max(1,W*H*dpr*dpr))));
  function img(i){
    if(!doc||i<0||i>=N)return null;
    let e=cache.get(i);
    if(!e){e={c:null,q:0,busy:false};cache.set(i,e)}
    const q=wantQ();
    if(!e.busy&&e.q<q-.01)render(i,e,q);
    return e.c;
  }
  async function render(i,e,q){
    const g=gen;e.busy=true;
    try{
      const p=await doc.getPage(i+1);
      const v0=p.getViewport({scale:1}),vp=p.getViewport({scale:W*dpr*q/v0.width});
      const c=document.createElement("canvas");c.width=Math.round(vp.width);c.height=Math.round(vp.height);
      const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
      await p.render({canvasContext:x,viewport:vp}).promise;
      tint(c);
      if(g!==gen||cache.get(i)!==e||closed){c.width=0;return}
      if(e.c)e.c.width=0;
      e.c=c;e.q=q;e.busy=false;if(!anim)draw();
    }catch(err){e.busy=false;e.q=q}
  }
  function prefetch(){
    if(!doc)return;
    const s=step();
    const big=Z>1.4;
    (big?[cur,cur+1,cur+2,cur+3,cur-1,cur-2]:[cur,cur+1,cur+2,cur+3,cur-1,cur-2,cur+4,cur+5]).forEach(i=>{if(i>=0&&i<N)img(i)});
    const lo=big?cur-2*s:cur-4*s,hi=big?cur+2*s+1:cur+6*s;
    for(const [k,e] of [...cache])if(k<lo||k>hi){if(e.c)e.c.width=0;cache.delete(k)}
  }

  function pic(c,x,y){ctx.drawImage(c,x,y,W,H)}
  /* 画面の座標 = 本の座標 × Z ＋ (TX,TY)（拡大とずらし） */
  function base(){ctx.setTransform(dpr*Z,0,0,dpr*Z,dpr*TX,dpr*TY)}
  /* 紙1枚を描く（x,y は左上）。side: "L"=左ページ "R"=右ページ "S"=1ページ表示 */
  function paper(i,x,y,side,shadow){
    if(i<0||i>=N)return false;
    ctx.save();
    if(shadow){ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=22*dpr*Z;ctx.shadowOffsetY=6*dpr*Z}
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
      ctx.shadowColor="rgba(20,12,0,.38)";ctx.shadowBlur=(10+20*Math.sin(Math.PI*prog))*dpr*Z;
      ctx.shadowOffsetX=-nx*4*dpr*Z;ctx.shadowOffsetY=3*dpr*Z;
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
    stage.classList.remove("bump-l","bump-r");void stage.offsetWidth;stage.classList.add(dir>0?"bump-l":"bump-r");
  }
  function jump(i){finishAnim();flip=null;cur=norm(i);changed()}
  function changed(){
    if(cur!==shownCur){if(shownCur>=0&&Z>1)toStart();shownCur=cur}
    draw();prefetch();
    if(!N)return;
    store.set(KEY,String(cur));
    const a=cur+1,b=spread&&cur+2<=N?cur+2:0;
    pg.textContent=(b?a+"–"+b:a)+" / "+N;
    range.value=String(cur+1);
    cv.setAttribute("aria-label","『"+(opt.title||"")+"』 "+a+"ページ");
    bNext.disabled=!canFwd();bPrev.disabled=!canBack();
  }

  /* ---- 拡大・縮小 ---- */
  /* 本（見開きなら2ページ分）の範囲が画面を外れすぎないように、ずらしを制限する */
  function clampPan(){
    const cols=spread?2:1,x0=ox,x1=ox+W*cols,y0=oy,y1=oy+H,m=10;
    const cw=(x1-x0)*Z,ch=(y1-y0)*Z;
    TX=cw+2*m<=SW?(SW-(x0+x1)*Z)/2:Math.min(m-x0*Z,Math.max(SW-m-x1*Z,TX));
    TY=ch+2*m<=SH?(SH-(y0+y1)*Z)/2:Math.min(m-y0*Z,Math.max(SH-m-y1*Z,TY));
  }
  /* ページの書き出し（縦書きなので右上）を見せる */
  function toStart(){const cols=spread?2:1;TX=SW-10-(ox+W*cols)*Z;TY=10-oy*Z;clampPan()}
  function setZoom(nz,fx,fy,keep){
    nz=Math.min(ZMAX,Math.max(ZMIN,nz));
    if(fx==null){fx=SW/2;fy=SH/2}
    const sx=(fx-TX)/Z,sy=(fy-TY)/Z,first=Z<=1.001&&nz>1.001;
    Z=nz;
    if(Z<=1.001){Z=1;TX=TY=0}else if(first&&!keep){toStart()}else{TX=fx-sx*Z;TY=fy-sy*Z;clampPan()}
    zVal.textContent=Math.round(Z*100)+"%";
    zOut.disabled=Z<=ZMIN;zIn.disabled=Z>=ZMAX;
    stage.classList.toggle("zoomed",Z>1);
    store.set("book:zoom",String(Z));
    if(Z>1&&!toldZoom){toldZoom=true;say("拡大中は指でずらして読めます。左右の端をタップでページをめくります",4500)}
    draw();clearTimeout(zT);zT=setTimeout(prefetch,250);
  }
  let zT=0;
  const stepZoom=dir=>{const i=ZSTEPS.findIndex(v=>v>=Z-.01);let k=dir>0?ZSTEPS.findIndex(v=>v>Z+.01):(()=>{let j=-1;ZSTEPS.forEach((v,n)=>{if(v<Z-.01)j=n});return j})();if(k<0)k=dir>0?ZSTEPS.length-1:0;setZoom(ZSTEPS[k])};
  zIn.addEventListener("click",()=>stepZoom(1));
  zOut.addEventListener("click",()=>stepZoom(-1));
  zVal.addEventListener("click",()=>setZoom(1));
  stage.addEventListener("wheel",e=>{
    if(!doc)return;
    const r=cv.getBoundingClientRect(),fx=e.clientX-r.left,fy=e.clientY-r.top;
    if(e.ctrlKey){e.preventDefault();setZoom(Z*Math.exp(-e.deltaY*.01),fx,fy,true);return}
    if(Z>1){e.preventDefault();TX-=e.deltaX;TY-=e.deltaY;clampPan();draw()}
  },{passive:false});

  /* ---- 指・マウス ---- */
  const ptrs=new Map();let pinch=null,lastTap=null;
  const local=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  /* 画面の点 → 本の座標 */
  const toBook=(x,y)=>({x:(x-TX)/Z,y:(y-TY)/Z});
  cv.addEventListener("pointerdown",e=>{
    if(!doc||(e.button&&e.button!==0))return;
    ptrs.set(e.pointerId,local(e));
    try{cv.setPointerCapture(e.pointerId)}catch(err){}
    if(ptrs.size===2){
      /* 2本指：めくりかけていたら戻して、拡大・縮小へ */
      if(drag&&drag.on&&flip&&!anim)settle(false);
      drag=null;
      const [a,b]=[...ptrs.values()];
      pinch={d0:Math.max(20,Math.hypot(a.x-b.x,a.y-b.y)),z0:Z,s:toBook((a.x+b.x)/2,(a.y+b.y)/2)};
      return;
    }
    if(ptrs.size>2)return;
    finishAnim();
    const p=local(e),bp=toBook(p.x,p.y);
    drag={id:e.pointerId,x0:e.clientX,y0:e.clientY,sx:p.x,sy:p.y,bx:bp.x,by:bp.y,tx0:TX,ty0:TY,pan:Z>1.001,on:false,pts:[{x:e.clientX,t:performance.now()}]};
  });
  cv.addEventListener("pointermove",e=>{
    if(!ptrs.has(e.pointerId))return;
    ptrs.set(e.pointerId,local(e));
    if(pinch&&ptrs.size>=2){
      const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      Z=Math.min(ZMAX,Math.max(ZMIN,pinch.z0*d/pinch.d0));
      TX=mx-pinch.s.x*Z;TY=my-pinch.s.y*Z;
      if(Z<=1.001){Z=1;TX=TY=0}else clampPan();
      zVal.textContent=Math.round(Z*100)+"%";stage.classList.toggle("zoomed",Z>1);
      draw();return;
    }
    if(!drag||e.pointerId!==drag.id)return;
    const dx=e.clientX-drag.x0,dy=e.clientY-drag.y0;
    drag.pts.push({x:e.clientX,t:performance.now()});if(drag.pts.length>8)drag.pts.shift();
    if(drag.pan){
      /* 拡大中はずらして読む */
      if(!drag.moved&&Math.hypot(dx,dy)<6)return;
      drag.moved=true;TX=drag.tx0+dx;TY=drag.ty0+dy;clampPan();draw();return;
    }
    if(!drag.on){
      if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy))return;
      const dir=dx>0?1:-1;
      if(dir>0?!canFwd():!canBack()){drag.blocked=true;return}
      drag.on=true;
      const cy=drag.by-oy<H*.45?0:H;
      begin(dir,cy);drag.k=spread?1:2;
    }
    if(drag.blocked)return;
    const base0=flip.dir>0?0:2*W;
    flip.d={x:base0+dx*drag.k,y:flip.cy+dy};
    draw();
  });
  const up=e=>{
    if(!ptrs.has(e.pointerId))return;
    ptrs.delete(e.pointerId);
    if(pinch){
      if(ptrs.size<2){pinch=null;drag=null;setZoom(Z,null,null,true)}
      return;
    }
    if(!drag||e.pointerId!==drag.id)return;
    const g=drag;drag=null;
    if(g.on&&flip){
      const p=g.pts,a=p[0],z=p[p.length-1],vx=(z.x-a.x)/Math.max(16,z.t-a.t);
      const pr=clampD(flip.d,flip.cy).x/(2*W);
      const commit=flip.dir>0?(vx>.3||(pr>.22&&vx>-.2)):(vx<-.3||(pr<.78&&vx<.2));
      settle(commit);return;
    }
    if(g.blocked){bump(e.clientX>g.x0?1:-1);return}
    if(e.type==="pointercancel"||g.moved)return;
    if(Math.hypot(e.clientX-g.x0,e.clientY-g.y0)<10)tap(g.sx,g.sy,g.bx,g.by);
  };
  cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);

  /* x,y は画面の点、bx,by は本の座標 */
  async function tap(x,y,bx,by){
    /* 目次などのページ内リンク */
    const hit=spread?(bx>=ox+W?{i:cur,px:bx-ox-W}:{i:cur+1,px:bx-ox}):{i:cur,px:bx-ox};
    const py=by-oy;
    if(hit.i<N&&hit.px>=0&&hit.px<=W&&py>=0&&py<=H){
      const to=await linkAt(hit.i,hit.px/W,py/H);
      if(to!=null){jump(to);return}
    }
    /* 左右の端はページめくり（拡大中は端を狭く）。真ん中のダブルタップで拡大／元に戻す */
    const edge=Z>1?.28:.4;
    if(x<SW*edge){lastTap=null;turn(1);return}
    if(x>SW*(1-edge)){lastTap=null;turn(-1);return}
    const now=performance.now();
    if(lastTap&&now-lastTap.t<350&&Math.hypot(x-lastTap.x,y-lastTap.y)<40){lastTap=null;setZoom(Z>1?1:2,x,y,true);return}
    lastTap={t:now,x,y};
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
    if(e.key==="+"||e.key===";"||e.key==="="){e.preventDefault();stepZoom(1);return}
    if(e.key==="-"||e.key==="_"){e.preventDefault();stepZoom(-1);return}
    if(e.key==="0"){e.preventDefault();setZoom(1);return}
    if(e.key==="ArrowLeft"||e.key==="PageDown"||(e.key===" "&&!e.shiftKey)){e.preventDefault();turn(1)}
    else if(e.key==="ArrowRight"||e.key==="PageUp"||(e.key===" "&&e.shiftKey)){e.preventDefault();turn(-1)}
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
    msg.remove();W=0;layout();cur=norm(cur);if(Z>1)toStart();setZoom(Z,null,null,true);changed();
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
    for(const e of cache.values())if(e.c)e.c.width=0;
    cache.clear();clearTimeout(zT);clearTimeout(hintT);try{if(task)task.destroy()}catch(e){}
  }};
}
window.BookReader={open};
})();
