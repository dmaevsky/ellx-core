import test from 'node:test';
import assert from 'node:assert/strict';

import { progressiveAssembly, compile } from '../src/progressive_assembly.js';
import { range } from './tools.js';

import math from './math.mock.js';

const resolve = name => {
  if (name === 'math') return math;
  if (name === 'range') return range;
  return name.charCodeAt(0);
}

test('Identifier, Literal, BinaryExpression', () => {
  const root = progressiveAssembly('a + 42', resolve);

  // Not evaluated yet, so expect the binary + to be deferred
  assert.equal(compile(root, true),
    'this.nodes[0].transpile(this.external("a"),42)'
  );
  assert.equal(root.evaluator(), 97 + 42);

  // After evaluation the compiled body should be finalized
  assert.equal(compile(root, true), 'this.external("a") + 42');
  assert.equal(root.evaluator(), 97 + 42);
});

test('exponentiation operator', () => {
  const root = progressiveAssembly('2 ** 3 ** 2', resolve);
  assert.equal(root.evaluator(), 512);
});

test('string literals concatenation with binary +', () => {
  const root = progressiveAssembly('"a" + "b"', resolve);
  assert.equal(compile(root, true),
    'this.nodes[0].transpile("a","b")'
  );
  assert.equal(root.evaluator(), 'ab');
  assert.equal(compile(root, true), '"a" + "b"');
});

test('ArrowFunction', () => {
  const root = progressiveAssembly('a => (b = c) => a * x + b', resolve);

  assert.equal(root.type, 'ArrowFunction');
  assert.deepEqual(root.deps, new Set(['c', 'x']));

  const outer = root.evaluator();
  assert.equal(outer.signature(), `a => this.nodes[0].evaluator({a})`);
  assert.deepEqual(outer.closure, {});

  const inner = outer(5);
  assert.equal(inner.signature(), '(b = this.external("c")) => this.nodes[1].transpile(this.nodes[2].transpile(a,this.external("x")),b)');
  assert.deepEqual(inner.closure, {a: 5});

  assert.equal(inner(), 5 * 120 + 99);
  // Signature is updated after the first execution
  assert.equal(inner.signature(), '(b = this.external("c")) => a * this.external("x") + b');
  // But the result stays the same
  assert.equal(inner(), 699);
});

test('ArrayLiteral, EmptyElement, SpreadElement, and rest parameter', () => {
  const root = progressiveAssembly('(a, ...z) => [...z, , a]', resolve);
  assert.equal(root.deps.size, 0);

  const f = root.evaluator();
  assert.deepEqual(f(1,2,3), [2,3,,1]);
  assert.equal(f.signature(), '(a, ...z) => [...z, , a]');
});

test('ArrowFunction with destructuring', () => {
  const root = progressiveAssembly('([{y: {z1 = 5, ...z2} = {x:6}}, z3, ...z4]) => (z1 * z2.x) * z3 * z4.length', resolve);
  const f = root.evaluator();

  assert.equal(f([{},2,null,null]), 120);
});

test('CompoundExpression', () => {
  const args = [];
  global.__ellxSpy = a => args.push(a);

  const root = progressiveAssembly('(__ellxSpy(555), 42)', resolve);
  assert.equal(root.type, 'CompoundExpression');
  assert.equal(root.deps.size, 0);

  assert.equal(root.evaluator(), 42);
  assert.equal(compile(root, true), '(__ellxSpy(555), 42)');
  assert.deepEqual(args, [555]);
});

test('ObjectLiteral', () => {
  const root = progressiveAssembly('{ foo: "bar", [x]: y }', resolve);
  assert.equal(root.type, 'ObjectLiteral');
  assert.deepEqual(root.deps, new Set(['x', 'y']));
  assert.deepEqual(root.evaluator(), { foo: 'bar', 120: 121 });
  assert.equal(compile(root, true), '{ foo: "bar", [this.external("x")]: this.external("y") }');
});

test('CallExpression', () => {
  const root = progressiveAssembly('((a, b, c) => a * x + b * c)(...[5, c], 2)', resolve);
  assert.equal(root.type, 'CallExpression');
  assert.deepEqual(root.deps, new Set(['x', 'c']));

  assert.equal(root.evaluator(), 5 * 120 + 99 * 2);
  assert.equal(compile(root, true), `this.nodes[1].evaluator({})(...[5, this.external("c")], 2)`);
});

test('MemberExpression', () => {
  const root = progressiveAssembly('({x}).x', resolve);
  assert.equal(root.type, 'MemberExpression');
  assert.deepEqual(root.deps, new Set(['x']));
  assert.equal(root.evaluator(), 120);
  assert.equal(compile(root, true), '({x:this.external("x")}).x');

  const root2 = progressiveAssembly('(o => o.x * o["y"])({x,y})', resolve);
  assert.equal(root2.evaluator(), 120 * 121);
});

test('MemberExpression with a compiled property', () => {
  const root = progressiveAssembly('({xy})["x" + "y"]', resolve);
  assert.equal(root.evaluator(), 120);
  assert.equal(compile(root, true), '({xy:this.external("xy")})["x" + "y"]');
  assert.equal(root.evaluator(), 120);
});

test('using library functions', () => {
  const root = progressiveAssembly('range(1, 3).map(i => i + x)', resolve);
  assert.deepEqual(root.deps, new Set(['range', 'x']));

  assert.deepEqual(root.evaluator(), [121, 122]);
  assert.equal(compile(root, true), `this.external("range")(1, 3).map(this.nodes[3].evaluator({}))`);
  assert.deepEqual(root.evaluator(), [121, 122]);
});

test('NewExpression', () => {
  const root = progressiveAssembly('new Array(3)', resolve);
  assert.equal(root.type, 'NewExpression');
  assert.equal(root.deps.size, 0);
  assert.deepEqual(root.evaluator(), [,,,]);
  assert.equal(compile(root, true), 'new (Array)(3)');
});

test('UnaryExpression', () => {
  const root = progressiveAssembly('typeof +"42"', resolve);
  assert.equal(root.type, 'UnaryExpression');
  assert.equal(root.deps.size, 0);
  assert.equal(root.evaluator(), 'number');
  assert.equal(compile(root, true), 'typeof +"42"');
});

test('ConditionalExpression', () => {
  const root = progressiveAssembly('x => x > a ? x - a : a - x', resolve);
  assert.equal(root.children[0].type, 'ConditionalExpression');
  assert.deepEqual(root.deps, new Set(['a']));

  const f = root.evaluator();
  assert.equal(f.signature(),
    'x => this.nodes[0].transpile(x,this.external("a")) ? this.nodes[1].transpile(x,this.external("a")) : this.nodes[2].transpile(this.external("a"),x)'
  );

  assert.equal(f(100), 100 - 97);
  assert.equal(f.signature(), `x => x > this.external("a") ? x - this.external("a") : this.nodes[2].transpile(this.external("a"),x)`);
  assert.equal(f(80), 97 - 80);
  assert.equal(f.signature(), 'x => x > this.external("a") ? x - this.external("a") : this.external("a") - x');
});

test('transpilation of UnaryExpression', () => {
  const root = progressiveAssembly('~math.complex(1,2)', resolve);
  assert.equal(root.type, 'UnaryExpression');
  assert.equal(root.deps.size, 1);
  assert.deepEqual(root.evaluator(), math.complex(1, -2));
  assert.equal(compile(root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2))');
  assert.deepEqual(root.evaluator(), math.complex(1, -2));
});

test('transpilation of BinaryExpression', () => {
  const root = progressiveAssembly('math.complex(1,2) * math.complex(1,-2)', resolve);
  assert.equal(root.type, 'BinaryExpression');
  assert.equal(root.deps.size, 1);
  assert.deepEqual(root.evaluator(), math.complex(5, 0));
  assert.equal(compile(root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2),this.external("math").complex(1,-2))');
  assert.deepEqual(root.evaluator(), math.complex(5, 0));
});

test('more awesome transpilation', () => {
  const root = progressiveAssembly('(x => x * ~x)(math.complex(2,3))', resolve);
  assert.deepEqual(root.evaluator(), math.complex(13, 0));
});

test('Fibonacci numbers sequence generation', () => {
  const root = progressiveAssembly('range(0, 5).reduce(acc => acc.concat(acc[acc.length-1] + acc[acc.length-2]), [1,1])', resolve);
  assert.deepEqual(root.evaluator(), [1, 1, 2, 3, 5, 8, 13]);
});

test('more cases of arrow functions depending on external nodes', () => {
  const root = progressiveAssembly('x => a + (a => a + x)(5)', resolve);
  const f = root.evaluator();
  assert.equal(f(42), 97 + 5 + 42);
});


test('MemFn expression', () => {
  const root = progressiveAssembly('[1, 2].reduce((a, b) => a + b)', resolve);
  assert.equal(root.deps.size, 0);
  assert.equal(root.evaluator(), 3);
  assert.equal(compile(root, true), '[1, 2].reduce(this.nodes[2].evaluator({}))');
  assert.equal(root.evaluator(), 3);
});

test('String interpolation', () => {
  const root = progressiveAssembly('`a + b is ${a + b}!`', resolve);
  assert.deepEqual(root.deps, new Set(['a', 'b']));
  assert.equal(root.evaluator(), `a + b is ${97 + 98}!`);
});

test('arguments reserved word', () => {
  const root = progressiveAssembly('({ re, im = 0 } = math.complex(1, 1)) => arguments', resolve);
  assert.deepEqual(root.deps, new Set(['math']));

  const fn = root.evaluator();

  assert.deepEqual(fn(), { re: 1, im: 1 })
  assert.deepEqual(fn({ re: 42 }), { re: 42, im: 0 })
});

test('initializers depending on previous args', () => {
  const root = progressiveAssembly('({a} = {a:42}, b = a * 2) => arguments', resolve)
  assert.equal(root.deps.size, 0);

  const fn = root.evaluator();
  assert.deepEqual(fn(), { a: 42, b: 84 });
});

test('arguments with nested arrow functions', () => {
  const root = progressiveAssembly('a => b => arguments', resolve)
  assert.equal(root.deps.size, 0);

  const fn = root.evaluator();
  assert.deepEqual(fn(5)(6), { b: 6 });
});
