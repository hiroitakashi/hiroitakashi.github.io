/* 小説の一覧（WORKS）とページの動き */
(function(){
const TPL=document.getElementById("tpl");document.getElementById("root").append(TPL.content.cloneNode(true));
const WORKS=[
 {t:"民の火種",cover:"files/covers-tami.jpg",pdf:"files/pdf-tami.pdf",who:"廣居図書忠起",era:"江戸中期・米沢藩",d:"破産寸前の米沢藩。鷹山の改革と七家騒動のさなか、兄を売らず主を欺かず、ただ帳面を見つめた若き藩士の物語。"},
 {t:"天平の灯",cover:"files/covers-ganjin.jpg",pdf:"files/pdf-ganjin.pdf",who:"鑑真",era:"奈良時代・唐から日本へ",d:"六度目の渡海で、盲いた老僧は薩摩の浜の砂をすくった。栄叡と普照、二人の日本僧との十二年。"},
 {t:"月かげの里",cover:"files/covers-honen.jpg",pdf:"files/pdf-honen.pdf",who:"法然",era:"平安末〜鎌倉",d:"「仇を討つな」と遺した父の言葉から、恨みの連鎖を断つ道としての念仏にたどり着くまで。"},
 {t:"白道",cover:"files/covers-shinran.jpg",pdf:"files/pdf-shinran.pdf",who:"親鸞",era:"鎌倉時代",d:"煩悩を一つも捨てられぬまま、九十年かけて歩みきった一本の白い道。妻・恵信尼の手紙を背骨に。"},
 {t:"花は愛惜に散る",cover:"files/covers-dogen.jpg",pdf:"files/pdf-dogen.pdf",who:"道元",era:"鎌倉時代",d:"八つで母を見送った日、香の煙の行方を追った少年は、人はなぜ消え、消えるものをなぜ愛しく思うのかと問いつづけた。"},
 {t:"紅顔と白骨",cover:"files/covers-rennyo.jpg",pdf:"files/pdf-rennyo.pdf",who:"蓮如",era:"室町時代",d:"五たび妻を娶り二十七人の子をなし、八十を過ぎてなお赤子を抱いた男を、十男・実悟が書き残す。"},
 {t:"三浦按針",cover:"files/covers-anjin.jpg",pdf:"files/pdf-anjin.pdf",who:"ウィリアム・アダムス",era:"江戸初期・全七巻",d:"帰れない男が、江戸の河岸の舟大工の娘・鶴と巣をつくる。海の向こうの妻メアリーとの二十年。"},
 {t:"沖の白帆",cover:"files/covers-bunzaemon.jpg",pdf:"files/pdf-bunzaemon.pdf",who:"紀伊國屋文左衛門",era:"江戸前期・元禄",d:"嵐の海へ白帆を張り、江戸じゅうの度肝を抜いた男。深川の庵で老いた意荃が、訪ねてきた娘に語る栄華と没落。"},
 {t:"見試しの川",cover:"files/covers-hirata.jpg",pdf:"files/pdf-hirata.pdf",who:"平田靱負",era:"江戸中期・宝暦治水",d:"遠い薩摩から美濃の輪中へ。三つの大河に挑み、工事を終えて逝った総奉行と、名も残らなかった侍たちの一年と三月。"},
 {t:"あべこべ宿",cover:"files/covers-kokudaya.jpg",pdf:"files/pdf-kokudaya.pdf",who:"穀田屋十三郎",era:"江戸中期・仙台藩吉岡宿",d:"百姓が殿様に金を貸す。泣く伝馬の馬、化かす狐、口をきく一文銭。八年かけて千両を貯めた九人の、あべこべで奇想天外な物語。"},
 {t:"ひりりと辛い",cover:"files/covers-karaku.jpg",pdf:"files/pdf-karaku.pdf",who:"初代三笑亭可楽",era:"江戸後期・寄席ばなし",d:"線香一本が灰になるまでに、客のお題で一席こしらえる。馬喰町の櫛挽き職人から、江戸に寄席の灯をともした男へ。"},
 {t:"灯ともす人",cover:"files/covers-yugaku.jpg",pdf:"files/pdf-yugaku.pdf",who:"大原幽学",era:"江戸後期・下総",d:"雪の夜、一人の博打打ちが泣いた。そこから村は生まれ変わった。干潟の村に先祖株を説き、百姓とともに生きた男の生涯。"},
 {t:"波頭",cover:"files/covers-manjiro.jpg",pdf:"files/pdf-manjiro.pdf",who:"ジョン万次郎",era:"幕末〜明治",d:"字も読めぬ土佐の漁師の少年が、鳥島から捕鯨船へ。日本とアメリカのあいだに架けたただ一人の橋。"},
 {t:"日出づる涯",cover:"files/covers-satow.jpg",pdf:"files/pdf-satow.pdf",who:"アーネスト・サトウ",era:"幕末〜明治・長編",d:"船上から見えた島影に始まる、英国人通訳官の目に映った幕末日本。植木職人の娘・兼と子どもたちへの、生涯消えなかった想い。"},
 {t:"到る処青山あり",cover:"files/covers-tanaka.jpg",pdf:"files/pdf-tanaka.pdf",who:"田中光顕",era:"幕末〜昭和・長編",d:"土佐佐川の少年は、志士の仲間を次々に見送り、ひとり昭和まで生き残った。「最後の志士」が語り継いだ、散った者たちの青山。"},
 {t:"暗闇の影",cover:"files/covers-kurayami.jpg",pdf:"files/pdf-kurayami.pdf",who:"木立凌庵",era:"幕末・慶応二年",d:"将軍家茂と孝明帝、二つの死をつなぐ護符と香。町医者の倅が、書かれなかった歴史の影を追う。"},
 {t:"壁のなめくじ",cover:"files/covers-shinsho.jpg",pdf:"files/pdf-shinsho.pdf",who:"五代目古今亭志ん生",era:"明治〜昭和",d:"沼の上の長屋で、壁を這う銀の筋を女房は「きれい」と言った。のろくたって、止まらなかった噺家の生涯。"},
 {t:"まかり通る",cover:"files/covers-tesshu.jpg",pdf:"files/pdf-tesshu.pdf",who:"山岡鉄舟",era:"幕末〜明治",d:"「朝敵徳川慶喜家来、山岡鉄太郎まかり通る」。官軍の陣中を名乗って歩き、駿府で西郷と向き合った大男の、剣と禅と書の生涯。"},
 {t:"鈴の屋",cover:"files/covers-norinaga.jpg",pdf:"files/pdf-norinaga.pdf",who:"本居宣長",era:"江戸中期",d:"昼は子供の熱を診る町医者、夜は二階の書斎で鈴を鳴らし古事記に向かう。新上屋の一夜から三十五年、師に託された頂に立った人の生涯。"}
];
let state;
try{state=window.SITE_STATE}catch(e){state={photos:[],youtube:{name:"",url:"",videos:[]}}}
state.photos=state.photos||[];state.songs=state.songs||[];state.comments=state.comments||[];state.youtube=Object.assign({name:"",url:"",videos:[]},state.youtube||{});

const $=s=>document.querySelector(s);
const el=(tag,props={},kids=[])=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(props)){if(k==="text")n.textContent=v;else if(k.startsWith("on"))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v)}for(const c of[].concat(kids))if(c)n.append(c);return n};
const safeUrl=u=>{try{const x=new URL(u);return(x.protocol==="https:"||x.protocol==="http:")?x.href:""}catch(e){return""}};

/* 作品 */
const wl=$("#works-list");
WORKS.forEach(w=>wl.append(el("li",{class:"work"},[(w.cover?el("a",{class:"cover",href:w.pdf||w.cover,target:"_blank",rel:"noopener","aria-label":w.t+"をPDFで読む"},el("img",{src:w.cover,alt:"『"+w.t+"』表紙",loading:"lazy",width:"424",height:"600"})):null),el("h3",{class:"wt",text:w.t}),el("div",{class:"who",text:w.who}),el("div",{class:"era",text:w.era}),el("p",{text:w.d}),w.pdf?el("div",{class:"read"},[el("a",{href:w.pdf,target:"_blank",rel:"noopener",text:"PDFで読む"}),el("a",{href:w.pdf,download:w.t+".pdf",class:"dl",text:"ダウンロード"})]):null])));

wl.addEventListener("click",async e=>{const a=e.target.closest("a.dl");if(!a||!downloads)return;e.preventDefault();const t=a.textContent;a.textContent="準備中…";try{const r=await fetch(a.getAttribute("href"));if(!r.ok)throw 0;await downloads.save({filename:a.getAttribute("download"),data:await r.blob()})}catch(err){if(!(err&&err.code==="declined"))window.open(a.getAttribute("href"),"_blank","noopener")}a.textContent=t});

/* トップへ戻るボタン */
const totop=$("#totop");
const syncTop=()=>{totop.hidden=scrollY<360};addEventListener("scroll",syncTop,{passive:true});syncTop();
totop.addEventListener("click",()=>scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));

/* ページの切り替え（トップ／各カテゴリー） */
const PAGES={works:"小説",songs:"作曲",photos:"写真集",youtube:"YouTubeチャンネル",comments:"コメント"};
function route(){
  const h=(location.hash||"").slice(1);
  const page=window.FILE_PAGE||(PAGES[h]?h:"top");
  document.documentElement.dataset.page=page;
  document.title=(PAGES[page]?PAGES[page]+" | ":"")+"Yellowman's Room";
  document.querySelectorAll(".subnav a").forEach(a=>a.toggleAttribute("aria-current",a.dataset.p===page));
  scrollTo(0,0);syncTop();
}
addEventListener("hashchange",route);route();

/* 訪問者カウンター（公開中のホームページのトップだけ） */
if(window.FILE_PAGE==="top"){
  const c=$("#counter");
  const img=el("img",{src:"https://hits.sh/hiroitakashi.github.io.svg?style=flat-square&label=%E3%81%94%E8%A8%AA%E5%95%8F&color=24476b&labelColor=8a949b",alt:"訪問者数",height:"20",decoding:"async"});
  img.addEventListener("error",()=>{c.hidden=true});
  c.append(img);c.hidden=false;
}

/* トップの写真スライドショー */
(function(){
  const slides=[...document.querySelectorAll("#hero .slide")];const dots=$("#dots");if(slides.length<2)return;
  let cur=0,timer=null;
  const btns=slides.map((_,i)=>{const b=el("button",{type:"button","aria-label":(i+1)+"枚目の写真"});b.addEventListener("click",()=>{show(i);restart()});dots.append(b);return b});
  function show(i){slides[cur].classList.remove("on");btns[cur].setAttribute("aria-current","false");cur=(i+slides.length)%slides.length;slides[cur].classList.add("on");btns[cur].setAttribute("aria-current","true")}
  function restart(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&document.documentElement.dataset.page!=="works"&&getComputedStyle($("#top")).display!=="none")show(cur+1)},6000)}
  btns[0].setAttribute("aria-current","true");restart();
})();

/* 拡大表示 */
const lb=$("#lightbox");
function openLb(p){$("#lb-img").src=p.url;$("#lb-img").alt=p.caption||"写真";$("#lb-cap").textContent=p.caption||"";lb.hidden=false;$("#lb-close").focus()}
function closeLb(){lb.hidden=true;$("#lb-img").removeAttribute("src")}
$("#lb-close").addEventListener("click",closeLb);
lb.addEventListener("click",e=>{if(e.target===lb)closeLb()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!lb.hidden)closeLb()});

let owner=null; // {assets, artifact}
let dirty=false;

function renderGallery(){
  const area=$("#gallery-area");area.replaceChildren();
  if(!state.photos.length){
    area.append(el("div",{class:"empty",text:owner?"まだ写真がありません。下の「写真を追加」から載せてください。":"写真集は準備中です。"}));
    return;
  }
  const g=el("div",{class:"gallery"});
  state.photos.forEach((p,i)=>{
    const fig=el("figure",{class:"ph"});
    const img=el("img",{src:p.url,alt:p.caption||"写真",loading:"lazy"});
    fig.append(el("button",{class:"open",type:"button","aria-label":"大きく見る",onclick:()=>openLb(p)},img));
    if(owner){
      const inp=el("input",{type:"text",id:"cap-"+p.id,value:p.caption||"",placeholder:"説明（場所・季節など）","aria-label":"写真の説明"});
      inp.addEventListener("input",()=>{p.caption=inp.value;markDirty()});
      fig.append(el("div",{class:"edit"},[inp,el("button",{class:"btn warn",type:"button",text:"外す",onclick:()=>{state.photos.splice(i,1);markDirty();renderGallery()}})]));
    }else{
      fig.append(el("figcaption",{text:p.caption||""}));
    }
    g.append(fig);
  });
  area.append(g);
}

function renderYt(){
  const area=$("#yt-area");area.replaceChildren();
  const y=state.youtube;const url=safeUrl(y.url);
  const chs=(y.channels||[]).filter(c=>safeUrl(c.url));
  if(chs.length){
    const wrap=el("div",{class:"yt-card yt-channels"},[el("div",{class:"ch",text:"チャンネルを選んでください"})]);
    const row=el("div",{class:"yt-btns"});
    chs.forEach(c=>row.append(el("a",{class:"go",href:safeUrl(c.url),target:"_blank",rel:"noopener"},[el("span",{class:"yt-mark","aria-hidden":"true",text:"▶"}),document.createTextNode(c.name||"YouTube")])));
    wrap.append(row);area.append(wrap);
  }else{
  const card=el("div",{class:"yt-card"});
  if(url){
    card.append(el("div",{class:"ch",text:y.name||"廣居隆史のチャンネル"}));
    card.append(el("a",{class:"go",href:url,target:"_blank",rel:"noopener",text:"YouTubeで見る"}));
  }else{
    card.append(el("div",{class:"ch",text:"チャンネルは近日公開"}));
    card.append(el("p",{class:"status",text:owner?"下の欄にチャンネルのURLを入れてください。":"準備ができしだい、ここにリンクを載せます。"}));
  }
  area.append(card);
  }
  const vids=(y.videos||[]).filter(v=>safeUrl(v.url));
  if(vids.length){
    const c2=el("div",{class:"yt-card"},[el("div",{class:"ch",text:"おすすめの動画"})]);
    const ul=el("ul",{class:"vids"});
    vids.forEach(v=>ul.append(el("li",{},el("a",{href:safeUrl(v.url),target:"_blank",rel:"noopener",text:v.title||v.url}))));
    c2.append(ul);area.append(c2);
  }
}


/* 作曲 */
let downloads=null;
let playing=null;
function extOf(name,type){const m=(name||"").match(/\.([a-z0-9]+)$/i);if(m)return m[1].toLowerCase();if(/mp4/.test(type))return "mp4";if(/mpeg|mp3/.test(type))return "mp3";if(/wav/.test(type))return "wav";if(/m4a|aac/.test(type))return "m4a";return "mp3"}
function fileBase(t){return (t||"song").replace(/[\\/:*?"<>|]/g,"").trim().slice(0,80)||"song"}
async function downloadSong(sg,btn,st){
  if(!downloads){st.textContent="この画面ではダウンロードできません。";return}
  btn.disabled=true;st.textContent="準備しています…";
  try{
    const res=await fetch(sg.url);if(!res.ok)throw {code:"fetch"};
    const blob=await res.blob();
    let filename,data;
    if(sg.ext==="mp4"){filename=fileBase(sg.title)+".mp4";data=blob}
    else{
      if(!window.JSZip)throw {code:"zip"};
      const zip=new JSZip();zip.file(fileBase(sg.title)+"."+sg.ext,blob);
      data=await zip.generateAsync({type:"blob"});filename=fileBase(sg.title)+".zip";
    }
    await downloads.save({filename,data});st.textContent="";
  }catch(e){
    const c=e&&e.code;
    st.textContent=c==="declined"?"":c==="rate_limited"?"少し待ってからもう一度押してください。":"ダウンロードできませんでした（"+(c||"エラー")+"）。";
  }finally{btn.disabled=false}
}
const CATS=["邦楽","洋楽","インストゥルメンタル"];
let player=null,pAudio=null,pTitle=null,curLi=null,curSong=null;
function ensurePlayer(){
  if(player)return;
  pAudio=el("audio",{controls:"",preload:"none"});
  pTitle=el("span",{class:"ptt"});
  const close=el("button",{class:"pclose",type:"button","aria-label":"再生を止めて閉じる",text:"×"});
  close.addEventListener("click",()=>{pAudio.pause();player.hidden=true;document.body.classList.remove("playing");if(curLi)curLi.classList.remove("on");curLi=null;curSong=null});
  player=el("div",{class:"player",role:"region","aria-label":"再生中の曲"},[el("span",{class:"plabel",text:"NOW PLAYING"}),pTitle,pAudio,close]);
  player.hidden=true;document.body.append(player);
  pAudio.addEventListener("ended",()=>{ // 同じ分類の次の曲へ
    if(!curSong)return;const list=state.songs.filter(x=>x.url&&(x.cat||CATS[0])===(curSong.cat||CATS[0]));const j=list.indexOf(curSong);
    if(j>=0&&j<list.length-1){const nx=list[j+1];const li=document.querySelector('.song[data-id="'+CSS.escape(nx.id||nx.url)+'"]');playSong(nx,li)}
  });
}
function playSong(sg,li){
  ensurePlayer();
  if(curSong===sg&&!pAudio.paused){pAudio.pause();return}
  if(curSong!==sg){pAudio.src=sg.url;curSong=sg}
  if(curLi)curLi.classList.remove("on");curLi=li;if(li)li.classList.add("on");
  pTitle.textContent=sg.title||"無題";player.hidden=false;document.body.classList.add("playing");
  pAudio.play().catch(()=>{});
}
function songRow(sg,i,num){
    const li=el("li",{class:"song","data-id":sg.id||sg.url||""});
    if(curSong===sg)li.classList.add("on");
    const play=el(sg.url?"button":"a",sg.url?{class:"play",type:"button","aria-label":(sg.title||"無題")+"を再生"}:{class:"play",href:safeUrl(sg.suno)||"#",target:"_blank",rel:"noopener"},[el("span",{class:"pi","aria-hidden":"true"}),el("span",{class:"tt",text:sg.title||"無題",title:sg.title||""})]);
    if(sg.url)play.addEventListener("click",()=>playSong(sg,li));
    const st=el("span",{class:"status"});
    const acts=el("div",{class:"acts"});
    if(sg.url&&downloads){const b=el("button",{class:"dlbtn",type:"button",text:"ダウンロード"});b.addEventListener("click",()=>downloadSong(sg,b,st));acts.append(b)}
    else if(sg.url&&!window.claude){acts.append(el("a",{class:"dlbtn",href:sg.url,download:fileBase(sg.title)+"."+(sg.url.split(".").pop()),text:"ダウンロード"}))}
    if(safeUrl(sg.suno))acts.append(el("a",{class:"dlbtn ghost",href:safeUrl(sg.suno),target:"_blank",rel:"noopener",text:"SUNO"}));
    li.append(el("span",{class:"no",text:String(num).padStart(2,"0")}),play,acts,st);
    if(owner){
      const ti=el("input",{type:"text",id:"st-"+i,value:sg.title||"",placeholder:"曲名","aria-label":"曲名"});
      const no=el("input",{type:"text",id:"sn-"+i,value:sg.note||"",placeholder:"ひとこと（作った日など）","aria-label":"ひとこと"});
      const su=el("input",{type:"url",id:"su-"+i,value:sg.suno||"",placeholder:"SUNOの曲のURL（あれば）","aria-label":"SUNOのURL"});
      const ca=el("select",{id:"sc-"+i,"aria-label":"分類"});CATS.forEach(c=>{const o=el("option",{value:c,text:c});if((sg.cat||CATS[0])===c)o.selected=true;ca.append(o)});
      ti.addEventListener("change",()=>{sg.title=ti.value;markDirty();renderSongs()});
      no.addEventListener("change",()=>{sg.note=no.value;markDirty();renderSongs()});
      su.addEventListener("change",()=>{sg.suno=su.value.trim();markDirty();renderSongs()});
      ca.addEventListener("change",()=>{sg.cat=ca.value;markDirty();renderSongs()});
      const up=el("button",{class:"btn ghost",type:"button",text:"↑",title:"上へ","aria-label":"上へ",onclick:()=>{let j=i-1;while(j>=0&&(state.songs[j].cat||CATS[0])!==(sg.cat||CATS[0]))j--;if(j>=0){[state.songs[j],state.songs[i]]=[state.songs[i],state.songs[j]];markDirty();renderSongs()}}});
      const rm=el("button",{class:"btn warn",type:"button",text:"外す",onclick:()=>{state.songs.splice(i,1);markDirty();renderSongs()}});
      li.append(el("div",{class:"edit"},[ti,no,su,ca,up,rm]));
    }
    return li;
}
function renderSongs(){
  const area=$("#songs-area");area.replaceChildren();
  if(!state.songs.length){area.append(el("div",{class:"empty",text:owner?"まだ曲がありません。下の「曲を追加」から載せてください。":"曲は準備中です。"}));return}
  const cats=[...CATS];state.songs.forEach(sg=>{if(sg.cat&&!cats.includes(sg.cat))cats.push(sg.cat)});
  cats.forEach((c,ci)=>{
    const list=state.songs.map((sg,i)=>[sg,i]).filter(([sg])=>(sg.cat||CATS[0])===c);
    if(!list.length)return;
    const det=el("details",{class:"folder"});det.open=true;
    det.append(el("summary",{},[el("span",{class:"fname",text:c}),el("span",{class:"fcount",text:list.length+"曲"})]));
    const ol=el("ol",{class:"songs"});
    list.forEach(([sg,i],k)=>ol.append(songRow(sg,i,k+1)));
    det.append(ol);area.append(det);
  });
}
function renderSongOwner(){
  const so=$("#song-owner");so.hidden=false;so.replaceChildren();
  const file=el("input",{type:"file",id:"song-file",accept:"audio/*,video/mp4,.mp3,.m4a,.wav,.mp4",multiple:""});
  const st=el("span",{class:"status"});
  const upCat=el("select",{id:"song-cat","aria-label":"入れる分類"});CATS.forEach(c=>upCat.append(el("option",{value:c,text:c})));
  file.addEventListener("change",async()=>{
    const fs=[...file.files];if(!fs.length)return;file.disabled=true;
    for(let i=0;i<fs.length;i++){
      const f=fs[i];st.textContent=`アップロード中… ${i+1} / ${fs.length}`;
      try{const r=await owner.assets.upload(f);state.songs.push({id:r.id,url:r.url,ext:extOf(f.name,r.contentType||f.type),title:f.name.replace(/\.[^.]+$/,""),cat:upCat.value,note:"",suno:""})}
      catch(e){const c=e&&e.code;st.textContent=c==="unsupported_type"?`「${f.name}」はこの形式では載せられません。SUNOの「動画（MP4）」でダウンロードした曲なら載せられます。`:`「${f.name}」を載せられませんでした（${c||"エラー"}）。`}
    }
    file.value="";file.disabled=false;markDirty();renderSongs();
    if(!st.textContent.includes("載せられ"))st.textContent="追加しました。曲名を直したら「変更を保存して公開」を押してください。";
  });
  const lt=el("input",{type:"text",id:"link-title",placeholder:"曲名","aria-label":"曲名"});
  const lu=el("input",{type:"url",id:"link-url",placeholder:"SUNOの曲のURL","aria-label":"SUNOのURL"});
  const add=el("button",{class:"btn ghost",type:"button",text:"リンクで加える",onclick:()=>{if(!safeUrl(lu.value.trim())){lu.focus();return}state.songs.push({title:lt.value.trim()||"無題",cat:upCat.value,note:"",suno:lu.value.trim()});lt.value="";lu.value="";markDirty();renderSongs()}});
  so.append(el("div",{class:"owner"},[el("h3",{text:"曲を追加（あなただけに表示）"}),el("p",{class:"status",text:"SUNOからダウンロードした曲のファイル（MP3またはMP4）を選んでください。複数まとめて選べます。"}),el("div",{class:"row"},[el("span",{class:"status",text:"入れる分類："}),upCat,file]),st,el("h3",{text:"ファイルがなければ、SUNOのリンクだけでも載せられます"}),el("div",{class:"row"},[lt,lu,add])]));
}


/* コメント */
const ADDR="hiroitakashi@gmail.com";
function renderComments(){
  const area=$("#cm-list");area.replaceChildren();
  if(!state.comments.length){area.append(el("div",{class:"empty",text:"まだコメントはありません。最初のひとことをお待ちしています。"}));return}
  const ul=el("ul",{class:"cms"});
  state.comments.forEach((c,i)=>{
    const li=el("li",{class:"cm"},[el("div",{class:"hd"},[el("span",{class:"nm",text:c.name||"匿名"}),c.about?el("span",{class:"ab",text:c.about}):null,c.date?el("span",{class:"dt",text:c.date}):null]),el("p",{text:c.text||""})]);
    if(c.reply)li.append(el("div",{class:"reply"},[el("b",{text:"廣居より"}),document.createTextNode(c.reply)]));
    if(owner){
      const rp=el("button",{class:"btn ghost",type:"button",text:c.reply?"返事を直す":"返事を書く",onclick:()=>{const box=li.querySelector(".rbox");box.hidden=!box.hidden}});
      const rm=el("button",{class:"btn warn",type:"button",text:"外す",onclick:()=>{state.comments.splice(i,1);markDirty();renderComments()}});
      const ta=el("textarea",{id:"rp-"+i,rows:"3","aria-label":"返事"});ta.value=c.reply||"";
      const ok=el("button",{class:"btn",type:"button",text:"返事を入れる",onclick:()=>{c.reply=ta.value.trim();markDirty();renderComments()}});
      const box=el("div",{class:"rbox"},[ta,el("div",{class:"tools"},[ok])]);box.hidden=true;box.style.cssText="display:grid;gap:6px;margin-top:8px";
      li.append(el("div",{class:"tools"},[rp,rm]),box);
    }
    ul.append(li);
  });
  area.append(ul);
}
function draft(){const n=$("#cm-name").value.trim(),a=$("#cm-about").value.trim(),t=$("#cm-text").value.trim();return{n,a,t,subject:"ホームページへのコメント"+(a?"（"+a+"）":""),body:"お名前："+(n||"匿名")+"\nどれについて："+(a||"")+"\n\n"+t+"\n"}}
async function copyText(txt,st,okMsg){try{await navigator.clipboard.writeText(txt);st.textContent=okMsg}catch(e){st.textContent="コピーできませんでした。文字を選んでコピーしてください。"}}
$("#cm-form").addEventListener("submit",e=>{
  e.preventDefault();const d=draft(),st=$("#cm-status");
  if(!d.t){st.textContent="コメントを書いてから送ってください。";$("#cm-text").focus();return}
  const a=el("a",{href:"mailto:"+ADDR+"?subject="+encodeURIComponent(d.subject)+"&body="+encodeURIComponent(d.body)});document.body.append(a);a.click();a.remove();
  st.textContent="メールソフトで送信してください。開かない場合は「文面をコピー」で "+ADDR+" へお送りください。";
});
$("#cm-copy").addEventListener("click",()=>{const d=draft(),st=$("#cm-status");if(!d.t){st.textContent="コメントを書いてからコピーしてください。";return}copyText("件名："+d.subject+"\n"+d.body,st,"文面をコピーしました。"+ADDR+" 宛てのメールに貼り付けて送ってください。")});
$("#cm-addr-copy").addEventListener("click",()=>copyText(ADDR,$("#cm-status"),"アドレスをコピーしました。"));
function renderCommentOwner(){
  const co=$("#cm-owner");co.hidden=false;co.replaceChildren();
  const nm=el("input",{type:"text",id:"oc-name",placeholder:"お名前","aria-label":"お名前"});
  const ab=el("input",{type:"text",id:"oc-about",placeholder:"どれについて","aria-label":"どれについて"});
  const dt=el("input",{type:"text",id:"oc-date",placeholder:"日付","aria-label":"日付"});
  const d=new Date();dt.value=d.getFullYear()+"年"+(d.getMonth()+1)+"月"+d.getDate()+"日";
  const tx=el("textarea",{id:"oc-text",rows:"4",placeholder:"届いたコメントを貼り付け","aria-label":"コメント"});
  const st=el("span",{class:"status"});
  const add=el("button",{class:"btn",type:"button",text:"コメントを公開欄に加える",onclick:()=>{if(!tx.value.trim()){tx.focus();return}state.comments.unshift({name:nm.value.trim()||"匿名",about:ab.value.trim(),date:dt.value.trim(),text:tx.value.trim(),reply:""});nm.value="";ab.value="";tx.value="";markDirty();renderComments();st.textContent="加えました。「変更を保存して公開」で公開されます。"}});
  co.append(el("div",{class:"owner"},[el("h3",{text:"届いたコメントを載せる（あなただけに表示）"}),el("div",{class:"row"},[nm,ab,dt]),tx,el("div",{class:"row"},[add]),st]));
}

/* 持ち主だけの編集欄 */
const saveBtn=el("button",{class:"btn",type:"button",text:"変更を保存して公開",disabled:"",onclick:save});
const saveStatus=el("span",{class:"status",text:""});
function markDirty(){dirty=true;saveBtn.removeAttribute("disabled");saveStatus.textContent="保存していない変更があります。"}

function renderOwner(){
  const po=$("#photo-owner");po.hidden=false;po.replaceChildren();
  const file=el("input",{type:"file",id:"photo-file",accept:"image/*",multiple:""});
  const st=el("span",{class:"status"});
  file.addEventListener("change",async()=>{
    const fs=[...file.files];if(!fs.length)return;
    file.disabled=true;
    for(let i=0;i<fs.length;i++){
      st.textContent=`アップロード中… ${i+1} / ${fs.length}`;
      try{const r=await owner.assets.upload(fs[i]);state.photos.push({id:r.id,url:r.url,caption:""})}
      catch(e){st.textContent=`「${fs[i].name}」を載せられませんでした（${e&&e.code||"エラー"}）。20MBまでの画像を選んでください。`}
    }
    file.value="";file.disabled=false;markDirty();renderGallery();
    st.textContent="追加しました。説明を書いたら「変更を保存して公開」を押してください。";
  });
  po.append(el("div",{class:"owner"},[el("h3",{text:"写真を追加（あなただけに表示）"}),el("div",{class:"row"},[file]),st]));

  const yo=$("#yt-owner");yo.hidden=false;yo.replaceChildren();
  const nm=el("input",{type:"text",id:"yt-name",value:state.youtube.name,placeholder:"チャンネル名","aria-label":"チャンネル名"});
  const ur=el("input",{type:"url",id:"yt-url",value:state.youtube.url,placeholder:"https://www.youtube.com/@…","aria-label":"チャンネルのURL"});
  nm.addEventListener("input",()=>{state.youtube.name=nm.value;markDirty()});
  ur.addEventListener("input",()=>{state.youtube.url=ur.value.trim();markDirty()});
  const vt=el("input",{type:"text",id:"vid-title",placeholder:"動画の題名","aria-label":"動画の題名"});
  const vu=el("input",{type:"url",id:"vid-url",placeholder:"動画のURL","aria-label":"動画のURL"});
  const list=el("ul",{class:"vids"});
  const drawList=()=>{list.replaceChildren();state.youtube.videos.forEach((v,i)=>list.append(el("li",{},[el("span",{text:v.title||v.url}),el("button",{class:"btn warn",type:"button",text:"外す",onclick:()=>{state.youtube.videos.splice(i,1);drawList();markDirty();renderYt()}})])))};
  drawList();
  const add=el("button",{class:"btn ghost",type:"button",text:"動画を加える",onclick:()=>{if(!safeUrl(vu.value.trim())){vu.focus();return}state.youtube.videos.push({title:vt.value.trim(),url:vu.value.trim()});vt.value="";vu.value="";drawList();markDirty();renderYt()}});
  yo.append(el("div",{class:"owner"},[el("h3",{text:"チャンネルの設定（あなただけに表示）"}),el("div",{class:"row"},[nm,ur]),el("h3",{text:"おすすめの動画"}),el("div",{class:"row"},[vt,vu,add]),list]));
  const bar=$("#owner-bar");bar.hidden=false;document.body.classList.add("owner-on");bar.replaceChildren(el("div",{class:"wrap row"},[el("span",{class:"status",text:"編集モード（あなただけに表示）"}),saveBtn,saveStatus]));
}

/* 自分自身を書き直して公開 */
function buildDoc(){
  const reset=(document.head.querySelector("style")||{textContent:""}).textContent;
  const json=JSON.stringify(state).replace(/</g,"\\u003c");
  const style=document.getElementById("page-style").textContent;
  const app=document.getElementById("app").textContent;
  return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+reset+'</style></head><body>'
   +'<title>Yellowman&#39;s Room</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
   +'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
   +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Poiret+One&display=swap">\n'
   +'<style id="page-style">'+style+'</style>\n'
   +'<template id="tpl">'+TPL.innerHTML+'</template>\n<div id="root"></div>\n'
   +'<script type="application/json" id="site-state">'+json+'</scr'+'ipt>\n'
   +'<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></scr'+'ipt>\n'
   +'<script id="app">'+app+'</scr'+'ipt>'
   +'</body></html>';
}
async function save(){
  if(!owner||!owner.artifact)return;
  saveBtn.setAttribute("disabled","");saveStatus.textContent="公開しています…";
  try{await owner.artifact.publish(buildDoc());dirty=false;saveStatus.textContent="公開しました。"}
  catch(e){
    const c=e&&e.code;
    saveStatus.textContent=c==="conflict"?"別の画面で先に更新されました。読み込み直してからもう一度お試しください。":c==="rate_limited"?"続けて保存しすぎました。少し待ってからもう一度押してください。":"公開できませんでした（"+(c||"エラー")+"）。";
    saveBtn.removeAttribute("disabled");
  }
}
window.addEventListener("beforeunload",e=>{if(dirty){e.preventDefault();e.returnValue=""}});

renderSongs();renderGallery();renderYt();renderComments();

(async()=>{
  if(!window.claude||!claude.use)return;
  const [assets,artifact,dl]=await Promise.all([claude.use("assets").catch(()=>null),claude.use("artifact").catch(()=>null),claude.use("downloads").catch(()=>null)]);
  downloads=dl;
  if(assets&&artifact){owner={assets,artifact};renderGallery();renderYt();renderOwner();renderSongOwner();renderComments();renderCommentOwner()}
  renderSongs();
})();
})();
