import { z } from "zod";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const scheduledAtSchema = z.string().datetime({ offset: true });

export const filmRoundFilmSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1),
    year: z.number().int().nonnegative(),
    coverImage: z.string(),
  })
  .strict();

export const filmRoundCatalogueEntrySchema = filmRoundFilmSchema
  .extend({
    tmdbVoteAverage: z.number().finite(),
  })
  .strict();

export const filmRoundTicketSchema = z
  .object({
    film: filmRoundFilmSchema,
    image: z.string(),
    fallback: z.string(),
    logo: z.string().optional(),
    logoFallback: z.string().optional(),
    director: z.string().optional(),
    palette: z.string(),
    date: z.string(),
    time: z.string(),
    venue: z.string(),
    note: z.string(),
    serial: z.string(),
  })
  .strict();

export const filmRoundRankingEntrySchema = z
  .object({
    film: filmRoundFilmSchema,
    tmdbVoteAverage: z.number().finite().optional(),
    votes: z.number().int().nonnegative(),
  })
  .strict();

export const filmRoundStatsSchema = z
  .object({
    totalVotes: z.number().int().nonnegative(),
    participatingDevices: z.number().int().nonnegative(),
    lastVoteAt: scheduledAtSchema.nullable(),
  })
  .strict();

export const filmRoundSnapshotSchema = z
  .object({
    boardId: identifierSchema,
    clubId: identifierSchema,
    screeningId: identifierSchema,
    scheduledAt: scheduledAtSchema,
    lockedAt: scheduledAtSchema,
    snapshotId: z.string().trim().min(1).max(128),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    algorithmVersion: z.string().trim().min(1).max(64),
    revision: z.number().int().nonnegative(),
    ranking: z.array(filmRoundRankingEntrySchema).min(1),
    winner: filmRoundRankingEntrySchema.nullable(),
    stats: filmRoundStatsSchema,
    ticket: filmRoundTicketSchema.nullable(),
  })
  .strict();

export const filmRoundLockMetadataSchema = z
  .object({
    clubId: identifierSchema,
    screeningId: identifierSchema,
    scheduledAt: scheduledAtSchema,
    catalogue: z.array(filmRoundCatalogueEntrySchema).min(1).max(200),
    ticketTemplates: z.record(filmRoundTicketSchema),
    algorithmVersion: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    const ids = new Set<number>();
    for (const [index, film] of metadata.catalogue.entries()) {
      if (ids.has(film.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["catalogue", index, "id"],
          message: "Catalogue film ids must be unique.",
        });
      }
      ids.add(film.id);
    }
  });

export type FilmRoundFilm = z.infer<typeof filmRoundFilmSchema>;
export type FilmRoundCatalogueEntry = z.infer<
  typeof filmRoundCatalogueEntrySchema
>;
export type FilmRoundTicket = z.infer<typeof filmRoundTicketSchema>;
export type FilmRoundRankingEntry = z.infer<typeof filmRoundRankingEntrySchema>;
export type FilmRoundStats = z.infer<typeof filmRoundStatsSchema>;
export type FilmRoundSnapshot = z.infer<typeof filmRoundSnapshotSchema>;
export type FilmRoundLockMetadata = z.infer<typeof filmRoundLockMetadataSchema>;

export const FILM_ROUND_ALGORITHM_VERSION = "film-vote-v1";

export const FILM_ROUND_ERROR_CODES = {
  ROUND_CLOSED: "ROUND_CLOSED",
  REVISION_CONFLICT: "REVISION_CONFLICT",
} as const;

export type FilmRoundErrorCode =
  (typeof FILM_ROUND_ERROR_CODES)[keyof typeof FILM_ROUND_ERROR_CODES];

export class FilmRoundError extends Error {
  readonly code: FilmRoundErrorCode;

  constructor(code: FilmRoundErrorCode, message: string) {
    super(message);
    this.name = "FilmRoundError";
    this.code = code;
  }
}

export class FilmRoundClosedError extends FilmRoundError {
  constructor() {
    super(
      FILM_ROUND_ERROR_CODES.ROUND_CLOSED,
      "This voting round is already closed.",
    );
    this.name = "FilmRoundClosedError";
  }
}

export class FilmRoundRevisionConflictError extends FilmRoundError {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super(
      FILM_ROUND_ERROR_CODES.REVISION_CONFLICT,
      "The voting revision has changed.",
    );
    this.name = "FilmRoundRevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }

  return value;
};

export const freezeFilmRoundSnapshot = (
  snapshot: FilmRoundSnapshot,
): FilmRoundSnapshot => deepFreeze(snapshot);

export const isFilmRoundError = (error: unknown): error is FilmRoundError =>
  error instanceof FilmRoundError ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === FILM_ROUND_ERROR_CODES.ROUND_CLOSED ||
      error.code === FILM_ROUND_ERROR_CODES.REVISION_CONFLICT));
