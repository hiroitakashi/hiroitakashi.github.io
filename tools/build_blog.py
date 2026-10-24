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
sources:
- 出典のタイトル | https://example.com/...
---
本文（Markdown の一部：## 見出し / ### 小見出し / 段落 / - 箇条書き / 1. 番号付き / > 引用 / **太字** / [リンク](URL)）
"""
import html, os, re, sys, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, 'blog', 'posts')
SITE = 'https://hiroitakashi.github.io'
FONTS = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Poiret+One&display=swap'
NAV = [('novels.html', '小説', ''), ('songs.html', '作曲', ''), ('photos.html', '写真集', ''),
       ('youtube.html', 'YouTubeチャンネル', 'yt-link'), ('comments.html', 'コメント', ''), ('blog.html', 'ブログ', '')]

def esc(t): return html.escape(t, quote=True)

def counter(key, label):
    # 訪問者カウンター（hits.sh）。読み込めない時は表示しない
    from urllib.parse import quote
    src = f'https://hits.sh/hiroitakashi.github.io/{key}.svg?style=flat-square&label={quote(label)}&color=24476b&labelColor=8a949b'
    return f'<div class="counter blog-counter"><img src="{src}" alt="{esc(label)}の数" height="20" decoding="async" onerror="this.parentNode.remove()"></div>'

def slides():
    # トップページ（index.html）のスライドショーと同じ写真を使う
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
    out, para, lst, ltype = [], [], [], None
    def flush():
        nonlocal para, lst, ltype
        if para: out.append('<p>' + inline(' '.join(para)) + '</p>'); para = []
        if lst: out.append(f'<{ltype}>' + ''.join(f'<li>{inline(x)}</li>' for x in lst) + f'</{ltype}>'); lst = []; ltype = None
    for line in body.splitlines():
        s = line.rstrip()
        if not s.strip(): flush(); continue
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
        tags = ''.join(f'<span class="tag">{esc(t)}</span>' for t in p['tags'])
        pr = '<p class="pr">PR：この記事にはアフィリエイト広告（商品・サービスへのリンク）が含まれます。リンク先で購入されると、運営者に紹介料が支払われることがあります。</p>' if p['pr'] else ''
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
    items = ''.join(f'''<li><a href="blog/{p['slug']}.html"><time datetime="{p['date']}">{jdate(p['date'])}</time>{''.join(f'<span class="tag">{esc(t)}</span>' for t in p['tags'])}<h2>{esc(p['title'])}</h2><p>{esc(p.get('description', ''))}</p></a></li>''' for p in posts)
    body = f'''<div class="backrow"><a class="back" href="index.html"><span aria-hidden="true">‹</span> トップへ戻る</a></div>
<div class="blog-head"><h1>ブログ<span class="kana">BLOG</span></h1><p>毎朝、いま話題のことを取り上げて書いています。</p>{counter('blog', 'ブログへのご訪問')}</div>
<ul class="posts">{items or '<li><p>記事は準備中です。</p></li>'}</ul>'''
    open(os.path.join(ROOT, 'blog.html'), 'w', encoding='utf-8').write(page("ブログ | Yellowman's Room", 'Yellowman\'s Room のブログ。毎朝、いま話題のことを取り上げて書いています。', body, '', f'{SITE}/blog.html', banner=hero('', 'short', 'BLOG')))
    urls = ['', 'novels.html', 'songs.html', 'photos.html', 'youtube.html', 'comments.html', 'blog.html'] + [f'blog/{p["slug"]}.html' for p in posts]
    today = datetime.date.today().isoformat()
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{SITE}/{u}</loc><lastmod>{(posts[[f"blog/{x["slug"]}.html" for x in posts].index(u)]["date"] if u.startswith("blog/") else today)}</lastmod></url>\n' for u in urls) + '</urlset>\n'
    open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8').write(sm)
    open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8').write(f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
    print(f'記事 {len(posts)} 件を組み立てました')

if __name__ == '__main__':
    build()
