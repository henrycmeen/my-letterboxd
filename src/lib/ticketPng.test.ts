import test from "node:test";
import assert from "node:assert/strict";
import { getTicketPngDimensions, getTicketPngFilename } from "./ticketPng";

void test("ticket PNG dimensions target the printed ticket size", () => {
  const dimensions = getTicketPngDimensions(350, 831.25);

  assert.equal(dimensions.width, 1200);
  assert.equal(dimensions.height, 2850);
  assert.ok(dimensions.scale > 1);
});

void test("ticket PNG dimensions keep mobile output within the pixel bound", () => {
  const dimensions = getTicketPngDimensions(320, 2_000);

  assert.ok(dimensions.width * dimensions.height <= 6_000_000);
  assert.ok(dimensions.scale <= 4);
});

void test("ticket PNG filenames are safe and descriptive", () => {
  assert.equal(
    getTicketPngFilename("Yi Yi: En film / en kveld"),
    "filmklubben-yi-yi-en-film-en-kveld.png",
  );
  assert.equal(getTicketPngFilename("   "), "filmklubben-film.png");
});
