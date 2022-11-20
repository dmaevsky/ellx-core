import test from 'node:test';
import assert from 'node:assert/strict';

import { writable } from 'tinyx';
import { calcNode } from '../src/calc_node.js';

test('SpreadElement is transpiled in ArrayLiteral but not other elements', async () => {
  const p12 = Promise.resolve([1, 2]);
  const p3 = Promise.resolve(3);
  const p45 = Promise.resolve([4, 5]);

  const { subscribe } = calcNode('[...p12, p3, ...p45]', name => ({ p12, p3, p45 })[name]);
  const results = [];

  const off = subscribe(value => results.push(value), error => results.push(error), () => results.push('STALE'));

  assert.equal(results[0], 'STALE');
  await p12;
  assert.deepEqual(results[1], [1, 2, p3, 4, 5]);

  off();
});

test('SpreadElement is transpiled in ObjectLiteral but not other properties', () => {
  const w = writable({ foo: 5 });

  const { subscribe } = calcNode('{ w, ...w }', () => w);
  const results = [];

  const off = subscribe(value => results.push(value), error => results.push(error));

  assert.deepEqual(results[0], { w, foo: 5 });
  w.set({ bar: 6 });
  assert.deepEqual(results[1], { w, bar: 6 });

  off();
});

test('check (a + b) * (a + c) where a is an iterator', { todo: 1 }, () => {

});
