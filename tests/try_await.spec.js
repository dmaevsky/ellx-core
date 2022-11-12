import test from 'node:test';
import assert from 'node:assert/strict';

import { calcNode, calcGraph } from '../src/calc_node.js';

test('throw/try', () => {
  const aw = calcNode('try(throw("boom"), e => e.toUpperCase())', () => null);

  let result;
  aw.subscribe(r => result = r);

  assert.equal(result, 'BOOM');
});

test('await promise', async () => {
  const p = Promise.resolve(42);

  const aw = calcNode('await(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  assert.deepEqual(results, [55]);
  await p;
  assert.deepEqual(results, [55, 42]);
});

test('try promise', async () => {
  const p = Promise.resolve(42);

  const aw = calcNode('try(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  assert.deepEqual(results, ['STALE']);
  await p;
  assert.deepEqual(results, ['STALE', 42]);
});

test('try does not catch stales', async () => {
  const p = Promise.resolve(42);

  const cg = calcGraph({
    promise: 'p',
    aw: 'try(promise, () => 55)'
  }, () => p);

  const results = [];
  cg.aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  assert.deepEqual(results, ['STALE']);
  await p;
  assert.deepEqual(results, ['STALE', 42]);
});

test('await catches stales', async () => {
  const p = Promise.resolve(42);

  const cg = calcGraph({
    promise: 'p',
    aw: 'await(promise, () => 55)'
  }, () => p);

  const results = [];
  cg.aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  assert.deepEqual(results, [55]);
  await p;
  assert.deepEqual(results, [55, 42]);
});

test('try catches rejected flows', async () => {
  const p = Promise.reject('BOOM');

  const aw = calcNode('try(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  assert.deepEqual(results, ['STALE']);
  await p.catch(() => null);
  assert.deepEqual(results, ['STALE', 55]);
});

test('await does not catch rejected flows', async () => {
  const p = Promise.reject('BOOM');

  const aw = calcNode('await(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  assert.deepEqual(results, [55]);
  await p.catch(() => null);
  assert.deepEqual(results, [55, 'ERROR:BOOM']);
});
