import test from 'node:test';
import assert from 'node:assert/strict';

import { calcMap } from '../src/calc_map.js';

let off = () => {};
test.afterEach(off);

test('basic graph operations', () => {
  const cg = calcMap({
    a: '5',
    b: 'a + 6'
  });

  const results = [], errors = [];

  off = cg.subscribe('b', value => results.push(value), error => errors.push(error));

  assert.equal(results[0], 11);

  cg.set('a', 'b');

  assert(errors[0] instanceof Error);
  assert.equal(errors[0].message, '[Quarx ERROR]:cycle detected:(eval b):(eval a):(eval b)');

  cg.set('a', '42');
  assert.equal(results[1], 48);

  assert.throws(() => cg.set('a', 'function'), new Error('Cannot refer to a reserved word function as a dependency'));
});

test('evaluation error for a node should be cleared after setting the right value for a dependency', () => {
  const cg = calcMap({
    r: '{}',
    qq: 'r.map(i=>i+1)'
  });

  let qq, err;
  off = cg.subscribe('qq', value => qq = value, e => err = e);

  assert(err instanceof Error);
  assert.equal(err.message, 'r.map is not a function');

  cg.set('r', '[0,1]');

  assert.deepEqual(qq, [1,2]);
});

test('external constructors', () => {
  const cg = calcMap({
    d: "'2021-02-17'",
    date: 'new TestDate(d)'
  }, name => ({ TestDate: Date }[name]));

  let date;
  off = cg.subscribe('date', value => date = value);

  assert.equal(date.getDay(), 3);

  cg.set('d', "'2021-02-18'");

  assert.equal(date.getDay(), 4);
});

test('return the same iterator in different parts of an object structure', { todo: 1 }, () => {

});
