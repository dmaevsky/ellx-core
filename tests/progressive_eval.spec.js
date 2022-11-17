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

const build = formula => progressiveAssembly(formula, resolve);

test('Identifier, Literal, BinaryExpression', () => {
  const root = build('a + 42');

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
  const root = build('2 ** 3 ** 2');
  assert.equal(root.evaluator(), 512);
});

test('string literals concatenation with binary +', () => {
  const root = build('"a" + "b"');
  assert.equal(compile(root, true),
    'this.nodes[0].transpile("a","b")'
  );
  assert.equal(root.evaluator(), 'ab');
  assert.equal(compile(root, true), '"a" + "b"');
});

test('ArrowFunction', () => {
  const root = build('a => (b = c) => a * x + b');

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
  const root = build('(a, ...z) => [...z, , a]');
  assert.equal(root.deps.size, 0);

  const f = root.evaluator();
  assert.deepEqual(f(1,2,3), [2,3,,1]);
  assert.equal(f.signature(), '(a, ...z) => [...z, , a]');
});

test('ArrowFunction with destructuring', () => {
  const root = build('([{y: {z1 = 5, ...z2} = {x:6}}, z3, ...z4]) => (z1 * z2.x) * z3 * z4.length');
  const f = root.evaluator();

  assert.equal(f([{},2,null,null]), 120);
});

test('CompoundExpression', () => {
  const args = [];
  global.__ellxSpy = a => args.push(a);

  const root = build('(__ellxSpy(555), 42)');
  assert.equal(root.type, 'CompoundExpression');
  assert.equal(root.deps.size, 0);

  assert.equal(root.evaluator(), 42);
  assert.equal(compile(root, true), '(__ellxSpy(555), 42)');
  assert.deepEqual(args, [555]);
});

test('ObjectLiteral', () => {
  const root = build('{ foo: "bar", [x]: y }');
  assert.equal(root.type, 'ObjectLiteral');
  assert.deepEqual(root.deps, new Set(['x', 'y']));
  assert.deepEqual(root.evaluator(), { foo: 'bar', 120: 121 });
  assert.equal(compile(root, true), '{ foo: "bar", [this.external("x")]: this.external("y") }');
});

test('CallExpression', () => {
  const root = build('((a, b, c) => a * x + b * c)(...[5, c], 2)');
  assert.equal(root.type, 'CallExpression');
  assert.deepEqual(root.deps, new Set(['x', 'c']));

  assert.equal(root.evaluator(), 5 * 120 + 99 * 2);
  assert.equal(compile(root, true), `this.nodes[1].evaluator({})(...[5, this.external("c")], 2)`);
});

test('MemberExpression', () => {
  const root = build('({x}).x');
  assert.equal(root.type, 'MemberExpression');
  assert.deepEqual(root.deps, new Set(['x']));
  assert.equal(root.evaluator(), 120);
  assert.equal(compile(root, true), '({x:this.external("x")}).x');

  const root2 = build('(o => o.x * o["y"])({x,y})');
  assert.equal(root2.evaluator(), 120 * 121);
});

test('MemberExpression with a compiled property', () => {
  const root = build('({xy})["x" + "y"]');
  assert.equal(root.evaluator(), 120);
  assert.equal(compile(root, true), '({xy:this.external("xy")})["x" + "y"]');
  assert.equal(root.evaluator(), 120);
});

test('using library functions', () => {
  const root = build('range(1, 3).map(i => i + x)');
  assert.deepEqual(root.deps, new Set(['range', 'x']));

  assert.deepEqual(root.evaluator(), [121, 122]);
  assert.equal(compile(root, true), `this.external("range")(1, 3).map(this.nodes[3].evaluator({}))`);
  assert.deepEqual(root.evaluator(), [121, 122]);
});

test('NewExpression', () => {
  const root = build('new Array(3)');
  assert.equal(root.type, 'NewExpression');
  assert.equal(root.deps.size, 0);
  assert.deepEqual(root.evaluator(), [,,,]);
  assert.equal(compile(root, true), 'new (Array)(3)');
});

test('UnaryExpression', () => {
  const root = build('typeof +"42"');
  assert.equal(root.type, 'UnaryExpression');
  assert.equal(root.deps.size, 0);
  assert.equal(root.evaluator(), 'number');
  assert.equal(compile(root, true), 'typeof +"42"');
});

test('ConditionalExpression', () => {
  const root = build('x => x > a ? x - a : a - x');
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
  const root = build('~math.complex(1,2)');
  assert.equal(root.type, 'UnaryExpression');
  assert.equal(root.deps.size, 1);
  assert.deepEqual(root.evaluator(), math.complex(1, -2));
  assert.equal(compile(root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2))');
  assert.deepEqual(root.evaluator(), math.complex(1, -2));
});

test('transpilation of BinaryExpression', () => {
  const root = build('math.complex(1,2) * math.complex(1,-2)');
  assert.equal(root.type, 'BinaryExpression');
  assert.equal(root.deps.size, 1);
  assert.deepEqual(root.evaluator(), math.complex(5, 0));
  assert.equal(compile(root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2),this.external("math").complex(1,-2))');
  assert.deepEqual(root.evaluator(), math.complex(5, 0));
});

test('more awesome transpilation', () => {
  const root = build('(x => x * ~x)(math.complex(2,3))');
  assert.deepEqual(root.evaluator(), math.complex(13, 0));
});

test('Fibonacci numbers sequence generation', () => {
  const root = build('range(0, 5).reduce(acc => acc.concat(acc[acc.length-1] + acc[acc.length-2]), [1,1])');
  assert.deepEqual(root.evaluator(), [1, 1, 2, 3, 5, 8, 13]);
});

test('more cases of arrow functions depending on external nodes', () => {
  const root = build('x => a + (a => a + x)(5)');
  const f = root.evaluator();
  assert.equal(f(42), 97 + 5 + 42);
});


test('MemFn expression', () => {
  const root = build('[1, 2].reduce((a, b) => a + b)');
  assert.equal(root.deps.size, 0);
  assert.equal(root.evaluator(), 3);
  assert.equal(compile(root, true), '[1, 2].reduce(this.nodes[2].evaluator({}))');
  assert.equal(root.evaluator(), 3);
});

test('String interpolation', () => {
  const root = build('`a + b is ${a + b}!`');
  assert.deepEqual(root.deps, new Set(['a', 'b']));
  assert.equal(root.evaluator(), `a + b is ${97 + 98}!`);
});

test('arguments reserved word', () => {
  const root = build('({ re, im = 0 } = math.complex(1, 1)) => arguments');
  assert.deepEqual(root.deps, new Set(['math']));

  const fn = root.evaluator();

  assert.deepEqual(fn(), { re: 1, im: 1 })
  assert.deepEqual(fn({ re: 42 }), { re: 42, im: 0 })
});

test('initializers depending on previous args', () => {
  const root = build('({a} = {a:42}, b = a * 2) => arguments', resolve)
  assert.equal(root.deps.size, 0);

  const fn = root.evaluator();
  assert.deepEqual(fn(), { a: 42, b: 84 });
});

test('arguments with nested arrow functions', () => {
  const root = build('a => b => arguments', resolve)
  assert.equal(root.deps.size, 0);

  const fn = root.evaluator();
  assert.deepEqual(fn(5)(6), { b: 6 });
});
