export interface FilmProgramMovie {
  id: number;
  title: string;
  year: number;
  director: string;
  scheduledAt: string;
  coverImage: string;
  trailerYoutubeId: string | null;
}

export interface LiveProgramMovie {
  id: number;
  title: string;
  scheduledAt: string;
  coverImage: string;
  posterUrl: string | null;
  year: number | null;
}

export interface LiveProgramResponse {
  now: LiveProgramMovie | null;
}

export const FILM_CLUB_TIME_ZONE = "Europe/Oslo";

const PROGRAM_COVER_BY_ID: Record<number, string> = {
  62: "/VHS/program/covers/2001-a-space-odyssey.webp",
  78: "/VHS/program/covers/blade-runner.webp",
  655: "/VHS/program/covers/paris-texas.webp",
  843: "/VHS/program/covers/in-the-mood-for-love.webp",
  290098: "/VHS/program/covers/the-handmaiden.webp",
  438631: "/VHS/program/covers/dune.webp",
  496243: "/VHS/program/covers/parasite.webp",
  503919: "/VHS/program/covers/the-lighthouse.webp",
  965150: "/VHS/program/covers/aftersun.webp",
};

const PROGRAM_TRAILER_BY_ID: Record<number, string> = {
  78: "iYhJ7Mf2Oxs",
};

export const FALLBACK_NEXT_MOVIE: FilmProgramMovie = {
  id: 78,
  title: "Blade Runner",
  year: 1982,
  director: "Ridley Scott",
  scheduledAt: "2026-09-22T16:00:00+02:00",
  coverImage: PROGRAM_COVER_BY_ID[78]!,
  trailerYoutubeId: PROGRAM_TRAILER_BY_ID[78]!,
};

export const isLiveProgramResponse = (
  value: unknown,
): value is LiveProgramResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { now?: unknown };
  if (payload.now === null) {
    return true;
  }

  if (!payload.now || typeof payload.now !== "object") {
    return false;
  }

  const movie = payload.now as Partial<LiveProgramMovie>;
  return (
    typeof movie.id === "number" &&
    typeof movie.title === "string" &&
    typeof movie.scheduledAt === "string" &&
    typeof movie.coverImage === "string"
  );
};

export const mergeLiveNextMovie = (
  movie: LiveProgramMovie,
): FilmProgramMovie => ({
  id: movie.id,
  title: movie.title,
  year: movie.year ?? FALLBACK_NEXT_MOVIE.year,
  director:
    movie.id === FALLBACK_NEXT_MOVIE.id
      ? FALLBACK_NEXT_MOVIE.director
      : "Valgt av filmklubben",
  scheduledAt: movie.scheduledAt,
  coverImage:
    PROGRAM_COVER_BY_ID[movie.id] ?? movie.coverImage ?? movie.posterUrl ?? "",
  trailerYoutubeId: PROGRAM_TRAILER_BY_ID[movie.id] ?? null,
});

export const formatFilmDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Tidspunkt kommer";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: FILM_CLUB_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};
