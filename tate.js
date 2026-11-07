/* 縦書きの組版（読書画面で本文を画面の大きさに合わせて組み直す）
   Tate.paginate(本文データ, {W,H,F,…}) → {pages, heads, find(pos)}   … ページ割り
   Tate.drawPage(ctx, page, layout, scale)                          … 1ページをキャンバスに描く
   本文データは tools/pdf_to_text.py が作る files/text-xxx.json
   - 1字＝1em の升目で上から下へ、行は右から左へ。行間は字の大きさの0.85倍
   - 禁則：句読点・閉じかっこ・小書きの仮名などは行頭に置かず、前の行の下へぶら下げる（2字まで）。開きかっこは行末に置かない
   - 縦書きの約物：かっこ・長音・ダッシュ・三点リーダーは90度回し、句読点は升目の右上、小書きの仮名は少し右上へ
   - 英語は横倒し、2桁までの数字は縦中横
   - ルビは親字の右に半分の大きさで
   - 章は新しいページから始める */
(function(){
"use strict";
const OPEN="「『（【〔〈《［｛〝‘“";
const NO_START="、。，．・：；？！ー」』）】〕〉》］｝〟’”ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々…‥〜～";
const ROT="「」『』（）【】〔〕〈〉《》［］｛｝ー―‐－—–…‥〜～：；＝＜＞";
const PUNCT="、。，．";
const SMALL="ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ";
const LABEL=/^(第[一二三四五六七八九十百千〇0-9０-９]+[章部巻話幕篇編]|序章?|終章|序|跋|あとがき|後書き?|エピローグ|プロローグ|最終章|間章|作者覚書|[一二三四五六七八九十百]+)$/;
const FAMILY='"Hiragino Mincho ProN","Hiragino Mincho Pro","Yu Mincho","YuMincho","Noto Serif CJK JP","Noto Serif JP","Source Han Serif JP","IPAexMincho",serif';
const INK="#2a231d",RUBY_INK="#3a3129",MUTED="#8a7a64";
const font=(px,bold)=>(bold?"600 ":"")+px+"px "+FAMILY;

let mctx=null;
function measurer(F){
  if(!mctx)mctx=document.createElement("canvas").getContext("2d");
  return s=>{mctx.font=font(F);return mctx.measureText(s).width/F};
}

/* 本文の文字列 → 升目に置く単位（unit）の列。ルビ付きは {g:[…], ruby:"…"} でひとかたまり */
function tokens(text,meas){
  const out=[];let i=0;
  while(i<text.length){
    const ch=text[i];
    if(ch==="｜"){
      const j=text.indexOf("《",i),k=j>0?text.indexOf("》",j):-1;
      if(j>0&&k>j){
        const g=tokens(text.slice(i+1,j),meas);
        out.push({g,ruby:text.slice(j+1,k),adv:g.reduce((a,u)=>a+u.adv,0)});i=k+1;continue;
      }
    }
    const code=ch.charCodeAt(0);
    if(code>=0x21&&code<=0x7e){
      let j=i;while(j<text.length&&text.charCodeAt(j)>=0x20&&text.charCodeAt(j)<=0x7e)j++;
      const run=text.slice(i,j);i=j;
      if(/^\d{1,2}$/.test(run)||/^[!?]{1,2}$/.test(run)){out.push({t:run,k:"tcy",adv:1});continue}
      /* 英語は単語ごと（空白のあとで切れる） */
      const words=run.match(/[^ ]+ */g)||[run];
      for(const w of words){const a=meas(w);if(a<=0)continue;out.push({t:w,k:"lat",adv:Math.max(.3,a)})}
      continue;
    }
    const cp=text.codePointAt(i),c=String.fromCodePoint(cp);i+=c.length;
    if(c==="　"){out.push({t:c,k:"sp",adv:1});continue}
    out.push({t:c,k:ROT.includes(c)?"rot":PUNCT.includes(c)?"pun":SMALL.includes(c)?"sm":"c",adv:1});
  }
  return out;
}
const firstChar=u=>u.g?firstChar(u.g[0]||{}):(u.t||"")[0]||"";
const lastChar=u=>u.g?lastChar(u.g[u.g.length-1]||{}):(u.t||"").slice(-1);

/* 段落を行に分ける。各行は [{u, y(em), i(段落の中の単位の番号)}] */
function breakLines(units,N,indent){
  const lines=[];let line=[],pos=Math.min(indent,Math.max(0,N-4)),hang=0;
  const push=()=>{lines.push(line);line=[];pos=0;hang=0};
  for(let i=0;i<units.length;i++){
    let u=units[i];
    if(pos+u.adv>N+1e-6&&line.length){
      /* 行頭禁則：ぶら下げ（2字まで） */
      if(!u.g&&u.adv<=1&&NO_START.includes(firstChar(u))&&hang<2){line.push({u,y:pos,i});pos+=u.adv;hang++;continue}
      /* 行末禁則：開きかっこは次の行へ */
      const carry=[];
      while(line.length>1&&OPEN.includes(lastChar(line[line.length-1].u)))carry.unshift(line.pop());
      push();
      for(const c of carry){line.push({u:c.u,y:pos,i:c.i});pos+=c.u.adv}
    }
    if(u.adv>N&&u.k==="lat"){             /* 1行より長い英単語は字ごとに */
      const parts=[...u.t];units.splice(i,1,...parts.map(t=>({t,k:"lat",adv:u.adv/parts.length})));u=units[i];
    }
    line.push({u,y:pos,i});pos+=u.adv;
  }
  if(line.length)push();
  return lines;
}

function paginate(data,P){
  const F=P.F,L=Math.round(F*1.85*10)/10;
  const mt=P.mt,mb=P.mb,ms=P.ms;
  const N=Math.max(6,Math.floor((P.H-mt-mb)/F));
  const usable=P.W-2*ms;
  const meas=measurer(F);
  const pages=[],heads=[];
  const blocks=data.blocks||[];
  /* 目次の項目 */
  const tocItems=[];
  /* 目次に載せる見出し：最初の「序章」「第一章」などから。作品名と同じ見出し（扉・奥付）は載せない */
  const plain=t=>t.replace(/[\s　]/g,"");
  const title=plain(P.title||"");
  const hs=[];blocks.forEach((b,k)=>{if(b[0]==="h")hs.push({k,t:b[1].join("　")})});
  const firstLab=hs.findIndex(h=>LABEL.test(h.t.split("　")[0]));
  hs.slice(Math.max(0,firstLab)).forEach(h=>{if(!title||plain(h.t)!==title)tocItems.push(h)});
  /* 行は右から左へ。w は直前の行の中心からの距離 */
  let page=null,lastX=0;
  const newPage=start=>{page={lines:[],start,links:[]};pages.push(page);return page};
  const room=(w,size)=>page.lines.length===0||lastX-w-size/2>=ms-.5;
  const addLine=(ln,w)=>{
    const size=ln.size||F;
    if(!room(w,size))newPage(ln.pos||page.start);
    ln.x=page.lines.length===0?P.W-ms-size/2:lastX-w;
    lastX=ln.x;page.lines.push(ln);
  };
  /* 表紙 */
  pages.push({cover:true,lines:[],start:[-2,0],links:[]});
  /* 目次 */
  if(tocItems.length){
    const cap=N-5;
    newPage([-1,0]);
    addLine({kind:"t",size:F*1.35,bold:true,items:[...tokens("目次",meas)].map((u,j)=>({u,y:2+j*1.6})),pos:[-1,0]},F*1.35*2.4);
    tocItems.forEach((it,j)=>{
      let t=it.t;const us=tokens(t,meas);let acc=0,cut=us.length;
      for(let q=0;q<us.length;q++){acc+=us[q].adv;if(acc>cap){cut=q;break}}
      const items=breakLines(us.slice(0,cut),9999,0)[0]||[];
      items.forEach(o=>o.y+=1);
      if(cut<us.length)items.push({u:{t:"…",k:"rot",adv:1},y:cap+1});
      const ln={kind:"toc",size:F,items,target:it.k,pos:[-1,j]};
      addLine(ln,L);
      page.links.push({x0:ln.x-L/2,x1:ln.x+L/2,y0:mt,y1:mt+N*F,target:it.k,line:ln});
    });
  }
  /* 本文 */
  let started=false;
  const blank=()=>{if(page&&page.lines.length&&!page.cover)addLine({kind:"blank",size:F,items:[]},L)};
  blocks.forEach((b,k)=>{
    if(b[0]==="h"){
      newPage([k,0]);started=true;
      heads.push({k,t:b[1].join("　"),page:pages.length-1});
      /* 見出し：「第一章　漂流」は章番号と題に分けて、題を大きく */
      const parts=[];
      for(const s of b[1]){
        const m=s.split("　");
        if(m.length>1&&LABEL.test(m[0]))parts.push({t:m[0],lab:true},{t:m.slice(1).join("　"),lab:false});
        else parts.push({t:s,lab:LABEL.test(s)&&b[1].length>1});
      }
      const anyTitle=parts.some(p=>!p.lab);
      addLine({kind:"blank",size:F,items:[]},F*1.2);
      parts.forEach(p=>{
        const sz=p.lab&&anyTitle?F*1.1:F*1.55;
        const us=tokens(p.t,meas),n=Math.max(4,Math.floor((P.H-mt-mb)/sz)-3);
        breakLines(us,n,0).forEach(items=>{
          items.forEach(o=>o.y+=p.lab?3:4);
          addLine({kind:"t",size:sz,bold:true,items,pos:[k,0]},sz*1.75);
        });
      });
      addLine({kind:"blank",size:F,items:[]},L*1.3);
      return;
    }
    if(!started){newPage([k,0]);started=true}
    if(b[0]==="g"){if(page.lines.length)blank();return}
    if(b[0]==="s"){
      if(page.lines.length)blank();
      const us=tokens(b[1]||"＊",meas),w=us.reduce((a,u)=>a+u.adv,0);
      const items=breakLines(us,9999,0)[0]||[];items.forEach(o=>o.y+=Math.max(0,(N-w)/2));
      addLine({kind:"t",size:F,items,pos:[k,0]},L);
      blank();return;
    }
    if(b[0]==="p"){
      const us=tokens(b[2],meas);
      const lines=breakLines(us,N,b[1]||0);
      lines.forEach(items=>{
        const pos=[k,items.length?items[0].i:0];
        if(!room(L,F))newPage(pos);
        if(page.lines.length===0)page.start=pos;
        addLine({kind:"t",size:F,items,pos},L);
      });
    }
  });
  /* 目次の項目にページ番号 */
  const headPage={};heads.forEach(h=>headPage[h.k]=h.page);
  pages.forEach(p=>p.links.forEach(l=>{l.page=headPage[l.target];if(l.line)l.line.num=String((l.page||0)+1)}));
  const P2=Object.assign({},P,{N,L});
  const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1];
  return{pages,heads,P:P2,
    /* 位置（[ブロック番号, 単位番号]）を含むページ */
    find(pos){
      if(!pos)return 0;
      let lo=1,hi=pages.length-1,ans=0;
      while(lo<=hi){const m=(lo+hi)>>1;if(cmp(pages[m].start,pos)<=0){ans=m;lo=m+1}else hi=m-1}
      return ans;
    }};
}

/* ---- 描く ---- */
let noise=null;
function paperNoise(){
  if(noise)return noise;
  const c=document.createElement("canvas");c.width=c.height=128;
  const x=c.getContext("2d"),im=x.createImageData(128,128),d=im.data;
  for(let j=0;j<d.length;j+=4){const v=Math.random();d[j]=d[j+1]=d[j+2]=v<.5?60:255;d[j+3]=Math.random()*10}
  x.putImageData(im,0,0);noise=c;return c;
}
function drawUnit(ctx,u,x,y,size){
  const cy=y+size/2;
  switch(u.k){
    case "sp":return;
    case "rot":ctx.save();ctx.translate(x,cy);ctx.rotate(Math.PI/2);ctx.fillText(u.t,0,0);ctx.restore();return;
    case "pun":ctx.fillText(u.t,x+size*.58,cy-size*.58);return;
    case "sm":ctx.fillText(u.t,x+size*.1,cy-size*.09);return;
    case "lat":ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/2);ctx.textAlign="left";ctx.fillText(u.t,0,0);ctx.restore();return;
    case "tcy":{const w=ctx.measureText(u.t).width,s=Math.min(1,size*.92/w);ctx.save();ctx.translate(x,cy);ctx.scale(s,1);ctx.fillText(u.t,0,0);ctx.restore();return}
    default:ctx.fillText(u.t,x,cy);
  }
}
function drawItems(ctx,items,x,top,size,bold){
  ctx.font=font(size,bold);
  for(const it of items){
    const u=it.u,y=top+it.y*size;
    if(u.g){
      let yy=y;for(const g of u.g){drawUnit(ctx,g,x,yy,size);yy+=g.adv*size}
      /* ルビ */
      const rs=size*.5,rt=[...u.ruby],span=u.adv*size,n=rt.length;
      ctx.save();ctx.font=font(rs,bold);ctx.fillStyle=RUBY_INK;
      const stepY=n*rs<=span?span/n:rs,start=n*rs<=span?y:y+(span-n*rs)/2;
      rt.forEach((c,j)=>{
        const k=ROT.includes(c)?"rot":PUNCT.includes(c)?"pun":SMALL.includes(c)?"sm":"c";
        drawUnit(ctx,{t:c,k},x+size*.5+rs*.55,start+stepY*j+(stepY-rs)/2,rs);
      });
      ctx.restore();ctx.font=font(size,bold);
    }else drawUnit(ctx,u,x,y,size);
  }
}
function drawPage(ctx,page,P,scale,index){
  ctx.save();ctx.scale(scale,scale);
  ctx.fillStyle="rgb(248,241,222)";ctx.fillRect(0,0,P.W,P.H);
  try{ctx.fillStyle=ctx.createPattern(paperNoise(),"repeat");ctx.fillRect(0,0,P.W,P.H)}catch(e){}
  ctx.fillStyle=INK;ctx.textAlign="center";ctx.textBaseline="middle";
  for(const ln of page.lines){
    if(ln.kind==="blank")continue;
    drawItems(ctx,ln.items,ln.x,P.mt,ln.size,ln.bold);
    if(ln.kind==="toc"&&ln.num){
      /* 目次：点線とページ番号（下そろえ） */
      const endY=P.mt+((ln.items.length?ln.items[ln.items.length-1].y+1:1))*ln.size,numY=P.mt+(P.N-1)*P.F;
      ctx.save();ctx.strokeStyle=MUTED;ctx.lineWidth=Math.max(.7,ln.size*.06);ctx.setLineDash([1,ln.size*.32]);ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(ln.x,endY+ln.size*.5);ctx.lineTo(ln.x,numY-ln.size*.4);ctx.stroke();ctx.restore();
      ctx.save();ctx.font=font(ln.size*.82);const w=ctx.measureText(ln.num).width,s=Math.min(1,ln.size*.95/w);
      ctx.translate(ln.x,numY+ln.size/2);ctx.scale(s,1);ctx.fillText(ln.num,0,0);ctx.restore();
    }
  }
  /* ノンブル（ページ番号） */
  if(index!=null){ctx.save();ctx.fillStyle=MUTED;ctx.font=font(Math.max(10,P.F*.62));ctx.fillText(String(index+1),P.W/2,P.H-P.mb*.5);ctx.restore()}
  ctx.restore();
}
/* すべての字（フォント読み込み用） */
function allChars(data){
  const s=new Set();for(const b of data.blocks||[]){const t=b[0]==="h"?b[1].join(""):b[0]==="p"?b[2]:b[0]==="s"?(b[1]||""):"";for(const c of t)s.add(c)}
  "目次0123456789…".split("").forEach(c=>s.add(c));
  return[...s].join("");
}
window.Tate={paginate,drawPage,allChars,FAMILY,font};
})();
