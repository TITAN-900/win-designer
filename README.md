# WIN JOINERY SDN BHD

Existing WIN-DESIGNER repository and Vercel project. Two architectural dioramas,
a physical Blender portfolio book, and real project photography. No CMS, owner
authentication or public upload functionality is implemented.

## Run and check

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5175 --strictPort
pnpm build
pnpm preview --host 127.0.0.1 --port 4175 --strictPort
pnpm test
```

Keep both servers running for the HTTP integration tests. `npm run build` invokes
the same Vite production build where npm is installed. No separate lint or type
check command is configured; JavaScript and the existing Node regression tests
are the current project checks.

Optional isolated Chrome acceptance suite (Playwright supplied externally):

```sh
node scripts/qa-v5.mjs http://127.0.0.1:4175 validation/joinery-v5-local /path/to/playwright/index.mjs
```

These browser checks are emulation, not physical iPhone/Android device tests.

## Project content

- `assets/data/projects.js`: the single real project, BUNGALOW BUKIT TAMAN SEGAR.
- `assets/data/book-layout.json`: six project pages, four slots each. A slug
  occupies a project position; `null` prints `INCOMING`. Binding endpapers are
  separate from the 24-position capacity.
- `public/images/bungalow-bukit-taman-segar/`: 39 original-resolution JPEGs and
  their smaller WebP delivery candidates. All full-resolution JPEGs match the
  supplied originals byte-for-byte.
- `assets/data/bungalow-photo-audit.json`: source names, hashes and dimensions.
- `scripts/BUNGALOW-PHOTOS.md`: photo preparation and future-project workflow.
- `/projects/bungalow-bukit-taman-segar/`: static, directly accessible project
  route, with all 39 photographs and an accessible enlarged-photo viewer.

The source customer directory is retained unchanged. Old project photos and
logos remain recoverable in Git/source archives but are excluded from the
production build and public content. No new company address, telephone number,
email or opening hours has been invented. The existing contact-free public
navigation remains Spaces / Portfolio.

## Preserved presentation

`public/3d/` contains the unchanged book and both room GLBs. Cover hinges,
flexible spine, gold edges, page curl, pointer gestures, lighting and mobile
framing are preserved. New cover branding is printed into the existing material
master, not overlaid HTML. Archivo and Manrope remain the two self-hosted fonts.

## Existing production deployment

- Repository: `https://github.com/TITAN-900/win-designer`, branch `main`.
- Existing Vercel project: `win-designer` (do not create another project).
- Production hostname: `https://win-joinery.vercel.app/`.
- Retained hostname: `https://win-designer.vercel.app/`.
- Vercel preset: Vite. Build: `npm run build`. Output: `dist`.
- Canonical, Open Graph, sitemap and robots use the new hostname. `SITE_URL`
  explicitly overrides the build origin if required; deployment-preview URLs
  are never used as canonical addresses.

Keep the old hostname active. Domain assignment is managed in the existing
Vercel project's Domains settings. A successful build alone does not establish
that a hostname is connected; verify both live URLs after deployment.

The release report records only checks actually performed. Browser/device
limitations and any pending real-device checks must remain explicit.

