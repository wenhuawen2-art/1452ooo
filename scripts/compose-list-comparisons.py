from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root = Path(__file__).resolve().parents[1]
output = root / 'output/playwright'
sources = Path.home() / '.mgmcp/resources/screenshots/207398416604513'
font = ImageFont.truetype(str(root / '.mastergo/fonts/source/AlibabaPuHuiTi-2-55-Regular.ttf'), 18)
for name, layer, title in [('public','5-03961','团队清单-亮色'),('personal','5-04740','我的清单-亮色'),('outfit','5-03498','穿搭-亮色'),('outfit-empty','5-04436','穿搭-亮色')]:
    reference = Image.open(sources / layer / f'{title}_{layer}.png').convert('RGB')
    actual = Image.open(output / f'list-corrected-{name}-393.png').convert('RGB')
    canvas = Image.new('RGB',(802,1613),'#f1f5f9')
    draw = ImageDraw.Draw(canvas)
    draw.text((16,8),'MasterGo 设计稿',font=font,fill='#17212c')
    draw.text((425,8),'本地实现 · 共用行程背景',font=font,fill='#17212c')
    canvas.paste(reference,(0,40));canvas.paste(actual,(409,40))
    canvas.save(output / f'compare-list-{name}-393.png')
log = (output / 'list-visual-check.log').read_text(encoding='utf-8-sig')
if log.startswith('### Result'):
    metrics = json.loads(log.splitlines()[1])
    (output / 'list-visual-metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(metrics)} browser scenarios; all checked geometry, fonts, images, overflow, and 28px gap.')
