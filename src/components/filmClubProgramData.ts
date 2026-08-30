export interface FilmProgramMovie {
  id: number;
  title: string;
  year: number;
  director: string;
  scheduledAt: string;
  coverImage: string;
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

export const FALLBACK_NEXT_MOVIE: FilmProgramMovie = {
  id: 78,
  title: "Blade Runner",
  year: 1982,
  director: "Ridley Scott",
  scheduledAt: "2026-09-06T19:00:00+02:00",
  coverImage: PROGRAM_COVER_BY_ID[78]!,
};

export const PAST_FILMS: FilmProgramMovie[] = [
  {
    id: 62,
    title: "2001: A Space Odyssey",
    year: 1968,
    director: "Stanley Kubrick",
    scheduledAt: "2026-08-16T19:00:00+02:00",
    coverImage: PROGRAM_COVER_BY_ID[62]!,
  },
  {
    id: 503919,
    title: "The Lighthouse",
    year: 2019,
    director: "Robert Eggers",
    scheduledAt: "2026-08-02T19:00:00+02:00",
    coverImage: PROGRAM_COVER_BY_ID[503919]!,
  },
  {
    id: 438631,
    title: "Dune",
    year: 2021,
    director: "Denis Villeneuve",
    scheduledAt: "2026-07-19T19:00:00+02:00",
    coverImage: PROGRAM_COVER_BY_ID[438631]!,
  },
  {
    id: 843,
    title: "In the Mood for Love",
    year: 2000,
    director: "Wong Kar-wai",
    scheduledAt: "2026-07-05T19:00:00+02:00",
    coverImage: PROGRAM_COVER_BY_ID[843]!,
  },
  {
    id: 655,
    title: "Paris, Texas",
    year: 1984,
    director: "Wim Wenders",
    scheduledAt: "2026-06-21T19:00:00+02:00",
    coverImage: PROGRAM_COVER_BY_ID[655]!,
  },
];

export const POLL_FILMS = [
  {
    id: "aftersun",
    movie: {
      id: 965150,
      title: "Aftersun",
      year: 2022,
      director: "Charlotte Wells",
      scheduledAt: "",
      coverImage: PROGRAM_COVER_BY_ID[965150]!,
    },
    votes: 11,
  },
  {
    id: "parasite",
    movie: {
      id: 496243,
      title: "Parasite",
      year: 2019,
      director: "Bong Joon Ho",
      scheduledAt: "",
      coverImage: PROGRAM_COVER_BY_ID[496243]!,
    },
    votes: 14,
  },
  {
    id: "the-handmaiden",
    movie: {
      id: 290098,
      title: "The Handmaiden",
      year: 2016,
      director: "Park Chan-wook",
      scheduledAt: "",
      coverImage: PROGRAM_COVER_BY_ID[290098]!,
    },
    votes: 8,
  },
] as const;

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
});

export const formatFilmDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Tidspunkt kommer";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatArchiveDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};
