import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  getCachedTmdbPosterPath,
  getTmdbMoviesByTitleQueries,
  getTmdbMovieList,
  type TmdbTitleQuery,
  type TmdbMovieListType,
} from '@/lib/tmdb';
import { renderPosterIntoPsd } from '@/lib/vhs/psdRenderer';
import { renderVhsPoster } from '@/lib/vhs/render';

const OUTPUT_DIRECTORY = path.join(process.cwd(), 'public', 'VHS', 'generated');
const DEFAULT_PSD_TEMPLATE_PATH = path.join(
  process.cwd(),
  'assets',
  'vhs-mockups',
  'originals',
  '01. Front Side COVER.psd'
);

export type VhsRenderer = 'sharp' | 'photoshop';

export interface SyncVhsCoversOptions {
  listType?: TmdbMovieListType;
  titleQueries?: TmdbTitleQuery[];
  limit?: number;
  force?: boolean;
  format?: 'png' | 'webp';
  quality?: number;
  templateId?: string;
  renderer?: VhsRenderer;
  psdPath?: string;
  smartObjectLayerName?: string;
}

export interface VhsClubMovieCover {
  id: number;
  title: string;
  year: number | null;
  releaseDate: string;
  voteAverage: number;
  coverImage: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const fileExists = async (absolutePath: string): Promise<boolean> => {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const getPsdTemplateSlug = (psdPath: string): string => {
  const baseName = path.basename(psdPath, path.extname(psdPath));
  return slugify(baseName) || 'psd-template';
};

const renderWithSharp = async (options: {
  sourceFilePath: string;
  templateId: string;
  format: 'png' | 'webp';
  quality: number;
  outputPath: string;
}): Promise<void> => {
  const result = await renderVhsPoster({
    sourceFilePath: options.sourceFilePath,
    templateId: options.templateId,
    fit: 'cover',
    format: options.format,
    quality: options.quality,
    background: 'transparent',
  });

  await fs.writeFile(options.outputPath, result.buffer);
};

const renderWithPhotoshop = async (options: {
  sourceFilePath: string;
  psdPath: string;
  smartObjectLayerName?: string;
  format: 'png' | 'webp';
  quality: number;
  outputPath: string;
  scratchPath: string;
}): Promise<void> => {
  const outputPng = options.format === 'png' ? options.outputPath : options.scratchPath;

  await renderPosterIntoPsd({
    psdPath: options.psdPath,
    posterPath: options.sourceFilePath,
    outputPath: outputPng,
    smartObjectLayerName: options.smartObjectLayerName,
  });

  if (options.format === 'webp') {
    await sharp(outputPng).webp({ quality: options.quality }).toFile(options.outputPath);
    await fs.rm(outputPng, { force: true });
  }
};

export const syncFrontSideVhsCovers = async (
  options: SyncVhsCoversOptions = {}
): Promise<VhsClubMovieCover[]> => {
  const hasCustomTitles = Boolean(options.titleQueries && options.titleQueries.length > 0);
  const listType = options.listType ?? 'popular';
  const limit = clamp(options.limit ?? 8, 1, 20);
  const force = options.force ?? false;
  const format = options.format ?? 'webp';
  const quality = clamp(options.quality ?? 92, 1, 100);
  const renderer = options.renderer ?? 'sharp';
  const templateId = options.templateId ?? 'front-side-cover-flat';
  const psdPath = options.psdPath ?? DEFAULT_PSD_TEMPLATE_PATH;

  if (renderer === 'photoshop' && !(await fileExists(psdPath))) {
    throw new Error(`PSD template not found: ${psdPath}`);
  }

  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

  const movies = hasCustomTitles
    ? await getTmdbMoviesByTitleQueries(options.titleQueries ?? [])
    : await getTmdbMovieList(listType, 1);
  const moviesWithPoster = movies.filter((movie) => movie.posterUrl);
  const selectedMovies = moviesWithPoster.slice(0, limit);

  const output: VhsClubMovieCover[] = [];

  for (const movie of selectedMovies) {
    if (!movie.posterUrl) {
      continue;
    }

    const posterPath = await getCachedTmdbPosterPath(movie.id, movie.posterUrl);

    const safeSlug = slugify(movie.title) || `movie-${movie.id}`;
    const templateSlug =
      renderer === 'photoshop'
        ? getPsdTemplateSlug(psdPath)
        : (slugify(templateId) || 'template');

    const sourceKey = hasCustomTitles ? 'custom' : listType;
    const fileBase = `${sourceKey}-${movie.id}-${renderer}-${templateSlug}-${safeSlug}`;
    const fileName = `${fileBase}.${format}`;
    const scratchPngPath = path.join(OUTPUT_DIRECTORY, `${fileBase}.render.png`);
    const absoluteFilePath = path.join(OUTPUT_DIRECTORY, fileName);
    const publicPath = `/VHS/generated/${fileName}`;

    if (force || !(await fileExists(absoluteFilePath))) {
      if (renderer === 'photoshop') {
        await renderWithPhotoshop({
          sourceFilePath: posterPath,
          psdPath,
          smartObjectLayerName: options.smartObjectLayerName,
          format,
          quality,
          outputPath: absoluteFilePath,
          scratchPath: scratchPngPath,
        });
      } else {
        await renderWithSharp({
          sourceFilePath: posterPath,
          templateId,
          format,
          quality,
          outputPath: absoluteFilePath,
        });
      }
    }

    output.push({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      releaseDate: movie.releaseDate,
      voteAverage: movie.voteAverage,
      coverImage: publicPath,
    });
  }

  return output;
};
