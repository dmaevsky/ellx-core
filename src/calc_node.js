import { toObservable } from 'quarx/adapters';
import { subscribableAsync } from 'quarx-async';
import { progressiveAssembly } from './progressive_assembly.js';
import { subscribableAsyncFlat } from './transpile_subs.js';

export function calcNode(formula, resolve, options = {}) {
  const { name = `(${formula})` } = options;

  const evaluate = progressiveAssembly(String(formula), resolve).evaluator;

  const subs = subscribableAsyncFlat(evaluate, { name: `(eval ${name})` });
  const obs = toObservable(subs, { name: `(currentValue ${name})` });

  return {
    ...obs,
    ...subscribableAsync(() => obs.get(), { name: `(subscribe to ${name})` })
  };
}

export function calcGraph(nodes, resolve) {
  const cg = {};

  for (let name in nodes) {
    cg[name] = calcNode(nodes[name], id => id in cg ? cg[id].get() : resolve(id), { name });
  }
  return cg;
}
