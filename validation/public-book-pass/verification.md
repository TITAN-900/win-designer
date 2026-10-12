# Public portfolio release verification

Commit: `88a0b9ed3161c39b9a5744c1058c0ce3c9b26313`

Supabase, owner login, upload, publishing and persistent administration were explicitly deferred by the owner. No authentication bypass, browser-storage database or public editor was introduced.

## Source repairs

- Removed one detached sky slab and three exterior residence placeholder meshes from each room's Blender source and rebuilt both GLBs/posters/previews. Window frame, glass, piers, jambs and the measured sill/header overlaps remain.
- Retained the existing light sequence, material maps, 3D room design and paper-curl topology.
- Added manual closed-cover posing around a fixed binding pivot. The fifteen original Blender book parts remain; both leaf stacks and front/back paper are retained.
- Added a saved content layout: four printed pages, sixteen slots, six unique existing projects, ten blank slots. This is a static public catalog, not an owner CMS.
- Removed public Contact, WhatsApp, telephone and enquiry affordances and structured contact data. Existing project routes, photography and portfolio navigation remain.
- Reprojected desktop drag gutters when the cover camera changes, kept the minimum two-page cover operable and retained keyboard input during initial asset preparation.

## Local validation

- `pnpm run build`: passed (the configured Vite production build).
- `pnpm test`: 82 passed; 0 failed; 0 skipped.
- `git diff --check`: passed.
- No separate lint or type-check scripts are configured.
- Browser viewport tests: 1920 x 1080, 390 x 844 and 430 x 932.
- Direct pointer cover opening, forward paper turn, backward paper turn and project photograph navigation passed.
- Keyboard-equivalent held geometry at 20%, 50%, 80%, reverse motion, cancellation and small-release return checked visually. The automation interface cannot hold a physical touchscreen pointer across calls.
- Mobile menu opens, link selection closes it, and vertical page scrolling remains possible.
- Both room final states have complete mobile framing with no detached window blocks. Source tests cover their absence in all construction stages.
- No warning/error console entries in the local verification tab.
- Current browser override is DPR 1; high-DPR caps, raster allocation, visible photo hits and pixel budgets are covered by automated tests, not real iPhone hardware measurements.
- Mobile rendering caps remain DPR 2 / 2.2 million book pixels; anisotropy 8 for pages, bounded current/next spread plus cover texture cache. No source texture downgrade.

Screenshots in this folder are local review artifacts, not published assets.

## Production verification

- Pushed existing `origin/main` successfully; no new repository, branch, Vercel project or domain.
- Vercel commit check: SUCCESS, deployment `DMmDko3ckSpcAQqEhGKBwTLUYQ8z`.
- Official URL: https://win-designer.vercel.app/
- Production HTML references the matching new build entry `/assets/home-ByhOZdgC.js`.
- Home, both room GLBs, Blender book GLB, both local font resources and checked project routes return HTTP 200.
- Fresh production browser: both Hero final states, closed cover on re-entry, 390px direct forward/backward paper gestures, Stone Kitchen photo navigation, 430px menu and bedroom verified.
- Production browser warning/error log: empty.
- No public management controls or contact links present. CMS/admin persistence and security validation remain deferred, not claimed complete.
