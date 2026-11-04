# Portfolio mobile / Vercel Preview readiness

Status: preparation only. No push or deployment authorized or executed.
Existing repository: TITAN-900/win-designer. Existing Vercel project: win-designer.
Production remains https://win-joinery.vercel.app/.

## Architecture

- Public: existing 3D book and dedicated project routes; read published portfolio records.
- Owner: same origin `/admin/`, email/password via Supabase Auth, owner whitelist + RLS.
- Uploads go directly from the phone to Supabase Storage; no developer computer or Vercel temporary filesystem stores photos.
- Published media is served through the same-origin `/api/portfolio-image` Vercel function, using only the publishable key and anonymous RLS. Draft media stays private.
- After publication, a newly loaded/reloaded customer page reads the new project. An already-open book is not live-subscribed; refresh it. No rebuild is needed per new project.
- Sessions are currently memory-only: refresh/tab eviction requires another login. Keep the browser foregrounded while uploading; mobile background suspension can interrupt a transfer. Retry errors are shown; pending unsaved selections are lost on refresh.

## Preview environment variables

Username login update: also set SERVER-ONLY `PORTFOLIO_ADMIN_USERNAME` and `PORTFOLIO_ADMIN_AUTH_EMAIL` (existing owner email) for Preview. Neither may have a VITE_ prefix. No password or privileged key is required. `/api/portfolio-login` must deploy as a Node Function. See `USERNAME-LOGIN.md`; older email-login descriptions below refer to Supabase's internal identity only.

Set both in the EXISTING project's Settings → Environment Variables, scope **Preview**:

| Name | Value | Use |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://bprazfewcrrqewwkughh.supabase.co` | Build-time browser connection and server function |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing project's `sb_publishable_...` value from Supabase API Keys | Build-time browser connection and server function |

Never set an admin password, database password, Secret Key or Service Role Key in a VITE variable. The publishable key is intentionally public; RLS is the authorization boundary. `.env.local` is ignored and not a substitute for Vercel variables.
Keep canonical identity at the existing formal domain; no SITE_URL override is needed for this preview.
When Production is separately approved, add the same variables to Production before rebuilding. Variable changes require a new deployment.

## Deploy only after approval

1. Verify the existing Vercel account/project association. This checkout has no `.vercel/project.json`, so do not assume CLI linkage.
2. Link to EXISTING `win-designer` (never create a new project). Use Vite preset, `npm run build`, `dist` output.
3. Set Preview variables above. Use a Preview deployment from the working checkout (`vercel`, without `--prod`) once approved; no push to main is needed. Do not promote it or alter production domains yet.
4. Share the actual returned HTTPS Preview URL + `/admin/`. If Vercel Deployment Protection applies, owner needs preview access first; that is separate from Supabase admin login. Do not disable protection silently.
5. Preview uses the existing Supabase project, so changes are REAL and persist. Use a clearly labelled temporary draft, leave the existing Bungalow content untouched, and remove only the authorized test content after checking publish/unpublish.
6. Test on physical iPhone Safari and Android Chrome over mobile data, not localhost: login, select several photos, preview/reorder/cover, draft, publish, fresh public page, detail route refresh, unpublish, deletion, logout and rejected mutations.
7. Approve production separately only after Preview passes. Final owner URL will be `https://win-joinery.vercel.app/admin/`; it has NOT been deployed by this task.

## Auth and media specifics

Public signup is disabled, one verified owner is allowlisted. Direct password sign-in does not use an email/OAuth redirect. If adding invitation/recovery flows later, configure exact approved HTTPS callback URLs in Supabase Auth first; do not use a global wildcard.
Multiple selection has no `capture` attribute, so the phone can use its library. JPEG/PNG/WebP are decoded and converted sequentially to JPEG (long edge <=2400, quality .9); 50-photo total limit, 25MB input and 8MB output. HEIC is conditional on browser decoding, not guaranteed on Android or older Safari; unsupported files show an explicit JPEG conversion message. Browser compatibility and real device picker behavior still require the Preview tests.
No paid service purchased. Storage, egress and Vercel function use consume the existing plans' quotas. Preview does not imply production plan/commercial-use suitability has been audited.

## Evidence and remaining gates

- Real Supabase: database/storage/RLS installed; owner allowlist count 1; public registration disabled.
- Real anonymous API mutation probes passed; transaction-based draft visibility test passed and rolled back.
- Local mobile login snapshots at 390/430: no overflow or console errors. These are desktop Chrome viewport tests, not real Safari/Android.
- Earlier frontend contract flow checks used mocked APIs; they are not proof of live owner upload.
- Real owner login, upload, publish/edit/delete/logout end-to-end remains pending owner sign-in. No credentials are requested in chat.
- No Preview URL exists yet; no remote-device pass or Vercel function deployment pass is claimed.

References: https://vercel.com/docs/deployments/environments , https://vercel.com/docs/environment-variables , https://supabase.com/docs/guides/auth/redirect-urls
