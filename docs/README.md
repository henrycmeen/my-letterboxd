# Documentation Structure

The `docs/` folder is split by purpose so product notes and technical notes are easy to find.

## Folders

- `product/`
  Product intent, UX direction, and long-term vision.
- `engineering/`
  Architecture, runtime/storage rules, migration plans, and technical audits.
- `references/`
  Historical snapshots, experiments, and old visual/code references.

## Rule of Thumb

- If it's used by runtime, it belongs in `public/` (static) or `.cache/`/`data/` (runtime state).
- If it's source material (PSD/PSB/template packs), it belongs in `assets/`.
- If it's explanation, decision-making, or plans, it belongs in `docs/`.
