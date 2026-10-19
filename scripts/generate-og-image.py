#!/usr/bin/env python3
"""Erzeugt das Open-Graph-Vorschaubild (`public/og-image.png`) aus dem
hellen Logo plus einem Service-Untertitel und Standort-Zeile.

Nutzung:
    python3 scripts/generate-og-image.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

WIDTH, HEIGHT = 1200, 630

BRAND_DARK = (14, 23, 42)        # #0E172A
BRAND_MID = (29, 45, 92)         # Tiefes Marineblau
BRAND_HIGHLIGHT = (56, 97, 206)  # #3861CE
WHITE = (255, 255, 255)
MUTED = (176, 193, 221)

SERVICES_LINE = "Reparaturen  ·  Reinigung  ·  Wartung  ·  Objektbetreuung"
LOCATION_LINE = "zeus-service.de  ·  Hamburg & Norderstedt"

INTER_BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
INTER_MEDIUM = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"


def diagonal_gradient(size: tuple[int, int]) -> Image.Image:
    """Weicher Diagonal-Gradient von dunklem zu etwas helleren Brand-Blau."""
    w, h = size
    base = Image.new("RGB", size, BRAND_DARK)
    overlay = Image.new("RGB", size, BRAND_HIGHLIGHT)
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for i in range(w + h):
        intensity = int(90 * (i / (w + h)))
        draw.line([(i, 0), (0, i)], fill=intensity)
    return Image.composite(overlay, base, mask)


def main() -> None:
    canvas = diagonal_gradient((WIDTH, HEIGHT)).convert("RGBA")

    logo = Image.open(PUBLIC / "logo-light.png").convert("RGBA")
    target_w = 620
    ratio = target_w / logo.width
    logo = logo.resize((target_w, int(logo.height * ratio)), Image.LANCZOS)
    logo_x = (WIDTH - logo.width) // 2
    logo_y = 190
    canvas.alpha_composite(logo, (logo_x, logo_y))

    draw = ImageDraw.Draw(canvas)

    svc_font = ImageFont.truetype(INTER_BOLD, 36)
    svc_bbox = draw.textbbox((0, 0), SERVICES_LINE, font=svc_font)
    svc_w = svc_bbox[2] - svc_bbox[0]
    draw.text(
        ((WIDTH - svc_w) // 2, logo_y + logo.height + 50),
        SERVICES_LINE,
        font=svc_font,
        fill=WHITE,
    )

    loc_font = ImageFont.truetype(INTER_MEDIUM, 26)
    loc_bbox = draw.textbbox((0, 0), LOCATION_LINE, font=loc_font)
    loc_w = loc_bbox[2] - loc_bbox[0]
    draw.text(
        ((WIDTH - loc_w) // 2, logo_y + logo.height + 110),
        LOCATION_LINE,
        font=loc_font,
        fill=MUTED,
    )

    out = PUBLIC / "og-image.png"
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
