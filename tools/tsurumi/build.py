#!/usr/bin/env python3
"""連載「鶴見川物語」を1冊の縦書きPDF（files/pdf-tsurumi.pdf）に組む。

  python3 tools/tsurumi/build.py

- 原稿は tools/tsurumi/epNN.txt（1話1ファイル）。1行目＝「第○話」、2行目＝題、3行目から本文。
  全角空白で始まる行は字下げの段落、「で始まる行は会話、＊だけの行は場面の区切り、
  最後の「（第○話　了）」は下寄せ。本文の算用数字は組むときに漢数字になる。
- 新しい話を足すときは epNN.txt を置いてこのスクリプトを流し直すだけ。表紙・目次・しおり・奥付も作り直す。
- 組版は tools/yoko_to_tate.py と同じ（Chromium＋Noto Serif CJK JP、A5・右綴じ、算用数字のノンブル）。
"""
import os, re, sys, glob, html, subprocess, tempfile, datetime
import pymupdf as fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import yoko_to_tate as Y  # noqa: E402

TITLE = '鶴見川物語'
OUT = os.path.join(ROOT, 'files', 'pdf-tsurumi.pdf')


def load():
    items = []
    files = sorted(glob.glob(os.path.join(HERE, 'ep*.txt')))
    for f in files:
        lines = [l.rstrip('\n') for l in open(f, encoding='utf-8')]
        lines = [l for l in lines if l.strip()]
        items.append({'k': 'label', 't': lines[0].strip()})
        items.append({'k': 'title', 't': lines[1].strip()})
        for l in lines[2:]:
            s = l.strip()
            if s == '＊':
                items.append({'k': 'sep'})
            elif re.fullmatch(r'（第.+?話　了）', s):
                items.append({'k': 'end', 't': s})
            else:
                items.append({'k': 'p', 't': s, 'indent': l.startswith('　')})
    return items, len(files)


def body_html(items, pages, nep):
    # yoko_to_tate の組み方をそのまま使い、話の終わりの「了」を下寄せにする
    tmp = [dict(i, k='p', indent=False, t='@@END@@' + i['t']) if i['k'] == 'end' else i for i in items]
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date()  # 日本時間
    tmp += [{'k': 'colo', 't': TITLE, 'size': 14},
            {'k': 'colo', 't': '著者　廣居隆史', 'size': 9},
            {'k': 'colo', 't': ('連載　第一話' if nep == 1 else f'連載　第一話〜第{Y.num_kanji(str(nep))}話'), 'size': 9},
            {'k': 'colo', 't': f'{today.year}年{today.month}月{today.day}日', 'size': 9},
            {'k': 'colo', 't': "Yellowman's Room", 'size': 9}]
    h = Y.build_html(tmp, pages)
    h = re.sub(r'<p>@@END@@(.*?)</p>', lambda m: f'<p class="end">{m.group(1)}</p>', h)
    return h


PRINT_JS = Y.PRINT_JS


def render_html(h, out, footer=True):
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, 'x.html')
        open(p, 'w', encoding='utf-8').write(h)
        js = PRINT_JS if footer else PRINT_JS.replace('displayHeaderFooter:true', 'displayHeaderFooter:false')
        subprocess.run(['node', '-e', js, p, out], check=True, cwd=ROOT)


COVER = r'''<!doctype html><html lang="ja"><meta charset="utf-8"><style>
@page{size:148mm 210mm;margin:0}
html,body{margin:0;width:148mm;height:210mm;overflow:hidden}
body{position:relative;background:linear-gradient(175deg,#12253f 0%,#1d3a5c 46%,#2c5674 70%,#a9b9b4 100%);
  font-family:"Noto Serif CJK JP",serif}
svg{position:absolute;left:0;top:0;width:148mm;height:210mm}
.title{position:absolute;right:20mm;top:22mm;writing-mode:vertical-rl;color:#f3ead6;font-weight:700;
  font-size:40pt;letter-spacing:.32em;text-shadow:0 0 6px rgba(0,0,0,.35)}
.author{position:absolute;left:18mm;top:30mm;writing-mode:vertical-rl;color:#e9dfc8;font-size:14pt;letter-spacing:.5em}
.seal{position:absolute;right:21.5mm;top:146mm;width:11mm;height:11mm;border:1.2pt solid #b33a2b;color:#b33a2b;
  font-size:7.5pt;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;letter-spacing:.05em;
  background:rgba(243,234,214,.85);font-weight:700}
</style><body>
<svg viewBox="0 0 148 210" preserveAspectRatio="none">
 <defs><radialGradient id="moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8e4"/><stop offset=".7" stop-color="#f3e6c3"/><stop offset="1" stop-color="#f3e6c3" stop-opacity="0"/></radialGradient></defs>
 <circle cx="52" cy="40" r="11" fill="url(#moon)"/>
 <!-- 遠い山並み -->
 <path d="M0 150 Q20 140 36 146 T70 142 T108 147 T148 140 V170 H0Z" fill="#203c57" opacity=".75"/>
 <!-- 橋 -->
 <g stroke="#0d1a2b" stroke-width="1.6" fill="none">
  <path d="M-2 160 Q74 138 150 160"/>
  <path d="M-2 163 Q74 141 150 163" stroke-width=".7"/>
 </g>
 <g stroke="#0d1a2b" stroke-width="1">
  <line x1="14" y1="155" x2="14" y2="178"/><line x1="34" y1="150" x2="34" y2="178"/><line x1="54" y1="146.5" x2="54" y2="178"/>
  <line x1="74" y1="145.5" x2="74" y2="178"/><line x1="94" y1="146.5" x2="94" y2="178"/><line x1="114" y1="150" x2="114" y2="178"/>
  <line x1="134" y1="155" x2="134" y2="178"/>
 </g>
 <g stroke="#0d1a2b" stroke-width=".5">
  <line x1="24" y1="152" x2="24" y2="157"/><line x1="44" y1="148" x2="44" y2="153"/><line x1="64" y1="146" x2="64" y2="151"/>
  <line x1="84" y1="146" x2="84" y2="151"/><line x1="104" y1="148" x2="104" y2="153"/><line x1="124" y1="152" x2="124" y2="157"/>
 </g>
 <!-- 川面 -->
 <rect x="0" y="176" width="148" height="34" fill="#25475f" opacity=".55"/>
 <g stroke="#e8dcc0" stroke-width=".35" opacity=".55" fill="none">
  <path d="M8 184 q6 -1.5 12 0 t12 0"/><path d="M60 188 q6 -1.5 12 0 t12 0 t12 0"/><path d="M110 182 q5 -1.2 10 0 t10 0"/>
  <path d="M22 196 q7 -1.6 14 0 t14 0"/><path d="M88 200 q6 -1.4 12 0 t12 0"/><path d="M40 205 q5 -1.2 10 0"/>
 </g>
 <path d="M48 180 L56 180 L52 205 Z" fill="#f3e6c3" opacity=".18"/>
 <!-- 茶屋の灯 -->
 <rect x="6" y="166" width="5" height="7" fill="#e7b75a" opacity=".9"/>
</svg>
<div class="title">鶴見川物語</div>
<div class="author">廣居隆史</div>
</body></html>'''


def main():
    items, nep = load()
    with tempfile.TemporaryDirectory() as td:
        cov = os.path.join(td, 'cover.pdf')
        render_html(COVER, cov, footer=False)
        tmp = os.path.join(td, 'body.pdf')
        render_html(body_html(items, None, nep), tmp)
        pages = Y.chapter_pages(tmp)
        assert len(pages) == nep, (pages, nep)
        render_html(body_html(items, pages, nep), tmp)
        assert Y.chapter_pages(tmp) == pages
        d, c = fitz.open(tmp), fitz.open(cov)
        p0 = d[0]
        p0.add_redact_annot(p0.rect); p0.apply_redactions()
        p0.show_pdf_page(p0.rect, c, 0, keep_proportion=False)
        labs = [i['t'] for i in items if i['k'] == 'label']
        tts = [items[k + 1]['t'] for k, i in enumerate(items) if i['k'] == 'label']
        d.set_toc([[1, TITLE, 1], [2, '目次', 2]] + [[2, f'{a}　{b}', p] for a, b, p in zip(labs, tts, pages)])
        d.set_metadata({'title': TITLE, 'author': '廣居隆史', 'producer': 'tools/tsurumi/build.py'})
        d.save(OUT, garbage=4, deflate=True)
        print(OUT, len(d), 'pages; episodes at', pages)


if __name__ == '__main__':
    main()
