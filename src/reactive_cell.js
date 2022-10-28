import { createAtom, autorun } from 'quarx';
import { computed } from 'quarx/computed';

import { pull } from './pull.js';

export function reactiveCell(evaluate, options = {}) {
  const name = (options.name || 'reactive') + ':cell';

  let value, inner, outer;
  value = new Promise(() => {});    // indicate stale

  const cell = computed(evaluate, options);

  const atom = createAtom(
    start,
    { name: 'atom:' + name }
  );

  function computation() {
    try {
      return cell.get();
    }
    catch (e) {
      return e;
    }
  }

  function start() {
    outer = autorun(() => {
      if (inner) inner();

      inner = pull(computation(), set);
    }, { name });

    return () => {
      if (inner) inner();
      if (outer) outer();
    }
  }

  function set(newValue) {
    value = newValue;
    atom.reportChanged();
  }

  return {
    get: () => {
      if (!atom.reportObserved()) {
        console.warn(`${name} unobserved`);
      };
      return value;
    },
    set
  };
}
