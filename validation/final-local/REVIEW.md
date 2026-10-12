# WIN DESIGN — implementation and release review

## Release

- Existing repository: `TITAN-900/win-designer`, existing branch `main`.
- Commit: `ed08121e88a9cb5a34328d0b541d9cc17f456105`.
- Push succeeded. Vercel commit status: **success**.
- Production: https://win-designer.vercel.app/
- Vercel deployment: https://vercel.com/titan-900s-projects/win-designer/AXXoZ2WhQGRCmw4SkbZ8uxHv9Zks
- Local production preview: http://127.0.0.1:4175/
- No new repository, branch, Vercel project or domain. AXRIVO and NAE-TRUCK were not changed.
- This report and browser screenshots remain local; the editable Blender source and its inspection renders are committed.

## Cleanup and typography

- Homepage now contains the automatic two-space Hero, physical portfolio book, Contact/WhatsApp and minimal footer.
- Navigation contains only Contact and WhatsApp. Original logo and real phone/WhatsApp are retained.
- Removed obsolete corporate page/form renderers and global comparison navigation. Old About URLs redirect to Contact.
- Syne variable display (750–800) and Manrope variable body/UI (450–650); two local WOFF2 files total 59,444 bytes.
- Separate mobile title sizes retain a complete, unobstructed room.

## Hero

- Each room: 7.6s staged construction, 2.4s real 3D daylight reveal, 2.6s final hold, 1.8s overlapping transition. Full two-room loop: 28.8s.
- Construction is time-driven, never scroll-driven; no workers or people. Normal page scrolling remains available.
- Original Space 01 and Space 02 GLBs remain unchanged, including the bedroom/bed corrections.
- Each actual GLB window supplies an aperture for its own sun direction, window-frame shadows, neutral environment reflections, ambient contribution and contact shadows. ACES Filmic output; no CSS sunlight overlay.
- Two preloaded rooms share one renderer; materials are warmed before playback. Two reused render targets crossfade fully rendered opaque rooms, avoiding per-mesh transparency flashes.
- Rendering pauses offscreen. Mobile DPR capped at 1.35; mobile key/sun shadows 512/1024. Reduced motion shows the completed, lit first room.
- Fixed post-load WebGL context-loss fallback and cleanup during pending GLB/shader startup. Failure shows the existing poster and an error instead of an empty Hero.
- Production-build browser observations covered over three full loop durations, all eight room/phase combinations, 78 sampled states. Texture count remained 36 and geometry count 310. No errors/warnings in the inspected console. This is not a frame-by-frame video audit or a mobile GPU benchmark.

## Blender book and real-time curl

- Source: `design/portfolio_book.blend` (291,901 bytes).
- Rebuild script: `scripts/build_portfolio_book.py`.
- Export: `public/3d/book/portfolio_book.glb` (516,488 bytes, 19,580 triangles, 15 independent parts).
- Covers, endpapers, spine, binding, both permanent stacks, edge lines, both resting pages and active front/back/rim remain independent.
- Active paper: 72×18 grid, 1,387 vertices per face, real thin rim. Blender inspection shape keys/renders cover 20%, 50% and 80%; web deformation is not a canned exported animation.
- The runtime integrates non-stretching paper ribbons on the Blender topology, constrains the spine and continuously recomputes normals. Front/back project photography is mapped onto the deforming surface.
- Moving geometry produces real dynamic directional shadows and paper self-shading.
- Pointer capture is limited to deliberate page-edge grabs. Pointer movement controls progress directly; holding does not animate ahead, reversal is deterministic. Release uses progress/direction/velocity and a bounded damped spring. Secondary controls invoke the same curl.
- Mobile raises/foreshortens the left wing, retaining the entire book body while making the right physical page readable. The curl solves directly toward that raised landing surface, avoiding a late rotation/reversal.
- Both stacks remain after turns. Six alternating turns were checked; book resources stabilized at 16 geometries / 5 textures after first active turn.
- Current/adjacent page textures are cached, retired resize textures are disposed after the new spread is installed, and the book renders on demand. Mobile DPR capped at 1.5 and shadows at 512.
- GPU failure keeps accessible project navigation. Mobile fallback now shows both printed pages vertically rather than losing the left-page projects.

## Portfolio and projects

- Four printed pages / two spreads / 16 image cells. Each physical page is exactly 2×2; desktop shows eight cells per spread.
- Existing photographs and data map to six dedicated static routes:
  - `/projects/walnut-residence/`
  - `/projects/stone-kitchen/`
  - `/projects/private-suite/`
  - `/projects/open-living/`
  - `/projects/foyer-cabinetry/`
  - `/projects/built-in-study/`
- Reusable `src/project-content.js`, `project.html` and `assets/data/projects.js` generate photography-first pages with canonical/OG metadata, concise existing descriptions, return links and project-specific WhatsApp drafts.
- Existing comparison assets are explicitly marked as an unverified reference pair; they are not presented as genuine client before/after. The renderer supports verified project-specific pairs, but none are currently verified.

## Validation

- `pnpm run build`: passed. This shell has Node/pnpm but no npm executable; pnpm runs the same package.json `vite build` script used by the Vercel npm build command.
- `pnpm test`: **55/55 passed**, no skipped tests. No lint/type-check script is configured.
- `git diff --check`: passed. Existing Windows line-ending notices are not build errors.
- 1920×1080, 390px and 430px responsive browser checks: both complete rooms, no horizontal overflow, no text over the room, compact menu, Contact and normal scrolling.
- Held curl at 25%, 50%, 80%, reversal, small-return/large-completion spring behavior and multiple forward/back turns checked. Held-stage visual inspection used the accessibility controls driving the same mesh; native pointer drags were also tested in both directions.
- Actual paper photograph taps opened Stone Kitchen and Foyer Cabinetry routes. Direct route refresh and unknown-project 404 passed locally.
- All 37 checked production pages/assets returned 200, including both room GLBs, book GLB, project photographs, fonts, scripts, stylesheet, sitemap and robots.
- Live production Hero and physical curl loaded correctly; live paper tap opened the Stone Kitchen project page. Inspected browser console had no errors/warnings.

## Limitations requiring human/device acceptance

- Responsive Chromium testing is not physical iPhone Safari / Android hardware testing. Real-finger slow hold/flick feel and sustained mobile 60fps/GPU thermals are not certified.
- Only the four existing portfolio pages are available; repeated-turn testing alternated between the two spreads rather than inventing additional project content.
- No genuine before/after pair is currently verified in the supplied project data.

## Main changed files

- Layout, typography, navigation: `index.html`, `about.html`, `project.html`, `assets/css/{typography,diorama-hero,portfolio-book,minimal-site}.css`, `assets/js/{main,site-integration}.js`, local fonts.
- Hero: `src/diorama.js`, `src/diorama-timeline.js`, `src/room-daylight.js`, `src/room-crossfade.js`.
- Book: `src/portfolio-book.js`, `src/book-curl.js`, `src/page-curl-math.js`, `src/book-page-texture.js`, Blender source/script/export/inspection renders.
- Project routes: `src/project.js`, `src/project-content.js`, `assets/data/projects.js`, `vite.config.js`, `vercel.json`, `sitemap.xml`.
- Regression suites: book asset/topology, daylight, lifecycle fallback, page curl, project routes, integration and typography tests.

## Screenshot evidence

- `hero-desktop-space-01.jpg`, `hero-desktop-space-02.jpg`
- `hero-390-space-01.jpg`, `hero-390-space-02.jpg`
- `hero-430-space-01.jpg`, `hero-430-space-02.jpg`
- `book-390-25.jpg`, `book-390-50.jpg`, `book-390-80.jpg`
- `book-430-held.jpg`, `book-desktop-held.jpg`, `project-390.jpg`
- `production-430.jpg`, `production-book-430.jpg`
