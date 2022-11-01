import { conclude, isFlow, inProgress } from 'conclure';

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

export function pull(value, cb) {
  let inner, outer;

  if (isFlow(value)) {
    outer = conclude(value, (error, result) => {
      inner = pull(error || result, cb);
    });
    if (inProgress(value)) cb(value);
  }
  else if (isSubscribable(value)) {
    outer = value.subscribe(result => {
      if (inner) inner();
      inner = pull(result, cb);
    });
  }
  else cb(value);

  return () => {
    if (inner) inner();
    if (outer) outer();
  };
}
