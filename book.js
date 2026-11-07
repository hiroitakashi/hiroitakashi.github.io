/* 小説の読書画面（本のようにページをめくる）
   - 本文モード（ふだん）：tools/pdf_to_text.py が作った本文データ（files/text-xxx.json）を、tate.js で
     画面の大きさ・文字の大きさに合わせて縦書きに組み直す（Kindle のように画面いっぱいがページ）。
     ＋−・2本指・Ctrl＋ホイール・＋−キーは「文字の大きさ」を変える（組み直して、読んでいた所はそのまま）
   - PDFモード（本文データが読めないとき）：PDF を PDF.js（lib/pdfjs/）で1ページずつ描く。＋−は拡大
   - 紙がめくれる動きをキャンバスに描く
   - 縦書き・右綴じの本なので、左から右へスワイプ（または左側をタップ・← キー）で次のページへ
   - 紙は真っ白ではなくアイボリー（PAPER）。PDF の白い地をこの色に置きかえる
   - 読みかけのページはブラウザに覚えておき、次に開いたときそこから
   - 老眼の方のために拡大縮小できる（右下の＋−、2本指で広げる・つまむ、真ん中をダブルタップ、Ctrl＋ホイール、＋/−キー）。
     拡大中は指（マウス）でずらして読み、ページは左右の端のタップ・ボタン・キーでめくる。めくると次のページの書き出し（右上）へ。
     倍率はブラウザが覚える
   使い方：BookReader.open(入れ物の要素, {src:"files/pdf-xxx.pdf", text:"files/text-xxx.json", cover:"表紙画像", key:"xxx", title:"題名"}) → {close()} */
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
  const im=x.getImageData(0,0,w,h),d=im.data;
  /* 紙の地の色：四辺の上の点のうち明るいほう半分の平均（余白を詰めた端に文字がかかっていても大丈夫なように） */
  const sm=[];
  for(let k=0;k<40;k++){const t=(k+.5)/40;for(const [px,py] of [[t*(w-1),1],[t*(w-1),h-2],[1,t*(h-1)],[w-2,t*(h-1)]]){const j=(Math.round(py)*w+Math.round(px))*4;sm.push([d[j],d[j+1],d[j+2]])}}
  sm.sort((a,b)=>(b[0]+b[1]+b[2])-(a[0]+a[1]+a[2]));
  const bg=[0,0,0],hn=sm.length>>1;for(let k=0;k<hn;k++){bg[0]+=sm[k][0]/hn;bg[1]+=sm[k][1]/hn;bg[2]+=sm[k][2]/hn}
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
  say("左から右へスワイプで次のページ。真ん中をタップでメニュー",4200);
  if(opt.note)setTimeout(()=>{if(!closed)say(opt.note,8000)},4600);

  const ctx=cv.getContext("2d");
  const KEY="book:"+(opt.key||opt.src);
  let doc=null,N=0,ratio=594.96/420,closed=false;
  let spread=false,W=0,H=0,ox=0,oy=0,SW=0,SH=0,dpr=1,gen=0;
  let cur=parseInt(store.get(KEY)||"0",10)||0;
  const cache=new Map(),annots=new Map();
  let flip=null,anim=null,drag=null;
  const ZMIN=1,ZMAX=3,ZSTEPS=[1,1.25,1.5,1.75,2,2.5,3];
  /* 余白を詰める範囲（ページに対する割合）。読み込み時に数ページの文字の位置から決める */
  let crop={x:0,y:0,w:1,h:1};
  /* 読書中は上下の帯を隠して画面いっぱいに。真ん中のタップで出し入れ */
  const host=box.closest(".reader")||box;let uiT=0;
  const ui=on=>{host.classList.toggle("ui-off",!on)};
  let Z=Math.min(ZMAX,Math.max(ZMIN,parseFloat(store.get("book:zoom"))||1)),TX=0,TY=0,shownCur=-1,toldZoom=false;
  /* 本文モード */
  let TEXT=null,PG=null,FS=0,fontsReady=Promise.resolve(),coverImg=null,lastLay="";
  const POSKEY="bookpos:"+(opt.key||opt.src);
  let savedPos=null;try{savedPos=JSON.parse(store.get(POSKEY)||"null")}catch(e){}
  const FSTEPS=[13,14,15,16,17,18,19,20,22,24,26,28,31,34,38,42];
  const fsDefault=()=>SW<600?18:20;
  /* 画面下の安全領域（iPhone のホームバー） */
  const insetB=()=>{const d=document.createElement("div");d.style.cssText="position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden";document.body.append(d);const v=parseFloat(getComputedStyle(d).paddingBottom)||0;d.remove();return v};
  const step=()=>spread?2:1;
  const norm=i=>{i=Math.max(0,Math.min(i,N-1));return spread?i-(i%2):i};

  /* ---- 大きさ ---- */
  function layout(){
    const r=stage.getBoundingClientRect();SW=Math.max(1,r.width);SH=Math.max(1,r.height);
    dpr=Math.min(2,window.devicePixelRatio||1);
    spread=SW>=760&&SW/SH>1.05;
    if(TEXT){layoutText();return}
    const pad=SW<600?0:14,cols=spread?2:1;
    const nW=Math.floor(Math.min((SW-pad*2)/cols,(SH-pad*2)/ratio));
    if(nW!==W){W=nW;gen++;cache.clear()}
    H=Math.round(W*ratio);
    ox=Math.round((SW-W*cols)/2);oy=Math.round((SH-H)/2);
    cv.width=Math.round(SW*dpr);cv.height=Math.round(SH*dpr);cv.style.width=SW+"px";cv.style.height=SH+"px";
    if(N)cur=norm(cur);
    if(Z>1)clampPan();else TX=TY=0;
    draw();prefetch();
  }

  /* 本文モードの大きさ：ページ＝画面（見開きなら半分ずつ）。大きさか文字が変わったら組み直す */
  function layoutText(){
    const cols=spread?2:1;
    W=Math.floor(SW/cols);H=Math.floor(SH);ox=Math.round((SW-W*cols)/2);oy=0;
    cv.width=Math.round(SW*dpr);cv.height=Math.round(SH*dpr);cv.style.width=SW+"px";cv.style.height=SH+"px";
    if(!FS){const v=parseInt(store.get("book:fs")||"",10);FS=FSTEPS.includes(v)?v:fsDefault()}
    const key=[W,H,FS,dpr].join("x");
    if(key!==lastLay){
      const pos=PG&&PG.pages[cur]?PG.pages[cur].start:savedPos;
      const ib=insetB();
      PG=window.Tate.paginate(TEXT,{title:opt.title||"",W,H,F:FS,mt:Math.max(26,FS*2.1),mb:FS*2.5+ib,ms:Math.max(16,FS*1.15)});
      N=PG.pages.length;range.max=String(N);
      cur=norm(PG.find(pos));lastLay=key;gen++;
      for(const e of cache.values())if(e.c)e.c.width=0;
      cache.clear();
      fillToc();
    }else cur=norm(cur);
    TX=TY=0;Z=1;
    draw();prefetch();changed();
  }
  function fillToc(){
    tocSel.replaceChildren();
    const o0=mk("option",null,"目次");o0.value="";tocSel.append(o0);
    PG.heads.forEach((h,i)=>{const op=mk("option",null,h.t);op.value=String(i);tocSel.append(op)});
    tocSel.hidden=!PG.heads.length;
  }
  function changeFont(dir,to){
    if(!TEXT)return;
    let i=FSTEPS.indexOf(FS);if(i<0)i=FSTEPS.indexOf(fsDefault());
    const n=to!=null?to:FSTEPS[Math.max(0,Math.min(FSTEPS.length-1,i+dir))];
    if(n===FS)return;
    FS=n;store.set("book:fs",String(FS));
    zVal.textContent=Math.round(FS/fsDefault()*100)+"%";
    zOut.disabled=FS<=FSTEPS[0];zIn.disabled=FS>=FSTEPS[FSTEPS.length-1];
    finishAnim();flip=null;layoutText();
  }

  /* ---- ページの絵 ---- */
  /* 描く細かさ：拡大したら細かく描き直す（ただし1ページの画素数に上限。スマホのメモリのため） */
  const wantQ=()=>TEXT?1:Math.max(1,Math.min(Z,Math.sqrt(4.5e6/Math.max(1,W*H*dpr*dpr))));
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
    if(TEXT){
      try{
        await fontsReady;
        if(g!==gen||cache.get(i)!==e||closed)return;
        const pgo=PG.pages[i],c=document.createElement("canvas");
        c.width=Math.round(W*dpr*q);c.height=Math.round(H*dpr*q);
        const x=c.getContext("2d");
        if(pgo.cover){
          /* 表紙：暗い地に、表紙の絵を画面に収まる大きさで */
          x.fillStyle="#2a2018";x.fillRect(0,0,c.width,c.height);
          const im=await coverImg;
          if(im&&im.naturalWidth){
            /* 地：表紙の絵を画面いっぱいに広げてぼかし、少し暗く（小さく縮めてから引き伸ばすとぼける） */
            const t=document.createElement("canvas");t.width=12;t.height=Math.max(1,Math.round(12*im.naturalHeight/im.naturalWidth));
            t.getContext("2d").drawImage(im,0,0,t.width,t.height);
            const bs=Math.max(c.width/t.width,c.height/t.height);
            x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";
            x.drawImage(t,(c.width-t.width*bs)/2,(c.height-t.height*bs)/2,t.width*bs,t.height*bs);
            x.fillStyle="rgba(0,0,0,.28)";x.fillRect(0,0,c.width,c.height);
            x.save();x.shadowColor="rgba(0,0,0,.5)";x.shadowBlur=30*dpr;
            const sc=Math.min(c.width/im.naturalWidth,c.height/im.naturalHeight),w=im.naturalWidth*sc,h=im.naturalHeight*sc;
            x.drawImage(im,(c.width-w)/2,(c.height-h)/2,w,h);x.restore();
          }
        }else window.Tate.drawPage(x,pgo,PG.P,dpr*q,i);
        if(g!==gen||cache.get(i)!==e||closed){c.width=0;return}
        e.c=c;e.q=q;e.busy=false;if(!anim)draw();
      }catch(err){e.busy=false;e.q=q}
      return;
    }
    try{
      const p=await doc.getPage(i+1);
      const v0=p.getViewport({scale:1}),full=i===0;   /* 表紙は余白を詰めず全体を */
      const vp=p.getViewport({scale:full?Math.min(W/v0.width,H/v0.height)*dpr*q:W*dpr*q/(v0.width*crop.w)});
      const c=document.createElement("canvas");
      c.width=Math.round(full?vp.width:W*dpr*q);c.height=Math.round(full?vp.height:H*dpr*q);c._full=full;
      const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
      await p.render({canvasContext:x,viewport:vp,transform:full?null:[1,0,0,1,-crop.x*vp.width,-crop.y*vp.height]}).promise;
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

  function pic(c,x,y){
    if(!c._full){ctx.drawImage(c,x,y,W,H);return}
    const s=Math.min(W/c.width,H/c.height),w=c.width*s,h=c.height*s;
    ctx.drawImage(c,x+(W-w)/2,y+(H-h)/2,w,h);
  }
  /* 余白を詰める範囲を決める：ページをいくつか小さく描いて、文字（濃い点）のある範囲を合わせ、少し余裕を足す */
  async function findCrop(){
    const idx=[];const n=Math.min(12,N-1);
    for(let k=0;k<n;k++)idx.push(1+Math.floor(k*(N-1)/n));
    let x0=1,y0=1,x1=0,y1=0;
    for(const i of [...new Set(idx)]){
      try{
        const p=await doc.getPage(i+1),v=p.getViewport({scale:1}),vp=p.getViewport({scale:260/v.width});
        const c=document.createElement("canvas");c.width=Math.round(vp.width);c.height=Math.round(vp.height);
        const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
        await p.render({canvasContext:x,viewport:vp}).promise;
        const d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
        let a=w,b=h,e=-1,f=-1,cnt=0;
        for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const j=(yy*w+xx)*4;if(d[j]+d[j+1]+d[j+2]<480){cnt++;if(xx<a)a=xx;if(xx>e)e=xx;if(yy<b)b=yy;if(yy>f)f=yy}}
        c.width=0;
        if(e<0||cnt>w*h*.3)continue;              /* 白紙や絵のページは使わない */
        x0=Math.min(x0,a/w);y0=Math.min(y0,b/h);x1=Math.max(x1,(e+1)/w);y1=Math.max(y1,(f+1)/h);
      }catch(err){}
      if(closed)return;
    }
    if(x1<=x0||y1<=y0)return;
    const px=.035,py=.03;
    x0=Math.max(0,x0-px);y0=Math.max(0,y0-py);x1=Math.min(1,x1+px);y1=Math.min(1,y1+py);
    if((x1-x0)*(y1-y0)>.92)return;               /* ほとんど詰められないならそのまま */
    crop={x:x0,y:y0,w:x1-x0,h:y1-y0};
  }
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
    if(TEXT){if(PG&&PG.pages[cur])store.set(POSKEY,JSON.stringify(PG.pages[cur].start))}else store.set(KEY,String(cur));
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
  let zT=0,wheelT=0;
  /* 画面の高さにページの高さをぴったり合わせる倍率（スマホの縦長画面で上下の隙間をなくす） */
  const fitH=()=>{const f=SH/Math.max(1,H);return f>1.04&&f<ZMAX?Math.floor(f*100)/100:0};
  const stepZoom=dir=>{
    const st=[...ZSTEPS];const f=fitH();if(f&&!st.some(v=>Math.abs(v-f)<.06))st.push(f);st.sort((a,b)=>a-b);
    const k=dir>0?st.find(v=>v>Z+.01):[...st].reverse().find(v=>v<Z-.01);
    setZoom(k==null?(dir>0?ZMAX:ZMIN):k);
  };
  zIn.addEventListener("click",()=>TEXT?changeFont(1):stepZoom(1));
  zOut.addEventListener("click",()=>TEXT?changeFont(-1):stepZoom(-1));
  zVal.addEventListener("click",()=>TEXT?changeFont(0,fsDefault()):setZoom(1));
  stage.addEventListener("wheel",e=>{
    if(!doc)return;
    const r=cv.getBoundingClientRect(),fx=e.clientX-r.left,fy=e.clientY-r.top;
    if(e.ctrlKey){e.preventDefault();if(TEXT){const t=performance.now();if(t-wheelT>250){wheelT=t;changeFont(e.deltaY<0?1:-1)}return}setZoom(Z*Math.exp(-e.deltaY*.01),fx,fy,true);return}
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
      if(TEXT){pinch.r=d/pinch.d0;return}
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
      drag.on=true;ui(false);
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
      if(ptrs.size<2){
        const r=pinch.r||1;pinch=null;drag=null;
        if(TEXT){if(r>1.12||r<.89){let i=FSTEPS.indexOf(FS);const st=Math.max(1,Math.round(Math.abs(Math.log(r))/.12));i=Math.max(0,Math.min(FSTEPS.length-1,i+(r>1?st:-st)));changeFont(0,FSTEPS[i])}}
        else setZoom(Z,null,null,true);
      }
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
    if(TEXT){
      const i=spread?(bx>=ox+W?cur:cur+1):cur,px=spread?(bx>=ox+W?bx-ox-W:bx-ox):bx-ox;
      const pgo=PG.pages[i];
      if(pgo){const l=pgo.links.find(l=>px>=l.x0&&px<=l.x1&&by>=l.y0&&by<=l.y1);if(l&&l.page!=null){jump(l.page);return}}
      if(x<SW*.34){ui(false);turn(1);return}
      if(x>SW*.66){ui(false);turn(-1);return}
      ui(host.classList.contains("ui-off"));return;
    }
    /* 目次などのページ内リンク */
    const hit=spread?(bx>=ox+W?{i:cur,px:bx-ox-W}:{i:cur+1,px:bx-ox}):{i:cur,px:bx-ox};
    const py=by-oy;
    if(hit.i<N&&hit.px>=0&&hit.px<=W&&py>=0&&py<=H){
      const to=await linkAt(hit.i,crop.x+hit.px/W*crop.w,crop.y+py/H*crop.h);
      if(to!=null){jump(to);return}
    }
    /* 左右の端はページめくり（拡大中は端を狭く）。真ん中のダブルタップで拡大／元に戻す */
    const edge=Z>1?.28:.34;
    if(x<SW*edge){lastTap=null;ui(false);turn(1);return}
    if(x>SW*(1-edge)){lastTap=null;ui(false);turn(-1);return}
    const now=performance.now();
    clearTimeout(uiT);
    if(lastTap&&now-lastTap.t<350&&Math.hypot(x-lastTap.x,y-lastTap.y)<40){lastTap=null;setZoom(Z>1?1:(fitH()||2),x,y,true);return}
    lastTap={t:now,x,y};
    /* 1回だけのタップならメニュー（上下の帯）を出し入れ */
    uiT=setTimeout(()=>{lastTap=null;ui(host.classList.contains("ui-off"))},330);
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
  tocSel.addEventListener("change",async()=>{if(TEXT){const h=PG.heads[+tocSel.value];tocSel.value="";if(h)jump(h.page);return}const o=outline[+tocSel.value];tocSel.value="";if(!o)return;const i=await destIndex(o.dest).catch(()=>null);if(i!=null)jump(i)});
  const onKey=e=>{
    if(e.altKey||e.metaKey||e.ctrlKey||/^(INPUT|SELECT|TEXTAREA)$/.test((e.target&&e.target.tagName)||""))return;
    if(e.key==="+"||e.key===";"||e.key==="="){e.preventDefault();TEXT?changeFont(1):stepZoom(1);return}
    if(e.key==="-"||e.key==="_"){e.preventDefault();TEXT?changeFont(-1):stepZoom(-1);return}
    if(e.key==="0"){e.preventDefault();TEXT?changeFont(0,fsDefault()):setZoom(1);return}
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
  /* 本文データがあれば本文モード、なければ PDF */
  const tateP=window.Tate?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement("script");s.src="tate.js?v=1";s.onload=res;s.onerror=rej;document.head.append(s)});
  (opt.text?Promise.all([fetch(opt.text).then(r=>{if(!r.ok)throw 0;return r.json()}),tateP]).then(([data])=>data):Promise.reject()).then(data=>{
    if(closed)return;
    TEXT=data;doc={text:true};
    if(opt.cover)coverImg=new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=opt.cover});
    fontsReady=loadFonts(data);
    stage.classList.add("text-mode");
    msg.remove();setTimeout(()=>{if(!closed)ui(false)},2600);
    zIn.setAttribute("aria-label","文字を大きく");zOut.setAttribute("aria-label","文字を小さく");zVal.setAttribute("aria-label","文字の大きさを元に戻す");
    zIn.title="文字を大きく";zOut.title="文字を小さく";zVal.title="文字の大きさを元に戻す";
    W=0;layout();
    zVal.textContent=Math.round(FS/fsDefault()*100)+"%";zOut.disabled=FS<=FSTEPS[0];zIn.disabled=FS>=FSTEPS[FSTEPS.length-1];
  }).catch(()=>{if(!closed&&!TEXT)startPdf()});
  /* 明朝体：Mac・iPhone・Windows は本体の明朝体。ないとき（Android など）は Noto Serif JP を読み込む */
  function loadFonts(data){
    const T=window.Tate,chars=T.allChars(data);
    /* その書体が本体にあるか：英数字の幅が既定の書体と違えばある */
    const mc=document.createElement("canvas").getContext("2d"),probe="abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456789";
    const wOf=f=>{mc.font="40px "+f;return mc.measureText(probe).width};
    const has=f=>wOf(f+",monospace")!==wOf("monospace")||wOf(f+",sans-serif")!==wOf("sans-serif");
    const local=["Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif CJK JP","Source Han Serif JP","IPAexMincho"].some(f=>has('"'+f+'"'));
    if(!local&&!document.getElementById("noto-serif-jp")){
      const l=document.createElement("link");l.id="noto-serif-jp";l.rel="stylesheet";
      l.href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap";document.head.append(l);
    }
    let late=false;
    const done=Promise.all([document.fonts.load(T.font(16),chars),document.fonts.load(T.font(16,true),chars)]).catch(()=>{});
    /* 6秒待っても読み込めなければいったん手持ちの書体で描き、読み込めたら描き直す */
    done.then(()=>{if(late&&!closed){gen++;for(const e of cache.values())if(e.c)e.c.width=0;cache.clear();prefetch();draw()}});
    return Promise.race([done,new Promise(r=>setTimeout(()=>{late=true;r()},6000))]);
  }
  function startPdf(){
  loadLib().then(lib=>{
    if(closed)return;
    task=lib.getDocument({url:opt.src,isEvalSupported:false});
    return task.promise;
  }).then(async d=>{
    if(!d||closed)return;
    doc=d;N=d.numPages;range.max=String(N);
    const p=await d.getPage(1),v=p.getViewport({scale:1});
    await findCrop();if(closed)return;
    ratio=(v.height*crop.h)/(v.width*crop.w);
    msg.remove();setTimeout(()=>{if(!closed)ui(false)},2600);W=0;layout();cur=norm(cur);if(Z>1)toStart();setZoom(Z,null,null,true);changed();
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
  }
  requestAnimationFrame(()=>{if(TEXT||doc)layout()});

  return{close(){
    closed=true;finishAnim();
    document.removeEventListener("keydown",onKey);window.removeEventListener("resize",onResize);if(ro)ro.disconnect();
    for(const e of cache.values())if(e.c)e.c.width=0;
    cache.clear();clearTimeout(zT);clearTimeout(uiT);host.classList.remove("ui-off");clearTimeout(hintT);try{if(task)task.destroy()}catch(e){}
  }};
}
window.BookReader={open};
})();
