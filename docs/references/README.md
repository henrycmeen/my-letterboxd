# Reference Images (Local)

This folder is for local visual references and experiments that are not part of runtime.

## Structure

- `2026-02-28-session-images/`
  - Manual screenshots and debug renders collected from the repo root.
- `vhs-template-iterations/`
  - Intermediate template experiments (`_v*.png`) that are not used by the app.
- `legacy-public-images/`
  - Older images that previously lived in `public/` and are no longer used by runtime code.

## Notes

- These folders are ignored by git in `.gitignore` to avoid accidental large commits.
- Runtime assets should stay in `public/VHS/...`.
- Generated runtime covers are written to `public/VHS/generated/` and are also ignored.
