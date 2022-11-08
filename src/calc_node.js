import { box } from 'quarx/box';
import { toObservable } from 'quarx/adapters';
import { subscribableAsync } from 'quarx-async';
import { progressiveAssembly } from './progressive_assembly.js';
import { subscribableAsyncFlat } from './transpile_subs.js';

export default class CalcNode {
  constructor(formula, resolve, options = {}) {
    const { name = `CalcNode(${formula})` } = options;

    const makeEvaluator = expr => progressiveAssembly(String(expr), resolve).evaluator;

    const evaluator = box(makeEvaluator(formula), { name: `[${name}]:evaluator` });

    const subs = subscribableAsyncFlat(() => evaluator.get()(), {
      name: `(Evaluate ${name})`
    });

    this.currentValue = toObservable(subs, {
      name: `${name}.currentValue`
    });

    Object.assign(this, subscribableAsync(() => this.currentValue.get(), { name: `(Subscribe to ${name})` }));

    this.update = expr => evaluator.set(makeEvaluator(expr));
  }
}
