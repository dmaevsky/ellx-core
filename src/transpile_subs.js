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

export function catchErrorStale({ subscribe }, mapError, mapStale) {
  return flatten({
    subscrbe: (subscriber, onError, onStale) => subscribe(
      subscriber,
      mapError ? error => subscriber(mapError(error)) : onError,
      mapStale ? flow => subscriber(mapStale(flow)) : onStale
    )
  });
}

export const tryFn = (evaluate, mapError) => catchErrorStale(
  subscribable(evaluate, { name: evaluate.toString() }),
  mapError || (() => undefined)
);

export const awaitFn = (evaluate, mapStale) => catchErrorStale(
  subscribableAsyncFlat(evaluate, { name: evaluate.toString() }),
  null,
  mapStale
);

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
