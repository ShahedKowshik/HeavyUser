# HeavyUser — development, staging and production

Updated 2026-10-29. This document describes source-code control and the intended deployment flow; it does not establish the current Netlify dashboard settings.

## The simple workflow

1. **development** is where routine changes are made and tested. GitHub Actions runs checks on pushes to development. A Netlify *branch deploy* of development is the intended browser preview.
2. **main** is the production source. Vercel publishes main at https://web.heavyuser.app. Only deliberately reviewed releases should reach main.
3. **staging** is an additional existing branch. On 2026-10-29 it received an independent Week-dashboard removal and tests. Do **not** delete, reset or merge it until Netlify's actual build branch and published URL have been verified. Its branch name alone does not prove which website it serves.
4. **feature/**, **fix/** and **redesign/** branches are short-lived work branches. After their PRs are merged and any deployment references are verified, delete the disposable branches; retain the historical archive and its tags.

**A GitHub branch is source code, not a hosted site.** Renaming or deleting it does not automatically unpublish a Vercel or Netlify deployment.

## Verified on GitHub / Vercel on October 29, 2026

- main: `0a50d2c`, currently the last READY Vercel production deployment.
- development: `3e5fe6e`, passes GitHub Actions; its Week view is removed.
- staging: `9503859`, passes GitHub Actions; its Week view is removed independently.
- Development and staging are not the same commit. They also have historical divergence from main; neither should be blindly merged or force-reset.
- The repository's main branch is not protected. GitHub branch protection / ruleset settings require a separate administrator action.
- **Netlify configuration not verified:** this document is not evidence of which branch the live Netlify staging URL currently builds.

## Release procedure

1. Make a small change on development and let `Baseline checks` pass. The checks cover TypeScript, Node tests and a build; they do **not** prove browser, Supabase or deployment behavior.
2. Confirm the exact Netlify site, build branch, URL and successful preview before describing the feature as live on staging. If the active preview builds `staging`, do not silently switch it to development.
3. Review changes since main, including the two main-only archival documentation commits, and check authentication, data integrity, UI on mobile and rollback risks. Merge only the agreed, tested release into main.
4. Confirm Vercel has deployed the intended **main commit** with status READY, and inspect the real production URL. A GitHub CI success is not a deployment.
5. After verifying hosting references and that no work exists only on another branch, remove obsolete branches. Never delete `legacy/original-heavyuser`, `archive/pre-rebuild-2026-10-13` or the `legacy-*` tags as part of routine cleanup.

## Deployment safeguards

- `vercel.json` on development disables automatic non-main Vercel Git deployments. This configuration is **not yet on main** and is not a substitute for checking Vercel's actual project settings.
- `netlify.toml` on development intends to build only Netlify branch deploys of `development`. Netlify's main-branch build reads files from **main**, where this file is not yet present. Before publishing another main release, configure the Netlify production-build ignore rule in the Netlify dashboard, or approve the matching configuration as part of that release.
- Do not create automatic production releases from pull requests, previews, scheduled jobs or staging changes.
- Do not commit Supabase secrets or use service-role keys in browser variables.
- Staging and production currently share one Supabase project. The same personal login **can** be used in staging, as requested, but changes made there can affect real account records. A separate test account is a safer optional choice, not a requirement. Do not apply destructive database migrations merely to test staging.
- A deployment can remain accessible even after its GitHub branch disappears; remove unwanted public URLs in the hosting provider after verifying current production.

## Before retiring the extra staging branch

In Netlify, record the project's production branch, configured branch deploys, and the deploy details for the user-facing staging URL. Then choose **one** long-term preview branch (prefer development) and verify that one normal change actually reaches that URL. Only then retire the duplicate branch. Until this is confirmed, preserve both branches.

Historical source: [legacy/original-heavyuser](https://github.com/ShahedKowshik/HeavyUser/tree/legacy/original-heavyuser). These 228 original commits have separate history and should never be merged into the modern application.
