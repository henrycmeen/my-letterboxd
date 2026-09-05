import assert from "node:assert/strict";
import test from "node:test";
import { ACCESS_CODE_LENGTH, resolveClubSlugFromAccessCode } from "./accessCodes";
import { getClubHomePath } from "./clubSlug";

void test("the remote code 123 opens the NA club", () => {
  assert.equal(ACCESS_CODE_LENGTH, 3);
  assert.equal(getClubHomePath(resolveClubSlugFromAccessCode("123")!), "/na");
});

void test("incomplete, unknown and inherited keys are not club codes", () => {
  for (const code of ["", "12", "999", "constructor", "__proto__"]) {
    assert.equal(resolveClubSlugFromAccessCode(code), null);
  }
});
