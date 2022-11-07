import { isFlow } from 'conclure';
import { toObservable, subscribable } from 'quarx/adapters';
import { subscribableAsync } from 'quarx-async';
import { isSubscribable, flatten } from './pull.js';

const obsKey = Symbol.for('@@quarx-observable');
const getObs = subs => subs[obsKey] || (subs[obsKey] = toObservable(subs));

export const invokeSubs = (fn, ...args) => {
  args = args.map(a => isSubscribable(a) ? getObs(a) : { get: () => a });

  return flatten(subscribable(
    () => fn(...args.map(a => a.get())),
    { name: fn.toString() }
  ));
}

function* pullFlow(it) {
  return pull(yield it);
}

function pull(it) {
  if (isFlow(it)) return pullFlow(it);
  if (!isSubscribable(it)) return it;

  const obs = getObs(it);
  return subscribableAsyncFlat(() => obs.get());
}

export const subscribableAsyncFlat = (evaluate, options) => flatten(subscribableAsync(
  () => pull(evaluate()),
  options
));
