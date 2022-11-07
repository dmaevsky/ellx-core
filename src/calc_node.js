import { box } from 'quarx/box';
import { toObservable } from 'quarx/adapters';
import { subscribableAsync } from 'quarx-async';
import { isFlow } from 'conclure';
import { reactiveCell } from './reactive_cell.js';
import ProgressiveEval from './progressive_assembly.js';
import { subscribableAsyncFlat } from './transpile_subs.js';

export default class CalcNode {
  constructor(formula, resolve, options = {}) {
    const { name = `CalcNode(${formula})` } = options;

    this.parser = new ProgressiveEval(identifier => {
      const resolved = resolve(identifier);
      if (! (resolved instanceof CalcNode)) return resolved;

      const value = resolved.currentValue.get();
      if (isFlow(value) || value instanceof Error) throw value;
      return value;
    });

    const makeEvaluator = expr => this.parser.parse(String(expr));

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
