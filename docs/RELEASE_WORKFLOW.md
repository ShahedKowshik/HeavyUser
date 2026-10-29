# HeavyUser — how development, staging and production work

Updated 2026-10-29 from live GitHub, Netlify, Vercel and Supabase inspections.

## Two branches, two hosting services, one database

| GitHub branch | Host | Role | URL |
| --- | --- | --- | --- |
| `development` | Netlify | **Staging**: preview all ordinary changes | https://heavyuser.netlify.app |
| `main` | Vercel | **Production**: deliberate, reviewed releases only | https://web.heavyuser.app |

The GitHub branch `staging` is **redundant**, but preserve it until its separate test commits are reconciled and its old Vercel domain references have been checked.

**The site is not yet switched**: on October 29 the connected Netlify site's *published deploy* is `main` at commit `0a50d2c`, and Netlify's primary URL is therefore currently **not** a live development preview. Its project settings must be changed: **Netlify > heavyuser > Project configuration > Developer settings > Continuous deployment > Branches and deploy contexts > Configure > production branch = development**. The word *production* in this Netlify setting is just Netlify's term for the branch serving the primary `.netlify.app` URL; it does **not** deploy to Vercel production. Turn off additional branch deploys and PR previews if offered. The installed Netlify connector cannot edit this project build-branch setting, so this specific step needs an authorized UI change.

The `netlify.toml` on `development` is preconfigured to **build only development** when Netlify treats it as its production-branch deployment or as a branch deploy during transition. It skips `main`, old `staging` and PR previews. Node 24 and `npm run build` are configured.

### Database

Both URLs use the **same Supabase project** (no second database or login required). Changes made while signed into staging can modify the same account data visible in production. Use non-destructive test actions and verify relevant RLS policies; never apply a destructive migration for a staging-only test.

### A normal change

1. Commit to `development`; let GitHub `Baseline checks` pass.
2. Confirm Netlify published that exact SHA and open `https://heavyuser.netlify.app`. Check login, habit creation, counter/undo, timer, mobile layout, dates and sign-out.
3. When ready to release, review the **draft** pull request from `development` into `main`. Verify both the code diff and database migration compatibility; main has separate archive documentation commits that must survive.
4. Turn the draft PR into a reviewed PR and merge it **only after explicit approval**. GitHub `main` then triggers Vercel production deployment.
5. Check the Vercel READY deployment's SHA and verify `https://web.heavyuser.app` before considering production updated.

Passing CI is **not** proof of a deployed app. No automatic merge, DB reset or branch-force-reset is authorized as part of normal staging work.

### Safeguards and backlog

- Vercel preview deployments were disabled at the project level to avoid old branch deployment noise; its Git configuration in `vercel.json` on development allows automatic Git builds only for `main`. The Vercel project still has an older `staging.heavyuser.app` custom-domain binding that should be retired if not in use, using the project's domain settings.
- Netlify's configured site access currently requires team SSO. Do not make it public as a shortcut without checking the user experience.
- `main` is currently **unprotected** in GitHub. Add branch protection or rulesets requiring a pull request, passing `Baseline checks` and blocking force-push/deletion; a solo owner does not need mandatory second-person approval.
- Old merged feature/fix branches can be deleted when their reachable commits and deployment references are confirmed. This GitHub connector cannot delete refs or update protection/rulesets.
- Preserve `legacy/original-heavyuser`, `archive/pre-rebuild-2026-10-13` and the historical tags. These represent the product's original history. The archive is **public** because the entire repo is public.
- An occasional Supabase advisor warning for an authenticated SECURITY DEFINER RPC is not by itself evidence of insecure access. The four present RPCs check `auth.uid()` and owner-filter their data operations. Revoking their EXECUTE permission would break current core functions.
- Supabase password-breach checks are a paid-plan feature; if the project is on a supported plan, enable them in Auth settings. Do not upgrade plans without explicit approval.
