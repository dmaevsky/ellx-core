import { isFlow } from 'conclure';
import { toObservable, subscribable } from 'quarx/adapters';
import { subscribableAsync } from 'quarx-async';

export const isSubscribable = obj => !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.subscribe === 'function';

export const flatten = ({ subscribe }) => ({
  subscribe: (subscriber, ...callbacks) => {
    let inner;
    const outer = subscribe(value => {
      if (inner) inner();

      if (isSubscribable(value)) {
        inner = flatten(value).subscribe(subscriber, ...callbacks);
      }
      else {
        inner = null;
        subscriber(value);
      }
    }, ...callbacks);

    return () => {
      if (inner) inner();
      if (outer) outer();
    };
  }
});

const obsKey = Symbol.for('@@quarx-observable');
const getObs = subs => subs[obsKey] || (subs[obsKey] = toObservable(subs));

export const invokeSubs = (fn, ...args) => {
  args = args.map(a => isSubscribable(a) ? getObs(a) : { get: () => a });

  return flatten(subscribable(
    () => fn(...args.map(a => a.get())),
    { name: fn.toString() }
  ));
}

export function catchErrorStale(evaluate, mapError, mapStale) {
  const { subscribe } = subscribableAsyncFlat(evaluate, { name: `(${evaluate.toString()})` });

  return flatten({
    subscribe: (subscriber, onError, onStale) => subscribe(
      subscriber,
      mapError ? (e => isFlow(e) ? onError(e) : subscriber(mapError(e))) : onError,
      mapStale ? flow => subscriber(mapStale(flow)) : onStale
    )
  });
}

export const tryFn = (evaluate, mapError) => catchErrorStale(evaluate, mapError || (() => undefined));
export const awaitFn = (evaluate, mapStale) => catchErrorStale(evaluate, null, mapStale);

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
