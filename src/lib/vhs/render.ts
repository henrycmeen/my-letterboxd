import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  DEFAULT_VHS_TEMPLATE_ID,
  getVhsTemplateById,
  type VhsOverlayLayer,
} from './templates';

const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');
const preparedOverlayCache = new Map<string, Buffer>();

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
  randomSeed?: string;
}

export interface RenderVhsResult {
  buffer: Buffer;
  contentType: 'image/png' | 'image/webp';
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createSeededRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

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
      `<rect x="0" y="${y}" width="${width}" height="1" fill="rgba(0,0,0,0.05)" />`
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

const toDestInMask = async (input: Buffer): Promise<Buffer> => {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelStride = info.channels;
  const pixels = info.width * info.height;

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * pixelStride;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const alpha = data[offset + 3] ?? 0;
    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    const maskedAlpha = Math.round((luminance * alpha) / 255);

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = maskedAlpha;
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
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

const getOverlayCacheKey = (
  overlayPath: string,
  targetWidth: number,
  targetHeight: number,
  blend: VhsOverlayLayer['blend'],
  opacity: number | undefined
): string =>
  `${overlayPath}|${targetWidth}x${targetHeight}|${blend ?? 'over'}|${opacity ?? 'none'}`;

const getPreparedOverlayBuffer = async (options: {
  overlayPath: string;
  targetWidth: number;
  targetHeight: number;
  blend?: VhsOverlayLayer['blend'];
  opacity?: number;
}): Promise<Buffer> => {
  const cacheKey = getOverlayCacheKey(
    options.overlayPath,
    options.targetWidth,
    options.targetHeight,
    options.blend,
    options.opacity
  );

  const cached = preparedOverlayCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const preparedOverlay = await sharp(options.overlayPath)
    .resize(options.targetWidth, options.targetHeight, {
      fit: 'fill',
    })
    .png()
    .toBuffer();

  let overlayBuffer = await withOpacity(preparedOverlay, options.opacity);
  if (options.blend === 'dest-in') {
    overlayBuffer = await toDestInMask(overlayBuffer);
  }

  preparedOverlayCache.set(cacheKey, overlayBuffer);
  return overlayBuffer;
};

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
  let posterOffsetX = 0;
  let posterOffsetY = 0;
  let posterScale = 1;

  if (template.posterJitter && options.randomSeed) {
    const random = createSeededRandom(`${template.id}:${options.randomSeed}`);
    const chance = clamp(template.posterJitter.chance, 0, 1);

    if (random() <= chance) {
      const maxOffsetX = Math.round(template.posterJitter.maxOffsetX * scaleX);
      const maxOffsetY = Math.round(template.posterJitter.maxOffsetY * scaleY);
      const verticalBiasChance = clamp(
        template.posterJitter.verticalBiasChance ?? 0,
        0,
        1
      );
      const verticalBiasMultiplier = Math.max(
        1,
        template.posterJitter.verticalBiasMultiplier ?? 1
      );
      const applyVerticalBias = random() < verticalBiasChance;
      const effectiveMaxOffsetX = Math.round(
        maxOffsetX * (applyVerticalBias ? 0.52 : 1)
      );
      const effectiveMaxOffsetY = Math.round(
        maxOffsetY * (applyVerticalBias ? verticalBiasMultiplier : 1)
      );

      posterOffsetX = Math.round((random() * 2 - 1) * effectiveMaxOffsetX);
      posterOffsetY = Math.round((random() * 2 - 1) * effectiveMaxOffsetY);

      const maxScalePct = clamp(template.posterJitter.maxScalePct ?? 0, 0, 0.18);
      if (maxScalePct > 0) {
        const scaleFloor = applyVerticalBias ? 0.38 : 0;
        posterScale = 1 + maxScalePct * (scaleFloor + random() * (1 - scaleFloor));
      }
    }
  }

  const sourceBuffer = await loadSourceBuffer(
    options.sourceUrl,
    options.sourcePath,
    options.sourceFilePath
  );

  const zoomPaddingX = Math.max(
    0,
    Math.round(((posterScale - 1) * posterWidth) / 2)
  );
  const zoomPaddingY = Math.max(
    0,
    Math.round(((posterScale - 1) * posterHeight) / 2)
  );
  const jitterPaddingX = Math.abs(posterOffsetX);
  const jitterPaddingY = Math.abs(posterOffsetY);
  const posterRenderWidth = posterWidth + (jitterPaddingX + zoomPaddingX) * 2;
  const posterRenderHeight = posterHeight + (jitterPaddingY + zoomPaddingY) * 2;
  const posterExtractLeft = clamp(
    jitterPaddingX + zoomPaddingX - posterOffsetX,
    0,
    Math.max(0, posterRenderWidth - posterWidth)
  );
  const posterExtractTop = clamp(
    jitterPaddingY + zoomPaddingY - posterOffsetY,
    0,
    Math.max(0, posterRenderHeight - posterHeight)
  );

  const posterBuffer = await sharp(sourceBuffer)
    .resize(posterRenderWidth, posterRenderHeight, {
      fit: options.fit ?? 'cover',
      // Keep poster placement stable across titles; attention can drift off-center.
      position: 'centre',
    })
    .modulate({
      brightness: 1.12,
      saturation: 1.22,
      hue: 0,
    })
    .linear(1.02, 10)
    .extract({
      left: posterExtractLeft,
      top: posterExtractTop,
      width: posterWidth,
      height: posterHeight,
    })
    .png()
    .toBuffer();

  const scanlineBuffer = buildScanlineOverlay(posterWidth, posterHeight);

  const compositeOperations: sharp.OverlayOptions[] = [];

  const templateUnderlays = normalizeOverlaysFromTemplate(
    template.underlays,
    scaleX,
    scaleY
  );

  for (const underlay of templateUnderlays) {
    const underlayPath = resolvePublicPath(underlay.publicPath);
    if (!(await fileExists(underlayPath))) {
      continue;
    }

    const targetWidth = underlay.width ?? outputWidth;
    const targetHeight = underlay.height ?? outputHeight;
    const top = underlay.top ?? 0;
    const left = underlay.left ?? 0;

    const underlayBuffer = await getPreparedOverlayBuffer({
      overlayPath: underlayPath,
      targetWidth,
      targetHeight,
      blend: underlay.blend,
      opacity: underlay.opacity,
    });

    compositeOperations.push({
      input: underlayBuffer,
      top,
      left,
      blend: underlay.blend ?? 'over',
    });
  }

  compositeOperations.push({
    input: posterBuffer,
    top: posterTop,
    left: posterLeft,
    blend: 'over',
  });

  if (template.scanlines !== false) {
    compositeOperations.push({
      input: scanlineBuffer,
      top: posterTop,
      left: posterLeft,
      blend: 'soft-light',
    });
  }

  const templateOverlays = normalizeOverlaysFromTemplate(template.overlays, scaleX, scaleY);
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

    const overlayBuffer = await getPreparedOverlayBuffer({
      overlayPath,
      targetWidth,
      targetHeight,
      blend: overlay.blend,
      opacity: overlay.opacity,
    });

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
