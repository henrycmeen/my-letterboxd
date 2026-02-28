export type VhsBlendMode =
  | 'over'
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

export const DEFAULT_VHS_TEMPLATE_ID = VHS_TEMPLATES[0].id;

export const getVhsTemplateById = (id?: string): VhsTemplate =>
  VHS_TEMPLATES.find((template) => template.id === id) ?? VHS_TEMPLATES[0];
