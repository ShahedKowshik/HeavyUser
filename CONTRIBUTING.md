# Contributing to HeavyUser

Thanks for helping make HeavyUser more reliable and easier to use.

## Start with an issue

- **Bug:** Share steps to reproduce, what you expected, what happened, and the browser/device where you saw it.
- **Feature idea:** Describe the user's problem and the simplest outcome that would solve it.
- **Security vulnerability:** Do **not** post it in public Issues; follow [SECURITY.md](SECURITY.md).

Please search existing issues before opening another. Attach screenshots only after removing personal habits, account information, access tokens, and other sensitive details.

## Code changes

The source is publicly viewable, but **this repository does not currently have an open-source license**. Public access does not grant broad rights to copy, distribute, or reuse the project. Please open an issue and coordinate with the maintainer before submitting significant code contributions; do not assume an unsolicited pull request can be accepted or relicensed.

For changes that are coordinated:

1. Explain the bug or user-facing improvement.
2. Keep the change focused and include regression coverage where feasible.
3. Run `npm run typecheck`, `npm test`, and `npm run build`.
4. Document data behavior, accessibility considerations, and affected edge cases.
5. Use the pull request template to explain what was tested and what remains unverified.

The frontend requires Node 24. Full database self-hosting instructions are not yet available; see [development setup](docs/DEVELOPMENT.md).

## Product principles

Prefer clear language over clever labels, accurate data over inflated streaks, predictable undo over implicit changes, and understandable screens over gratuitous complexity. For technical context, read the [architecture](docs/ARCHITECTURE.md) and [product guide](docs/PRODUCT_GUIDE.md).

The maintainer reviews issues and contributions as capacity allows; no response time is guaranteed.
