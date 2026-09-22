"""Optimize the PNGs that must stay in the WeChat mini-program main package."""

from pathlib import Path

from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "wechat-miniprogram" / "miniprogram" / "assets"
FILES = [ASSETS / "brand" / "logo-144.png", *sorted((ASSETS / "template-icons").glob("*.png"))]

for path in FILES:
    with Image.open(path) as source:
        optimized = source.convert("RGBA").quantize(colors=96, method=Image.Quantize.FASTOCTREE)
        optimized.save(path, format="PNG", optimize=True)
    print(f"{path.name}: {path.stat().st_size} bytes")
