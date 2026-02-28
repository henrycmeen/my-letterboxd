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
  overlays?: VhsOverlayLayer[];
}

export const VHS_TEMPLATES: VhsTemplate[] = [
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
    overlays: [
      {
        publicPath: '/VHS/templates/front-side-cover-mask.png',
        blend: 'dest-in',
      },
      {
        publicPath: '/VHS/templates/front-side-cover-texture.png',
        blend: 'over',
        opacity: 0.16,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-texture.png',
        blend: 'screen',
        opacity: 0.38,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-shadow2.png',
        blend: 'over',
        opacity: 0.52,
      },
      {
        publicPath: '/VHS/templates/front-side-cover-shadow.png',
        blend: 'over',
        opacity: 0.78,
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
