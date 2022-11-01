import { computed } from 'quarx/computed';
import { toObservable, fromObservable } from 'quarx/adapters';
import { isSubscribable, flatten } from './pull.js';

const obsKey = Symbol.for('@@quarx-observable');
const getObs = subs => subs[obsKey] || (subs[obsKey] = toObservable(subs));

export const invokeSubs = (fn, ...args) => {
  args = args.map(a => isSubscribable(a) ? getObs(a) : { get: () => a });

  return flatten(fromObservable(
    computed(() => fn(...args.map(a => a.get())), { name: fn.toString() }),
    { name: 'fromObservable:' + fn.toString() }
  ));
}
