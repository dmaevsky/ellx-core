import test from 'ava';
import { calcNode, calcGraph } from '../src/calc_node.js';

test('throw/try', t => {
  const aw = calcNode('try(throw("boom"), e => e.toUpperCase())', () => null);

  let result;
  aw.subscribe(r => result = r);

  t.is(result, 'BOOM');
});

test('await promise', async t => {
  const p = Promise.resolve(42);

  const aw = calcNode('await(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  t.deepEqual(results, [55]);
  await p;
  t.deepEqual(results, [55, 42]);
});

test('try promise', async t => {
  const p = Promise.resolve(42);

  const aw = calcNode('try(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  t.deepEqual(results, ['STALE']);
  await p;
  t.deepEqual(results, ['STALE', 42]);
});

test('try does not catch stales', async t => {
  const p = Promise.resolve(42);

  const cg = calcGraph({
    promise: 'p',
    aw: 'try(promise, () => 55)'
  }, () => p);

  const results = [];
  cg.aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  t.deepEqual(results, ['STALE']);
  await p;
  t.deepEqual(results, ['STALE', 42]);
});

test('await catches stales', async t => {
  const p = Promise.resolve(42);

  const cg = calcGraph({
    promise: 'p',
    aw: 'await(promise, () => 55)'
  }, () => p);

  const results = [];
  cg.aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  t.deepEqual(results, [55]);
  await p;
  t.deepEqual(results, [55, 42]);
});

test('try catches rejected flows', async t => {
  const p = Promise.reject('BOOM');

  const aw = calcNode('try(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  t.deepEqual(results, ['STALE']);
  await p.catch(() => null);
  t.deepEqual(results, ['STALE', 55]);
});

test('await does not catch rejected flows', async t => {
  const p = Promise.reject('BOOM');

  const aw = calcNode('await(p, () => 55)', () => p);

  const results = [];
  aw.subscribe(r => results.push(r), e => results.push('ERROR:' + e), () => results.push('STALE'));

  t.deepEqual(results, [55]);
  await p.catch(() => null);
  t.deepEqual(results, [55, 'ERROR:BOOM']);
});
