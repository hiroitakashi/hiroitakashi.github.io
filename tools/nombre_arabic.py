#!/usr/bin/env python3
"""小説PDFの漢数字のノンブル（ページ番号）と、目次のページ数を算用数字に直す。

  python3 tools/nombre_arabic.py 入力.pdf 出力.pdf

- ページ下の余白にある小さな漢数字（本文より下・小さい字）をノンブルとみなし、同じ位置・色の算用数字に置き換える。
- 目次（リンクの付いた項目）では、各項目の末尾の漢数字が「リンク先ページのノンブル」と一致したときだけ置き換える。
  章番号（一、二、第三章など）は一致しないので残る。
PyMuPDF が必要。
"""
import sys, re, collections
import pymupdf as fitz

KD = {'〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
KSET = set(KD) | {'十', '百'}

def kanji_to_int(s):
    if not s or any(c not in KSET for c in s): return None
    if '十' not in s and '百' not in s:            # 位取り式（一〇六）
        return int(''.join(str(KD[c]) for c in s))
    n, cur = 0, 0
    for c in s:
        if c in KD: cur = KD[c]
        elif c == '百': n += (cur or 1) * 100; cur = 0
        elif c == '十': n += (cur or 1) * 10; cur = 0
    return n + cur

def chars(page):
    out = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for sp in l['spans']:
                for ch in sp['chars']:
                    out.append(dict(c=ch['c'], bbox=fitz.Rect(ch['bbox']), size=sp['size'], color=sp['color'], origin=ch['origin']))
    return out

def tail_run(cs, link):
    inside = [c for c in cs if c['bbox'].intersects(link['from']) and c['c'].strip()]
    vertical = link['from'].height > link['from'].width
    inside.sort(key=(lambda c: c['bbox'].y0) if vertical else (lambda c: c['bbox'].x0))
    run = []
    for c in reversed(inside):            # 末尾から続く漢数字
        if c['c'] in KSET: run.insert(0, c)
        else: break
    return run

def find_nombre(page, body_bottom):
    H = page.rect.height; W = page.rect.width
    cs = [c for c in chars(page) if c['bbox'].y0 > body_bottom and c['c'].strip()]
    if not cs: return None
    cs = [c for c in cs if abs((c['bbox'].x0 + c['bbox'].x1) / 2 - W / 2) < W * 0.25]
    if not cs: return None
    y = min(c['bbox'].y0 for c in cs)
    line = sorted([c for c in cs if abs(c['bbox'].y0 - y) < 3], key=lambda c: c['bbox'].x0)
    txt = ''.join(c['c'] for c in line)
    if re.fullmatch(r'\d+', txt): return ('arabic', int(txt), line)
    v = kanji_to_int(txt)
    if v is not None: return ('kanji', v, line)
    return None

def body_bottom_of(doc):
    # 本文のいちばん下（ページの下 15% の範囲で、いちばん多い大きさの字の下端）
    ys = []
    for pno in range(min(len(doc), 30)):
        p = doc[pno]; H = p.rect.height
        for c in chars(p):
            if c['size'] >= 9 and c['bbox'].y1 > H * 0.8: ys.append(c['bbox'].y1)
    return (max(ys) + 2) if ys else doc[0].rect.height * 0.92

def color_tuple(c):
    return ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255)

def redact(page, rects):
    links = page.get_links()
    for r in rects: page.add_redact_annot(r, fill=False)
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE, text=fitz.PDF_REDACT_TEXT_REMOVE)
    have = {(tuple(round(v) for v in l['from']), l.get('page')) for l in page.get_links()}
    for l in links:
        if (tuple(round(v) for v in l['from']), l.get('page')) not in have: page.insert_link(l)

def put(page, text, cx, cy, size, color, maxw=None):
    font = fitz.Font('tiro')
    w = font.text_length(text, fontsize=size)
    if maxw and w > maxw: size = size * maxw / w; w = font.text_length(text, fontsize=size)
    page.insert_text((cx - w / 2, cy + size * 0.35), text, fontname='tiro', fontsize=size, color=color_tuple(color))

def main(src, dst):
    doc = fitz.open(src)
    bb = body_bottom_of(doc)
    nomb = {}; changed = 0
    for pno, page in enumerate(doc):
        r = find_nombre(page, bb)
        if not r: continue
        kind, v, line = r
        nomb[pno] = v
        if kind == 'kanji':
            rect = fitz.Rect(line[0]['bbox'])
            for c in line[1:]: rect |= c['bbox']
            cx = (rect.x0 + rect.x1) / 2; cy = (rect.y0 + rect.y1) / 2
            redact(page, [rect + (-0.5, -0.5, 0.5, 0.5)])
            put(page, str(v), cx, cy, line[0]['size'] * 1.05, line[0]['color'])
            changed += 1
    # ノンブルのないページは前後から推定（ページ番号 = 通し番号 - ずれ）
    offs = collections.Counter(p - v for p, v in nomb.items())
    off = offs.most_common(1)[0][0] if offs else None
    if off is None:
        # ノンブルが読めないとき：目次の数字とリンク先の通し番号のずれが、ほぼそろっていればそれを使う
        cand = collections.Counter()
        for pno in range(min(10, len(doc))):
            cs = chars(doc[pno])
            for l in doc[pno].get_links():
                if l.get('kind') != fitz.LINK_GOTO: continue
                run = tail_run(cs, l)
                v = kanji_to_int(''.join(c['c'] for c in run)) if run else None
                if v is not None: cand[l['page'] - v] += 1
        if cand:
            o, k = cand.most_common(1)[0]
            if k >= 3 and k >= 0.7 * sum(cand.values()): off = o
    def expected(p):
        if p in nomb: return nomb[p]
        return p - off if off is not None else None
    toc = 0
    for pno in range(min(10, len(doc))):
        page = doc[pno]; links = [l for l in page.get_links() if l.get('kind') == fitz.LINK_GOTO]
        if not links: continue
        cs = chars(page); jobs = []; rest = []
        for l in links:
            exp = expected(l['page'])
            if exp is None: continue
            vertical = l['from'].height > l['from'].width
            run = tail_run(cs, l)
            if not run: continue
            val = kanji_to_int(''.join(c['c'] for c in run))
            rect = fitz.Rect(run[0]['bbox'])
            for c in run[1:]: rect |= c['bbox']
            if val == exp: jobs.append((rect, run, exp, vertical))
            else: rest.append((rect, run, val, vertical))
        # ページ数の列にきちんと並んでいる（他の項目と同じ高さで終わる）ものは、数が合わなくても目次の数字として直す
        if len(jobs) >= 3:
            ends = [j[0].y1 if j[3] else j[0].x1 for j in jobs]
            for r in rest:
                e = r[0].y1 if r[3] else r[0].x1
                if r[2] is not None and min(abs(e - x) for x in ends) < 3: jobs.append(r)
        if not jobs: continue
        redact(page, [j[0] + (-0.3, -0.3, 0.3, 0.3) for j in jobs])
        for rect, run, exp, vertical in jobs:
            s = run[0]['size']
            put(page, str(exp), (rect.x0 + rect.x1) / 2, (rect.y1 - s * 0.55) if vertical else (rect.y0 + rect.y1) / 2, s * 0.95, run[0]['color'], maxw=(s * 1.25 if vertical else None))
            toc += 1
    doc.save(dst, garbage=3, deflate=True)
    print(f'{src}: ノンブル {changed} ページ、目次 {toc} か所を算用数字に')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
