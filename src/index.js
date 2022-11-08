import CalcNode from './calc_node.js';

export function calcGraph(nodes, resolve) {
  const cg = {};

  for (let name in nodes) {
    cg[name] = new CalcNode(nodes[name], id => id in cg ? cg[id].currentValue.get() : resolve(id), { name });
  }
  return cg;
}
