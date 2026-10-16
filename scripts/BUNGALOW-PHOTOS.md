# Bungalow photographs

The source folder is `BUNGALOW BUKIT TAMAN SEGAR/` at the project root. It contains **39 valid, unique JPEG photographs**, not 38. Pillow decoded all files successfully. Both file SHA-256 and decoded-pixel SHA-256 checks found **no exact duplicates**. Similar views are different photographs and have all been retained.

The supplied files are **1080 × 810 or 810 × 1080**. These are the actual supplied WhatsApp image dimensions; the pipeline does not claim a higher native resolution, upscale them or create replacement images.

## Delivery

- `public/images/bungalow-bukit-taman-segar/bungalow-NN.jpeg`: byte-identical full-resolution source copy.
- `public/images/bungalow-bukit-taman-segar/bungalow-NN-640.webp`: 640px-wide, aspect-preserving WebP candidate, quality 90.
- 39 originals: **3,206,229 bytes**.
- 39 mobile candidates: **2,006,820 bytes**.
- All 78 deployment files: **5,213,049 bytes**. A browser selects one responsive candidate per display, not both by design.

Full-size WebP at quality 92 was tested and was larger than the original JPEG for 38 of 39 photographs. The final pipeline therefore keeps the original JPEG bytes, avoiding an unnecessary lossy generation. There is no crop, retouching, colour grading or AI processing. Original customer files are never changed or deleted.

The cover is `bungalow-09.jpeg`: the actual television joinery with illuminated arched shelves. The gallery proceeds from living/dining joinery, through kitchen and laundry cabinetry, to bedrooms, storage and the media room. No floor area, completion year, detailed location or testimonial has been invented.

## Re-run the preparation

Install Pillow in a local Python environment, then run from the repository root:

```sh
python scripts/prepare_bungalow_photos.py
node --test tests/customer-photos.test.mjs
```

The script verifies and fully decodes every source image, respects EXIF orientation, checks file/pixel duplicates, and regenerates the responsive assets. It records source-to-delivery names and dimensions in `assets/data/bungalow-photo-audit.json`. Visual contact sheets and a second audit copy go into `validation/bungalow-photo-audit/`; these are QA artifacts, not public website assets.

## Add a future project

1. Keep the client's originals in a separate source folder; do not rename or overwrite this project's photographs.
2. Prepare optimized photographs in a new `public/images/<project-slug>/` folder, maintaining their aspect ratios and accurate dimensions.
3. Add one project entry in `assets/data/projects.js` with the real name, stable slug, real cover and gallery. Omit unknown facts and unavailable Before/After content.
4. Replace one `null` slot in `assets/data/book-layout.json` with the new project's slug. Each slot represents a whole project, not an individual gallery image.
5. Run the existing tests and production build. Check the generated `/projects/<project-slug>/` page and the actual 3D book tap before publishing.

The existing book consumes this data configuration; adding a project does not require rewriting the physical page-turn renderer.
