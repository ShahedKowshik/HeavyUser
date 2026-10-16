# External launch readiness checklist

This checklist separates the repository's **documented readiness** from work that still needs a real product or security verification. It is not evidence that a launch has passed.

## Public product presentation

- [x] Product-focused repository overview and navigation
- [x] Clear description of current capabilities and limitations
- [x] Technical architecture and development guidance
- [x] Issue and pull request templates
- [x] Contribution and security reporting guidance
- [ ] Capture and publish **real** product screenshots (Today, Week, insights, mobile). Do not substitute generated mockups presented as screenshots.
- [ ] Record a short end-to-end walkthrough with a demo account and no personal data
- [ ] Verify first-run signup, sign-in, email confirmation, reset, and account recovery from an outsider's perspective
- [ ] Prepare a clear public privacy policy, terms, and account/data-deletion guidance on the product website

## Engineering and trust

- [x] CI runs type check, automated Node tests, and a production build
- [ ] Add reproducible reviewed Supabase migrations and RLS verification
- [ ] Test international timezones and define timezone behavior before a global launch
- [ ] Add browser E2E coverage for signup, logging, edits, undo, and account settings
- [ ] Add automated accessibility checks plus keyboard/screen reader review
- [ ] Complete a production security review covering auth, RLS, data export, session storage, and deletion
- [ ] Establish release versioning and a changelog
- [ ] Decide repository license and code contribution policy (do not assume public means open-source)
- [ ] Review repository profile description/topics and public owner profile/pinned projects in GitHub settings

## Product Hunt listing

- [ ] Verify the landing page and sign-up path work for first-time visitors
- [ ] Write a specific tagline, concise description, maker comment, and honest product story
- [ ] Create a clear thumbnail and gallery with authentic visuals
- [ ] Prepare a short product demo and test its audio/captions
- [ ] Check support capacity and an easy-to-find feedback route
- [ ] Re-test mobile behavior, multi-step undo, statistics, and empty states before launch

See Product Hunt's [current launch guide](https://help.producthunt.com/en/articles/17350772-launch-guide) for submission and community details.

**Do not mark a checklist item complete solely because a README, test name, or design mockup exists.**
