import { observable, computed } from 'quarx';
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

    const circular = computed(() => {
      if (this.evaluator.get()) { // re-run on evaluator update
        return this.dependsOn(this);
      }
    }, { name: 'circular_check' });

    this.currentValue = reactiveCell(() => {
      if (circular.get()) {
        throw new Error('Circular dependency detected');
      }

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

  dependsOn(node, marker = {}) {
    this._traversalMarker = marker;

    return [...this.parser.dependencies()].some(dep => {
      const resolved = this.resolve(dep, false);  // static resolve
      if (! (resolved instanceof CalcNode)) return false;

      if (resolved === node) return true;
      return (resolved._traversalMarker !== marker && resolved.dependsOn(node, marker));
    });
  }
}
