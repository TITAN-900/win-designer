# Username + Password login

This document supersedes the email-login instructions in earlier setup notes.
No account was deleted or recreated. No deployment or push performed.

## Verified reset and login — 2026-11-04

- Used the Supabase Auth admin API to reset only the existing allowlisted user's password after matching its UUID and email against local configuration. Username remains `admin`; email, database password and RLS were not changed.
- Real local username bridge returned HTTP 200; owner RPC returned true and project read succeeded. Browser login then visibly reached **Manage Portfolio**.
- The privileged credential was provided by the owner in a restricted temporary file outside the repository. That file was deleted after use; no password or privileged key is stored in source or environment configuration.
- This verifies password reset and login, not the pending full upload/publish acceptance flow. The previous dated status below is historical.

## Current local acceptance status (2026-11-03)

- Local username is now `admin`; server-only mapping still targets the existing authorized account. The developer server was restarted on port 5175.
- Supabase Email provider UI explicitly states a minimum of 6 password characters. The requested four-character password was not set. No policy/password/account/RLS change was made.
- Real wrong-password request through the local username bridge returned HTTP 401 with no token. Real anonymous mutation checks passed again. 13 scoped login/CMS regression tests passed; their successful-login paths use explicit isolated upstream stubs, not cloud owner credentials.
- Successful owner sign-in and live upload/draft/publish/edit/unpublish/delete remain pending the owner's safe sign-in. Mobile viewport checks are not physical Safari/Android tests. No Preview deployment has been run.

## Set the owner login

1. Choose one username, 3–48 characters: lowercase English letters, digits, `.`, `_`, `-`; first character must be a letter or digit. Input is case-insensitive and trims surrounding spaces.
2. Add these SERVER-ONLY variables to ignored `.env.local`:

   ```dotenv
   PORTFOLIO_ADMIN_USERNAME=your-chosen-username
   PORTFOLIO_ADMIN_AUTH_EMAIL=the-existing-owner-account-email
   ```

   Do not use a `VITE_` prefix for either. No password goes in any environment variable or code. The email must belong to the EXISTING account already authorized in `portfolio_admins`.
3. Restart local Vite. Open http://127.0.0.1:5175/admin/ and enter the username plus your EXISTING Supabase account password. Customers never need the internal email in this interface.
4. If the password needs changing, the owner must use a secure Supabase Auth password reset flow. Do not send the password through chat or change it in source code. This task has not changed it.
5. After separate deployment approval, set these two variables in the existing Vercel project's Preview environment alongside `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Rebuild a Preview and test before assigning Production values.

## How it works

Browser → same-origin POST `/api/portfolio-login` with username/password → server-only mapping → Supabase password verification → `portfolio_is_admin` RPC → access token only.

The server never returns the mapping, full Auth user object, or refresh token. The Supabase-issued access token can itself contain identity claims; it is returned only after successful owner authentication and stored only in memory, as in V1. It is not an anonymity guarantee for the authenticated owner.

No Service Role Key is needed. Every write/upload still requires the owner's JWT and existing RLS. The username is a convenient login alias, not a replacement security boundary; someone who already knows the internal email can still call Supabase Auth directly, but cannot bypass the password or owner RLS.

## Abuse resistance and limitations

- No username lookup/availability API. Unknown names and wrong passwords use the same account's Supabase Auth path and generic 401 message. Unknown names submit a random unusable password, so a correct password with the wrong name never logs in.
- Failure delay has a small timing floor/jitter; this reduces simple differences but cannot promise perfect network timing indistinguishability.
- Supabase rate limits remain active and 429 is propagated with a generic retry message. Serverless in-memory counters are deliberately not claimed as distributed protection. Before production, validate provider limits and configure any available existing Vercel endpoint rate-limit/WAF rule; sustained abuse can cause denial of login availability. No paid rate-limit service was provisioned.
- JSON POST only, cross-site browser origins rejected, bounded fields and streaming request size, no credential logging, no cache. HTTPS is required for remote deployment; local HTTP is only for loopback development.
- Missing mapping returns explicit 503; there is no email fallback login in the UI.
- Sessions are memory-only and require login again after refresh/expiry. No new authentication persistence has been introduced.

## Deployment / costs

Requires a small Node Vercel Function (`api/portfolio-login.js`) in the EXISTING project, not another application/project. It cannot work on a static-files-only host without a server function. Vite dev/preview mount the same handler locally. Normal function/Auth usage consumes the existing plan quotas; there is no guaranteed zero cost at arbitrary volume, and nothing was purchased or upgraded.

## Validation

- Production build passed; 13 login/CMS tests passed.
- Tests exercise the real server handler with stubbed upstream Auth: success, unknown-name rejection, wrong password, non-owner token rejection/revocation, malformed input, cross-origin rejection, missing mapping, rate-limit propagation, minimal response, username UI and unchanged CMS security contract.
- These are not live password tests. Mapping is intentionally not configured until the owner chooses a username and supplies the existing account identifier through local/Vercel settings. Live owner login/upload/logout and deployed Preview remain pending.

Reference: https://supabase.com/docs/guides/auth/passwords
