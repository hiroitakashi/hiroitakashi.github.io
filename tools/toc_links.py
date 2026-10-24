# 小説PDFの目次にページ内リンク（と「しおり」）を付ける  usage: toc_links.py in.pdf out.pdf
import fitz,sys,re,unicodedata as u,collections,json,difflib,statistics
N=lambda t:re.sub(r'\s+','',u.normalize('NFKC',t))
KN={'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
NUMCH=set('0123456789〇零一二三四五六七八九十百')
LEAD=set('・.…‥-—―─ ･')
def parse_num(s):
  if not s: return None
  if re.fullmatch(r'\d+',s): return int(s)
  if not all(c in KN or c in '十百' for c in s): return None
  if '十' in s or '百' in s:
    tot=0;cur=0
    for c in s:
      if c in KN: cur=KN[c]
      elif c=='十': tot+=(cur or 1)*10;cur=0
      elif c=='百': tot+=(cur or 1)*100;cur=0
    return tot+cur
  return int(''.join(str(KN[c]) for c in s))
def chars(page):
  out=[]
  for b in page.get_text("rawdict")['blocks']:
    for l in b.get('lines',[]):
      for sp in l['spans']:
        for ch in sp['chars']:
          c=u.normalize('NFKC',ch['c'])
          if c.strip(): out.append((c,fitz.Rect(ch['bbox']),sp['size']))
  return out
def clean(t):
  t=re.sub(r'[・.…‥\-—―─･「」『』()（）、,]','',t)
  return t
def core(t):
  m=re.match(r'^(序章|終章|序|第[一二三四五六七八九十百\d]+[章部巻話]|[一二三四五六七八九十百]+|あとがき|後書き)(.*)$',t)
  return (m.group(2) or t) if m else t
def is_vertical(cs):
  below=right=0
  pos=[(round(c[1].x0),round(c[1].y0),round(c[1].x1),round(c[1].y1)) for c in cs]
  S=set((a,b) for a,b,_,_ in pos)
  for x0,y0,x1,y1 in pos:
    if any((x0,y) in S for y in range(y1-1,y1+4)): below+=1
    if any((x,y0) in S for x in range(x1-1,x1+4)): right+=1
  return below>=right
def toc_entries(page):
  cs=chars(page)
  if not cs: return [],True
  med=statistics.median(c[2] for c in cs)
  main=[c for c in cs if c[2]>=med*0.8]
  # 縦書き判定：同じx0を持つ文字が多い
  vertical=is_vertical(main)
  # 列（行）の基準：全角の本文字
  anchors=[]
  for c in sorted(main,key=lambda c:(c[1].x0 if vertical else c[1].y0)):
    lo,hi=((c[1].x0,c[1].x1) if vertical else (c[1].y0,c[1].y1))
    if hi-lo<c[2]*0.8: continue
    if anchors and abs(anchors[-1][0]-lo)<1.5: continue
    anchors.append((lo,hi))
  cols=[[] for _ in anchors]
  for c in main:
    mid=((c[1].x0+c[1].x1)/2) if vertical else ((c[1].y0+c[1].y1)/2)
    for i,(lo,hi) in enumerate(anchors):
      if lo-1<=mid<=hi+1: cols[i].append(c);break
  order=range(len(anchors)-1,-1,-1) if vertical else range(len(anchors))
  ents=[]
  for i in order:
    col=sorted([c for c in cols[i] if c[0] not in LEAD],key=lambda c:(c[1].y0 if vertical else c[1].x0))
    if not col: continue
    # 末尾のページ番号（大きな隙間の後の数字）
    j=len(col)
    while j>0 and col[j-1][0].isdigit(): j-=1
    if j==len(col):
      while j>0 and col[j-1][0] in NUMCH: j-=1
    num=None
    if j<len(col) and j>0:
      a=col[j-1][1];b=col[j][1];gap=(b.y0-a.y1) if vertical else (b.x0-a.x1)
      tail=''.join(c[0] for c in col[j:])
      if gap>=12 or tail.isascii(): num=parse_num(tail)
      else: j=len(col)
    title=''.join(c[0] for c in col[:j])
    if not title or title=='目次' or re.fullmatch(r'[\d]+',title): continue
    r=fitz.Rect(col[0][1])
    for c in col: r|=c[1]
    ents.append({'title':title,'num':num,'rect':r})
  return ents,vertical
def headings(d,start):
  # 本文の文字サイズより大きい文字＝見出し
  sizes=collections.Counter()
  for i in range(start,min(len(d),start+12)):
    for c in chars(d[i]): sizes[round(c[2],1)]+=1
  body=sizes.most_common(1)[0][0] if sizes else 10
  H=[]
  for i in range(start,len(d)):
    cs=[c for c in chars(d[i]) if c[2]>=body*1.18]
    if not cs: continue
    # 読み順：縦書き（右の列から）
    if is_vertical(cs): cs.sort(key=lambda c:(-round(c[1].x0),c[1].y0))
    else: cs.sort(key=lambda c:(round(c[1].y0),c[1].x0))
    t=clean(''.join(c[0] for c in cs))
    if len(t)>=1 and not re.fullmatch(r'\d+',t): H.append((i,t+'|'+clean(N(d[i].get_text()))[:80]))
  return H
def sim(a,b):
  a=clean(a);b=clean(b)
  if not a or not b: return 0
  if core(a) and core(a) in b: return 1.0
  return difflib.SequenceMatcher(None,a,b).ratio()
def run(path,out):
  d=fitz.open(path)
  t0=next(i for i in range(min(10,len(d))) if '目次' in N(d[i].get_text()))
  pages=[t0]
  for i in range(t0+1,min(t0+8,len(d))):
    t=N(d[i].get_text())
    if t.count('。')<=2 and len(t)<1800: pages.append(i)
    else: break
  ents=[]
  for p in pages:
    es,_=toc_entries(d[p])
    for e in es: e['page']=p;ents.append(e)
  cnt=collections.Counter(e['page'] for e in ents)
  pages=[p for p in pages if cnt[p]>=2 or p==t0]
  ents=[e for e in ents if e['page'] in pages]
  body0=max(pages)+1
  H=headings(d,body0)
  # 順番に照合
  hi=0;votes=collections.Counter()
  for e in ents:
    best=None
    for k in range(hi,min(len(H),hi+12)):
      s=sim(e['title'],H[k][1])
      if s>=0.6 and (best is None or s>best[0]+0.05): best=(s,k)
      if best and best[0]>=1.0: break
    if best:
      e['target']=H[best[1]][0];hi=best[1]+1
      if e['num'] is not None: votes[e['target']-e['num']]+=1
    else: e['target']=None
  off=votes.most_common(1)[0][0] if votes else None
  texts={}
  def ptxt(i):
    if i not in texts: texts[i]=clean(N(d[i].get_text()))
    return texts[i]
  for e in ents:
    if e['target'] is None and e['num'] is not None and off is not None and 0<=e['num']+off<len(d):
      g=e['num']+off;c=clean(core(e['title']))[:6];best=g
      if len(c)>=2:
        hit=next((g+dd for dd in (0,1,-1,2) if 0<=g+dd<len(d) and c in ptxt(g+dd)),None)
        if hit is None:
          prev=max([x['target'] for x in ents if x.get('target') is not None and x is not e and ents.index(x)<ents.index(e)] or [body0])
          hit=next((i for i in range(prev,min(len(d),prev+25)) if c in ptxt(i)),None)
        if hit is not None: best=hit
      e['target']=best;e['how']='num'
  for i,e in enumerate(ents):
    if e['target'] is None:
      nx=next((x['target'] for x in ents[i+1:] if x['target'] is not None),None)
      if nx is not None: e['target']=nx;e['how']='next'
  for p in pages:
    for l in d[p].get_links(): d[p].delete_link(l)
  n=0
  for e in ents:
    if e['target'] is None: continue
    r=fitz.Rect(e['rect']);r.x0-=2;r.x1+=2;r.y0-=2;r.y1+=2
    d[e['page']].insert_link({'kind':fitz.LINK_GOTO,'page':e['target'],'from':r,'to':fitz.Point(0,0)});n+=1
  if not d.get_toc():
    part=any(re.match(r'第.+[部巻]',e['title']) for e in ents);toc=[]
    for e in ents:
      if e['target'] is None: continue
      lvl=1 if (not part or re.match(r'第.+[部巻]',e['title'])) else 2
      if lvl==2 and not toc: lvl=1
      toc.append([lvl,e['title'],e['target']+1])
    try: d.set_toc(toc)
    except Exception as ex: print('  toc skip',ex)
  d.save(out,garbage=3,deflate=True)
  return {'toc_pages':pages,'offset':off,'entries':len(ents),'linked':n,'headings':len(H),
          'list':[(e['title'][:16],e['num'],e['target'],e.get('how',''),(N(d[e['target']].get_text())[:16] if e['target'] is not None else '')) for e in ents]}
if __name__=='__main__':
  r=run(sys.argv[1],sys.argv[2]);print(json.dumps({k:v for k,v in r.items() if k!='list'},ensure_ascii=False))
  for x in r['list']: print('   ',x)
