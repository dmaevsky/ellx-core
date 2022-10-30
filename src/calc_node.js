import { box } from 'quarx/box';
import { isFlow } from 'conclure';
import { reactiveCell } from './reactive_cell.js';
import ProgressiveEval from './progressive_assembly.js';
import { fromObservable } from './adapters.js';

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

    this.currentValue = reactiveCell(() => {
      const evaluate = evaluator.get();
      return evaluate();
    }, {
      name: `${name}.currentValue`
    });

    Object.assign(this, fromObservable(this.currentValue, { name: `Subscribe to node: ${name}` }));

    this.update = expr => evaluator.set(makeEvaluator(expr));
  }
}
