import test from 'node:test';
import assert from 'node:assert/strict';

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

    if (node.type === 'Identifier' || node.bindingName) {
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

test('renaming external node', () => {
  renamed.clear();
  const root = progressiveAssembly('x * (x - y)', resolve);
  const evaluator = root.evaluator;

  assert.equal(evaluator(), -120);
  assert.equal(compile(root, true), 'this.external("x") * (this.external("x") - this.external("y"))');
  assert.deepEqual(root.deps, new Set(['x', 'y']));

  rename('x', 'zNew');
  assert.equal(withRenames(root), 'zNew * (zNew - y)');
  assert.equal(compile(root, true), 'this.external("x") * (this.external("x") - this.external("y"))');
  assert.deepEqual([...renamed], [['x', 'zNew'], ['zNew', 'x']]);
  assert.equal(evaluator(), 122);

  rename('zNew', 'dAnother');
  rename('y', 'yAnother');
  assert.equal(withRenames(root), 'dAnother * (dAnother - yAnother)');
  assert.deepEqual([...renamed], [['x', 'dAnother'], ['dAnother', 'x'], ['y', 'yAnother'], ['yAnother', 'y']]);
  assert.equal(evaluator(), -2100);
});

test('that external nodes are evaluated lazily when not inside ArrowFunction body', () => {
  renamed.clear();
  const root = progressiveAssembly('a > 100 ? () => x : () => y', resolve);
  const evaluator = root.evaluator;

  const arrows = [root.children[1], root.children[2]];

  let f = evaluator();
  assert.equal(compile(root, true), `this.external("a") > 100 ? this.nodes[${arrows[0].id}].evaluator({}) : this.nodes[${arrows[1].id}].evaluator({})`);
  assert.equal(f.signature(), '() => this.external("y")');
  assert.equal(f(), 121);
  assert.equal(f.signature(), '() => this.external("y")');

  rename('a', 'z');
  assert.equal(f(), 121);
  f = evaluator();
  assert.equal(f.signature(), '() => this.external("x")');
  assert.equal(f(), 120);
  assert.equal(f.signature(), '() => this.external("x")');
});

test('renaming external node when a conflicting shorthand notation is present', () => {
  renamed.clear();
  const root = progressiveAssembly('{x}', resolve);
  const evaluator = root.evaluator;

  assert.deepEqual(root.deps, new Set(['x']));
  assert.deepEqual(evaluator(), {x: 120});
  rename('x', 'yy');
  assert.equal(withRenames(root), '{x:yy}');
  assert.deepEqual(evaluator(), {x: 121});
  rename('yy', 'zzz');
  assert.equal(withRenames(root), '{x:zzz}');
  assert.deepEqual(evaluator(), {x: 122});
});

test('renaming external node when a conflicting arrow argument is present', () => {
  renamed.clear();
  const root = progressiveAssembly('a => ({a}).a + bb', resolve);
  const evaluator = root.evaluator;

  assert.deepEqual(root.deps, new Set(['bb']));

  let f = evaluator();
  assert.equal(f(2), 100);
  assert.equal(f.signature(), 'a => ({a}).a + this.external("bb")');

  rename('bb', 'a');
  assert.equal(withRenames(root), 'bb => ({a:bb}).a + a');

  assert.equal(f(2), 99);

  f = evaluator();
  // After recalculation the compiled internals stay the same, but the externals re-captured correctly
  assert.equal(f.signature(), 'a => ({a}).a + this.external("bb")');
  assert.equal(f(2), 99);

  // Renaming it back brings the original formula back
  rename('a', 'bb');
  assert.equal(withRenames(root), 'a => ({a}).a + bb');
});
