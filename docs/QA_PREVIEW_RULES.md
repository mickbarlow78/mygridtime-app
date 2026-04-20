# QA Preview Stability Rules (Next.js)

## Purpose

Prevent false QA results caused by broken local preview state.

---

## Source of truth

All UI verification MUST be performed using:

npm run dev

The production build (`npm run build`) is NOT a valid environment for interactive QA.

---

## Known failure mode

Running `npm run build` alongside an active dev session can corrupt `.next` and cause:

- raw HTML rendering (no styles)
- missing JS/CSS chunks
- MODULE_NOT_FOUND errors
- partial hydration failures

---

## Recovery steps (mandatory)

If the preview looks broken:

stop dev server
rm -rf .next
npm run dev

Then reload the browser.

---

## Rules

- Never run `npm run build` before finishing browser QA
- Never trust a preview that renders without styling
- Never continue QA if chunks or assets fail to load
- Always restart dev server after a build if UI testing continues

---

## QA completion condition

UI verification is only valid if:

- styles are fully applied
- no console errors for missing assets
- navigation works correctly
- components render as expected

---

## Responsibility

Claude must enforce this rule on every UI-related task.

Failure to do so results in invalid QA.
