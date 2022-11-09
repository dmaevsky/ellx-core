import Parser from 'rd-parse';
import Grammar from 'rd-parse-jsexpr';
import { isFlow } from 'conclure';
import reservedWords from './reserved_words.js';
import { binaryOp, unaryOp, transpile } from './transpile.js';
import { isSubscribable, tryFn, awaitFn } from './transpile_subs.js';

const parseFormula = Parser(Grammar);
const Union = (...sets) => sets.reduce((acc, s) => (s ? new Set([...acc, ...s]) : acc), new Set());

const bind = (f, o) => f && typeof f.bind === 'function' ? f.bind(o) : f;

const fromParts = (node, replacer) => {
  let pos = 0, result = '', count = 0;

  for (let child of node.children) {
    result += node.text.slice(pos, child.pos) + replacer(child, count++);
    pos = child.pos + child.text.length;
  }

  result += node.text.slice(pos);
  return result;
}

export const compile = (node, asRoot = false) => {

  if (!asRoot && node.evaluator) {
    const args = node.parent ? node.parent.namespace : [];
    return `this.nodes[${node.id}].evaluator({${[...args].join(',')}})`;
  }

  let result;

  if (node.precompiled) {
    result = node.precompiled;
  }
  else if (node.transpile) {
    result = `this.nodes[${node.id}].transpile(${node.children.map(child => compile(child)).join(',')})`;
  }
  else {
    result = fromParts(node, child => compile(child));
  }

  if (node.isConstructor) {
    result = `(${result})`;
  }

  if (node.defer) {
    result = `() => ${result}`;
  }

  return result;
}

const assembler = node => {
  const body = fromParts(node, (_, i) => '_' + i);
  const f = new Function(...node.children.map((_, i) => '_' + i), 'return ' + body);

  return (...args) => {
    try {
      return f(...args);
    }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new Error(error.message.replace(/\b_([0-9]+)\b/, (_, idx) => node.children[idx].text));
    }
  }
}

export function progressiveAssembly(input, resolve) {
  const self = {
    external: resolve,
    nodes: [],
    try: tryFn,
    await: awaitFn,
    throw: e => { throw e; }
  };

  const reserved = new Set(reservedWords);
  const globals = globalThis;
  const ids = new WeakMap();

  function getNodeId(node) {
    if (!ids.has(node)) {
      ids.set(node, self.nodes.push(node) - 1);
    }
    return ids.get(node);
  }

  const astRoot = parseFormula(input);
  const root = precompile(astRoot);

  function precompile(astNode, parent = null, pos = 0) {
    const node = {
      get id() { return getNodeId(node) },
      parent,
      type: astNode.type,
      text: astNode.text,
      pos: astNode.pos - pos,
      namespace: parent ? parent.namespace : new Set(),
    }

    const subExpressions = [];
    const boundNames = [];

    const collectParts = tree => {
      for (let p in tree) {
        const part = tree[p];

        if (part && typeof part === 'object') {
          if (part.bindingType === 'SingleName') {
            if (reserved.has(part.name)) {
              throw new Error(`Cannot use a reserved word ${part.name} as a parameter name`);
            }
            boundNames.push({
              pos: part.pos - pos,
              text: part.text,
              bindingName: true
            });
          }
          else if (part.type) {
            subExpressions.push(part);
          }
          else collectParts(part);
        }
      }
    }

    collectParts(astNode);

    if (astNode.type === 'ArrowFunction') {
      node.isArrowFn = true;
      node.boundNames = boundNames.map(({ text }) => text);
      node.namespace = Union(node.namespace, node.boundNames);
    }
    else if (astNode.type === 'CallExpression' && astNode.callee.type === 'MemberExpression') {
      // The only modification to the original AST: will move this to the grammar later
      astNode.callee.isMemFn = true;
      node.isMemFnCall = true;
    }

    node.children = subExpressions.map(x => precompile(x, node, astNode.pos));

    node.parts = [...node.children, ...boundNames];
    node.parts.sort((a, b) => a.pos - b.pos);

    if (astNode.type === 'Identifier') {
      if (['throw', 'try', 'await'].includes(astNode.name)) {
        node.precompiled = `this.${astNode.name}`;
      }
      else if (astNode.name === 'arguments') {
        let n = node;
        while (!n.boundNames && n.parent) n = n.parent;

        node.precompiled = `({ ${( n.boundNames || []).join(',')} })`;
      }
      else if (reserved.has(astNode.name)) {
        throw new Error(`Cannot refer to a reserved word ${astNode.name} as a dependency`);
      }

      node.shortNotation = Boolean(astNode.shortNotation);

      if (reserved.has(astNode.name) || astNode.name in globals || node.namespace.has(astNode.name)) {
        node.deps = new Set();
      }
      else {
        // If node.namespace does not include the name, then it is a dependency
        node.deps = new Set([astNode.name]);
        node.precompiled = `this.external(${JSON.stringify(astNode.name)})`;

        if (astNode.shortNotation) {
          node.precompiled = astNode.name + ':' + node.precompiled;
        }
      }
    }
    else node.deps = Union(...node.children.map(child => child.deps));

    if (['MemberExpression', 'CallExpression', 'NewExpression'].includes(astNode.type)) {
      const op = assembler(node);

      if (astNode.isMemFn) {
        node.transpile = transpile((c, ...a) => bind(op(c, ...a), c));
      }
      else JIT_transpile(node, transpile(op), a => isFlow(a) || isSubscribable(a));

      if (astNode.type === 'CallExpression' && astNode.callee.type === 'Identifier' && ['try', 'await'].includes(astNode.callee.name)) {
        if (node.children.length < 2) {
          throw new Error(`Empty ${astNode.callee.name} expression`);
        }
        node.children[1].defer = true;
        attachEvaluator(node.children[1]);
      }

      if (astNode.type === 'NewExpression') {
        node.children[0].isConstructor = true;
      }
    }

    const opOverload = {
      'UnaryExpression': unaryOp,
      'BinaryExpression': binaryOp
    }[astNode.type];

    const opWhiteList = ['~', '**', '*', '/', '%', '+', '-', '>>>', '<<', '>>', '<=', '>=', '<', '>', '==', '!=', '&', '^', '|'];

    if (opOverload && opWhiteList.includes(astNode.operator)) {
      JIT_transpile(node, opOverload(astNode.operator), arg => typeof arg === 'object' || typeof arg === 'function');
    }

    if (!parent || node.isArrowFn) {
      attachEvaluator(node);
    }
    return node;
  }

  // Only the root node and arrow function root nodes will have evaluators, non-removable

  function buildEvaluator(node) {
    const args = node.parent ? node.parent.namespace : [];
    return new Function(`{ ${[...args].join(',')} }`, 'return ' + compile(node, true)).bind(self);
  }

  function attachEvaluator(node) {
    let evaluator = null;

    node.evaluator = (context = {}) => {
      if (!evaluator) {
        evaluator = buildEvaluator(node);
      }

      let lastEvaluator = evaluator;
      let result = evaluator(context);

      if (node.isArrowFn) {
        const fn = (...args) => {
          if (lastEvaluator !== evaluator) {
            if (!evaluator) {
              evaluator = buildEvaluator(node);
            }
            lastEvaluator = evaluator;
            result = evaluator(context);
          }
          return result(...args);
        }

        // Mainly for debug and testing purposes
        fn.signature = () => compile(node, true);
        fn.closure = context;
        return fn;
      }
      return result;
    }
    node.evaluator.invalidate = () => evaluator = null;
  }

  return root;
}

function invalidate(node) {
  while (!node.evaluator) node = node.parent;
  node.evaluator.invalidate();
}

function JIT_transpile(node, op, shouldTranspile) {
  node.transpile = (...parts) => {
    if (!parts.some(shouldTranspile)) {
      delete node.transpile;
      if (node.isMemFnCall) {
        delete node.children[0].transpile;
      }
      invalidate(node);
    }
    else node.transpile = op;
    return op(...parts);
  };
}
