import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  DEFAULT_VHS_TEMPLATE_ID,
  getVhsTemplateById,
  type VhsOverlayLayer,
} from './templates';

const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

export interface RenderVhsOptions {
  sourceUrl?: string;
  sourcePath?: string;
  sourceFilePath?: string;
  templateId?: string;
  fit?: 'cover' | 'contain';
  width?: number;
  height?: number;
  overlays?: VhsOverlayLayer[];
  format?: 'png' | 'webp';
  quality?: number;
  background?: string;
}

export interface RenderVhsResult {
  buffer: Buffer;
  contentType: 'image/png' | 'image/webp';
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const resolvePublicPath = (publicPath: string): string => {
  const normalized = publicPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const absolutePath = path.resolve(PUBLIC_ROOT, normalized);
  const publicRootWithSeparator = `${PUBLIC_ROOT}${path.sep}`;
  const isInsidePublic =
    absolutePath === PUBLIC_ROOT ||
    absolutePath.startsWith(publicRootWithSeparator);

  if (!isInsidePublic) {
    throw new Error('Invalid public path.');
  }

  return absolutePath;
};

const fileExists = async (absolutePath: string): Promise<boolean> => {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const loadSourceBuffer = async (
  sourceUrl?: string,
  sourcePath?: string,
  sourceFilePath?: string
): Promise<Buffer> => {
  if (sourceFilePath) {
    const absolutePath = path.resolve(sourceFilePath);
    const exists = await fileExists(absolutePath);

    if (!exists) {
      throw new Error(`Source file path not found: ${sourceFilePath}`);
    }

    return fs.readFile(absolutePath);
  }

  if (sourcePath) {
    const absolutePath = resolvePublicPath(sourcePath);
    const exists = await fileExists(absolutePath);

    if (!exists) {
      throw new Error(`Source path not found: ${sourcePath}`);
    }

    return fs.readFile(absolutePath);
  }

  if (!sourceUrl) {
    throw new Error('Missing source image. Provide sourceUrl or sourcePath.');
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Source URL does not point to an image.');
  }

  const sourceArrayBuffer = await response.arrayBuffer();
  return Buffer.from(sourceArrayBuffer);
};

const buildScanlineOverlay = (width: number, height: number): Buffer => {
  const lines: string[] = [];
  for (let y = 0; y < height; y += 3) {
    lines.push(
      `<rect x="0" y="${y}" width="${width}" height="1" fill="rgba(0,0,0,0.08)" />`
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${lines.join('')}
  </svg>`;

  return Buffer.from(svg);
};

const withOpacity = async (
  input: Buffer,
  opacity?: number
): Promise<Buffer> => {
  if (opacity === undefined) {
    return input;
  }

  const alpha = clamp(opacity, 0, 1);
  if (alpha === 1) {
    return input;
  }

  // Scale the existing alpha channel instead of replacing it.
  return sharp(input)
    .ensureAlpha()
    .linear([1, 1, 1, alpha], [0, 0, 0, 0])
    .png()
    .toBuffer();
};

const normalizeOverlaysFromTemplate = (
  overlays: VhsOverlayLayer[] | undefined,
  scaleX: number,
  scaleY: number
): VhsOverlayLayer[] =>
  (overlays ?? []).map((overlay) => ({
    ...overlay,
    left:
      overlay.left === undefined ? undefined : Math.round(overlay.left * scaleX),
    top: overlay.top === undefined ? undefined : Math.round(overlay.top * scaleY),
    width:
      overlay.width === undefined
        ? undefined
        : Math.round(overlay.width * scaleX),
    height:
      overlay.height === undefined
        ? undefined
        : Math.round(overlay.height * scaleY),
  }));

const resolveBackground = (background?: string): sharp.Color =>
  background === 'transparent'
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : (background ?? '#10232f');

export const renderVhsPoster = async (
  options: RenderVhsOptions
): Promise<RenderVhsResult> => {
  const template = getVhsTemplateById(options.templateId ?? DEFAULT_VHS_TEMPLATE_ID);
  const outputWidth = options.width ?? template.output.width;
  const outputHeight = options.height ?? template.output.height;

  const scaleX = outputWidth / template.output.width;
  const scaleY = outputHeight / template.output.height;

  const posterLeft = Math.round(template.poster.left * scaleX);
  const posterTop = Math.round(template.poster.top * scaleY);
  const posterWidth = Math.round(template.poster.width * scaleX);
  const posterHeight = Math.round(template.poster.height * scaleY);

  const sourceBuffer = await loadSourceBuffer(
    options.sourceUrl,
    options.sourcePath,
    options.sourceFilePath
  );

  const posterBuffer = await sharp(sourceBuffer)
    .resize(posterWidth, posterHeight, {
      fit: options.fit ?? 'cover',
      // Keep poster placement stable across titles; attention can drift off-center.
      position: 'centre',
    })
    .modulate({
      brightness: 1.03,
      saturation: 1.15,
      hue: 4,
    })
    .linear(1.08, 2)
    .png()
    .toBuffer();

  const scanlineBuffer = buildScanlineOverlay(posterWidth, posterHeight);

  const compositeOperations: sharp.OverlayOptions[] = [
    {
      input: posterBuffer,
      top: posterTop,
      left: posterLeft,
      blend: 'over',
    },
    {
      input: scanlineBuffer,
      top: posterTop,
      left: posterLeft,
      blend: 'soft-light',
    },
  ];

  const templateOverlays = normalizeOverlaysFromTemplate(
    template.overlays,
    scaleX,
    scaleY
  );
  const overlays = [...templateOverlays, ...(options.overlays ?? [])];

  for (const overlay of overlays) {
    const overlayPath = resolvePublicPath(overlay.publicPath);
    if (!(await fileExists(overlayPath))) {
      continue;
    }

    const targetWidth = overlay.width ?? outputWidth;
    const targetHeight = overlay.height ?? outputHeight;
    const top = overlay.top ?? 0;
    const left = overlay.left ?? 0;

    const preparedOverlay = await sharp(overlayPath)
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
      })
      .png()
      .toBuffer();

    const overlayBuffer = await withOpacity(preparedOverlay, overlay.opacity);

    compositeOperations.push({
      input: overlayBuffer,
      top,
      left,
      blend: overlay.blend ?? 'over',
    });
  }

  const renderPipeline = sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: resolveBackground(options.background),
    },
  }).composite(compositeOperations);

  if (options.format === 'webp') {
    const webpQuality = clamp(options.quality ?? 92, 1, 100);
    const webpBuffer = await renderPipeline.webp({ quality: webpQuality }).toBuffer();
    return {
      buffer: webpBuffer,
      contentType: 'image/webp',
    };
  }

  const pngBuffer = await renderPipeline.png().toBuffer();
  return {
    buffer: pngBuffer,
    contentType: 'image/png',
  };
};
