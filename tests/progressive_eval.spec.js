import test from 'ava';
import math from './math.mock.js';

import ProgressiveEval, { compile } from '../src/progressive_assembly.js';
import { range } from './tools.js';

const resolve = name => {
  if (name === 'math') return math;
  if (name === 'range') return range;
  return name.charCodeAt(0);
}

const parser = new ProgressiveEval(resolve);

test('Identifier, Literal, BinaryExpression', t => {
  const evaluator = parser.parse('a + 42');

  // Not evaluated yet, so expect the binary + to be deferred
  t.is(compile(parser.root, true),
    'this.nodes[0].transpile(this.external("a"),42)'
  );
  t.is(evaluator(), 97 + 42);

  // After evaluation the compiled body should be finalized
  t.is(compile(parser.root, true), 'this.external("a") + 42');
  t.is(evaluator(), 97 + 42);
});

test('exponentiation operator', t => {
  const evaluator = parser.parse('2 ** 3 ** 2');
  t.is(evaluator(), 512);
});

test('string literals concatenation with binary +', t => {
  const evaluator = parser.parse('"a" + "b"');
  t.is(compile(parser.root, true),
    'this.nodes[0].transpile("a","b")'
  );
  t.is(evaluator(), 'ab');
  t.is(compile(parser.root, true), '"a" + "b"');
});

test('ArrowFunction', t => {
  const evaluator = parser.parse('a => (b = c) => a * x + b');

  t.is(parser.root.type, 'ArrowFunction');
  t.deepEqual(parser.dependencies(), new Set(['c', 'x']));

  const outer = evaluator();
  t.is(outer.signature(), `a => this.nodes[${parser.root.result.id}].evaluator({a})`);
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
  const evaluator = parser.parse('(a, ...z) => [...z, , a]');
  t.is(parser.dependencies().size, 0);

  const f = evaluator();
  t.deepEqual(f(1,2,3), [2,3,,1]);
  t.is(f.signature(), '(a, ...z) => [...z, , a]');
});

test('ArrowFunction with destructuring', t => {
  const evaluator = parser.parse('([{y: {z1 = 5, ...z2} = {x:6}}, z3, ...z4]) => (z1 * z2.x) * z3 * z4.length');
  const f = evaluator();

  t.is(f([{},2,null,null]), 120);
});

test('CompoundExpression', t => {
  const args = [];
  global.__ellxSpy = a => args.push(a);

  const evaluator = parser.parse('(__ellxSpy(555), 42)');
  t.is(parser.root.type, 'CompoundExpression');
  t.is(parser.dependencies().size, 0);

  t.is(evaluator(), 42);
  t.is(compile(parser.root, true), '(__ellxSpy(555), 42)');
  t.deepEqual(args, [555]);
});

test('ObjectLiteral', t => {
  const evaluator = parser.parse('{ foo: "bar", [x]: y }');
  t.is(parser.root.type, 'ObjectLiteral');
  t.deepEqual(parser.dependencies(), new Set(['x', 'y']));
  t.deepEqual(evaluator(), { foo: 'bar', 120: 121 });
  t.is(compile(parser.root, true), '{ foo: "bar", [this.external("x")]: this.external("y") }');
});

test('CallExpression', t => {
  const evaluator = parser.parse('((a, b, c) => a * x + b * c)(...[5, c], 2)');
  t.is(parser.root.type, 'CallExpression');
  t.deepEqual(parser.dependencies(), new Set(['x', 'c']));

  t.is(evaluator(), 5 * 120 + 99 * 2);
  t.is(compile(parser.root, true), `this.nodes[${parser.root.callee.id}].evaluator({})(...[5, this.external("c")], 2)`);
});

test('MemberExpression', t => {
  const evaluator = parser.parse('({x}).x');
  t.is(parser.root.type, 'MemberExpression');
  t.deepEqual(parser.dependencies(), new Set(['x']));
  t.is(evaluator(), 120);
  t.is(compile(parser.root, true), '({x:this.external("x")}).x');

  t.is(parser.parse('(o => o.x * o["y"])({x,y})')(), 120 * 121);
});

test('MemberExpression with a compiled property', t => {
  const evaluator = parser.parse('({xy})["x" + "y"]');
  t.is(evaluator(), 120);
  t.is(compile(parser.root, true), '({xy:this.external("xy")})["x" + "y"]');
  t.is(evaluator(), 120);
});

test('using library functions', t => {
  const evaluator = parser.parse('range(1, 3).map(i => i + x)');
  t.deepEqual(parser.dependencies(), new Set(['range', 'x']));

  t.deepEqual(evaluator(), [121, 122]);
  t.is(compile(parser.root, true), `this.external("range")(1, 3).map(this.nodes[${parser.root.arguments[0].id}].evaluator({}))`);
  t.deepEqual(evaluator(), [121, 122]);
});

test('NewExpression', t => {
  const evaluator = parser.parse('new Array(3)');
  t.is(parser.root.type, 'NewExpression');
  t.is(parser.dependencies().size, 0);
  t.deepEqual(evaluator(), [,,,]);
  t.is(compile(parser.root, true), 'new (Array)(3)');
});

test('UnaryExpression', t => {
  const evaluator = parser.parse('typeof +"42"');
  t.is(parser.root.type, 'UnaryExpression');
  t.is(parser.dependencies().size, 0);
  t.is(evaluator(), 'number');
  t.is(compile(parser.root, true), 'typeof +"42"');
});

test('ConditionalExpression', t => {
  const evaluator = parser.parse('x => x > a ? x - a : a - x');
  t.is(parser.root.result.type, 'ConditionalExpression');
  t.deepEqual(parser.dependencies(), new Set(['a']));

  const f = evaluator();
  t.is(f.signature(),
    'x => this.nodes[0].transpile(x,this.external("a")) ? this.nodes[1].transpile(x,this.external("a")) : this.nodes[2].transpile(this.external("a"),x)'
  );

  t.is(f(100), 100 - 97);
  t.is(f.signature(), `x => x > this.external("a") ? x - this.external("a") : this.nodes[2].transpile(this.external("a"),x)`);
  t.is(f(80), 97 - 80);
  t.is(f.signature(), 'x => x > this.external("a") ? x - this.external("a") : this.external("a") - x');
});

test('transpilation of UnaryExpression', t => {
  const evaluator = parser.parse('~math.complex(1,2)');
  t.is(parser.root.type, 'UnaryExpression');
  t.is(parser.dependencies().size, 1);
  t.deepEqual(evaluator(), math.complex(1, -2));
  t.is(compile(parser.root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2))');
  t.deepEqual(evaluator(), math.complex(1, -2));
});

test('transpilation of BinaryExpression', t => {
  const evaluator = parser.parse('math.complex(1,2) * math.complex(1,-2)');
  t.is(parser.root.type, 'BinaryExpression');
  t.is(parser.dependencies().size, 1);
  t.deepEqual(evaluator(), math.complex(5, 0));
  t.is(compile(parser.root, true), 'this.nodes[0].transpile(this.external("math").complex(1,2),this.external("math").complex(1,-2))');
  t.deepEqual(evaluator(), math.complex(5, 0));
});

test('more awesome transpilation', t => {
  const evaluator = parser.parse('(x => x * ~x)(math.complex(2,3))');
  t.deepEqual(evaluator(), math.complex(13, 0));
});

test('Fibonacci numbers sequence generation', t => {
  const evaluator = parser.parse('range(0, 5).reduce(acc => acc.concat(acc[acc.length-1] + acc[acc.length-2]), [1,1])');
  t.deepEqual(evaluator(), [1, 1, 2, 3, 5, 8, 13]);
});

test('more cases of arrow functions depending on external nodes', t => {
  const evaluator = parser.parse('x => a + (a => a + x)(5)');
  const f = evaluator();
  t.is(f(42), 97 + 5 + 42);
});


test('MemFn expression', t => {
  const evaluator = parser.parse('[1, 2].reduce((a, b) => a + b)');
  t.is(parser.dependencies().size, 0);
  t.is(evaluator(), 3);
  t.is(compile(parser.root, true), '[1, 2].reduce(this.nodes[2].evaluator({}))');
  t.is(evaluator(), 3);
});

test('String interpolation', t => {
  const evaluator = parser.parse('`a + b is ${a + b}!`');
  t.deepEqual(parser.dependencies(), new Set(['a', 'b']));
  t.is(evaluator(), `a + b is ${97 + 98}!`);
});

test('arguments reserved word', t => {
  const evaluator = parser.parse('({ re, im = 0 } = math.complex(1, 1)) => arguments');
  t.deepEqual(parser.dependencies(), new Set(['math']));

  const fn = evaluator();

  t.deepEqual(fn(), { re: 1, im: 1 })
  t.deepEqual(fn({ re: 42 }), { re: 42, im: 0 })
});

test('initializers depending on previous args', t => {
  const evaluator = parser.parse('({a} = {a:42}, b = a * 2) => arguments')
  t.is(parser.dependencies().size, 0);

  const fn = evaluator();
  t.deepEqual(fn(), { a: 42, b: 84 });
});

test('arguments with nested arrow functions', t => {
  const evaluator = parser.parse('a => b => arguments')
  t.is(parser.dependencies().size, 0);

  const fn = evaluator();
  t.deepEqual(fn(5)(6), { b: 6 });
});
