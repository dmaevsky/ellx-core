import test from 'ava';
import calcGraph from '../src/index.js';

let off = () => {};
test.afterEach(off);

test('basic graph operations', t => {
  const cg = calcGraph({
    a: '5',
    b: 'a + 6'
  });

  let b;
  off = cg.b.subscribe(value => b = value);

  t.is(b, 11);

  cg.a.update('b');

  t.true(b instanceof Error);
  t.is(b.message, '[Quarx]: Circular dependency detected: [a]:currentValue -> [b]:currentValue:cell -> [b]:currentValue -> [a]:currentValue:cell -> [a]:currentValue');

  cg.a.update('42');
  t.is(b, 48);

  t.throws(() => cg.a.update('function'), { instanceOf: Error, message: 'Cannot refer to a reserved word function as a dependency' });
});

test('evaluation error for a node should be cleared after setting the right value for a dependency', t => {
  const cg = calcGraph({
    r: '{}',
    qq: 'r.map(i=>i+1)'
  });

  let qq;
  off = cg.qq.subscribe(value => qq = value);

  t.true(qq instanceof Error);
  t.is(qq.message, 'r.map is not a function');

  cg.r.update('[0,1]');

  t.deepEqual(qq, [1,2]);
});

test('external constructors', t => {
  const cg = calcGraph({
    d: "'2021-02-17'",
    date: 'new TestDate(d)'
  }, { TestDate: Date });

  let date;
  off = cg.date.subscribe(value => date = value);

  t.is(date.getDay(), 3);

  cg.d.update("'2021-02-18'");

  t.is(date.getDay(), 4);
});

test.todo('return the same iterator in different parts of an object structure');
