import CalcNode from './calc_node.js';

export function calcGraph(nodes, resolve) {
  const cg = {};

  for (let name in nodes) {
    cg[name] = new CalcNode(nodes[name], id => cg[id] || resolve(id), { name });
  }
  return cg;
}

export { reactiveCell } from './reactive_cell.js';
export { CalcNode };
