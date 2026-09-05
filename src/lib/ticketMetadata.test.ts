import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/tmdb/ticket";
import { getTmdbMovieTicketDetails } from "@/lib/tmdb";
import {
  selectDirectors,
  selectTicketMetadata,
  type TmdbMovieTicketDetails,
} from "./ticketMetadata";

interface RecordedResponse {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
}

const invoke = async ({
  method = "GET",
  query = {},
  remoteAddress = "127.0.0.1",
}: {
  method?: string;
  query?: Record<string, string | string[]>;
  remoteAddress?: string;
} = {}): Promise<RecordedResponse> => {
  let responseBody: unknown;
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const request = {
    headers: {},
    method,
    query,
    socket: { remoteAddress },
  } as unknown as NextApiRequest;
  const response = {
    json(payload: unknown) {
      responseBody = payload;
      return this;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value)
        ? value.join(", ")
        : String(value);
      return this;
    },
    status(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return this;
    },
  } as unknown as NextApiResponse;

  await handler(request, response);
  return { body: responseBody, headers, statusCode };
};

const withStubbedTmdb = async <T>(
  fetchImpl: typeof fetch,
  callback: () => Promise<T>,
): Promise<T> => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.TMDB_API_KEY;
  const originalRetries = process.env.TMDB_FETCH_RETRIES;
  process.env.TMDB_API_KEY = "unit-test-secret";
  process.env.TMDB_FETCH_RETRIES = "1";
  globalThis.fetch = fetchImpl;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalApiKey;
    if (originalRetries === undefined) delete process.env.TMDB_FETCH_RETRIES;
    else process.env.TMDB_FETCH_RETRIES = originalRetries;
  }
};

const testCacheFiles = [987654300, 987654301].map((movieId) =>
  path.join(
    process.cwd(),
    ".cache",
    "tmdb",
    "tickets",
    `movie-${movieId}-details.json`,
  ),
);

void test("rejects non-GET requests and malformed or ambiguous movie ids", async () => {
  const methodResponse = await invoke({
    method: "POST",
    query: { movieId: "62" },
  });
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.allow, "GET");

  const invalidQueries: Array<Record<string, string | string[]>> = [
    {},
    { movieId: "0" },
    { movieId: "62.5" },
    { movieId: "62e1" },
    { movieId: ["62", "63"] },
    { movieId: "62", url: "https://attacker.invalid" },
  ];

  for (const query of invalidQueries) {
    const response = await invoke({ query });
    assert.equal(response.statusCode, 400, JSON.stringify(query));
  }
});

void test("returns a safe error body when TMDB fails", async () => {
  const response = await withStubbedTmdb(
    async () =>
      new Response(
        JSON.stringify({
          error: "https://api.themoviedb.org/3/movie/62?api_key=leaked",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    () => invoke({ query: { movieId: "987654300" } }),
  );

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.body, {
    message: "TMDB ticket metadata is temporarily unavailable.",
  });
  assert.equal(JSON.stringify(response.body).includes("api_key"), false);
  assert.equal(JSON.stringify(response.body).includes("themoviedb.org"), false);
});

void test("uses one bounded details request for concurrent ticket lookups", async () => {
  let requestCount = 0;
  const responsePayload = {
    id: 987654301,
    title: "A bounded test film",
    release_date: "2001-01-01",
    original_language: "en",
    poster_path: "/bounded-poster.jpg",
    backdrop_path: null,
    credits: { crew: [] },
    images: { logos: [], backdrops: [], posters: [] },
  };

  await fs.rm(testCacheFiles[1]!, { force: true });
  await withStubbedTmdb(
    async () => {
      requestCount += 1;
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      const [first, second] = await Promise.all([
        getTmdbMovieTicketDetails(987654301),
        getTmdbMovieTicketDetails(987654301),
      ]);
      assert.equal(first?.id, 987654301);
      assert.equal(second?.id, 987654301);
    },
  );
  assert.equal(requestCount, 1);
  await fs.rm(testCacheFiles[1]!, { force: true });
});

void test("returns the ticket contract with original logo and bounded image size", async () => {
  let requestedUrl: URL | undefined;
  const responsePayload = {
    id: 987654300,
    title: "A ticket test film",
    release_date: "1968-04-02",
    original_language: "ja",
    poster_path: "/ticket-poster.jpg",
    backdrop_path: null,
    credits: { crew: [{ job: "Director", name: "Test Director" }] },
    images: {
      logos: [
        {
          file_path: "/ticket-logo.png",
          iso_639_1: "ja",
          width: 400,
          height: 100,
        },
      ],
      backdrops: [{ file_path: "/ticket-backdrop.jpg", iso_639_1: null }],
      posters: [],
    },
  };

  await fs.rm(testCacheFiles[0]!, { force: true });
  const response = await withStubbedTmdb(
    async (input) => {
      const requestTarget =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      requestedUrl = new URL(requestTarget);
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    () => invoke({ query: { movieId: "987654300" } }),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    film: {
      id: 987654300,
      title: "A ticket test film",
      year: 1968,
      coverImage: "https://image.tmdb.org/t/p/w780/ticket-poster.jpg",
    },
    image: "https://image.tmdb.org/t/p/w1280/ticket-backdrop.jpg",
    fallback: "https://image.tmdb.org/t/p/w780/ticket-poster.jpg",
    logo: "https://image.tmdb.org/t/p/original/ticket-logo.png",
    director: "Test Director",
  });
  assert.equal(requestedUrl?.pathname, "/3/movie/987654300");
  assert.equal(requestedUrl?.searchParams.get("language"), "en-US");
  assert.equal(
    requestedUrl?.searchParams.get("append_to_response"),
    "credits,images",
  );
  assert.match(
    requestedUrl?.searchParams.get("include_image_language") ?? "",
    /^en,null,.*ja/,
  );
  assert.equal(
    JSON.stringify(response.body).includes("unit-test-secret"),
    false,
  );
  await fs.rm(testCacheFiles[0]!, { force: true });
});

const makeDetails = (
  overrides: Partial<TmdbMovieTicketDetails> = {},
): TmdbMovieTicketDetails => ({
  id: 62,
  title: "2001: A Space Odyssey",
  releaseDate: "1968-04-02",
  originalLanguage: "en",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  credits: { crew: [] },
  images: {
    logos: [],
    backdrops: [],
    posters: [],
  },
  ...overrides,
});

void test("selects a backdrop first and keeps a safe empty image when artwork is absent", () => {
  const withBackdrop = selectTicketMetadata(
    makeDetails({
      images: {
        logos: [],
        backdrops: [{ filePath: "/selected-backdrop.jpg", language: null }],
        posters: [{ filePath: "/selected-poster.jpg", language: null }],
      },
    }),
    {
      coverImage: "/VHS/program/vote-covers/002-2001-a-space-odyssey.webp",
      fallback: "/VHS/program/cassette-labels/62.jpg",
    },
  );

  assert.equal(
    withBackdrop.image,
    "https://image.tmdb.org/t/p/w1280/selected-backdrop.jpg",
  );
  assert.equal(
    withBackdrop.film.coverImage,
    "/VHS/program/vote-covers/002-2001-a-space-odyssey.webp",
  );
  assert.equal(withBackdrop.fallback, "/VHS/program/cassette-labels/62.jpg");

  const withoutArtwork = selectTicketMetadata(
    makeDetails({ posterPath: null, backdropPath: null }),
    { coverImage: "/local-cover.webp", fallback: "/local-fallback.jpg" },
  );
  assert.equal(withoutArtwork.image, "");
  assert.equal(withoutArtwork.logo, undefined);
  assert.equal(withoutArtwork.director, undefined);

  const unsafeArtwork = selectTicketMetadata(
    makeDetails({
      posterPath: "/poster.svg",
      backdropPath: "https://attacker.invalid/backdrop.jpg",
    }),
  );
  assert.equal(unsafeArtwork.image, "");
  assert.equal(unsafeArtwork.film.coverImage, "");
});

void test("deduplicates multiple director credits while retaining their order", () => {
  assert.equal(
    selectDirectors([
      { job: "Director", name: "First Director" },
      { job: "Writer", name: "A Writer" },
      { job: " director ", name: " First Director " },
      { job: "Director", name: "Second Director" },
    ]),
    "First Director, Second Director",
  );
});

void test("prefers the original-language logo, then English, then an unlabelled logo", () => {
  const logos = [
    { filePath: "/null-logo.png", language: null },
    { filePath: "/english-logo.png", language: "en" },
    { filePath: "/japanese-logo.png", language: "ja" },
  ];

  const original = selectTicketMetadata(
    makeDetails({
      originalLanguage: "ja",
      images: { logos, backdrops: [], posters: [] },
    }),
  );
  assert.equal(
    original.logo,
    "https://image.tmdb.org/t/p/original/japanese-logo.png",
  );

  const english = selectTicketMetadata(
    makeDetails({
      originalLanguage: "fr",
      images: { logos, backdrops: [], posters: [] },
    }),
  );
  assert.equal(
    english.logo,
    "https://image.tmdb.org/t/p/original/english-logo.png",
  );

  const englishWhenUnknown = selectTicketMetadata(
    makeDetails({
      originalLanguage: null,
      images: { logos, backdrops: [], posters: [] },
    }),
  );
  assert.equal(
    englishWhenUnknown.logo,
    "https://image.tmdb.org/t/p/original/english-logo.png",
  );

  const unlabelled = selectTicketMetadata(
    makeDetails({
      originalLanguage: "fr",
      images: {
        logos: [{ filePath: "/null-logo.png", language: null }],
        backdrops: [],
        posters: [],
      },
    }),
  );
  assert.equal(
    unlabelled.logo,
    "https://image.tmdb.org/t/p/original/null-logo.png",
  );
});
