const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;

export interface TmdbTicketCredit {
  job: string;
  name: string;
}

export interface TmdbTicketImage {
  filePath: string;
  language: string | null;
  width?: number;
  height?: number;
  voteAverage?: number;
  voteCount?: number;
}

/** The validated, server-normalized subset needed to print a film ticket. */
export interface TmdbMovieTicketDetails {
  id: number;
  title: string;
  releaseDate: string;
  originalLanguage: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  credits: {
    crew: readonly TmdbTicketCredit[];
  };
  images: {
    logos: readonly TmdbTicketImage[];
    backdrops: readonly TmdbTicketImage[];
    posters: readonly TmdbTicketImage[];
  };
}

export interface TicketMetadataFilm {
  id: number;
  title: string;
  year: number;
  coverImage: string;
}

export interface TicketMetadata {
  film: TicketMetadataFilm;
  image: string;
  fallback: string;
  logo?: string;
  director?: string;
}

export interface TicketMetadataOptions {
  /** Existing local catalogue cover, when this movie is already curated. */
  coverImage?: string;
  /** Existing local cassette-label fallback, when this movie is curated. */
  fallback?: string;
}

const normalizeText = (value: string | null | undefined): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const normalizeLanguage = (value: string | null | undefined): string | null => {
  const normalized = normalizeText(value).toLocaleLowerCase("en-US");
  if (!normalized) return null;
  return normalized.split("-")[0] ?? null;
};

const toSafePath = (value: string | null | undefined): string => {
  const path = normalizeText(value);
  if (
    !path.startsWith("/") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("..") ||
    path.includes("//") ||
    !TMDB_IMAGE_EXTENSIONS.test(path)
  ) {
    return "";
  }

  return path;
};

const toTmdbImageUrl = (
  filePath: string | null | undefined,
  size: "original" | "w780" | "w1280" = "original",
): string => {
  const path = toSafePath(filePath);
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : "";
};

const qualityScore = (image: TmdbTicketImage): number => {
  const voteCount = Number.isFinite(image.voteCount)
    ? (image.voteCount ?? 0)
    : 0;
  const voteAverage = Number.isFinite(image.voteAverage)
    ? (image.voteAverage ?? 0)
    : 0;
  const width = Number.isFinite(image.width) ? (image.width ?? 0) : 0;
  const height = Number.isFinite(image.height) ? (image.height ?? 0) : 0;

  return voteCount * 1_000_000 + voteAverage * 1_000 + width * height;
};

const bestImagePath = (images: readonly TmdbTicketImage[]): string =>
  [...images]
    .sort((first, second) => qualityScore(second) - qualityScore(first))
    .map((image) => toSafePath(image.filePath))
    .find(Boolean) ?? "";

const preferredLogoPath = (details: TmdbMovieTicketDetails): string => {
  const originalLanguage = normalizeLanguage(details.originalLanguage);
  const preferredLanguages: Array<string | null> = [];
  if (originalLanguage) {
    preferredLanguages.push(originalLanguage);
  }
  for (const language of ["en", null] as const) {
    if (!preferredLanguages.some((candidate) => candidate === language)) {
      preferredLanguages.push(language);
    }
  }

  const candidates = details.images.logos
    .map((image, index) => ({
      image,
      index,
      language: normalizeLanguage(image.language),
    }))
    .filter(({ image }) => Boolean(toSafePath(image.filePath)))
    .map((candidate) => ({
      ...candidate,
      languageRank: preferredLanguages.indexOf(candidate.language),
    }))
    .filter((candidate) => candidate.languageRank >= 0)
    .sort(
      (first, second) =>
        first.languageRank - second.languageRank ||
        qualityScore(second.image) - qualityScore(first.image) ||
        first.index - second.index,
    );

  return toTmdbImageUrl(candidates[0]?.image.filePath);
};

/** Return all credited directors once, retaining TMDB crew order. */
export const selectDirectors = (
  credits: readonly TmdbTicketCredit[],
): string | undefined => {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const credit of credits) {
    if (normalizeText(credit.job).toLocaleLowerCase("en-US") !== "director") {
      continue;
    }

    const name = normalizeText(credit.name);
    if (!name) continue;

    const key = name.normalize("NFKC").toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names.length > 0 ? names.join(", ") : undefined;
};

const parseYear = (releaseDate: string): number => {
  const match = /^([0-9]{4})(?:-|$)/.exec(normalizeText(releaseDate));
  if (!match) return 0;

  const year = Number(match[1]);
  return Number.isSafeInteger(year) ? year : 0;
};

/**
 * Purely select the ticket-facing fields from a TMDB details response.
 * Existing local cover/fallback paths are optional so arbitrary search results
 * can use TMDB's poster as their cover and fallback.
 */
export const selectTicketMetadata = (
  details: TmdbMovieTicketDetails,
  options: TicketMetadataOptions = {},
): TicketMetadata => {
  const image =
    toTmdbImageUrl(bestImagePath(details.images.backdrops), "w1280") ||
    toTmdbImageUrl(bestImagePath(details.images.posters), "w1280") ||
    toTmdbImageUrl(details.backdropPath, "w1280") ||
    toTmdbImageUrl(details.posterPath, "w1280");
  const poster = toTmdbImageUrl(details.posterPath, "w780");
  const coverImage = normalizeText(options.coverImage) || poster;
  const fallback = normalizeText(options.fallback) || coverImage;
  const logo = preferredLogoPath(details);
  const director = selectDirectors(details.credits.crew);

  return {
    film: {
      id: details.id,
      title: normalizeText(details.title),
      year: parseYear(details.releaseDate),
      coverImage,
    },
    image,
    fallback,
    ...(logo ? { logo } : {}),
    ...(director ? { director } : {}),
  };
};
