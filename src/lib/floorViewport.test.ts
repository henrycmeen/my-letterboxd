import assert from 'node:assert/strict';
import test from 'node:test';

import { getFloorLayoutScale } from './floorViewport';

void test('zooms the floor out when a phone viewport becomes short', () => {
  const scale = getFloorLayoutScale({ width: 393, height: 710 });

  assert.equal(scale, 710 / 1180);
  assert.ok(scale < 393 / 580);
});

void test('keeps a tall phone width-limited', () => {
  const scale = getFloorLayoutScale({ width: 393, height: 844 });

  assert.equal(scale, 393 / 580);
});

void test('allows small phones to scale below the old 0.62 floor', () => {
  const scale = getFloorLayoutScale({ width: 320, height: 568 });

  assert.equal(scale, 568 / 1180);
  assert.ok(scale < 0.62);
});

void test('preserves the existing desktop scale', () => {
  assert.equal(getFloorLayoutScale({ width: 1440, height: 900 }), 1);
  assert.equal(getFloorLayoutScale({ width: 800, height: 720 }), 0.8);
});
