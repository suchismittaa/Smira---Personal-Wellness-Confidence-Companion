import re,glob,sys
# Every hex / rgb triplet that exists in Sumi's theme (SM, LIGHT_T, index.css surface layer)
HEX={h.upper() for h in """#7F9A66 #4F6B3E #A9BC93 #E0EBD0 #D98A93 #B4636B #F6E4E3 #C4585F #A9414A #FBF7EC #4E5138 #B8902A
#EEF3E2 #FBF8EE #9C525A #E6EEDA #565640 #6E7A59 #BF737B #C3DCAA #F4EFDF #C6A227 #BCCCA6 #C4696F #D9B08C #D9A0A6 #D9B98C #F3EAD3
#4A5238 #8A4A55 #FFFEFC #DEE8CD #FFF #FFFFFF""".split()}
RGB={tuple(map(int,t.split(','))) for t in """78,81,56 112,132,86 252,250,242 196,88,95 127,154,102 217,138,147 196,105,111 184,144,42 160,110,110
120,100,85 253,251,244 140,160,112 251,247,236 220,232,205 243,223,224 255,254,252 169,188,147 224,235,208 246,228,227 217,176,140 217,185,140
201,127,132 163,179,148 79,107,62 180,99,107 198,162,39 255,255,255""".split()}
bad=[]
for f in sorted(glob.glob('*.css')+glob.glob('*.js')+glob.glob('*.jsx')):
    if f=='cycleContent.js': continue  # original PHASES data from the existing app; not used by the UI
    for n,line in enumerate(open(f,encoding='utf8'),1):
        for h in re.findall(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b',line):
            if h.upper() not in HEX: bad.append((f,n,h))
        for m in re.findall(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)',line):
            if tuple(map(int,m)) not in RGB: bad.append((f,n,'rgb'+str(m)))
if bad:
    print(len(bad),'off-palette colours:'); [print(' ',*b) for b in bad]; sys.exit(1)
print('palette audit: every colour is from Sumi\'s theme')
