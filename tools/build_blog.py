#!/usr/bin/env python3
"""ブログを組み立てる。

blog/posts/*.md（1記事1ファイル）から、
  blog.html            … 記事の一覧
  blog/<slug>.html     … 記事のページ
  sitemap.xml          … 検索エンジン向けのページ一覧
を作り直す。追加のライブラリは不要（Python 3 標準のみ）。

記事ファイルの書式:
---
title: 記事のタイトル
date: 2026-10-25
slug: 2026-10-25-short-english-words
description: 一覧と検索結果に出る100字ほどの要約
tags: 季節, 暮らし
pr: false            # アフィリエイトリンクを含むなら true（記事の先頭に「PR」表記が出る）
category: 話題        # 「話題」（毎朝のトレンド記事・省略時）、「釣り」（東京湾の釣り情報）、「政治・経済」（意見記事。先頭に「筆者の意見」表記が出る）
sources:
- 出典のタイトル | https://example.com/...
---
政治・経済の記事は、まず blog/drafts/ に置き（ここは組み立てない＝公開されない）、廣居さんの「OK」が出てから blog/posts/ へ移す。

本文（Markdown の一部：## 見出し / ### 小見出し / 段落 / - 箇条書き / 1. 番号付き / > 引用 / | 表 |（2行目に |---|---| を入れると1行目が見出し）/ **太字** / [リンク](URL)）
"""
import html, os, re, sys, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, 'blog', 'posts')
SITE = 'https://hiroitakashi.github.io'
FONTS = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Poiret+One&display=swap'
NAV = [('novels.html', '小説', ''), ('songs.html', '作曲', ''), ('photos.html', '写真集', ''),
       ('youtube.html', 'YouTubeチャンネル', 'yt-link'), ('comments.html', 'コメント', ''), ('blog.html', 'ブログ', '')]

CATS = ['話題', '釣り', '政治・経済']
OPINION = '<p class="opinion">この記事は筆者・廣居隆史の個人的な意見です。事実の部分は末尾の「参考にした情報」に出典を載せています。</p>'

def esc(t): return html.escape(t, quote=True)

def counter(key, label):
    # 訪問者カウンター（hits.sh）。読み込めない時は表示しない
    from urllib.parse import quote
    src = f'https://hits.sh/hiroitakashi.github.io/{key}.svg?style=flat-square&label={quote(label)}&color=24476b&labelColor=8a949b'
    return f'<div class="counter blog-counter"><img src="{src}" alt="{esc(label)}の数" height="20" decoding="async" onerror="this.parentNode.remove()"></div>'

# ブログの写真（一覧の上のスライドショーと、記事ページの帯）。入れ替えるときはここを直す
BLOG_PHOTOS = [
    ('files/img-blog-01.jpg', '岩清水の手水鉢と柄杓'),
    ('files/img-blog-02.jpg', '杉木立に囲まれた参道の広場'),
    ('files/img-blog-03.jpg', '海に沈む夕日を眺める人たち'),
    ('files/img-blog-04.jpg', 'ホタルブクロと紫のカタバミ'),
    ('files/img-blog-05b.jpg', '凍った湖の向こうのダイヤモンド富士'),
    ('files/img-blog-06.jpg', 'ガラス張りのホールのベンチ'),
]

def slides():
    if BLOG_PHOTOS and all(os.path.exists(os.path.join(ROOT, u)) for u, _ in BLOG_PHOTOS): return BLOG_PHOTOS
    # 写真がない時は、トップページ（index.html）のスライドショーと同じ写真を使う
    try: src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    except OSError: return []
    return re.findall(r'<figure class="slide[^"]*"><img src="([^"]+)" alt="([^"]*)"', src)

def hero(prefix, kind, label, pick=None):
    ph = slides()
    if not ph: return ''
    if pick is not None: ph = [ph[pick % len(ph)]]
    figs = ''.join(f'<figure class="slide{" on" if i == 0 else ""}"><img src="{prefix}{esc(u)}" alt="{esc(a)}"{" fetchpriority=" + chr(34) + "high" + chr(34) if i == 0 else " loading=" + chr(34) + "lazy" + chr(34)}></figure>' for i, (u, a) in enumerate(ph))
    title = f'<div class="hero-title"><p class="name deco">Yellowman&rsquo;s Room</p><span class="hero-sub">{label}</span></div>' if label else ''
    js = '' if len(ph) < 2 else '''<script>(function(){var s=document.querySelectorAll(".hero .slide"),i=0;if(s.length<2||matchMedia("(prefers-reduced-motion: reduce)").matches)return;setInterval(function(){if(document.hidden)return;s[i].classList.remove("on");i=(i+1)%s.length;s[i].classList.add("on")},6000)})();</script>'''
    return f'<div class="hero {kind}">{figs}{title}</div>{js}'


def inline(t):
    t = esc(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    def link(m):
        txt, url = m.group(1), html.unescape(m.group(2))
        if not re.match(r'https?://', url): return txt
        rel = 'noopener sponsored' if 'sponsored' in m.group(0) else 'noopener'
        return f'<a href="{esc(url)}" target="_blank" rel="{rel}">{txt}</a>'
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', link, t)
    return t

def md(body):
    out, para, lst, ltype, tbl = [], [], [], None, []
    def cells(row): return [c.strip() for c in row.strip().strip('|').split('|')]
    def flush():
        nonlocal para, lst, ltype, tbl
        if tbl:
            rows = [cells(r) for r in tbl]
            head = rows[0] if len(rows) > 1 and re.match(r'^[\s|:-]+$', tbl[1]) else None
            body = rows[2:] if head else rows
            h = '<thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead>' if head else ''
            out.append('<div class="table"><table>' + h + '<tbody>' + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body) + '</tbody></table></div>'); tbl = []
        if para: out.append('<p>' + inline(' '.join(para)) + '</p>'); para = []
        if lst: out.append(f'<{ltype}>' + ''.join(f'<li>{inline(x)}</li>' for x in lst) + f'</{ltype}>'); lst = []; ltype = None
    for line in body.splitlines():
        s = line.rstrip()
        if not s.strip(): flush(); continue
        if s.lstrip().startswith('|'):
            if not tbl: flush()
            tbl.append(s); continue
        if tbl: flush()
        m = re.match(r'^(#{2,3})\s+(.*)$', s)
        if m: flush(); n = len(m.group(1)); out.append(f'<h{n}>{inline(m.group(2))}</h{n}>'); continue
        m = re.match(r'^\s*[-*]\s+(.*)$', s)
        if m:
            if para or ltype == 'ol': flush()
            ltype = 'ul'; lst.append(m.group(1)); continue
        m = re.match(r'^\s*\d+[.)]\s+(.*)$', s)
        if m:
            if para or ltype == 'ul': flush()
            ltype = 'ol'; lst.append(m.group(1)); continue
        m = re.match(r'^>\s?(.*)$', s)
        if m: flush(); out.append('<blockquote>' + inline(m.group(1)) + '</blockquote>'); continue
        if lst: flush()
        para.append(s.strip())
    flush()
    return '\n'.join(out)

def parse(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', raw, re.S)
    if not m: raise SystemExit(f'front matter がありません: {path}')
    meta, key = {'sources': []}, None
    for line in m.group(1).splitlines():
        if re.match(r'^\s*-\s+', line) and key == 'sources':
            item = re.sub(r'^\s*-\s+', '', line)
            name, _, url = item.rpartition('|') if '|' in item else ('', '', item)
            meta['sources'].append(((name or url).strip(), url.strip())); continue
        mm = re.match(r'^(\w+):\s*(.*)$', line)
        if mm: key = mm.group(1); meta[key] = mm.group(2).strip() if key != 'sources' else []
    for k in ('title', 'date', 'slug'):
        if not meta.get(k): raise SystemExit(f'{k} がありません: {path}')
    if not re.fullmatch(r'[a-z0-9-]+', meta['slug']): raise SystemExit(f'slug は半角英小文字・数字・ハイフンのみ: {path}')
    meta['tags'] = [x.strip() for x in meta.get('tags', '').split(',') if x.strip()]
    meta['pr'] = meta.get('pr', 'false').lower() == 'true'
    meta['category'] = meta.get('category') or '話題'
    if meta['category'] not in CATS: raise SystemExit(f'category は {" / ".join(CATS)} のどれか: {path}')
    meta['body'] = m.group(2).strip()
    return meta

def page(title, desc, body, prefix, canonical, current='blog', og_type='website', banner=''):
    nav = ''.join(f'<a href="{prefix}{h}" data-p="{h[:-5]}"{" class=" + chr(34) + c + chr(34) if c else ""}{" aria-current=" + chr(34) + "page" + chr(34) if h == current + ".html" else ""}>{t}</a>' for h, t, c in NAV)
    return f'''<!doctype html>
<html lang="ja" data-page="blog">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="{og_type}"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{canonical}"><meta property="og:site_name" content="Yellowman&#39;s Room">
<style>body{{margin:0}}img{{max-width:100%}}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{prefix}style.css">
</head>
<body>
<div class="subbar">
  <div class="wrap subbar-in">
    <a class="home" href="{prefix}index.html"><span aria-hidden="true">‹</span> トップ</a>
    <a class="brand deco" href="{prefix}index.html">Yellowman&rsquo;s Room</a>
    <nav class="subnav" aria-label="カテゴリー">{nav}</nav>
  </div>
</div>
{banner}
<main class="blog-wrap">
{body}
</main>
<footer class="wrap">© 廣居隆史　掲載の文章と写真の無断転載はご遠慮ください。</footer>
</body>
</html>
'''

def catlabel(p):
    cls = {'政治・経済': ' cat-pol', '釣り': ' cat-fish'}.get(p['category'], '')
    return f'<span class="cat{cls}">{esc(p["category"])}</span>'

def tabs(posts):
    have = [c for c in CATS if any(p['category'] == c for p in posts)]
    if len(have) < 2: return '', ''
    btn = '<button type="button" data-f="" aria-pressed="true">すべて</button>' + ''.join(f'<button type="button" data-f="{esc(c)}" aria-pressed="false">{esc(c)}</button>' for c in have)
    js = '''<script>(function(){var b=document.querySelectorAll(".cat-tabs button"),li=document.querySelectorAll(".posts li[data-cat]");function go(f){b.forEach(function(x){x.setAttribute("aria-pressed",x.dataset.f===f?"true":"false")});li.forEach(function(x){x.hidden=!!f&&x.dataset.cat!==f})}b.forEach(function(x){x.onclick=function(){go(x.dataset.f);try{history.replaceState(null,"",x.dataset.f?"#"+encodeURIComponent(x.dataset.f):location.pathname)}catch(e){}}});var h=decodeURIComponent(location.hash.slice(1));if(h)go(h)})();</script>'''
    return f'<div class="cat-tabs" role="group" aria-label="分野で絞り込む">{btn}</div>', js

def jdate(d):
    y, m, dd = d.split('-'); return f'{int(y)}年{int(m)}月{int(dd)}日'

def build():
    posts = [parse(p) for p in glob.glob(os.path.join(POSTS, '*.md'))]
    posts.sort(key=lambda p: (p['date'], p['slug']), reverse=True)
    os.makedirs(os.path.join(ROOT, 'blog'), exist_ok=True)
    keep = set()
    for i, p in enumerate(posts):
        newer = posts[i - 1] if i > 0 else None
        older = posts[i + 1] if i + 1 < len(posts) else None
        tags = catlabel(p) + ''.join(f'<span class="tag">{esc(t)}</span>' for t in p['tags'])
        if p['category'] == '政治・経済': pr = OPINION
        else: pr = ''
        pr += '<p class="pr">PR：この記事にはアフィリエイト広告（商品・サービスへのリンク）が含まれます。リンク先で購入されると、運営者に紹介料が支払われることがあります。</p>' if p['pr'] else ''
        src = ''
        if p['sources']:
            src = '<div class="sources">参考にした情報<ul>' + ''.join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener">{esc(n)}</a></li>' for n, u in p['sources'] if re.match(r'https?://', u)) + '</ul></div>'
        nav = '<nav class="post-nav">' + (f'<a href="{older["slug"]}.html">‹ {esc(older["title"])}</a>' if older else '<span></span>') + (f'<a href="{newer["slug"]}.html">{esc(newer["title"])} ›</a>' if newer else '<span></span>') + '</nav>'
        body = f'''<div class="backrow"><a class="back" href="../blog.html"><span aria-hidden="true">‹</span> ブログの一覧へ</a></div>
<article class="post">
<time datetime="{p['date']}">{jdate(p['date'])}</time>{tags}
<h1>{esc(p['title'])}</h1>
{pr}<div class="body">
{md(p['body'])}
</div>
{src}
{counter('blog/' + p['slug'], 'この記事の閲覧')}
</article>
{nav}'''
        fn = os.path.join(ROOT, 'blog', p['slug'] + '.html'); keep.add(fn)
        open(fn, 'w', encoding='utf-8').write(page(f'{p["title"]} | Yellowman\'s Room', p.get('description', ''), body, '../', f'{SITE}/blog/{p["slug"]}.html', og_type='article', banner=hero('../', 'thin', '', pick=sum(map(ord, p['slug'])))))
    # 消した記事のページを片付ける
    for fn in glob.glob(os.path.join(ROOT, 'blog', '*.html')):
        if fn not in keep: os.remove(fn)
    items = ''.join(f'''<li data-cat="{esc(p['category'])}"><a href="blog/{p['slug']}.html"><time datetime="{p['date']}">{jdate(p['date'])}</time>{catlabel(p)}{''.join(f'<span class="tag">{esc(t)}</span>' for t in p['tags'])}<h2>{esc(p['title'])}</h2><p>{esc(p.get('description', ''))}</p></a></li>''' for p in posts)
    tb = tabs(posts)
    body = f'''<div class="backrow"><a class="back" href="index.html"><span aria-hidden="true">‹</span> トップへ戻る</a></div>
<div class="blog-head"><h1>ブログ<span class="kana">BLOG</span></h1><p>毎朝、いま話題のことを取り上げて書いています。{'東京湾の最新の釣り情報も毎日お届けします。' if any(p['category'] == '釣り' for p in posts) else ''}{'政治・経済についての意見も載せています。' if any(p['category'] == '政治・経済' for p in posts) else ''}</p>{counter('blog', 'ブログへのご訪問')}</div>
{tb[0]}<ul class="posts">{items or '<li><p>記事は準備中です。</p></li>'}</ul>{tb[1]}'''
    open(os.path.join(ROOT, 'blog.html'), 'w', encoding='utf-8').write(page("ブログ | Yellowman's Room", 'Yellowman\'s Room のブログ。毎朝、いま話題のことを取り上げて書いています。', body, '', f'{SITE}/blog.html', banner=hero('', 'short', 'BLOG')))
    urls = ['', 'novels.html', 'songs.html', 'photos.html', 'youtube.html', 'comments.html', 'blog.html'] + [f'blog/{p["slug"]}.html' for p in posts]
    today = datetime.date.today().isoformat()
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{SITE}/{u}</loc><lastmod>{(posts[[f"blog/{x["slug"]}.html" for x in posts].index(u)]["date"] if u.startswith("blog/") else today)}</lastmod></url>\n' for u in urls) + '</urlset>\n'
    open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8').write(sm)
    open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8').write(f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
    print(f'記事 {len(posts)} 件を組み立てました')

if __name__ == '__main__':
    build()
