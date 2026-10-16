"""Generate a verified black/white QR only for the live, rebranded production site.

Requires qrcode, Pillow, zxing-cpp, Node.js and Sharp. No remote QR service.
Pass --node and --sharp when the local verification runtime is not on PATH.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.request import Request, urlopen

import qrcode
import qrcode.image.svg
from PIL import Image
import zxingcpp

URL = "https://win-joinery.vercel.app/"
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "delivery/win-joinery"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default=os.environ.get("NODE_BINARY", "node"))
    parser.add_argument("--sharp", default=os.environ.get("SHARP_MODULE", "sharp"))
    args = parser.parse_args()
    request = Request(URL, headers={"User-Agent": "WIN-Joinery-Delivery-Verification/1.0"})
    with urlopen(request, timeout=30) as response:
        content = response.read().decode("utf-8")
        if response.status != 200 or response.url != URL:
            raise RuntimeError("The final production URL is not serving directly.")
    if "WIN JOINERY SDN BHD" not in content or "WIN DESIGN" in content:
        raise RuntimeError("Production must serve the completed rebrand before QR delivery.")

    DEST.mkdir(parents=True, exist_ok=True)
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q,
                       box_size=60, border=4)
    qr.add_data(URL)
    qr.make(fit=True)
    png = DEST / "win-joinery-website-qr.png"
    svg = DEST / "win-joinery-website-qr.svg"
    bitmap = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    bitmap.save(png, dpi=(600, 600))
    qr.make_image(image_factory=qrcode.image.svg.SvgPathFillImage).save(svg)
    decoded = zxingcpp.read_barcode(Image.open(png))
    if decoded is None or decoded.text != URL:
        raise RuntimeError("Independent PNG QR decoder did not return the production URL.")
    # Check the SVG structure, then rasterize the actual delivered vector with
    # Sharp/libvips and independently decode those pixels using ZXing.
    import re
    import xml.etree.ElementTree as ET
    root = ET.parse(svg).getroot()
    path = root.find("{http://www.w3.org/2000/svg}path").attrib["d"]
    # SVG backend emits one move per dark module.
    modules = qr.get_matrix()
    moves = len(re.findall(r"[Mm]", path))
    if moves != sum(sum(row) for row in modules):
        raise RuntimeError("SVG module count differs from the validated QR matrix.")
    raster_script = """
        import { createRequire } from 'node:module';
        const require = createRequire(import.meta.url);
        const sharp = require(process.argv[3]);
        await sharp(process.argv[1], { density: 300 })
          .resize(1800, 1800, { fit: 'inside' })
          .png().toFile(process.argv[2]);
        process.stdout.write(JSON.stringify({ sharp: sharp.versions.sharp, vips: sharp.versions.vips }));
    """
    with tempfile.TemporaryDirectory(prefix="win-joinery-qr-") as temporary:
        raster = Path(temporary) / "delivered-svg-raster.png"
        result = subprocess.run(
            [args.node, "--input-type=module", "-e", raster_script,
             str(svg), str(raster), args.sharp],
            check=True, capture_output=True, text=True,
        )
        with Image.open(raster) as raster_image:
            svg_pixels = list(raster_image.size)
            svg_decoded = zxingcpp.read_barcode(raster_image)
        if svg_decoded is None or svg_decoded.text != URL:
            raise RuntimeError("Independent SVG QR decoder did not return the production URL.")
        renderer = json.loads(result.stdout)
    report = {"url": URL, "pngPixels": list(bitmap.size), "dpi": 600,
              "quietZoneModules": 4, "errorCorrection": "Q", "pngDecoded": decoded.text,
              "svgDecoded": svg_decoded.text, "svgRasterPixels": svg_pixels,
              "svgRasterizer": renderer, "svgDarkModules": moves,
              "files": [{"name": file.name, "bytes": file.stat().st_size,
                         "sha256": hashlib.sha256(file.read_bytes()).hexdigest()} for file in [png, svg]]}
    (DEST / "qr-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
