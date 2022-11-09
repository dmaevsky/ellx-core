import test from 'ava';
import { calcMap } from '../src/calc_map.js';

let off = () => {};
test.afterEach(off);

test('basic graph operations', t => {
  const cg = calcMap({
    a: '5',
    b: 'a + 6'
  });

  const results = [], errors = [];

  off = cg.subscribe('b', value => results.push(value), error => errors.push(error));

  t.is(results[0], 11);

  cg.set('a', 'b');

  t.true(errors[0] instanceof Error);
  t.is(errors[0].message, '[Quarx ERROR]:cycle detected:(eval b):(eval a):(eval b)');

  cg.set('a', '42');
  t.is(results[1], 48);

  t.throws(() => cg.set('a', 'function'), { instanceOf: Error, message: 'Cannot refer to a reserved word function as a dependency' });
});

test('evaluation error for a node should be cleared after setting the right value for a dependency', t => {
  const cg = calcMap({
    r: '{}',
    qq: 'r.map(i=>i+1)'
  });

  let qq, err;
  off = cg.subscribe('qq', value => qq = value, e => err = e);

  t.true(err instanceof Error);
  t.is(err.message, 'r.map is not a function');

  cg.set('r', '[0,1]');

  t.deepEqual(qq, [1,2]);
});

test('external constructors', t => {
  const cg = calcMap({
    d: "'2021-02-17'",
    date: 'new TestDate(d)'
  }, name => ({ TestDate: Date }[name]));

  let date;
  off = cg.subscribe('date', value => date = value);

  t.is(date.getDay(), 3);

  cg.set('d', "'2021-02-18'");

  t.is(date.getDay(), 4);
});

test.todo('return the same iterator in different parts of an object structure');
