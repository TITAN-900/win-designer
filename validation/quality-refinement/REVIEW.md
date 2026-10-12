# WIN DESIGN — room and portfolio quality review

## Scope and preservation

Refinement of the existing website only. The two room layouts, isometric cameras,
automatic construction timeline, typography, project content and routes are retained.
The Blender book source and its exported GLB are unchanged: both page stacks, spine,
binding, front/back surfaces and thin page rim remain physically present.
No new website, repository, Vercel project or domain was created.

## Space 01 / Space 02 quality

Contributing causes were the previous mobile DPR cap of 1.35, anisotropy of 1,
512px visible oak texture, excessive fabric micro-contrast/normal strength, an ivory
fabric UV classification using architectural scale, and unmatched bedroom floor
albedo versus normal/roughness plank allocation. These were not solved with sharpening.

- Visible oak albedo: 512 × 512 to 1024 × 1024, high-quality JPEG; secondary maps remain bounded.
- Bedroom floor: matching 768 × 768 albedo, roughness and normal plank atlases.
- Normal/roughness data remain lossless PNG. Decoded pixels verified linear values;
  there was no confirmed gamma corruption in the old maps.
- Fabric color variation reduced; normal strengths reduced to 0.10 timber,
  0.08 bedroom floor, 0.12 linen, 0.14 upholstery and 0.16 rug.
- Ivory textile UV period corrected from 1.8m architectural scale to 0.36m textile scale.
- Mobile Hero DPR cap: 1.8, additionally bounded to 1.1 million pixels.
  Desktop cap: 2, bounded to 4 million pixels.
- Room texture anisotropy: up to 4 mobile / 8 desktop; trilinear mipmaps and linear magnification.
- Contact/key shadow: 768 mobile / 1024 desktop. Sun shadow: 1536.
  Grazing sun shadow bias adjusted to reduce self-shadow acne.
- Mobile frosted-window transmission buffer uses half resolution; opaque room rendering
  retains full resolution. Desktop transmission quality is unchanged.
- Completed hold reuses the last full-quality rendered frame; timeline, resize,
  transition, visibility and failure cleanup are preserved.

Final GLBs: Space 01 = 5,133,524 bytes / 104,636 exported triangles;
Space 02 = 6,411,872 bytes / 80,656 exported triangles.
Combined 11,545,396 bytes, within the unchanged 12MB regression budget.

## Actual window geometry repair

Both source room builders inherited a rear pier starting at Y = 0.975m, while the
window jamb ended at Y = 0.44m: a 535mm full-height structural gap. Rear pier center
was moved to Y = 1.80m and length increased to 2.73m, starting at Y = 0.435m with a
5mm jamb overlap. The header underside was aligned to the frame top at Z = 2.60m
(previously 2.38m); wall-joint bevels reduced to 2mm. Sources rebuilt and GLBs
regenerated. No camera, overlay or fake panel conceals the repair.

## Lighting

Window daylight direction is preserved. Final key/fill is separately balanced for
living and bedroom. Each uses six actual authored fixture locations: two area lights
and four spotlights, reused without extra shadow maps. Living room illumination comes
from under-cabinet / console light, pendants and recessed lights; bedroom uses the
headboard cove, niche and bedside / recessed fixtures.

Warm actual illumination and authored diffuser emission reveal smoothly with daylight.
The original build → daylight → completed hold → two-room transition timing remains.
ACES tone mapping and exposure 1.06 are unchanged; no bloom or CSS glow was added.

## Mobile book composition and quality

- Mobile raised left wing changed from 76° to approximately 2°; no corner-fitting lift.
- Camera center X = 0.40, world width = 1.22, near-flat view. Approximately 39–40% of
  the total book width intentionally continues outside the left viewport.
- The complete active right reading page occupies about 82% of viewport width.
  Desktop keeps the complete open-book framing (world width 2.42).
- Off-screen physical edges have narrow, clamped screen-edge drag handles.
  Project photo centers are not blocked by a blanket gesture layer.
- Paper roughness changed from 0.94 to 0.86, without added grain or glossy plastic.
- Contact shadow 512 → 768 mobile, still 1024 desktop; tighter bias and softness.
- Four cached printed textures: measured 921 × 1197 at 390px and 1019 × 1325 at 430px
  with the browser scrollbar. Old approximate sizes: 551 × 716 / 607 × 789.
- Mobile page texture ceiling 1024 × 1332, desktop width ceiling 1536, constrained by
  device maximum texture size. Existing original project photographs are preserved.
- Canvas high-quality resampling, sRGB, mipmaps, trilinear filtering and up to 8× anisotropy.
- Book DPR capped at 2 mobile / 1.75 desktop, with a 2.2-million-pixel budget.
- Four maximum mobile page textures use approximately 28MiB including mipmaps;
  book rendering remains on-demand.

## Validation

- 1920 × 1080: both completed rooms inspected; desktop open-book framing preserved.
- 390px / 430px portrait: complete rooms visible without copy overlap or horizontal overflow.
  Larger cropped book inspected. Both physical wings remain in the asset.
- High-density renderer budgets exercised with simulated DPR 3 input, then test override
  removed. Room caps at 1.8; book caps at 2. No forced DPR remains in production code.
- Direct pointer drag forward and backward tested at 430px; partial hold, reverse curl,
  cancel and release tested. A printed Foyer Cabinetry photo opens the correct project.
- Room transition, pause when offscreen, completed hold, resize, fallback and cleanup
  covered by regression tests. Current production preview has no new console errors.
- All 74 tests pass; independent focused code review passed 28 relevant tests.
- Production build passes via `pnpm run build` (the existing `vite build` script).
  No lint command is configured. `git diff --check` passes.

## Remaining limits

Viewport checks use Chromium in the desktop browser; physical iPhone Safari / older
Android hardware was not available. High-DPR checks validate rendering budgets, not
device thermals. Actual active animation frame time varies with GPU; this is not a
claim of a measured 60fps on every phone. Lighting remains real-time rasterized PBR,
not path-traced GI. Fine material texture is intentionally retained, not blurred away.

## Commit and production verification

- Commit: `e57e5d178c21b2ceec73fb9b8a2972825d1e2404`.
- Pushed successfully to the existing `TITAN-900/win-designer` repository, `main`.
- Existing Vercel commit status: **success**.
- Deployment: https://vercel.com/titan-900s-projects/win-designer/2CVqMD4bE3cPBDzxvkdASggt4fCx
- Production: https://win-designer.vercel.app
- Live homepage loads the new `home-CkGdIqFW.js` bundle. Both GLB rooms reached
  their completed, fully lit state. The existing two-room loop remains active.
- Live 430px book uses the new 1019 × 1325 page texture and all 15 Blender parts;
  direct forward/reverse pointer dragging works. Tapping the printed Foyer Cabinetry
  photograph opens `/projects/foyer-cabinetry/`.
- Live mobile menu opens, Contact scrolls to the section and closes the menu;
  Logo returns home. Existing WhatsApp and phone destinations are retained.
- Live 390px completed bedroom has no horizontal overflow. Live browser console:
  no warnings or errors observed during this verification.
- Screenshots are saved beside this report (`live-*` captures are from production).
  This local validation folder is intentionally not included in the deployment commit.
