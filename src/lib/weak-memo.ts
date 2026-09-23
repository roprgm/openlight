/** Creates one value per key object on first use; an entry goes when its key is collected. */
export function weakMemo<K extends WeakKey, V>(create: (key: K) => V) {
  const values = new WeakMap<K, V>();
  return (key: K) => {
    let value = values.get(key);
    if (value === undefined) {
      value = create(key);
      values.set(key, value);
    }
    return value;
  };
}
