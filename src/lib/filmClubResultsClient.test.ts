import assert from "node:assert/strict";
import test from "node:test";
import {
  getFilmClubResultsRequestUrl,
  parseFilmClubResults,
} from "./filmClubResultsClient";

const completeResults = {
  club: { id: "na", name: "Nasjonalarkivet" },
  activeScreening: {
    id: "2026-09-22",
    scheduledAt: "2026-09-22T16:00:00+02:00",
  },
  ranking: [
    {
      rank: 1,
      filmId: 78,
      title: "Blade Runner",
      coverImage: "/VHS/program/covers/blade-runner.webp",
      tmdbVoteAverage: 8.2,
      votes: 7,
    },
    {
      rank: 2,
      filmId: 655,
      title: "Paris, Texas",
      coverImage: "/VHS/program/covers/paris-texas.webp",
      tmdbVoteAverage: 8.1,
      votes: 4,
    },
  ],
  stats: {
    totalVotes: 11,
    participatingDevices: 6,
    lastVoteAt: "2026-08-31T12:20:00.000Z",
  },
  history: [
    {
      screeningId: "screening-2026-08-30",
      scheduledAt: "2026-08-30T19:00:00+02:00",
      winner: {
        filmId: 655,
        title: "Paris, Texas",
        coverImage: "/VHS/program/covers/paris-texas.webp",
        votes: 12,
      },
      totalVotes: 21,
      participatingDevices: 9,
    },
  ],
  revision: 12,
  generatedAt: "2026-08-31T12:20:01.000Z",
};

void test("parses the complete aggregate results contract", () => {
  const results = parseFilmClubResults(completeResults);

  assert.equal(results?.club.id, "na");
  assert.equal(results?.ranking[0]?.title, "Blade Runner");
  assert.equal(results?.ranking[0]?.votes, 7);
  assert.equal(results?.ranking[0]?.tmdbVoteAverage, 8.2);
  assert.equal(results?.stats.participatingDevices, 6);
  assert.equal(results?.history[0]?.winner.title, "Paris, Texas");
});

void test("rejects malformed results and fields that could expose extra data", () => {
  const malformed = {
    ...completeResults,
    stats: { ...completeResults.stats, totalVotes: -1 },
  };
  const withUnexpectedField = {
    ...completeResults,
    voterIds: ["should-not-be-rendered"],
  };

  assert.equal(parseFilmClubResults(malformed), null);
  assert.equal(parseFilmClubResults(withUnexpectedField), null);
});

void test("normalizes the club route in the no-store results URL", () => {
  const requestUrl = getFilmClubResultsRequestUrl(" Nasjonalarkivet ");

  assert.equal(requestUrl, "/api/club/results?clubSlug=nasjonalarkivet");
});
