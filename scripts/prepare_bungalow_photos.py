"""Audit and prepare the supplied Bungalow photographs without altering their content.

Requires Pillow. Originals are read-only. The audit identifies both byte-identical
and decoded-pixel duplicates; only a confirmed duplicate is omitted from delivery.
No upscaling, crop, colour grading, retouching or generated imagery is used.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "BUNGALOW BUKIT TAMAN SEGAR"
DEST = ROOT / "public/images/bungalow-bukit-taman-segar"
AUDIT = ROOT / "validation/bungalow-photo-audit"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".avif"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    AUDIT.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    records, seen_bytes, seen_pixels, thumbnails = [], {}, {}, []
    files = sorted(path for path in SOURCE.iterdir() if path.is_file())
    for index, path in enumerate(files, 1):
        entry = {"source": path.name, "sourceBytes": path.stat().st_size, "index": index}
        records.append(entry)
        if path.suffix.lower() not in EXTENSIONS:
            entry["status"] = "not-an-image"
            continue
        try:
            with Image.open(path) as check:
                check.verify()
            with Image.open(path) as opened:
                photo = ImageOps.exif_transpose(opened).convert("RGB")
                photo.load()
            entry.update(width=photo.width, height=photo.height,
                         sha256=digest(path.read_bytes()),
                         pixelSha256=digest(f"{photo.size}:RGB:".encode() + photo.tobytes()))
            duplicate = seen_bytes.get(entry["sha256"]) or seen_pixels.get(entry["pixelSha256"])
            if duplicate:
                entry.update(status="duplicate", duplicateOf=duplicate)
                continue
            seen_bytes[entry["sha256"]] = seen_pixels[entry["pixelSha256"]] = path.name
            entry["status"] = "valid"
            stem = f"bungalow-{index:02d}"
            # The supplied JPEGs are already efficiently compressed. A tested
            # full-size WebP 92 conversion was larger for 38/39 photographs.
            # Preserve the exact original bytes instead of recompressing them.
            full_path = DEST / f"{stem}{path.suffix.lower()}"
            shutil.copy2(path, full_path)
            obsolete_trial = DEST / f"{stem}.webp"
            if obsolete_trial.is_file() and obsolete_trial != full_path:
                obsolete_trial.unlink()  # Only this script's own trial derivative.
            sizes = [{"width": photo.width, "height": photo.height,
                      "src": f"/images/bungalow-bukit-taman-segar/{full_path.name}",
                      "bytes": full_path.stat().st_size}]
            # A genuinely smaller mobile candidate, never an upscaled source.
            if photo.width > 640:
                mobile = photo.resize((640, round(photo.height * 640 / photo.width)), Image.Resampling.LANCZOS)
                mobile_path = DEST / f"{stem}-640.webp"
                mobile.save(mobile_path, "WEBP", quality=90, method=6)
                sizes.insert(0, {"width": mobile.width, "height": mobile.height,
                                "src": f"/images/bungalow-bukit-taman-segar/{mobile_path.name}",
                                "bytes": mobile_path.stat().st_size})
            entry["delivery"] = sizes
            thumb = ImageOps.contain(photo, (295, 230), Image.Resampling.LANCZOS)
            thumbnails.append((index, thumb, photo.size))
        except Exception as error:
            entry.update(status="unreadable", error=str(error))
    for sheet_index, start in enumerate(range(0, len(thumbnails), 12), 1):
        sheet = Image.new("RGB", (1280, 852), "#ece9e3")
        draw = ImageDraw.Draw(sheet)
        for position, (index, thumb, dimensions) in enumerate(thumbnails[start:start + 12]):
            column, row = position % 4, position // 4
            x, y = column * 320, row * 284
            sheet.paste(thumb, (x + (320 - thumb.width) // 2, y + 8))
            draw.text((x + 13, y + 246), f"{index:02d} | {dimensions[0]} x {dimensions[1]}", fill="#222222")
        sheet.save(AUDIT / f"contact-sheet-{sheet_index}.jpg", quality=92)
    summary = {"sourceDirectory": SOURCE.name, "items": len(files),
               "validUniqueImages": sum(item["status"] == "valid" for item in records),
               "duplicates": sum(item["status"] == "duplicate" for item in records),
               "unreadable": sum(item["status"] == "unreadable" for item in records),
               "nonImages": sum(item["status"] == "not-an-image" for item in records),
               "sourceBytes": sum(item["sourceBytes"] for item in records),
               "deliveryBytes": sum(size["bytes"] for item in records for size in item.get("delivery", [])),
               "policy": "Originals unchanged. Full-resolution delivery copies are byte-identical JPEGs. EXIF orientation respected. No crop, upscale, grading, retouching or AI. WebP 90 mobile derivatives only.",
               "images": records}
    (AUDIT / "audit.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/data/bungalow-photo-audit.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key != "images"}, indent=2))


if __name__ == "__main__":
    main()
