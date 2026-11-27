/* 検索エンジン向けの構造化データ（JSON-LD）を、作品・曲・写真のデータから自動で作って <head> に入れる（2026-11-28）。
   app.js の WORKS と data.js の SITE_STATE を読むだけなので、作品や曲を足してもここは直さなくてよい。
   各ページの静的な JSON-LD（パンくず・ページの説明）は HTML の <head> に直接書いてある。 */
(function(){
  try{
    var SITE="https://hiroitakashi.github.io/",page=window.FILE_PAGE,S=window.SITE_STATE||{};
    var me={"@id":SITE+"#person"};
    function abs(u){return u?SITE+String(u).replace(/^\.?\//,"").replace(/\?.*$/,""):undefined}
    function put(o){var s=document.createElement("script");s.type="application/ld+json";s.text=JSON.stringify(o);document.head.appendChild(s)}
    var WORKS=window.WORKS;
    if(page==="works"&&WORKS&&WORKS.length){
      put({"@context":"https://schema.org","@type":"ItemList","name":"廣居文庫　作品一覧","url":SITE+"novels.html",
        "itemListOrder":"https://schema.org/ItemListOrderAscending","numberOfItems":WORKS.length,
        "itemListElement":WORKS.map(function(w,i){return{"@type":"ListItem","position":i+1,"item":{
          "@type":"Book","name":String(w.t).replace(/\s+/g,""),"author":me,"inLanguage":"ja","genre":"歴史小説",
          "bookFormat":"https://schema.org/EBook","image":abs(w.cover),"description":w.d,
          "about":w.who||undefined,"temporalCoverage":w.era||undefined,"url":SITE+"novels.html",
          "associatedMedia":w.pdf?{"@type":"MediaObject","contentUrl":abs(w.pdf),"encodingFormat":"application/pdf"}:undefined}}})});
    }
    if(page==="songs"&&S.songs&&S.songs.length){
      put({"@context":"https://schema.org","@type":"MusicPlaylist","name":"YM MUSIC　廣居隆史のオリジナル曲","url":SITE+"songs.html",
        "numTracks":S.songs.length,"creator":me,
        "track":S.songs.map(function(x){return{"@type":"MusicRecording","name":x.title,"genre":x.cat,"byArtist":me,
          "audio":{"@type":"AudioObject","contentUrl":abs(x.url),"encodingFormat":"audio/mpeg"}}})});
    }
    if(page==="photos"&&S.albums&&S.albums.length){
      put({"@context":"https://schema.org","@type":"CollectionPage","name":"写真　廣居隆史の写真集","url":SITE+"photos.html","author":me,
        "hasPart":S.albums.map(function(a){
          if(a.video)return{"@type":"CreativeWork","name":a.title,"description":a.note||undefined,"image":abs(a.cover),"creator":me};
          return{"@type":"ImageGallery","name":a.title,"description":a.note||undefined,"creator":me,
            "image":(a.photos||[]).map(function(p){return{"@type":"ImageObject","contentUrl":abs(p.url),"caption":p.caption||undefined,"creator":me}})}})});
    }
  }catch(e){}
})();
