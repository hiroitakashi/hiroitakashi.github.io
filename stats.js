/* アクセス解析（2026-11-09）
   ・Google アナリティクスで、ページごとの閲覧数を管理画面に集める（ページ上には出さない）
   ・持ち主（廣居さん）の端末は数えない：その端末で一度だけ https://hiroitakashi.github.io/?me を開くと、
     以後その端末・そのブラウザでは計測もトップのカウンターも数えない。外すときは ?notme
   ・GA_ID に測定ID（G-で始まる）を入れると計測が始まる。空のあいだは何もしない */
(function(){
  var GA_ID="G-N7S108HM62";
  var K="yr-owner",owner=false,msg="";
  try{
    var q=location.search;
    if(/[?&]me(=|&|$)/.test(q)){localStorage.setItem(K,"1");msg="この端末を「持ち主」として登録しました。これからこの端末で見た分は、アクセス数に数えません。"}
    else if(/[?&]notme(=|&|$)/.test(q)){localStorage.removeItem(K);msg="この端末の「持ち主」登録を外しました。"}
    owner=localStorage.getItem(K)==="1";
    if(msg)history.replaceState(null,"",location.pathname+location.hash);
  }catch(e){}
  window.YR_OWNER=owner;

  if(!owner&&GA_ID){
    var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+GA_ID;
    document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){dataLayer.push(arguments)};
    gtag("js",new Date());gtag("config",GA_ID);
  }

  addEventListener("DOMContentLoaded",function(){
    // 解析を使っていることを、各ページの下に一言だけ書く（計測している間だけ）
    if(GA_ID){
      var f=document.querySelector("footer");
      if(f){var p=document.createElement("span");p.className="stats-note";p.textContent="このサイトは、閲覧数を知るためにGoogle アナリティクスを使っています（お名前など個人を特定する情報は集めていません）。";f.appendChild(p)}
    }
    if(msg){
      var t=document.createElement("div");t.className="owner-toast";t.setAttribute("role","status");t.textContent=msg;
      document.body.appendChild(t);setTimeout(function(){t.remove()},6000);
    }
  });
})();
