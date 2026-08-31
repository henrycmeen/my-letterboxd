import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filmClubHistoryEntrySchema,
  filmClubProgrammeConfigSchema,
  getActiveVoteBoardId,
  getFilmClubProgramme,
  resolveCanonicalClubId,
} from "./filmClubProgramme";

void test("maps the Nasjonalarkivet route alias to the same programme", () => {
  assert.equal(resolveCanonicalClubId("nasjonalarkivet"), "na");
  assert.deepEqual(
    getFilmClubProgramme("nasjonalarkivet"),
    getFilmClubProgramme("na"),
  );
});

void test("builds a stable vote board id from the canonical club and screening", () => {
  assert.equal(getActiveVoteBoardId("na"), "na-2026-09-06");
  assert.equal(getActiveVoteBoardId("Nasjonalarkivet"), "na-2026-09-06");
  assert.equal(getActiveVoteBoardId("na"), getActiveVoteBoardId("NA"));
});

void test("keeps unknown clubs deterministic and isolated from Nasjonalarkivet", () => {
  assert.equal(resolveCanonicalClubId("guest-night"), "guest-night");
  assert.notEqual(resolveCanonicalClubId("guest-night"), "na");
  assert.equal(getActiveVoteBoardId("guest-night"), "guest-night-2026-09-06");
  assert.notEqual(getActiveVoteBoardId("guest-night"), "na-2026-09-06");
  assert.deepEqual(
    getFilmClubProgramme("guest-night"),
    getFilmClubProgramme("guest night"),
  );
});

void test("validates the configured screening dates and empty history", () => {
  const programme = getFilmClubProgramme("na");

  assert.equal(programme.activeScreening.id, "2026-09-06");
  assert.equal(
    programme.activeScreening.scheduledAt,
    "2026-09-06T19:00:00+02:00",
  );
  assert.deepEqual(programme.history, []);
  assert.equal(
    filmClubProgrammeConfigSchema.safeParse({
      clubs: { na: programme, default: getFilmClubProgramme("default") },
      aliases: { nasjonalarkivet: "na" },
    }).success,
    true,
  );
});

void test("validates history entries used by the results view", () => {
  const historyEntry = filmClubHistoryEntrySchema.parse({
    screeningId: "2026-08-30",
    scheduledAt: "2026-08-30T19:00:00+02:00",
    winnerFilmId: 655,
    finalVoteCount: 6,
    totalVotes: 17,
    participatingDevices: 9,
  });

  assert.equal(historyEntry.screeningId, "2026-08-30");
  assert.equal(historyEntry.scheduledAt, "2026-08-30T19:00:00+02:00");
  assert.equal(historyEntry.winnerFilmId, 655);
  assert.equal(historyEntry.finalVoteCount, 6);
  assert.equal(historyEntry.totalVotes, 17);
  assert.equal(historyEntry.participatingDevices, 9);
  assert.equal(
    filmClubHistoryEntrySchema.safeParse({
      ...historyEntry,
      scheduledAt: "not-a-date",
    }).success,
    false,
  );
  assert.equal(
    filmClubHistoryEntrySchema.safeParse({
      ...historyEntry,
      winnerFilmId: 999_999_999,
    }).success,
    false,
  );
});
