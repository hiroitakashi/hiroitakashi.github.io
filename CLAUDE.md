# Yellowman's Room（hiroitakashi.github.io）

廣居隆史さんのホームページ。GitHub Pages で https://hiroitakashi.github.io に公開している。
返答は日本語で。

## ページ構成（2026-10-24 から複数ページ）
| ファイル | 中身 |
|---|---|
| index.html | トップページ（全幅の写真スライドショー＋サイト名「Yellowman's Room」、下にメニューとカウンター） |
| novels.html | 小説 |
| songs.html | 作曲（邦楽・洋楽・インストゥルメンタル） |
| photos.html | 写真集 |
| youtube.html | YouTubeチャンネル（2チャンネルのボタン） |
| comments.html | コメント |
| blog.html, blog/*.html | ブログ（tools/build_blog.py が blog/posts/*.md から生成） |

6つのHTMLはマークアップが共通で、`<script>window.FILE_PAGE="…"</script>` で表示するカテゴリーを切り替えている。
中身のデータと動きは共通ファイルにあるので、**作品や曲の追加でHTMLを直す必要はない**。

| 共通ファイル | 直すとき |
|---|---|
| app.js | 小説の追加・修正 → 先頭の `const WORKS=[ … ]`（t=題名, cover, pdf, who=主人公, era=時代, d=紹介文）。並びはおおむね時代順 |
| data.js | 曲の追加・曲名修正 → `window.SITE_STATE.songs`（cat は "邦楽" / "洋楽" / "インストゥルメンタル"）。YouTube は `youtube.channels` |
| style.css | デザイン |
| files/ | PDF・表紙・曲（MP3）・トップ写真。名前は `pdf-xxx.pdf`, `covers-xxx.jpg`, `music-<分類>-<番号>.mp3` |

- トップのスライドショーの写真は各HTMLの `<div class="hero">` 内の `<figure class="slide">`（6ファイルとも同じ）。画像は files/img-hero-*.jpg と files/img-top.jpg。6秒ごとにフェードで切り替わる（app.js）。
- 小説を追加したら、各HTMLの小説欄の見出し「○○作。」の数も直す（6ファイルとも同じ文）。
- 表紙は PDF の1ページ目を 600px 高で JPEG にしたもの（`pdftoppm -f 1 -l 1 -jpeg -scale-to 600`）。
- 小説PDFの目次には各章へのページ内リンクと「しおり」を付けている。新しい小説を追加したら同じ処理をする（スクリプトは tools/toc_links.py：`python3 tools/toc_links.py 入力.pdf 出力.pdf`。PyMuPDF が必要）。
- 日本語のファイル名はアップロード時に崩れるので、曲名・題名は本人の指示か PDF の中身から取る。

## ブログ（毎朝の自動更新）
- 記事は `blog/posts/YYYY-MM-DD-英単語.md`（1記事1ファイル。書式は tools/build_blog.py の先頭に説明あり）。
- 書いたら `python3 tools/build_blog.py` で blog.html・blog/<slug>.html・sitemap.xml・robots.txt を作り直し、まとめてコミットして push する。blog/*.html を手で直さない。
- 方針：その朝の日本のトレンドから、事実で書ける話題を1つ選ぶ。事件・事故・災害・訃報・選挙や政治・特定の個人の私生活・病気の治療法は避ける。調べた出典を sources に必ず書く。廣居さん本人の体験談をでっち上げない。
- アフィリエイトのリンクは blog/affiliate.json に登録されたものだけを使い、使った記事は `pr: true`（記事の先頭に「PR」表記が出る）。

## 下書き版
Claude 上のアーティファクト https://claude.ai/artifact/DkeozbbydYfNz8M4ZQ7v8b は1ファイル版の下書き（#works などのハッシュでページ切替）。
公開の本番はこのリポジトリ。
