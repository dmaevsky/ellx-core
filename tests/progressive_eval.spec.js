import test from 'ava';
import math from './math.mock.js';

import { progressiveAssembly, compile } from '../src/progressive_assembly.js';
import { range } from './tools.js';

const resolve = name => {
  if (name === 'math') return math;
  if (name === 'range') return range;
  return name.charCodeAt(0);
}

test('Identifier, Literal, BinaryExpression', t => {
  const root = progressiveAssembly('a + 42', resolve);

  // Not evaluated yet, so expect the binary + to be deferred
  t.is(compile(root, true),
    'this.nodes[0].transpile(this.external("a"),42)'
  );
  t.is(root.evaluator(), 97 + 42);

  // After evaluation the compiled body should be finalized
  t.is(compile(root, true), 'this.external("a") + 42');
  t.is(root.evaluator(), 97 + 42);
});

test('exponentiation operator', t => {
  const root = progressiveAssembly('2 ** 3 ** 2', resolve);
  t.is(root.evaluator(), 512);
});

test('string literals concatenation with binary +', t => {
  const root = progressiveAssembly('"a" + "b"', resolve);
  t.is(compile(root, true),
    'this.nodes[0].transpile("a","b")'
  );
  t.is(root.evaluator(), 'ab');
  t.is(compile(root, true), '"a" + "b"');
});

test('ArrowFunction', t => {
  const root = progressiveAssembly('a => (b = c) => a * x + b', resolve);

  t.is(root.type, 'ArrowFunction');
  t.deepEqual(root.deps, new Set(['c', 'x']));

  const outer = root.evaluator();
  t.is(outer.signature(), `a => this.nodes[${root.result.id}].evaluator({a})`);
  t.deepEqual(outer.closure, {});

  const inner = outer(5);
  t.is(inner.signature(), '(b = this.external("c")) => this.nodes[1].transpile(this.nodes[2].transpile(a,this.external("x")),b)');
  t.deepEqual(inner.closure, {a: 5});

  t.is(inner(), 5 * 120 + 99);
  // Signature is updated after the first execution
  t.is(inner.signature(), '(b = this.external("c")) => a * this.external("x") + b');
  // But the result stays the same
  t.is(inner(), 699);
});

test('ArrayLiteral, EmptyElement, SpreadElement, and rest parameter', t => {
  const root = progressiveAssembly('(a, ...z) => [...z, , a]', resolve);
  t.is(root.deps.size, 0);

  const f = root.evaluator();
  t.deepEqual(f(1,2,3), [2,3,,1]);
  t.is(f.signature(), '(a, ...z) => [...z, , a]');
});

test('ArrowFunction with destructuring', t => {
  const root = progressiveAssembly('([{y: {z1 = 5, ...z2} = {x:6}}, z3, ...z4]) => (z1 * z2.x) * z3 * z4.length', resolve);
  const f = root.evaluator();

  t.is(f([{},2,null,null]), 120);
});

test('CompoundExpression', t => {
  const args = [];
  global.__ellxSpy = a => args.push(a);

  const root = progressiveAssembly('(__ellxSpy(555), 42)', resolve);
  t.is(root.type, 'CompoundExpression');
  t.is(root.deps.size, 0);

  t.is(root.evaluator(), 42);
  t.is(compile(root, true), '(__ellxSpy(555), 42)');
  t.deepEqual(args, [555]);
});

test('ObjectLiteral', t => {
  const root = progressiveAssembly('{ foo: "bar", [x]: y }', resolve);
  t.is(root.type, 'ObjectLiteral');
  t.deepEqual(root.deps, new Set(['x', 'y']));
  t.deepEqual(root.evaluator(), { foo: 'bar', 120: 121 });
  t.is(compile(root, true), '{ foo: "bar", [this.external("x")]: this.external("y") }');
});

test('CallExpression', t => {
  const root = progressiveAssembly('((a, b, c) => a * x + b * c)(...[5, c], 2)', resolve);
  t.is(root.type, 'CallExpression');
  t.deepEqual(root.deps, new Set(['x', 'c']));

  t.is(root.evaluator(), 5 * 120 + 99 * 2);
  t.is(compile(root, true), `this.nodes[${root.callee.id}].evaluator({})(...[5, this.external("c")], 2)`);
});

test('MemberExpression', t => {
  const root = progressiveAssembly('({x}).x', resolve);
  t.is(root.type, 'MemberExpression');
  t.deepEqual(root.deps, new Set(['x']));
  t.is(root.evaluator(), 120);
  t.is(compile(root, true), '({x:this.external("x")}).x');

  const root2 = progressiveAssembly('(o => o.x * o["y"])({x,y})', resolve);
  t.is(root2.evaluator(), 120 * 121);
});

test('MemberExpression with a compiled property', t => {
  const root = progressiveAssembly('({xy})["x" + "y"]', resolve);
  t.is(root.evaluator(), 120);
  t.is(compile(root, true), '({xy:this.external("xy")})["x" + "y"]');
  t.is(root.evaluator(), 120);
});

test('using library functions', t => {
  const root = progressiveAssembly('range(1, 3).map(i => i + x)', resolve);
  t.deepEqual(root.deps, new Set(['range', 'x']));

  t.deepEqual(root.evaluator(), [121, 122]);
  t.is(compile(root, true), `this.external("range")(1, 3).map(this.nodes[${root.arguments[0].id}].evaluator({}))`);
  t.deepEqual(root.evaluator(), [121, 122]);
});

test('NewExpression', t => {
  const root = progressiveAssembly('new Array(3)', resolve);
  t.is(root.type, 'NewExpression');
  t.is(root.deps.size, 0);
  t.deepEqual(root.evaluator(), [,,,]);
  t.is(compile(root, true), 'new (Array)(3)');
});

test('UnaryExpression', t => {
  const root = progressiveAssembly('typeof +"42"', resolve);
  t.is(root.type, 'UnaryExpression');
  t.is(root.deps.size, 0);
  t.is(root.evaluator(), 'number');
  t.is(compile(root, true), 'typeof +"42"');
});

test('ConditionalExpression', t => {
  const root = progressiveAssembly('x => x > a ? x - a : a - x', resolve);
  t.is(root.result.type, 'ConditionalExpression');
  t.deepEqual(root.deps, new Set(['a']));

  const f = root.evaluator();
  t.is(f.signature(),
    'x => this.nodes[0].transpile(x,this.external("a")) ? this.nodes[1].transpile(x,this.external("a")) : this.nodes[2].transpile(this.external("a"),x)'
  );

  t.is(f(100), 100 - 97);
  t.is(f.signature(), `x => x > this.external("a") ? x - this.external("a") : this.nodes[2].transpile(this.external("a"),x)`);
  t.is(f(80), 97 - 80);
  t.is(f.signature(), 'x => x > this.external("a") ? x - this.external("a") : this.external("a") - x');
});

test('transpilation of UnaryExpression', t => {
  const root = progressiveAssembly('~math.complex(1,2)', resolve);
  t.is(root.type, 'UnaryExpression');
  t.is(root.deps.size, 1);
  t.deepEqual(root.evaluator(), math.complex(1, -2));
  t.is(compile(root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2))');
  t.deepEqual(root.evaluator(), math.complex(1, -2));
});

test('transpilation of BinaryExpression', t => {
  const root = progressiveAssembly('math.complex(1,2) * math.complex(1,-2)', resolve);
  t.is(root.type, 'BinaryExpression');
  t.is(root.deps.size, 1);
  t.deepEqual(root.evaluator(), math.complex(5, 0));
  t.is(compile(root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2),this.external("math").complex(1,-2))');
  t.deepEqual(root.evaluator(), math.complex(5, 0));
});

test('more awesome transpilation', t => {
  const root = progressiveAssembly('(x => x * ~x)(math.complex(2,3))', resolve);
  t.deepEqual(root.evaluator(), math.complex(13, 0));
});

test('Fibonacci numbers sequence generation', t => {
  const root = progressiveAssembly('range(0, 5).reduce(acc => acc.concat(acc[acc.length-1] + acc[acc.length-2]), [1,1])', resolve);
  t.deepEqual(root.evaluator(), [1, 1, 2, 3, 5, 8, 13]);
});

test('more cases of arrow functions depending on external nodes', t => {
  const root = progressiveAssembly('x => a + (a => a + x)(5)', resolve);
  const f = root.evaluator();
  t.is(f(42), 97 + 5 + 42);
});


test('MemFn expression', t => {
  const root = progressiveAssembly('[1, 2].reduce((a, b) => a + b)', resolve);
  t.is(root.deps.size, 0);
  t.is(root.evaluator(), 3);
  t.is(compile(root, true), '[1, 2].reduce(this.nodes[2].evaluator({}))');
  t.is(root.evaluator(), 3);
});

test('String interpolation', t => {
  const root = progressiveAssembly('`a + b is ${a + b}!`', resolve);
  t.deepEqual(root.deps, new Set(['a', 'b']));
  t.is(root.evaluator(), `a + b is ${97 + 98}!`);
});

test('arguments reserved word', t => {
  const root = progressiveAssembly('({ re, im = 0 } = math.complex(1, 1)) => arguments', resolve);
  t.deepEqual(root.deps, new Set(['math']));

  const fn = root.evaluator();

  t.deepEqual(fn(), { re: 1, im: 1 })
  t.deepEqual(fn({ re: 42 }), { re: 42, im: 0 })
});

test('initializers depending on previous args', t => {
  const root = progressiveAssembly('({a} = {a:42}, b = a * 2) => arguments', resolve)
  t.is(root.deps.size, 0);

  const fn = root.evaluator();
  t.deepEqual(fn(), { a: 42, b: 84 });
});

test('arguments with nested arrow functions', t => {
  const root = progressiveAssembly('a => b => arguments', resolve)
  t.is(root.deps.size, 0);

  const fn = root.evaluator();
  t.deepEqual(fn(5)(6), { b: 6 });
});
