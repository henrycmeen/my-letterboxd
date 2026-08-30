# Filmklubben VHS-program — design QA

## Source visual truth

- VHS/book opening reference: `/Users/henrymeen/Desktop/Screenshot 2026-08-30 at 13.24.22.png` (518 × 748 px), captured from `https://minchi.co/books/`.
- Programme structure and typography references:
  - `/Users/henrymeen/Desktop/Screenshot 2026-08-30 at 13.26.01.png` (3406 × 2296 px)
  - `/Users/henrymeen/Desktop/Screenshot 2026-08-30 at 13.26.06.png` (2856 × 1920 px)
  - `/Users/henrymeen/Desktop/Screenshot 2026-08-30 at 13.26.11.png` (3142 × 1648 px)
- Current product context: `https://henrymeen.no/filmklubb/` and `https://henrymeen.no/filmklubb/default/`.

The target is an intentional hybrid rather than a literal one-screen clone: Minchi's object-first hover behavior combined with the older Filmklubben programme hierarchy, expressed with the current product's real VHS assets.

## Implementation evidence

- Local route: `http://127.0.0.1:4173/default`
- Desktop next-film hover: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-program-hover.png` (1280 × 720 px)
- Desktop archive: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-program-archive.png` (1280 × 720 px)
- Desktop poll: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-program-poll.png` (1280 × 720 px)
- Tablet: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-program-tablet.png` (820 × 900 px)
- Mobile: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-program-mobile-viewport.png` (390 × 844 px)

The browser captures match their CSS viewports at 1× density. Source images were proportionally downscaled and padded for comparison; no source image was stretched. The focused interaction comparison crops the implementation to the VHS object because the Minchi source is itself an object close-up.

## Comparison evidence

- Full-view comparison: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-layout-comparison.png` (1280 × 1260 px). Each row places an old Filmklubben source on the left and the corresponding new programme region on the right.
- Focused interaction comparison: `/Users/henrymeen/Documents/Codex/2026-08-30/v/work/filmklubb-interaction-comparison.png` (1200 × 720 px). Minchi's opened book is on the left; Filmklubben's hovered VHS case is on the right.

## Findings

No actionable P0, P1, or P2 mismatches remain.

- **Fonts and typography:** The serif display hierarchy, compact uppercase section labels, and oversized film titles preserve the old Filmklubben references while remaining readable at desktop, tablet, and mobile widths. Long titles wrap without clipping.
- **Spacing and layout rhythm:** The desktop hero retains the old image-plus-film-information composition; the archive becomes an intentionally horizontal VHS shelf with a visible continuation. Mobile stacks the hero and keeps the next archive item peeking into view. No section overlap or unusable control was observed.
- **Colors and visual tokens:** The pale yellow surface and restrained black/rule palette follow Minchi's warm background and keep the page less clinical than the old white concept. Contrast remains strong for body copy and controls.
- **Image quality and asset fidelity:** Every visible cover is rendered through the project's real VHS compositor and uses the existing case/cassette raster assets. The hover state exposes the dark case/cassette edge rather than a CSS-drawn substitute. Covers remain sharp at tested sizes without visible masking halos.
- **Copy and content:** The Norwegian labels are coherent and concise. The poll explicitly says that it is local, avoiding a false persistence claim.
- **States and accessibility:** Hover, pointer/keyboard activation, pressed state, anchor navigation, radio selection, vote success feedback, visible focus, semantic labels, alt handling, and reduced-motion CSS were checked. The poll successfully changed a vote to Parasite. Browser console errors and warnings: none.
- **Responsive behavior:** Checked at 1280 × 720, 820 × 900, and 390 × 844 CSS px. The main hierarchy, horizontal archive, poll controls, and metadata remain usable. The circular `N` visible in development screenshots is the Next.js development overlay and is not part of the production UI.

## Comparison history

- Pass 1: The normalized full-view and focused object comparisons found no P0/P1/P2 issue, so no visual correction loop was required.
- Residual test gap: Real multi-user poll persistence is intentionally outside this local prototype; the visible copy accurately describes that boundary.

## Implementation checklist

- [x] Match Minchi-like object-first hover timing and depth.
- [x] Preserve the old Filmklubben next/past programme hierarchy.
- [x] Use real VHS imagery and film artwork.
- [x] Verify desktop, tablet, and mobile layouts.
- [x] Verify navigation, VHS state, and poll interaction.
- [x] Check browser console.

final result: passed
