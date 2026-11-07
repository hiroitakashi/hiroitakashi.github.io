#!/usr/bin/env python3
"""縦書きの小説PDFから、読書画面で組み直す（リフローする）ための本文データを作る。

  python3 tools/pdf_to_text.py files/pdf-xxx.pdf files/text-xxx.json
  python3 tools/pdf_to_text.py --all          # files/pdf-*.pdf をすべて変換

出力（JSON）:
  {"v":1, "title":"…", "blocks":[ ブロック, … ]}
  ブロック:
    ["h", ["第一章", "漂流"]]      章見出し（行ごと。新しいページから始める）
    ["p", 字下げ字数, "本文"]       段落。本文中のルビは ｜親字《るび》
    ["s", "＊"]                    場面の区切り（元の記号）
    ["g"]                          1行あき
- 1ページ目（表紙）と目次のページは入れない（読書画面が表紙の画像と目次を自前で作る）。
- ノンブル・柱（ページ上下の小さな字）は入れない。
- PyMuPDF が必要。
"""
import sys, re, json, glob, os, statistics, collections, unicodedata
import pymupdf as fitz

HEAD_RE = re.compile(r'^(第[一二三四五六七八九十百千〇0-9０-９]+[章部巻話幕篇編]|序章?|終章|序|跋|あとがき|後書き?|エピローグ|プロローグ|最終章|間章|附録|付録|作者覚書|著者あとがき)(　.*)?$')
SEP_RE = re.compile(r'^[＊\*◇◆※☆★・　\s]+$')
OPEN = set('「『（【〔〈《［｛')
CLOSE_END = set('。」』）】〕〉》！？…―')


def norm(c):
    o = ord(c)
    if 0xFE10 <= o <= 0xFE19 or 0xFE30 <= o <= 0xFE4F:   # 縦書き用の約物 → ふつうの字
        return unicodedata.normalize('NFKC', c)
    return c


def page_chars(page):
    out = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                for ch in s['chars']:
                    c = norm(ch['c'])
                    if c in ('\n', '\t'):
                        continue
                    x0, y0, x1, y1 = ch['bbox']
                    out.append({'c': c, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 's': round(s['size'], 2),
                                'xc': (x0 + x1) / 2, 'yc': (y0 + y1) / 2})
    return out


def cluster_cols(chars, tol):
    cols = []
    for ch in sorted(chars, key=lambda c: -c['xc']):
        if cols and abs(cols[-1]['xc'] - ch['xc']) <= tol(ch):
            cols[-1]['chars'].append(ch)
        else:
            cols.append({'xc': ch['xc'], 'chars': [ch]})
    # 縦中横（縦書きの中で横に並べた数字・英字）は隣の列とまとめる
    isn = lambda c: c['c'].isascii() and c['c'].isalnum() or c['c'] in '!?％%'
    merged = []
    for col in cols:
        if len(col['chars']) <= 4 and all(isn(c) for c in col['chars']):
            ys0 = min(c['y0'] for c in col['chars']); ys1 = max(c['y1'] for c in col['chars'])
            best = None
            for o in cols:
                if o is col or o.get('_gone'): continue
                if abs(o['xc'] - col['xc']) < 1.1 * max(c['s'] for c in col['chars']) and \
                        min(c['y0'] for c in o['chars']) - 1 <= ys0 and max(c['y1'] for c in o['chars']) + 1 >= ys1:
                    if best is None or abs(o['xc'] - col['xc']) < abs(best['xc'] - col['xc']): best = o
            if best is not None:
                best['chars'] += col['chars']; col['_gone'] = True
    cols = [c for c in cols if not c.get('_gone')]
    for col in cols:
        col['chars'].sort(key=lambda c: (round(c['yc'], 0), c['x0']))
        # 空白は英語の単語の間だけ残す
        cs = col['chars']
        col['chars'] = [c for k, c in enumerate(cs) if c['c'] != ' ' or
                        (0 < k < len(cs) - 1 and cs[k - 1]['c'].isascii() and cs[k + 1]['c'].isascii() and cs[k - 1]['c'] != ' ')]
    cols = [c for c in cols if c['chars']]
    for col in cols:
        col['x0'] = min(c['x0'] for c in col['chars']); col['x1'] = max(c['x1'] for c in col['chars'])
        col['y0'] = col['chars'][0]['y0']; col['y1'] = max(c['y1'] for c in col['chars'])
        col['s'] = statistics.median(c['s'] for c in col['chars'])
    return cols


def convert(src):
    d = fitz.open(src)
    pages = [page_chars(d[i]) for i in range(len(d))]
    sizes = collections.Counter()
    for pc in pages[1:]:
        for c in pc:
            sizes[c['s']] += 1
    S = sizes.most_common(1)[0][0]                     # 本文の字の大きさ
    # 本文の範囲：本文の大きさの字の列の、書き出し（いちばん多い位置）と終わり
    starts, ends, steps = collections.Counter(), [], []
    for pc in pages[1:]:
        bc = [c for c in pc if abs(c['s'] - S) < .05 * S]
        for col in cluster_cols(bc, lambda c: .45 * S):
            if len(col['chars']) < 4:
                continue
            starts[round(col['y0'])] += 1; ends.append(col['y1'])
            steps += [b['y0'] - a['y0'] for a, b in zip(col['chars'], col['chars'][1:]) if 0 < b['y0'] - a['y0'] < 2 * S]
    mx = starts.most_common(1)[0][1]
    TOP = min(y for y, n in starts.items() if n >= .05 * mx)   # 字下げしていない列の書き出し
    ends.sort(); BOT = ends[int(len(ends) * .97)]
    PITCH = statistics.median(steps) if steps else S
    # 目次のページ（ページ内リンクが多い、または「目次」の見出しがある）
    toc_pages = set()
    for i in range(1, len(d)):
        links = [l for l in d[i].get_links() if l.get('kind') in (fitz.LINK_GOTO, fitz.LINK_NAMED)]
        txt = ''.join(c['c'] for c in pages[i])
        if len(links) >= 3 or re.match(r'^\s*目\s*次', txt):
            toc_pages.add(i)
    blocks, stat = [], collections.Counter()
    prev = None                     # 直前の本文の列
    para = None
    pitch_samples = []

    def flush():
        nonlocal para
        if para is not None:
            t = re.sub(r'(?<![\x21-\x7e]) +| +(?![\x21-\x7e])', '', para['text']); n = len(t) - len(t.lstrip('\u3000'))
            blocks.append(['p', min(para['indent'] + n, 20), t[n:]])
            para = None

    for i in range(1, len(d)):
        if i in toc_pages:
            stat['toc_pages'] += 1; flush(); prev = None; continue
        pc = pages[i]
        main = [c for c in pc if c['s'] > .78 * S]
        small = [c for c in pc if c['s'] <= .78 * S]
        # ページの上下の余白にある字（ノンブル・柱）は除く
        def inbox(c, m): return c['y0'] >= TOP - m and c['y1'] <= BOT + m
        main_in = [c for c in main if c['s'] > 1.15 * S or (inbox(c, .4 * S) if abs(c['s'] - S) > .05 * S else inbox(c, 1.6 * S))]
        stat['margin_dropped'] += len(main) - len(main_in)
        cols = cluster_cols(main_in, lambda c: .45 * max(c['s'], S))
        # ルビ：本文の列のすぐ右にある小さな字
        rcols = cluster_cols([c for c in small if .4 * S <= c['s'] <= .56 * S and TOP - 1.2 * S <= c['y0'] <= BOT + 1.2 * S], lambda c: .45 * c['s'])
        ruby_on = collections.defaultdict(list)           # 列番号 → [(y0,y1,文字列)]
        for rc in rcols:
            groups, g = [], [rc['chars'][0]]
            for a, b in zip(rc['chars'], rc['chars'][1:]):
                if b['y0'] - a['y1'] > .6 * a['s']:
                    groups.append(g); g = [b]
                else:
                    g.append(b)
            groups.append(g)
            best = None
            for k, col in enumerate(cols):
                dx = rc['x0'] - col['x1']
                if -.35 * S <= dx <= .45 * S and (best is None or abs(dx) < best[0]):
                    best = (abs(dx), k)
            if best is None:
                stat['small_dropped'] += len(rc['chars']); continue
            for g in groups:
                ruby_on[best[1]].append((g[0]['y0'], g[-1]['y1'], ''.join(c['c'] for c in g)))
        for k, col in enumerate(cols):
            col['text'] = attach_ruby(col['chars'], ruby_on.get(k, []), stat)
            raw = ''.join(c['c'] for c in col['chars']).replace('　', '　')
            col['raw'] = raw
            col['head'] = (col['s'] > 1.08 * S and len(raw) <= 30) or (len(raw) <= 14 and HEAD_RE.match(raw.strip('　')) is not None and (col['y0'] > TOP + .5 * S or col['s'] > 1.04 * S))
        # 見出しの列（同じページで続くもの）をまとめる
        k = 0
        last_x = None
        while k < len(cols):
            col = cols[k]
            if col['head']:
                flush()
                lines = []
                while k < len(cols) and cols[k]['head']:
                    t = cols[k]['raw'].strip('　')
                    if t: lines.append(re.sub(r'　+', '　', t))
                    k += 1
                if lines and all(re.fullmatch(r'[―─—\-－・＊\*◇◆　]+', t) for t in lines):
                    blocks.append(['s']); stat['seps'] += 1
                elif lines:
                    blocks.append(['h', lines]); stat['headings'] += 1
                prev = None; last_x = None
                continue
            raw = col['raw']
            if SEP_RE.match(raw) and len(raw.strip('　')) <= 6:
                flush(); blocks.append(['s', raw.strip('　')]); stat['seps'] += 1; prev = None; last_x = col['xc']; k += 1; continue
            indent = max(0, round((col['y0'] - TOP) / PITCH))
            full = col['y1'] >= BOT - .8 * PITCH
            if last_x is not None:
                pitch_samples.append(last_x - col['xc'])
            gap = False
            if last_x is not None and pitch_samples:
                pitch = statistics.median(pitch_samples[-200:])
                gap = (last_x - col['xc']) > 1.65 * pitch
            first = col['chars'][0]['c']
            cont = (para is not None and prev is not None and prev['full'] and indent == 0 and not gap
                    and not (first in OPEN and prev['raw'][-1:] in CLOSE_END))
            if cont:
                para['text'] += col['text']
            else:
                flush()
                if gap and blocks and blocks[-1][0] == 'p':
                    blocks.append(['g'])
                para = {'indent': min(indent, 20), 'text': col['text']}
            prev = {'full': full, 'raw': raw}
            last_x = col['xc']
            k += 1
        # ページの最後の列がいっぱいでなければ段落はそこで終わり
        if prev is not None and not prev['full']:
            flush(); prev = None
    flush()
    title = (d.metadata or {}).get('title') or os.path.basename(src)
    # 字下げ1字の段落はふつうの段落として 1、それ以外はそのまま
    return {'v': 1, 'title': title, 'size': S, 'blocks': blocks}, stat


def attach_ruby(chars, rubies, stat):
    """列の字にルビを付けて ｜親字《るび》 の形の文字列にする"""
    if not rubies:
        return ''.join(c['c'] for c in chars)
    marks = {}
    for (ry0, ry1, rt) in rubies:
        idx = [i for i, c in enumerate(chars) if ry0 - .05 * (c['y1'] - c['y0']) <= c['yc'] <= ry1 + .05 * (c['y1'] - c['y0'])]
        if not idx:
            ov = [(min(c['y1'], ry1) - max(c['y0'], ry0), i) for i, c in enumerate(chars)]
            ov = [t for t in ov if t[0] > 0]
            if ov: idx = [max(ov)[1]]
        if not idx:
            stat['ruby_lost'] += 1; continue
        a, b = idx[0], idx[-1]
        marks[a] = (b, rt); stat['ruby'] += 1
    out, i = [], 0
    while i < len(chars):
        if i in marks:
            b, rt = marks[i]
            out.append('｜' + ''.join(c['c'] for c in chars[i:b + 1]) + '《' + rt + '》'); i = b + 1
        else:
            out.append(chars[i]['c']); i += 1
    return ''.join(out)


def main():
    if sys.argv[1:] == ['--all']:
        for p in sorted(glob.glob('files/pdf-*.pdf')):
            key = os.path.basename(p)[4:-4]
            data, stat = convert(p)
            out = f'files/text-{key}.json'
            json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            n = sum(len(b[2]) for b in data['blocks'] if b[0] == 'p')
            print(f'{key:10s} {len(data["blocks"]):5d} blocks {n:7d} chars', dict(stat))
    else:
        data, stat = convert(sys.argv[1])
        json.dump(data, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(sys.argv[2], dict(stat))


if __name__ == '__main__':
    main()
