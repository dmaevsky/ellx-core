import test from 'node:test';
import assert from 'node:assert/strict';

import { writable } from 'tinyx';
import { calcGraph, calcNode } from '../src/calc_node.js';
import { flatten } from '../src/transpile_subs.js';

function collector() {
  const results = [];

  const collect = [
    value => results.push(value),
    error => results.push(error.message),
    () => results.push('STALE')
  ];
  return [results, collect];
}

test('A simple subscribable', () => {
  const store = writable(42);

  const cg = calcGraph({
    s: 'store',
    plus5: 's + 5'
  }, name => ({ store }[name]));

  let plus5;
  const off = cg.plus5.subscribe(v => plus5 = v);

  assert.equal(plus5, 47);
  store.set(55);
  assert.equal(plus5, 60);
  off();
});

test('Flatten subscribables', () => {
  const [values, collect] = collector();

  const s1 = writable(1);
  const s2 = writable(2);

  const s = writable(s1);
  const off = flatten(s).subscribe(...collect);

  s1.set(10);
  s.set(s2);
  s2.set(20);

  assert.deepEqual(values, [1, 10, 2, 20]);

  off();
});

test('Transpile subscribables', async () => {
  const [values, collect] = collector();
  const s = writable(5);

  const sq = calcNode('s * s', name => ({ s }[name]));

  const off = sq.subscribe(...collect);

  s.set(6);

  const p = Promise.resolve(7);
  s.set(p);
  await p;

  assert.deepEqual(values, [25, 36, 'STALE', 49]);
  off();
});

test('Transpile flows resolving to subscribables', async () => {
  const [values, collect] = collector();
  const s = writable(5);
  const p = Promise.resolve(7);

  function* f() {
    yield p;
    return s;
  }

  const sq = calcNode('s * s', name => name === 's' && f());

  const off = sq.subscribe(...collect);
  await p;

  s.set(6);
  s.set(p);

  assert.deepEqual(values, ['STALE', 25, 36, 49]);
  off();
});

test('Transpile subscribables resolving to flows resolving to subscribables', async () => {
  const [values, collect] = collector();
  const s = [writable(5), writable(6)];
  const p = Promise.resolve(7);

  const f = writable(function* (idx) {
    yield p;
    return s[idx];
  });

  const sq = calcNode('f(0) * f(1)', name => name === 'f' && f);

  const off = sq.subscribe(...collect);
  await p;

  s[0].update(v => v + 1);
  s[1].update(v => v + 1);

  assert.deepEqual(values, ['STALE', 30, 36, 42]);
  off();
});
