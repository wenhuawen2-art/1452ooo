"""Build bundled design font subsets without runtime network requests."""
from pathlib import Path
from urllib.request import urlretrieve
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.mastergo/font-tools'))
from fontTools import subset
from fontTools.ttLib import TTFont
import base64
import re

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.mastergo/fonts/source'
CACHE.mkdir(parents=True, exist_ok=True)
MINI = ROOT / 'wechat-miniprogram/miniprogram'
texts = ''.join(p.read_text(encoding='utf-8-sig') for p in (MINI / 'pages').rglob('*') if p.suffix in ('.js', '.wxml'))
texts += '早上好Zero物品清单每日穿搭团队准备我的准备团队行囊进度携带物品墨镜软用水与纸巾湿巾常用药品急救个人处方药创可贴布洛芬晕车药感冒药车辆出发检查轮胎胎压蓄电池与充电雨刷逛街白色衬衫四姑娘山最高最低添加类目穿搭空状态'
chars = ''.join(chr(n) for n in range(32, 127)) + ''.join(sorted(set(re.findall(r'[\u3000-\u9fff]', texts))))
faces = []
licenses = []
for weight, suffix in [(400, '55-Regular'), (500, '65-Medium'), (600, '75-SemiBold'), (800, '95-ExtraBold')]:
    name = 'AlibabaPuHuiTi-2-' + suffix
    url = f'https://puhuiti.oss-cn-hangzhou.aliyuncs.com/AlibabaPuHuiTi-2/{name}/{name}.ttf'
    source = CACHE / (name + '.ttf')
    if not source.exists():
        try:
            urlretrieve(url, source)
        except Exception:
            url = f'https://raw.githubusercontent.com/Fretice/AlibabaPuHuiFonts/master/{name}.ttf'
            try:
                urlretrieve(url, source)
            except Exception:
                url = f'https://huggingface.co/datasets/tomjackson2023/Fonts/resolve/main/{name}.ttf'
                urlretrieve(url, source)
    font = TTFont(source)
    licenses += [f'{name}: {url}'] + list(dict.fromkeys(n.toUnicode() for n in font['name'].names if n.nameID in (0, 13, 14)))
    options = subset.Options()
    options.flavor = 'woff2'
    sub = subset.Subsetter(options=options)
    sub.populate(text=chars)
    sub.subset(font)
    font.flavor = 'woff2'
    target = CACHE / (name + '.woff2')
    font.save(target)
    faces.append(f"@font-face{{font-family:'Alibaba PuHuiTi 2.0';font-weight:{weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,{base64.b64encode(target.read_bytes()).decode()}) format('woff2')}}")
    print(name, target.stat().st_size)

source = CACHE / 'KonkhmerSleokchher-Regular.ttf'
url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/konkhmersleokchher/KonkhmerSleokchher-Regular.ttf'
if not source.exists():
    urlretrieve(url, source)
font = TTFont(source)
options = subset.Options()
sub = subset.Subsetter(options=options)
sub.populate(text='0123456789°%/:.- Welcome To')
sub.subset(font)
font.flavor = 'woff2'
target = CACHE / 'KonkhmerSleokchher-Regular.woff2'
font.save(target)
faces.append(f"@font-face{{font-family:'Konkhmer Sleokchher';font-weight:400;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,{base64.b64encode(target.read_bytes()).decode()}) format('woff2')}}")
(MINI / 'styles/fonts.wxss').write_text('/* Bundled subsets: see assets/mastergo-list/FONTS.txt. */\n' + '\n'.join(faces) + '\n', encoding='utf-8')
licenses += ['Konkhmer Sleokchher: ' + url, 'Copyright 2022 The Konkhmer Sleokchher Project Authors. SIL Open Font License 1.1.']
(MINI / 'assets/mastergo-list/FONTS.txt').write_text('\n'.join(licenses) + '\nSubsets retain source names and include application text, ASCII, and numeric glyphs. Uncovered user characters use system fallback.\n', encoding='utf-8')
