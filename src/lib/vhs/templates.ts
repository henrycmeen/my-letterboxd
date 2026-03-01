export type VhsBlendMode =
  | 'over'
  | 'dest-in'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light';

export interface VhsOverlayLayer {
  publicPath: string;
  blend?: VhsBlendMode;
  opacity?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface VhsPosterJitter {
  chance: number;
  maxOffsetX: number;
  maxOffsetY: number;
  maxScalePct?: number;
  verticalBiasChance?: number;
  verticalBiasMultiplier?: number;
}

export interface VhsTemplate {
  id: string;
  name: string;
  output: {
    width: number;
    height: number;
  };
  poster: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  scanlines?: boolean;
  posterJitter?: VhsPosterJitter;
  underlays?: VhsOverlayLayer[];
  overlays?: VhsOverlayLayer[];
}

export const VHS_TEMPLATES: VhsTemplate[] = [
  {
    id: 'black-case-front-v1',
    name: 'Black VHS Case Front (PSB Layer Export)',
    output: {
      width: 4000,
      height: 4000,
    },
    poster: {
      left: 1102,
      top: 468,
      width: 1737,
      height: 3017,
    },
    scanlines: false,
    posterJitter: {
      chance: 0.38,
      maxOffsetX: 20,
      maxOffsetY: 44,
      maxScalePct: 0.075,
      verticalBiasChance: 0.74,
      verticalBiasMultiplier: 1.85,
    },
    underlays: [
      {
        publicPath: '/VHS/templates/black-case-front/front-case-underlay.png',
        blend: 'over',
      },
    ],
    overlays: [
      {
        publicPath: '/VHS/templates/black-case-front/front-texture-plastic.png',
        blend: 'screen',
      },
      {
        publicPath: '/VHS/templates/black-case-front/front-texture-scratches.png',
        blend: 'over',
        opacity: 0.5,
      },
    ],
  },
  {
    id: 'front-side-cover-flat',
    name: 'Front Side Cover (Flat PSD Export)',
    output: {
      width: 5000,
      height: 5000,
    },
    poster: {
      left: 1363,
      top: 454,
      width: 2274,
      height: 4101,
    },
    scanlines: false,
    posterJitter: {
      chance: 0.34,
      maxOffsetX: 22,
      maxOffsetY: 40,
      maxScalePct: 0.068,
      verticalBiasChance: 0.68,
      verticalBiasMultiplier: 1.72,
    },
    underlays: [
      {
        publicPath: '/VHS/templates/front-side-cover-base.png',
        blend: 'over',
      },
    ],
    overlays: [
      {
        publicPath: '/VHS/templates/front-side-cover-mask2.png',
        blend: 'dest-in',
      },
      {
        publicPath: '/VHS/templates/front-side-cover-texture2.png',
        blend: 'over',
        opacity: 0.12,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-texture.png',
        blend: 'screen',
        opacity: 0.28,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-shadow2.png',
        blend: 'over',
        opacity: 0.12,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-shadow.png',
        blend: 'overlay',
        opacity: 0.06,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-highlight2.png',
        blend: 'overlay',
        opacity: 0.08,
      },
    ],
  },
  {
    id: 'front-side-psd',
    name: 'Old VHS Front Side (PSD)',
    output: {
      width: 5000,
      height: 5000,
    },
    poster: {
      left: 1363,
      top: 454,
      width: 2274,
      height: 4101,
    },
    overlays: [
      {
        publicPath: '/VHS/Front Side.png',
      },
    ],
  },
  {
    id: 'retro-cover-default',
    name: 'Retro Cover Default',
    output: {
      width: 900,
      height: 1350,
    },
    poster: {
      left: 90,
      top: 90,
      width: 720,
      height: 1080,
    },
  },
];

const FALLBACK_TEMPLATE = VHS_TEMPLATES[0];

if (!FALLBACK_TEMPLATE) {
  throw new Error('No VHS templates configured.');
}

export const DEFAULT_VHS_TEMPLATE_ID = FALLBACK_TEMPLATE.id;

export const getVhsTemplateById = (id?: string): VhsTemplate =>
  VHS_TEMPLATES.find((template) => template.id === id) ?? FALLBACK_TEMPLATE;
