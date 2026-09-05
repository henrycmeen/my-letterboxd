import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import films from "../data/filmVoteCatalogue.json";
import { makeDemoFinalists, makeFilmTicket } from "./filmTicket";

void test("the finale captures the visitor's ranking without changing the catalogue", () => {
  const ranked = [...films].reverse();
  const finalists = makeDemoFinalists(ranked);
  assert.equal(finalists.length, ranked.length);
  assert.equal(finalists[0]!.film.id, ranked[0]!.id);
  assert.equal(finalists[0]!.votes, 34);
  assert.ok(
    finalists.every(
      (entry, index) =>
        index === 0 || entry.votes <= finalists[index - 1]!.votes,
    ),
  );
  const capturedTitle = finalists[0]!.film.title;
  ranked[0] = { ...ranked[0]!, title: "Changed after announcement" };
  assert.equal(finalists[0]!.film.title, capturedTitle);
  assert.deepEqual(makeDemoFinalists([]), []);
  assert.equal(makeDemoFinalists(films.slice(0, 1)).length, 1);
});

void test("every catalogue film can produce a ticket with an existing local fallback", () => {
  for (const film of films) {
    const ticket = makeFilmTicket(film, "001");
    assert.equal(ticket.film.id, film.id);
    assert.ok(
      existsSync(join(process.cwd(), "public", ticket.fallback)),
      film.title,
    );
    if (ticket.logoFallback) {
      assert.ok(
        existsSync(join(process.cwd(), "public", ticket.logoFallback)),
        film.title,
      );
    }
  }
  const persona = makeFilmTicket(films.find((f) => f.id === 797)!, "002");
  assert.equal(persona.logo, undefined);
  assert.equal(persona.film.title, "Persona");
});
