import Parser from 'rd-parse';
import Grammar from 'rd-parse-jsexpr';
import { isFlow } from 'conclure';
import reservedWords from './reserved_words.js';
import { binaryOp, unaryOp, transpile } from './transpile.js';
import { isSubscribable, pull } from './pull.js';

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

// Just assemble compiled code
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
    nodes: []
  };

  const reserved = new Set(reservedWords);
  const globals = globalThis;

  const root = parseFormula(input);
  precompile(root);

  const ids = new WeakMap();

  function getNodeId(node) {
    if (!ids.has(node)) {
      ids.set(node, self.nodes.push(node) - 1);
    }
    return ids.get(node);
  }

  function precompile(node, parent = null) {
    Object.defineProperty(node, 'id', { get: () => getNodeId(node) })

    const children = [];
    const boundNames = [];

    const collectParts = tree => {
      for (let p in tree) {
        const part = tree[p];

        if (part && typeof part === 'object') {
          if (part.bindingType === 'SingleName') {
            if (reserved.has(part.name)) {
              throw new Error(`Cannot use a reserved word ${part.name} as a parameter name`);
            }
            boundNames.push(part);
          }
          else if (part.type) {
            children.push(part);
          }
          else collectParts(part);
        }
      }
    }

    collectParts(node);

    node.parts = [...children, ...boundNames];
    node.parts.sort((a, b) => a.pos - b.pos);

    node.children = children;
    node.parent = parent;
    node.namespace = parent ? parent.namespace : new Set();

    if (node.type === 'ArrowFunction') {
      node.isArrowFn = true;
      node.boundNames = boundNames.map(({ name }) => name);
      node.namespace = Union(node.namespace, node.boundNames);
    }
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      node.callee.isMemFn = true;
    }
    else if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['try', 'await'].includes(node.callee.name)) {
      if (!node.arguments.length) {
        throw new Error(`Empty ${node.callee.name} expression`);
      }
      node.arguments[0].catchErrors = true;
    }
    else if (node.type === 'NewExpression') {
      node.ctor.isConstructor = true;
    }

    for (let child of node.children) {
      precompile(child, node);
    }

    for (let part of node.parts) part.pos -= node.pos;

    if (node.type === 'Identifier') {
      if (node.name === 'throw') {
        node.transpile = () => e => { throw e; };
      }
      else if (node.name === 'try') {
        node.transpile = () => ({ result, error }, catchClause) => {
          if (!error) return result;
          return catchClause && catchClause(error);
        }
      }
      else if (node.name === 'await') {
        node.transpile = () => ({ result, error }, staleClause) => ({
          subscribe: subscriber => pull(error || result, value => {
            if (isFlow(value)) {
              try {
                value = staleClause(value);
              }
              catch (error) {
                value = error;
              }
            }
            subscriber(value);
          })
        });
      }
      else if (node.name === 'arguments') {
        let n = node;
        while (!n.boundNames && n.parent) n = n.parent;

        node.precompiled = `({ ${( n.boundNames || []).join(',')} })`;
      }
      else if (reserved.has(node.name)) {
        throw new Error(`Cannot refer to a reserved word ${node.name} as a dependency`);
      }

      if (reserved.has(node.name) || node.name in globals || node.namespace.has(node.name)) {
        node.deps = new Set();
      }
      else {
        // If node.namespace does not include the name, then it is a dependency
        node.deps = new Set([node.name]);
        node.precompiled = `this.external(${JSON.stringify(node.name)})`;

        if (node.shortNotation) {
          node.precompiled = node.name + ':' + node.precompiled;
        }
      }
    }
    else node.deps = Union(...node.children.map(child => child.deps));

    if (['MemberExpression', 'CallExpression', 'NewExpression'].includes(node.type)) {
      const op = assembler(node);
      if (node.isMemFn) {
        // The transpilation will be lifted by the node's CallExpression parent if possible
        node.transpile = transpile((c, ...a) => bind(op(c, ...a), c));
      }
      else JIT_transpile(node, transpile(op), a => isFlow(a) || isSubscribable(a));
    }

    const opOverload = {
      'UnaryExpression': unaryOp,
      'BinaryExpression': binaryOp
    }[node.type];

    const opWhiteList = ['~', '**', '*', '/', '%', '+', '-', '>>>', '<<', '>>', '<=', '>=', '<', '>', '==', '!=', '&', '^', '|'];

    if (opOverload && opWhiteList.includes(node.operator)) {
      JIT_transpile(node, opOverload(node.operator), arg => typeof arg === 'object' || typeof arg === 'function');
    }

    if (!parent || node.isArrowFn || node.catchErrors) {
      node.evaluator = progressiveEvaluator(node);
    }
  }

  // Only the root node and arrow function root nodes will have evaluators, non-removable

  function buildEvaluator(node) {
    const args = node.parent ? node.parent.namespace : [];
    const evalFn = new Function(`{ ${[...args].join(',')} }`, 'return ' + compile(node, true)).bind(self);

    if (!node.catchErrors) return evalFn;

    return context => {
      try {
        return { result: evalFn(context) };
      }
      catch (error) {
        return { error };
      }
    };
  }

  function progressiveEvaluator(node) {
    let evaluator = null;

    return Object.assign((context = {}) => {
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
    }, {
      invalidate: () => evaluator = null
    });
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
      if (node.callee && node.callee.isMemFn) {
        delete node.callee.transpile;
      }
      invalidate(node);
    }
    else node.transpile = op;
    return op(...parts);
  };
}
