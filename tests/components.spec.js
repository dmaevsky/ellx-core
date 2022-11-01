import test from 'ava';
import { isFlow } from 'conclure';
import { writable } from 'tinyx';
import { calcGraph } from '../src/index.js';
import { flatten } from '../src/pull.js';

test('A simple subscribable', t => {
  const store = writable(42);

  const cg = calcGraph({
    s: 'store',
    plus5: 's + 5'
  }, name => ({ store }[name]));

  let plus5;
  const off = cg.plus5.subscribe(v => plus5 = v);

  t.is(plus5, 47);
  store.set(55);
  t.is(plus5, 60);
  off();
});

test('Flatten subscribables', t => {
  const values = [];

  const s1 = writable(1);
  const s2 = writable(2);

  const s = writable(s1);
  const off = flatten(s).subscribe(value => values.push(value));

  s1.set(10);
  s.set(s2);
  s2.set(20);

  t.deepEqual(values, [1, 10, 2, 20]);

  off();
});

test('Transpile subscribables', async t => {
  const values = [];
  const s = writable(5);

  const cg = calcGraph({
    sq: 's * s'
  }, name => ({ s }[name]));

  const off = cg.sq.subscribe(value => values.push(value));

  s.set(6);

  const p = Promise.resolve(7);
  s.set(p);
  await p;

  t.deepEqual(values.map(v => isFlow(v) ? 'STALE' : v), [25, 36, 'STALE', 49]);
  off();
});

test('Transpile flows resolving to subscribables', async t => {
  const values = [];
  const s = writable(5);
  const p = Promise.resolve(7);

  function* f() {
    yield p;
    return s;
  }

  const cg = calcGraph({
    sq: 's * s'
  }, name => name === 's' && f());

  const off = cg.sq.subscribe(value => values.push(value));
  await p;

  s.set(6);
  s.set(p);

  t.deepEqual(values.map(v => isFlow(v) ? 'STALE' : v), ['STALE', 25, 36, 49]);
  off();
});

test('Transpile subscribables resolving to flows resolving to subscribables', async t => {
  const values = [];
  const s = [writable(5), writable(6)];
  const p = Promise.resolve(7);

  const f = writable(function* (idx) {
    yield p;
    return s[idx];
  });

  const cg = calcGraph({
    sq: 'f(0) * f(1)'
  }, name => name === 'f' && f);

  const off = cg.sq.subscribe(value => values.push(value));
  await p;

  s[0].update(v => v + 1);
  s[1].update(v => v + 1);

  t.deepEqual(values.map(v => isFlow(v) ? 'STALE' : v), ['STALE', 30, 36, 42]);
  off();
});
