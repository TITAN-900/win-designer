# WIN-DESIGNER

Integrated Win Design website with the approved photographic 3D interior on the home page, the original independent About story, and the existing project galleries.

## Local preview

Run `pnpm install --frozen-lockfile`, then `pnpm dev` (do not open the HTML file directly).

`npm run build` produces the complete static website in `dist/`; `pnpm preview` serves that production build locally. The 3D renderer is lazy-loaded so the editorial page becomes usable before the model bundle completes.

With both local servers running and a fresh build, `pnpm test` checks preserved assets, the six projects, homepage anchors, enquiry validation/encoding and HTTP availability. The test stubs WhatsApp; it sends no message.

## Typography

`assets/css/typography.css` is the only source of font families, sizes, weights, leading and tracking for all three pages. Do not introduce typography declarations in the layout stylesheets.

- Headings and display copy: locally hosted **Cormorant Garamond 500**.
- Body, navigation, controls, forms, contact details and footer: locally hosted **Inter 400/500**.
- Italic is limited to the final line of the home Hero. Other headings are upright.
- Shared responsive scales: page title 40–64 px, Hero 34–48 px, section title 32–48 px, subheading 24–30 px, body 14–15 px, controls 13 px, small copy 12 px, labels 11 px. Leading: headings 1.08, body 1.7, UI 1.4. No third-party font requests.
- Four Latin WOFF2 files (95,172 bytes total) and their SIL licenses live in `assets/fonts/`; the matching Fontsource packages are pinned by the lockfile.
- `pnpm test` includes checks that prevent legacy stylesheets or page templates from adding competing fonts and type scales.

## Preserved content and assets

- `public/models/win_interior_demo.glb` and `public/lighting/` are unchanged copies of the approved independent demo. Do not overwrite its Blender or source assets.
- `assets/win20/win-design-logo-nav-compact.png` is the original official logo, not a recreation.
- Portfolio content remains in `assets/data/projects.js`; references and placeholder comparisons are explicitly identified as such.
- The verified phone/WhatsApp is `+601172455699`. The form opens a draft; it does not send a message automatically.
- Detailed studio address, email, and social profile URLs were not verified in the old files; do not publish guessed values.
- The original About page's six-stage 3D interaction is retained, independently of the new home hero.

## Vercel deployment

- Repository: `TITAN-900/WIN-DESIGNER`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: leave on Vercel's automatic setting (the pinned pnpm lockfile is detected).

`vercel.json` contains only this site's build output and immutable caching rules for the model and baked lighting. During a Vercel build, canonical, Open Graph, sitemap and robots URLs are populated from `VERCEL_PROJECT_PRODUCTION_URL`; set `SITE_URL` only when a custom production domain should override it. Runtime files never refer to workstation paths or localhost.

Before integration, both working versions were copied to `C:/Users/helon/Documents/Codex/2026-09-23/blender-3d-1-2-3-4/outputs/win_site_pre_integration/`.

