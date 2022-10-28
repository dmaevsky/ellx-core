import test from 'ava';
import { autorun } from 'quarx';
import { box } from 'quarx/box';
import { isPromise } from 'conclure';

import { reactiveCell } from '../src/reactive_cell.js';

const evaluator = box();

const cell = reactiveCell(() => {
  const evaluate = evaluator.get();
  return evaluate && evaluate();
});

test('reactiveCell', async t => {
  const results = [];
  const promise = Promise.resolve(42);
  evaluator.set(() => promise);

  const gate = box(false);

  const off = autorun(() => {
    if (!gate.get()) return;

    results.push(cell.get());
  });

  t.true(isPromise(cell.get()));  // stale and unobserved
  t.is(results.length, 0);

  gate.set(true);

  t.deepEqual(results, [promise]);

  await promise;
  t.deepEqual(results, [promise, 42]);

  off();
});
