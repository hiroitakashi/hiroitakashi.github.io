#!/usr/bin/env python3
"""横書きの小説PDFを、ほかの作品と同じ縦書き（A5・右綴じ）のPDFに組み直す。

  python3 tools/yoko_to_tate.py 入力.pdf 出力.pdf

- 入力は「表紙 → 目次 → 章（小見出し＋大見出し）→ 本文 → 奥付」の横書きPDF（2026-11 の「波頭」の形）。
  本文の文字・段落・場面区切り（＊）・章立て・奥付を読み取り、縦書きに組み直す。表紙は1ページ目をそのまま使う。
- 組版は Chromium（Playwright）で行う。書体は Noto Serif CJK JP（apt の fonts-noto-cjk）。PyMuPDF が必要。
- 目次の各章へのページ内リンクと「しおり」、算用数字のノンブル（ページ番号）も付ける。
- 本文中の算用数字は縦書きにそろえて漢数字に直す（奥付の年月など）。
"""
import sys, re, json, html, os, subprocess, tempfile
import pymupdf as fitz

KAN = '〇一二三四五六七八九'


def extract(src):
    d = fitz.open(src)
    items, prev = [], None
    for pn in range(2, len(d)):                      # 1=表紙, 2=目次
        for b in d[pn].get_text('dict')['blocks']:
            for l in b.get('lines', []):
                sp = l['spans'][0]
                t = ''.join(s['text'] for s in l['spans'])
                sz, bold = round(sp['size'], 1), 'Bo' in sp['font']
                x, x1 = l['bbox'][0], l['bbox'][2]
                if sz < 9.5 and re.fullmatch(r'\d+', t.strip()):   # ノンブル
                    continue
                if sz >= 16:
                    items.append({'k': 'title', 't': t.strip()}); prev = None; continue
                if sz < 9.8 or sz > 12:                       # 奥付
                    items.append({'k': 'colo', 't': t.strip(), 'size': sz}); prev = None; continue
                if bold:
                    items.append({'k': 'label', 't': t.strip()}); prev = None; continue
                st = t.strip()
                if st in ('＊', '*', '◇'):
                    items.append({'k': 'sep'}); prev = None; continue
                indent = x >= 60
                starts = t.startswith(('「', '『', '（', '――'))
                new = prev is None or indent or starts
                if new:
                    items.append({'k': 'p', 't': t.lstrip('　 '), 'indent': indent})
                else:
                    last = items[-1]
                    if re.search(r'[A-Za-z.,!?]$', last['t']) and re.match(r'[A-Za-z]', t):
                        last['t'] += ' '
                    last['t'] += t
                prev = (x, x1)
    # 行頭が「 などで別の段落に見えたが、前の段落が句読点で終わっていないものはつなぐ
    out = []
    for it in items:
        if it['k'] == 'p' and out and out[-1]['k'] == 'p' and not it['indent'] \
                and not re.search(r'[。」』！？）―…、]$', out[-1]['t']):
            out[-1]['t'] += it['t']
        else:
            out.append(it)
    return out


def num_kanji(s):
    """算用数字を漢数字に（2026年10月 → 二〇二六年十月）。年は1字ずつ、それ以外は十の位取り。"""
    def one(m):
        n, after = m.group(0), s[m.end():m.end() + 1]
        if after == '年' or len(n) >= 3:
            return ''.join(KAN[int(c)] for c in n)
        v = int(n)
        if v < 10: return KAN[v]
        t, o = divmod(v, 10)
        return ('' if t == 1 else KAN[t]) + '十' + (KAN[o] if o else '')
    return re.sub(r'\d+', one, s)


CSS = r'''
@page{size:148mm 210mm;margin:19mm 16mm 21mm 16mm}
html{writing-mode:vertical-rl;-webkit-writing-mode:vertical-rl}
body{margin:0;font-family:"Noto Serif CJK JP",serif;font-size:9.6pt;line-height:1.85;color:#1a1a1a;
  line-break:strict;font-feature-settings:"palt" 0;text-align:justify;text-spacing-trim:normal}
p{margin:0}
p.i{text-indent:1em}
.blank{break-after:page;block-size:1px}
.toc{break-after:page}
.toc h1{font-size:14pt;letter-spacing:.6em;margin:0 0 0 1.4em;font-weight:700}
.toc a{display:flex;align-items:center;color:inherit;text-decoration:none;font-size:9.6pt;line-height:1;block-size:2.05em;overflow:hidden}
.toc a>span{line-height:1}
.toc .lab{inline-size:5em}
.toc .ld{flex:1;overflow:hidden;white-space:nowrap;margin:0 .5em;color:#888;letter-spacing:.1em}
.toc .ld::after{content:"・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・・"}
.tcy{text-combine-upright:all;-webkit-text-combine:horizontal}
.chap{break-before:page;margin:0 0 0 2.6em;padding-block-start:0}
.chap .lab{display:block;font-size:10pt;font-weight:700;margin:2.6em 0 0 .2em;letter-spacing:.15em}
.chap .tt{display:block;font-size:17pt;font-weight:700;margin:3.2em 0 0 0;letter-spacing:.2em;line-height:1.4}
.sep{text-indent:7em;margin:0 1.2em}
.end{margin-right:1em;text-indent:13em}
.colo{break-before:page;block-size:100%;display:flex;flex-direction:column;justify-content:flex-end}
.colo div{border-right:.6pt solid #555;border-left:.6pt solid #555;padding:0 1.2em;margin-block-end:4mm;inline-size:auto;margin-top:auto}
.colo .ct{font-size:14pt;font-weight:700;letter-spacing:.3em;margin:1.2em 0 .6em}
.colo p{font-size:9pt;line-height:2}
'''


def build_html(items, pages=None):
    chaps = [i for i in range(len(items)) if items[i]['k'] == 'label']
    toc = []
    for n, ci in enumerate(chaps):
        lab, tt = items[ci]['t'], items[ci + 1]['t']
        pg = str(pages[n]) if pages else '00'
        toc.append(f'<a href="#c{n}"><span class="lab">{html.escape(lab)}</span><span class="tt">{html.escape(tt)}</span>'
                   f'<span class="ld"></span><span class="tcy">{pg}</span></a>')
    out = ['<div class="blank"></div>', '<section class="toc"><h1>目次</h1>' + ''.join(toc) + '</section>']
    n, i, colo = 0, 0, []
    while i < len(items):
        it = items[i]
        if it['k'] == 'label':
            out.append(f'<h2 class="chap" id="c{n}"><span class="lab">{html.escape(it["t"])}</span>'
                       f'<span class="tt">{html.escape(items[i+1]["t"])}</span></h2>')
            n += 1; i += 2; continue
        if it['k'] == 'p':
            t = html.escape(num_kanji(it['t']))
            cls = 'end' if it['t'] in ('（完）',) else ('i' if it['indent'] else '')
            out.append(f'<p class="{cls}">{t}</p>' if cls else f'<p>{t}</p>')
        elif it['k'] == 'sep':
            out.append('<p class="sep">＊</p>')
        elif it['k'] == 'colo':
            colo.append(it)
        i += 1
    if colo:
        c = ''.join(f'<p class="ct">{html.escape(x["t"])}</p>' if x['size'] > 11 else f'<p>{html.escape(num_kanji(x["t"]))}</p>' for x in colo)
        out.append(f'<section class="colo"><div>{c}</div></section>')
    return f'<!doctype html><html lang="ja"><meta charset="utf-8"><style>{CSS}</style><body>{"".join(out)}</body></html>'


PRINT_JS = r'''
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.argv[1],{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);
await p.pdf({path:process.argv[2],preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,
 headerTemplate:'<span></span>',
 footerTemplate:'<div style="width:100%;text-align:center;font-family:\'Noto Serif CJK JP\',serif;font-size:7.5pt;color:#444;padding-bottom:9mm"><span class="pageNumber"></span></div>'});
await b.close()})();
'''


def render(items, pages, out):
    with tempfile.TemporaryDirectory() as td:
        h = os.path.join(td, 'book.html')
        open(h, 'w', encoding='utf-8').write(build_html(items, pages))
        subprocess.run(['node', '-e', PRINT_JS, h, out], check=True)


def chapter_pages(pdf):
    d = fitz.open(pdf)
    return [l['page'] + 1 for l in d[1].get_links() if l.get('kind') in (fitz.LINK_GOTO, fitz.LINK_NAMED) and l.get('page', -1) >= 0]


def main(src, dst):
    items = extract(src)
    tmp = dst + '.tmp.pdf'
    render(items, None, tmp)
    pages = chapter_pages(tmp)
    nch = sum(1 for i in items if i['k'] == 'label')
    assert len(pages) == nch, (pages, nch)
    render(items, pages, tmp)
    assert chapter_pages(tmp) == pages
    d, orig = fitz.open(tmp), fitz.open(src)
    # 1ページ目（白紙）に元の表紙をのせる。白紙に付いたノンブルは消す
    p0 = d[0]
    p0.add_redact_annot(p0.rect); p0.apply_redactions()
    p0.show_pdf_page(p0.rect, orig, 0, keep_proportion=False)
    labels = [i['t'] for i in items if i['k'] == 'label']
    titles = [items[k + 1]['t'] for k, i in enumerate(items) if i['k'] == 'label']
    meta_title = (orig.get_toc() or [[1, '']])[0][1] or os.path.basename(src)
    toc = [[1, meta_title, 1], [2, '目次', 2]] + [[2, f'{a}　{b}', p] for a, b, p in zip(labels, titles, pages)]
    d.set_toc(toc)
    d.set_metadata({'title': meta_title, 'author': '廣居隆史', 'producer': 'yoko_to_tate.py'})
    d.save(dst, garbage=4, deflate=True)
    os.remove(tmp)
    print(dst, len(d), 'pages; chapters at', pages)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
