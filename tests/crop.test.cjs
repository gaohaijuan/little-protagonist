'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCropRect } = require('../miniprogram/lib/crop');

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, actual + ' differs from ' + expected);
}

test('default crop is centered and uses the head ellipse ratio', () => {
  const landscape = getCropRect(1200, 800);
  near(landscape.height, 800);
  near(landscape.width / landscape.height, 54 / 57);
  near(landscape.x, (1200 - landscape.width) / 2);
  near(landscape.y, 0);
  const portrait = getCropRect(600, 1200);
  near(portrait.width, 600);
  near(portrait.x, 0);
  near(portrait.y, (1200 - portrait.height) / 2);
});

test('zoom reduces the source region without stretching it', () => {
  const whole = getCropRect(1200, 800);
  const zoomed = getCropRect(1200, 800, { zoom: 3, x: 50, y: 50 });
  near(zoomed.width, whole.width / 3);
  near(zoomed.height, whole.height / 3);
  near(zoomed.x + zoomed.width / 2, 600);
  near(zoomed.y + zoomed.height / 2, 400);
});

test('every edge and zoom level stays inside tall, wide, and tiny photos', () => {
  const dimensions = [[1200, 800], [600, 1200], [1, 1], [20000, 13], [13, 20000], [1080, 1140]];
  for (const [width, height] of dimensions) {
    for (const zoom of [1, 1.3, 2, 3]) {
      for (const x of [0, 17, 50, 99, 100]) {
        for (const y of [0, 19, 50, 97, 100]) {
          const rectangle = getCropRect(width, height, { zoom, x, y });
          const tolerance = 1e-8;
          assert.ok(rectangle.x >= 0 && rectangle.y >= 0);
          assert.ok(rectangle.x + rectangle.width <= width + tolerance);
          assert.ok(rectangle.y + rectangle.height <= height + tolerance);
          near(rectangle.width / rectangle.height, 54 / 57);
          if (x === 0) near(rectangle.x, 0);
          if (x === 100) near(rectangle.x + rectangle.width, width, tolerance);
          if (y === 0) near(rectangle.y, 0);
          if (y === 100) near(rectangle.y + rectangle.height, height, tolerance);
        }
      }
    }
  }
});

test('invalid slider values recover safely and numeric limits clamp', () => {
  assert.deepEqual(getCropRect(600, 800, { zoom: NaN, x: NaN, y: NaN }), getCropRect(600, 800));
  assert.deepEqual(getCropRect(600, 800, { zoom: 99, x: -20, y: 300 }), getCropRect(600, 800, { zoom: 3, x: 0, y: 100 }));
  assert.deepEqual(getCropRect(600, 800, { zoom: '2', x: '25', y: '75' }), getCropRect(600, 800, { zoom: 2, x: 25, y: 75 }));
});

test('custom aspect ratios are preserved and invalid dimensions reject', () => {
  near(getCropRect(640, 480, {}, 1).width, 480);
  for (const [width, height] of [[0, 10], [10, 0], [-2, 30], [NaN, 40], [10, Infinity]]) {
    assert.throws(() => getCropRect(width, height), RangeError);
  }
  for (const ratio of [0, -1, NaN, Infinity]) {
    assert.throws(() => getCropRect(100, 100, {}, ratio), RangeError);
  }
});
