# HeavyUser Design System
**Visual source of truth:** https://ui.shadcn.com/create?preset=buFywKm

## Selected preset
- shadcn/ui **Lyra** compact style
- **Neutral** base, theme, and chart palette
- **Inter** text and headings
- **Lucide**-style 24px stroke icons
- **Subtle** menu accent and **default** menu background
- Sharp **0px visual corners**, matching the screenshot of the Lyra preset

## Implementation
- `src/app/design-system.css` defines reusable shadcn-compatible semantic color tokens and standardizes every existing interactive control.
- `src/app/dashboard.css` contains the current application layout and legacy class contracts. `src/app/account.css` contains account layout rules. `design-system.css` is intentionally imported last to provide the common visual system.
- React app logic, backend calls, history, timers, authentication, and Supabase data are unchanged.
- The currently installed interface is **preset-aligned native React CSS**, not the complete shadcn/Base UI component library. Add underlying Base UI primitives separately if interactive widget upgrades are needed; do not pretend the library is installed.
- All new screens/components should use the semantic tokens below instead of hardcoding color values.
- Do not reintroduce the previous green palette or soft rounded containers.

## Tokens
| Token | Light |
|---|---|
| background | #fafafa |
| card | #ffffff |
| foreground / primary | #171717 |
| primary-foreground | #fafafa |
| secondary, muted, accent | #f5f5f5 |
| muted-foreground | #737373 |
| border, input | #e5e5e5 |
| focus ring | #737373 |
| chart 1–5 | neutral from #171717 to #d4d4d4 |
| radius | 0px |

## Visual quality rules
- Dense, readable Lyra hierarchy; avoid oversized decorative cards.
- Never color-code habit states using color alone. Use text/icons + shade or border.
- Cards: 1px border, white fill, zero radius, no gratuitous shadows.
- Buttons: solid neutral for the primary action, bordered neutral for supporting actions.
- Inputs: visible focus rings, clear error state, at least 38px touch target.
- Mobile navigation continues to expose Today, Insights, and Add.
- Theme is currently light-only, matching the selected screenshot. Dark mode is not yet part of the product requirements.
