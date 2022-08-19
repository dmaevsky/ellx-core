import test from 'ava';
import { writable } from 'tinyx';
import calcGraph from '../src/index.js';

const store = writable(42);

test('A simple subscribable', t => {
  const cg = calcGraph({
    s: 'store',
    plus5: 's + 5'
  }, { store });

  let plus5;
  const off = cg.plus5.subscribe(v => plus5 = v);

  t.is(plus5, 47);
  store.set(55);
  t.is(plus5, 60);
  off();
});
