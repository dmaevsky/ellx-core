import CalcNode from './calc_node.js';

export default function calcGraph(nodes, imports = {}) {
  const cg = {};
  const resolve = name => cg[name] || imports[name];

  for (let name in nodes) {
    cg[name] = new CalcNode(nodes[name], resolve, { name });
  }

  return cg;
}
