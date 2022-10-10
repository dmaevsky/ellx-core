import { observable } from 'quarx';
import { isFlow } from 'conclure';
import { reactiveCell } from './reactive_cell.js';
import ProgressiveEval from './progressive_assembly.js';
import { fromObservable } from './adapters.js';

export default class CalcNode {
  constructor(formula, resolve, options = {}) {
    const { name = 'CalcNode' } = options;

    this.resolve = resolve;

    this.parser = new ProgressiveEval(identifier => {
      const resolved = this.resolve(identifier);
      if (! (resolved instanceof CalcNode)) return resolved;

      const value = resolved.currentValue.get();
      if (isFlow(value) || value instanceof Error) throw value;
      return value;
    });

    this.evaluator = observable.box(() => undefined, { name: `[${name}]:evaluator` });

    this.currentValue = reactiveCell(() => {
      const evaluate = this.evaluator.get();
      return evaluate();
    }, {
      name: `[${name}]:currentValue`
    });

    Object.assign(this, fromObservable(this.currentValue, { name: `Subscribe to node: ${name}` }));

    this.update(formula);
  }

  update(formula) {
    this.evaluator.set(this.parser.parse(String(formula)));
  }
}
