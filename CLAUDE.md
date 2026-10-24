# Yellowmanの書斎（hiroitakashi.github.io）

廣居隆史さんのホームページ。GitHub Pages で https://hiroitakashi.github.io に公開している。
返答は日本語で。

## ページ構成（2026-10-24 から複数ページ）
| ファイル | 中身 |
|---|---|
| index.html | トップページ（名前・メニュー・写真） |
| novels.html | 小説 |
| songs.html | 作曲（邦楽・洋楽・インストゥルメンタル） |
| photos.html | 写真集 |
| youtube.html | YouTubeチャンネル（2チャンネルのボタン） |
| comments.html | コメント |

6つのHTMLはマークアップが共通で、`<script>window.FILE_PAGE="…"</script>` で表示するカテゴリーを切り替えている。
中身のデータと動きは共通ファイルにあるので、**作品や曲の追加でHTMLを直す必要はない**。

| 共通ファイル | 直すとき |
|---|---|
| app.js | 小説の追加・修正 → 先頭の `const WORKS=[ … ]`（t=題名, cover, pdf, who=主人公, era=時代, d=紹介文）。並びはおおむね時代順 |
| data.js | 曲の追加・曲名修正 → `window.SITE_STATE.songs`（cat は "邦楽" / "洋楽" / "インストゥルメンタル"）。YouTube は `youtube.channels` |
| style.css | デザイン |
| files/ | PDF・表紙・曲（MP3）・トップ写真。名前は `pdf-xxx.pdf`, `covers-xxx.jpg`, `music-<分類>-<番号>.mp3` |

- 小説を追加したら、各HTMLの小説欄の見出し「○○作。」の数も直す（6ファイルとも同じ文）。
- 表紙は PDF の1ページ目を 600px 高で JPEG にしたもの（`pdftoppm -f 1 -l 1 -jpeg -scale-to 600`）。
- 日本語のファイル名はアップロード時に崩れるので、曲名・題名は本人の指示か PDF の中身から取る。

## 下書き版
Claude 上のアーティファクト https://claude.ai/artifact/DkeozbbydYfNz8M4ZQ7v8b は1ファイル版の下書き（#works などのハッシュでページ切替）。
公開の本番はこのリポジトリ。
