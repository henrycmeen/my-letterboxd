# Agent Rules

## Floor Selection Design
- Do not render visible text labels, instructions, buttons, cards, sidebars, scoreboards, or decorative frames.
- Keep the floor selection view visually minimal: floor background + VHS cassettes only.
- Keep selection hierarchy and leader state internal logic only (not displayed in UI).
- Ranking rule: the cassette positioned higher on the floor has higher priority.
- Exception for add-movie flow: show the active search query as large white text beside the add cassette.
- Do not show a visible text input field in add-movie flow; keyboard typing should update the query directly.
