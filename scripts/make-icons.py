"""Genera los íconos de la app instalable (PWA) desde el logo de la cooperativa.

Se corre A MANO una sola vez (o cuando cambie el logo) y los PNG se commitean:
el build de Docker no tiene Pillow ni sharp, así que nunca se generan en el build.

    python scripts/make-icons.py [ruta/al/logo]

Por defecto usa logo.jpg de la raíz del Mundo. Con el logo actual de 200x200 los
íconos de 512 salen agrandados 2,5x: conviene reemplazarlo por el original en alta
resolución cuando la cooperativa lo mande (ver ADR-057).
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "logo.jpg"
OUT = ROOT / "apps" / "web" / "public" / "icons"
WHITE = (255, 255, 255, 255)


def on_white(size: int, logo_fraction: float) -> Image.Image:
    """Logo centrado sobre fondo blanco, ocupando `logo_fraction` del lado."""
    canvas = Image.new("RGBA", (size, size), WHITE)
    side = round(size * logo_fraction)
    logo = Image.open(SRC).convert("RGBA").resize((side, side), Image.LANCZOS)
    offset = (size - side) // 2
    canvas.alpha_composite(logo, (offset, offset))
    return canvas.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # "any": el logo ya es un círculo con aire alrededor, va casi a lienzo completo.
    on_white(192, 0.96).save(OUT / "icon-192.png", optimize=True)
    on_white(512, 0.96).save(OUT / "icon-512.png", optimize=True)
    # "maskable": Android recorta hasta un círculo del 80% del lado; el logo va dentro.
    on_white(512, 0.78).save(OUT / "icon-maskable-512.png", optimize=True)
    on_white(180, 0.9).save(OUT / "apple-touch-icon.png", optimize=True)
    on_white(32, 1.0).save(OUT / "favicon-32.png", optimize=True)
    for f in sorted(OUT.glob("*.png")):
        print(f"{f.relative_to(ROOT)}  {Image.open(f).size}")


if __name__ == "__main__":
    main()
