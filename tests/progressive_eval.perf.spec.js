import test from 'node:test';
import assert from 'node:assert/strict';

import { progressiveAssembly } from '../src/progressive_assembly.js';
import * as library from './tools.js';

const resolve = name => {
  if (name in library) return library[name];
  return name.charCodeAt(0);
}

test('transpiled arrow function performance', { skip: 1 }, () => {
  const formula = 'range(0, 1000000).reduce((a, b) => a + b)';

  const evaluator1 = progressiveAssembly(formula, resolve).evaluator;
  const evaluator2 = new Function('range', 'return () => ' + formula)(library.range);

  const start1 = Date.now();
  assert.equal(evaluator1(), 499999500000);
  const time1 = Date.now() - start1;

  const start2 = Date.now();
  assert.equal(evaluator2(), 499999500000);
  const time2 = Date.now() - start2;

  const relative = (time1 - time2) / time2;
  console.log('Relative slow-down is ' + relative);
  assert(relative < 1.2);
});

// test('performance of a slightly more complicated arrow function', () => {
//   const formula = 'range(1, 1000000).reduce(acc => acc.append(acc[acc.length-1] + acc[acc.length-2]), [1,1])';
//   const evaluator1 = parser.parse(formula);
// });
