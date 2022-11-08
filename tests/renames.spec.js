import test from 'ava';
import { progressiveAssembly, compile } from '../src/progressive_assembly.js';

const renamed = new Map();
const resolve = name => (renamed.get(name) || name).charCodeAt(0);

function rename(oldName, newName) {
  if (renamed.has(oldName)) {
    const original = renamed.get(oldName);
    renamed.delete(oldName);
    oldName = original;
  }

  if (oldName === newName) {
    renamed.delete(oldName);
  }
  else {
    renamed.set(oldName, newName);
    renamed.set(newName, oldName);
  }
}

function withRenames(root) {
  const originalInput = root.text;
  let pos = 0, result = '';

  for (let node of root.parts) {
    let replaced;

    if (node.type === 'Identifier' || node.bindingType === 'SingleName') {
      if (!renamed.has(node.text)) continue;

      replaced = renamed.get(node.text);
      if (node.shortNotation) replaced = node.text + ':' + replaced;
    }
    else replaced = withRenames(node);

    result += originalInput.slice(pos, node.pos) + replaced;
    pos = node.pos + node.text.length;
  }

  result += originalInput.slice(pos);
  return result;
}

test('renaming external node', t => {
  renamed.clear();
  const root = progressiveAssembly('x * (x - y)', resolve);
  const evaluator = root.evaluator;

  t.is(evaluator(), -120);
  t.is(compile(root, true), 'this.external("x") * (this.external("x") - this.external("y"))');
  t.deepEqual(root.deps, new Set(['x', 'y']));

  rename('x', 'zNew');
  t.is(withRenames(root), 'zNew * (zNew - y)');
  t.is(compile(root, true), 'this.external("x") * (this.external("x") - this.external("y"))');
  t.deepEqual([...renamed], [['x', 'zNew'], ['zNew', 'x']]);
  t.is(evaluator(), 122);

  rename('zNew', 'dAnother');
  rename('y', 'yAnother');
  t.is(withRenames(root), 'dAnother * (dAnother - yAnother)');
  t.deepEqual([...renamed], [['x', 'dAnother'], ['dAnother', 'x'], ['y', 'yAnother'], ['yAnother', 'y']]);
  t.is(evaluator(), -2100);
});

test('that external nodes are evaluated lazily when not inside ArrowFunction body', t => {
  renamed.clear();
  const root = progressiveAssembly('a > 100 ? () => x : () => y', resolve);
  const evaluator = root.evaluator;

  const arrows = [root.consequent, root.alternate];

  let f = evaluator();
  t.is(compile(root, true), `this.external("a") > 100 ? this.nodes[${arrows[0].id}].evaluator({}) : this.nodes[${arrows[1].id}].evaluator({})`);
  t.is(f.signature(), '() => this.external("y")');
  t.is(f(), 121);
  t.is(f.signature(), '() => this.external("y")');

  rename('a', 'z');
  t.is(f(), 121);
  f = evaluator();
  t.is(f.signature(), '() => this.external("x")');
  t.is(f(), 120);
  t.is(f.signature(), '() => this.external("x")');
});

test('renaming external node when a conflicting shorthand notation is present', t => {
  renamed.clear();
  const root = progressiveAssembly('{x}', resolve);
  const evaluator = root.evaluator;

  t.deepEqual(root.deps, new Set(['x']));
  t.deepEqual(evaluator(), {x: 120});
  rename('x', 'yy');
  t.is(withRenames(root), '{x:yy}');
  t.deepEqual(evaluator(), {x: 121});
  rename('yy', 'zzz');
  t.is(withRenames(root), '{x:zzz}');
  t.deepEqual(evaluator(), {x: 122});
});

test('renaming external node when a conflicting arrow argument is present', t => {
  renamed.clear();
  const root = progressiveAssembly('a => ({a}).a + bb', resolve);
  const evaluator = root.evaluator;

  t.deepEqual(root.deps, new Set(['bb']));

  let f = evaluator();
  t.is(f(2), 100);
  t.is(f.signature(), 'a => ({a:a}).a + this.external("bb")');

  rename('bb', 'a');
  t.is(withRenames(root), 'bb => ({a:bb}).a + a');

  t.is(f(2), 99);

  f = evaluator();
  // After recalculation the compiled internals stay the same, but the externals re-captured correctly
  t.is(f.signature(), 'a => ({a:a}).a + this.external("bb")');
  t.is(f(2), 99);

  // Renaming it back brings the original formula back
  rename('a', 'bb');
  t.is(withRenames(root), 'a => ({a}).a + bb');
});
