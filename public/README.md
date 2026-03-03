# Public Assets

Static and generated media for the app.

## VHS

- `VHS/Front Side.png`: Overlay/template used by VHS render pipeline.
- `VHS/generated/`: Auto-generated VHS covers from TMDB posters.
- `VHS/templates/black-case-front/`: Front-case layer exports for `black-case-front-v1`.
- `VHS/templates/black-case-spine/`: Spine layer exports for `black-case-spine-v1`.

Generated files are created by calling:

- `GET /api/vhs/covers`
