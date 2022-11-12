import test from 'node:test';
import assert from 'node:assert/strict';

import math from './math.mock.js';

import { unaryOp, binaryOp } from '../src/transpile.js';
import { range } from './tools.js';

test('default object / vector operator overloads', () => {
  let o1 = {a: 10, b: 20}, o2 = {a: 15, b: 15, c: 999};

  assert.deepEqual(unaryOp('-')(o1), {a: -10, b: -20});
  assert.deepEqual(binaryOp('-')(o1, o2), {a: -5, b: 5});
  assert.deepEqual(binaryOp('<')(o1, o2), {a: true, b: false});
  assert.deepEqual(binaryOp('&')(range(0, 6), 3), [0, 1, 2, 3, 0, 1]);
});

test('explicit operator overloads', () => {
  let z = math.complex(2, 3);
  let z1 = unaryOp('~')(z);
  let product = binaryOp('*')(z, z1);
  assert.equal(product.re, 13);
  assert.equal(product.im, 0);
});
