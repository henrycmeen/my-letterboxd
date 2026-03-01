import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  getCachedTmdbImagePath,
  getTmdbMovieById,
  getTmdbMoviesBySearchQuery,
  getTmdbMoviesByTitleQueries,
  getTmdbMovieList,
  type ClubMovie as TmdbClubMovie,
  type TmdbTitleQuery,
  type TmdbMovieListType,
} from '@/lib/tmdb';
import { renderPosterIntoPsd } from '@/lib/vhs/psdRenderer';
import { renderVhsPoster } from '@/lib/vhs/render';
import { DEFAULT_VHS_TEMPLATE_ID } from '@/lib/vhs/templates';

const OUTPUT_DIRECTORY = path.join(process.cwd(), 'public', 'VHS', 'generated');
const VHS_RENDER_VERSION = 'r11';
const DEFAULT_SHARP_RENDER_SIZE = 1800;
const MIN_SHARP_RENDER_SIZE = 720;
const MAX_SHARP_RENDER_SIZE = 4000;
const DEFAULT_PSD_TEMPLATE_PATH = path.join(
  process.cwd(),
  'assets',
  'vhs-mockups',
  'originals',
  '01. Front Side COVER.psd'
);

export type VhsRenderer = 'sharp' | 'photoshop';
export type VhsSourceImageType = 'poster' | 'backdrop';

export interface SyncVhsCoversOptions {
  movieId?: number;
  listType?: TmdbMovieListType;
  titleQueries?: TmdbTitleQuery[];
  searchQuery?: string;
  limit?: number;
  force?: boolean;
  format?: 'png' | 'webp';
  quality?: number;
  templateId?: string;
  renderer?: VhsRenderer;
  sourceImageType?: VhsSourceImageType;
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

const getSharpRenderSize = (): number => {
  const raw = process.env.VHS_SHARP_RENDER_SIZE?.trim();
  if (!raw) {
    return DEFAULT_SHARP_RENDER_SIZE;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SHARP_RENDER_SIZE;
  }

  return clamp(
    Math.round(parsed),
    MIN_SHARP_RENDER_SIZE,
    MAX_SHARP_RENDER_SIZE
  );
};

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
  renderSize: number;
  randomSeed?: string;
  outputPath: string;
}): Promise<void> => {
  const result = await renderVhsPoster({
    sourceFilePath: options.sourceFilePath,
    templateId: options.templateId,
    fit: 'cover',
    width: options.renderSize,
    height: options.renderSize,
    format: options.format,
    quality: options.quality,
    background: 'transparent',
    randomSeed: options.randomSeed,
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
  const movieId =
    options.movieId !== undefined && Number.isFinite(options.movieId)
      ? Math.floor(options.movieId)
      : undefined;
  const hasMovieId = Boolean(movieId && movieId > 0);
  const hasCustomTitles = Boolean(options.titleQueries && options.titleQueries.length > 0);
  const searchQuery = options.searchQuery?.trim() ?? '';
  const hasSearchQuery = searchQuery.length > 0;
  const listType = options.listType ?? 'popular';
  const limit = clamp(options.limit ?? 8, 1, 20);
  const force = options.force ?? false;
  const format = options.format ?? 'webp';
  const quality = clamp(options.quality ?? 92, 1, 100);
  const renderer = options.renderer ?? 'sharp';
  const templateId = options.templateId ?? DEFAULT_VHS_TEMPLATE_ID;
  const sourceImageType = options.sourceImageType ?? 'poster';
  const psdPath = options.psdPath ?? DEFAULT_PSD_TEMPLATE_PATH;
  const sharpRenderSize = getSharpRenderSize();

  if (renderer === 'photoshop' && !(await fileExists(psdPath))) {
    throw new Error(`PSD template not found: ${psdPath}`);
  }

  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

  let movies: TmdbClubMovie[];
  if (hasMovieId) {
    const movie = await getTmdbMovieById(movieId ?? 0);
    movies = movie ? [movie] : [];
  } else if (hasCustomTitles) {
    movies = await getTmdbMoviesByTitleQueries(options.titleQueries ?? []);
  } else if (hasSearchQuery) {
    movies = await getTmdbMoviesBySearchQuery(searchQuery, Math.min(20, limit * 3));
  } else {
    movies = await getTmdbMovieList(listType, 1);
  }
  const moviesWithSource = movies.filter((movie) =>
    sourceImageType === 'backdrop'
      ? movie.backdropUrl ?? movie.posterUrl
      : movie.posterUrl
  );
  const selectedMovies = moviesWithSource.slice(0, limit);

  const output: VhsClubMovieCover[] = [];

  for (const movie of selectedMovies) {
    const sourceImageUrl =
      sourceImageType === 'backdrop'
        ? movie.backdropUrl ?? movie.posterUrl
        : movie.posterUrl ?? movie.backdropUrl;

    if (!sourceImageUrl) {
      continue;
    }

    const posterPath = await getCachedTmdbImagePath(
      movie.id,
      sourceImageUrl,
      sourceImageType
    );

    const safeSlug = slugify(movie.title) || `movie-${movie.id}`;
    const templateSlug =
      renderer === 'photoshop'
        ? getPsdTemplateSlug(psdPath)
        : (slugify(templateId) || 'template');

    const sourceKey = hasMovieId
      ? 'movie'
      : hasCustomTitles
        ? 'custom'
        : hasSearchQuery
          ? 'search'
          : listType;
    const sourceImageKey = sourceImageType === 'poster' ? '' : `-${sourceImageType}`;
    const fileBase = `${sourceKey}-${movie.id}${sourceImageKey}-${renderer}-${templateSlug}-${VHS_RENDER_VERSION}-${safeSlug}`;
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
          renderSize: sharpRenderSize,
          randomSeed: `movie-${movie.id}`,
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
