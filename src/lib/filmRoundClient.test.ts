import assert from "node:assert/strict";
import test from "node:test";
import {
  FilmRoundRequestError,
  parseFilmRoundResponse,
} from "./filmRoundClient";

const ticket = {
  film: {
    id: 62,
    title: "2001: A Space Odyssey",
    year: 1968,
    coverImage: "/VHS/program/covers/2001-a-space-odyssey.webp",
  },
  image: "/ticket-demo/2001.webp",
  fallback: "/VHS/program/covers/2001-a-space-odyssey.webp",
  logo: "/ticket-demo/2001-logo.svg",
  palette: "ember",
  date: "2026-09-22",
  time: "16:00",
  venue: "Wergelandssalen",
  note: "ADGANG FOR ÉN",
  serial: "001",
};

const closedResponse = {
  status: "closed" as const,
  boardId: "na-2026-09-22",
  snapshot: {
    boardId: "na-2026-09-22",
    clubId: "na",
    screeningId: "2026-09-22",
    scheduledAt: "2026-09-22T16:00:00+02:00",
    lockedAt: "2026-09-22T18:00:00+02:00",
    snapshotId: "snapshot-1",
    algorithmVersion: "v1",
    revision: 12,
    ranking: [
      { film: ticket.film, votes: 4 },
      {
        film: {
          id: 78,
          title: "Blade Runner",
          year: 1982,
          coverImage: "/VHS/program/covers/blade-runner.webp",
        },
        votes: 1,
      },
    ],
    stats: {
      totalVotes: 5,
      participatingDevices: 3,
      lastVoteAt: "2026-09-22T17:59:00+02:00",
    },
    ticket,
  },
};

void test("parses open and closed round status", () => {
  assert.deepEqual(
    parseFilmRoundResponse({ status: "open", boardId: "na-2026-09-22" }),
    { status: "open", boardId: "na-2026-09-22" },
  );

  const parsed = parseFilmRoundResponse(closedResponse, "na-2026-09-22");
  assert.equal(parsed?.status, "closed");
  if (parsed?.status === "closed") {
    assert.equal(parsed.snapshot.ranking[0]?.film.title, ticket.film.title);
    assert.equal(parsed.snapshot.ticket?.film.id, ticket.film.id);
  }
});

void test("rejects stale board and malformed frozen rankings", () => {
  assert.equal(parseFilmRoundResponse(closedResponse, "another-board"), null);

  const duplicateRanking = structuredClone(closedResponse);
  duplicateRanking.snapshot.ranking[1]!.film =
    duplicateRanking.snapshot.ranking[0]!.film;
  assert.equal(parseFilmRoundResponse(duplicateRanking), null);
});

void test("rejects malformed round statuses", () => {
  assert.equal(parseFilmRoundResponse({ status: "open" }), null);
  assert.equal(
    parseFilmRoundResponse({
      status: "closed",
      boardId: "na-2026-09-22",
      snapshot: { ...closedResponse.snapshot, ticket: "not-a-ticket" },
    }),
    null,
  );

  const error = new FilmRoundRequestError("Runden er ikke tilgjengelig.", 503);
  assert.equal(error.name, "FilmRoundRequestError");
  assert.equal(error.status, 503);
});
