import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";

const testDirectory = await fs.mkdtemp(
  path.join(tmpdir(), "filmklubb-results-api-"),
);
process.env.CLUB_DB_PATH = path.join(testDirectory, "results.sqlite");

const { getFilmVoteStore } = await import("./filmVotes");
const { default: handler } = await import("../pages/api/club/results");

interface RecordedResponse {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
}

const invoke = async ({
  method = "GET",
  query = { clubSlug: "NA" },
}: {
  method?: string;
  query?: Record<string, string | string[]>;
} = {}): Promise<RecordedResponse> => {
  let responseBody: unknown;
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const request = { method, query } as unknown as NextApiRequest;
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

  handler(request, response);
  return { body: responseBody, headers, statusCode };
};

after(async () => {
  await fs.rm(testDirectory, { force: true, recursive: true });
});

void test("returns the active screening, exact ranking, and aggregate use", async () => {
  const firstFilmId = filmVoteCatalogue[0]!.id;
  const secondFilmId = filmVoteCatalogue[1]!.id;
  const store = getFilmVoteStore();
  store.setVote("na", firstFilmId, "legacy-ip-key", true);
  store.setVote("na-2026-09-06", secondFilmId, "previous-round-device", true);
  store.setVote("na-2026-09-22", secondFilmId, "device-v1:a", true);
  store.setVote("na-2026-09-22", secondFilmId, "device-v1:b", true);
  store.setVote("na-2026-09-22", firstFilmId, "device-v1:a", true);

  const response = await invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-store");
  const body = response.body as {
    activeScreening: { id: string; scheduledAt: string };
    club: { id: string; name: string };
    history: unknown[];
    ranking: Array<{ filmId: number; rank: number; votes: number }>;
    revision: number;
    stats: {
      lastVoteAt: string | null;
      participatingDevices: number;
      totalVotes: number;
    };
  };
  assert.deepEqual(body.club, { id: "na", name: "Nasjonalarkivet" });
  assert.deepEqual(body.activeScreening, {
    id: "2026-09-22",
    scheduledAt: "2026-09-22T16:00:00+02:00",
  });
  assert.deepEqual(body.ranking[0], {
    filmId: secondFilmId,
    rank: 1,
    title: filmVoteCatalogue[1]!.title,
    coverImage: filmVoteCatalogue[1]!.coverImage,
    votes: 2,
  });
  assert.equal(body.revision, 3);
  assert.equal(body.stats.totalVotes, 3);
  assert.equal(body.stats.participatingDevices, 2);
  assert.match(body.stats.lastVoteAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(body.history, []);
  assert.equal(JSON.stringify(body).includes("device-v1"), false);
});

void test("maps the long Nasjonalarkivet alias to the same active results", async () => {
  const response = await invoke({ query: { clubSlug: "nasjonalarkivet" } });
  const body = response.body as {
    club: { id: string };
    revision: number;
  };

  assert.equal(body.club.id, "na");
  assert.equal(body.revision, 3);
});

void test("rejects unsupported methods", async () => {
  const response = await invoke({ method: "POST" });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "GET");
});
