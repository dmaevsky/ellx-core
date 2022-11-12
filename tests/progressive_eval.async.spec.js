import test from 'node:test';
import assert from 'node:assert/strict';

import snapshot from 'usnap';

snapshot.setup(import.meta.url);

import { conclude } from 'conclure';
import math from './math.mock.js';

import { progressiveAssembly, compile } from '../src/progressive_assembly.js';
import * as library from './tools.js';

const resolve = name => {
  if (name === 'math') return math;
  if (name in library) return library[name];
  return name.charCodeAt(0);
}

const parse = formula => {
  // Make a new parser for each formula (1 in each test)
  const root = progressiveAssembly(formula, resolve);
  const evaluator = root.evaluator;

  const result = () => new Promise((resolve, reject) =>
    conclude(evaluator(), (error, result) => error ? reject(error) : resolve(result))
  );
  result.compiled = () => compile(root, true);
  return result;
}

test('async error', async () => {
  const evaluator = parse('delayed(1, () => x.something.wrong)()');
  await assert.rejects(evaluator, new Error('Cannot read properties of undefined (reading \'wrong\')'));
});

test('async MemberExpression with a ComputedProperty', async t => {
  const evaluator = parse('delayed(1, () =>({xy}))()["x" + "y"]');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 120);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 120);
});

test('MemberExpression with an async ComputedProperty', async t => {
  const evaluator = parse('{xy}[delayed(1, () =>"x" + "y")()]');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 120);
  await snapshot(evaluator.compiled(), t.name);
});

test('async CallExpression', async t => {
  const evaluator = parse('Math.floor(delayed(1, () => 3.14)())');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 3);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 3);
});

test('async CallExpression with this argument', async t => {
  const evaluator = parse('range(0, 5).slice(delayed(1, () => 2)())');

  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), [2,3,4]);
  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), [2,3,4]);
});

test('async CallExpression with async callee and spread arguments', async t => {
  const evaluator = parse('delayed(1, () => (...args) => sum(args))()(...range(1, 3), ...range(4, 6))');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 12);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 12);
});

test('async CallExpression with async callee and this argument', async t => {
  const evaluator = parse('delayed(1, () => range(0, 5))().slice(2)');

  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), [2,3,4]);
  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), [2,3,4]);
});

test('async CallExpression with async callee and a chain of properties and calls', async t => {
  const evaluator = parse('~delayed(1, () => math.complex)()(1, 1)');

  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), math.complex(1, -1));
  await snapshot(evaluator.compiled(), t.name);
});

test('o[p](args) with o, p sync but o[p] async resolving to a function', async t => {
  const evaluator = parse('({ f: delayed(1, () => x => x + 42)() }).f(8)');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 50);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 50);
});

test('o[p](args) with o, p sync but o[p] async resolving to a non-function', async t => {
  const evaluator = parse('({ f: delayed(1, () => [42])() }).f[0]');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 42);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 42);
});

test('NewExpression with async constructor', async t => {
  const evaluator = parse('new (delayed(1, () => Array)())(3)');

  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), [,,,]);
  await snapshot(evaluator.compiled(), t.name);
  assert.deepEqual(await evaluator(), [,,,]);
});

test('async sum', async t => {
  const evaluator = parse('sum(delayed(1, [ delayed(1, 55), delayed(1, 33) ]))');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 88);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 88);
});

test('race', async t => {
  const evaluator = parse('(x => x * x)(race([delayed(10, () => -1)(), delayed(1, () => 5)()]))');

  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 25);
  await snapshot(evaluator.compiled(), t.name);
});

test('that everything else (including .then callbacks) is still transpiled', async t => {
  const evaluator = parse('(x => x + delayed(1, () => y)())(Promise.resolve(42))');

  assert.equal(await evaluator(), 42 + 121);
  await snapshot(evaluator.compiled(), t.name);
  assert.equal(await evaluator(), 42 + 121);
});

test('array of Promises', async () => {
  const evaluator = parse('range(5).map(x => new Promise(resolve => setTimeout(() => resolve(x*x), 1)))');

  assert.deepEqual(await Promise.all(await evaluator()), [0, 1, 4, 9, 16]);
});
