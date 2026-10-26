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
- 毎朝3本立て：6:21「釣り」（東京湾の釣果まとめ・自動公開）、6:51「話題」（トレンド・自動公開）、7:13「政治・経済」（下書き→本人OK→公開）。いずれもスケジュール済みタスク。
- 「話題」の方針：いま実際に多く検索されている勢いのある話題を優先（本人談「文鳥の日や柿の日ではインパクトが弱い」）。記念日はほかに強い話題がない日だけ。
- 方針：その朝の日本のトレンドから、事実で書ける話題を1つ選ぶ。事件・事故・災害・訃報・選挙や政治（政治・経済は下の別枠）・特定の個人の私生活・病気の治療法は避ける。調べた出典を sources に必ず書く。廣居さん本人の体験談をでっち上げない。
- **釣りの記事**（`category: 釣り`、slug は YYYY-MM-DD-tokyowan-tsuri）：横浜フィッシングピアーズ（本牧・大黒・磯子）と東京湾・三浦半島の船宿の最新釣果、旬の爆釣情報。公式サイト yokohama-fishingpiers.jp は中身がスクリプトで読めないので、釣りビジョン（本牧 s=11284、大黒 s=11285）、つりサポ、釣割などで数字を確かめる。数字は出典にあるものだけ、文章・写真は写さない。
- **政治・経済の記事は別扱い**（`category: 政治・経済`。記事の先頭に「筆者の意見」表記、一覧に分野タブが出る）。毎朝のトレンド記事には政治を入れない。
  - 立場：保守論客の姿勢。高市政権を支持し、左派・リベラル勢力の主張や政策をはっきり批判する。野党が選挙前の公約を守らないことをはっきり批判する。SNSを批判する大手メディアには毅然と反論する。結びの考え方は「政治は国家国民のため。政治家の職業のためにあるのではありません。」
  - 書き方：公約と今の行動を日付・出典つきで並べる。批判は発言・政策・行動に対してだけ（人格攻撃・うわさは書かない）。メディアへの反論は「どの社が・いつ・何と書いたか」を具体的に。相手側の言い分も一度は紹介してから反論する。数字・引用は出典で確かめたものだけ。
  - **必ず廣居さんの「OK」をもらってから公開する**。下書きは blog/drafts/（.gitignore 済み・push しない。.nojekyll なので push すると .md がそのまま見えてしまう）に置き、OK が出たら blog/posts/ へ移して build_blog.py。選挙の投票日当日は投票を呼びかける記事を出さない。
- アフィリエイトのリンクは blog/affiliate.json に登録されたものだけを使い、使った記事は `pr: true`（記事の先頭に「PR」表記が出る）。

- `google6642eb6d4ee4a7ad.html` は Google Search Console の所有権確認ファイル。消さないこと。

## 下書き版
Claude 上のアーティファクト https://claude.ai/artifact/DkeozbbydYfNz8M4ZQ7v8b は1ファイル版の下書き（#works などのハッシュでページ切替）。
公開の本番はこのリポジトリ。
