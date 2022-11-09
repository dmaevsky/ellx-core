import { observableMap } from 'quarx/map';
import { calcNode } from './calc_node.js';

export function calcMap(nodes, resolve) {
  const mapResolve = name => map.has(name) ? map.get(name).get() : resolve(name);

  const map = observableMap(new Map(
    Object.entries(nodes).map(
      ([name, formula]) => [name, calcNode(formula, mapResolve, { name })]
    )
  ));

  return {
    get: name => map.get(name)?.get(),
    set: (name, formula) => map.set(name, calcNode(formula, mapResolve, { name })),
    subscribe: (name, ...args) => map.get(name)?.subscribe(...args)
  };
}
