const clone = (value) => value == null ? value : structuredClone(value);
function memoryDb(initial = {}) {
  let state = clone(initial), queue = Promise.resolve();
  const source = (data) => ({ collection(name) {
    data[name] ||= {};
    const match = (value, filter) => Object.entries(filter).every(([key, expected]) => value[key] === expected);
    const listing = (filter = {}) => {
      let max = 100, offset = 0;
      return { limit(value) { max = value; return this; }, skip(value) { offset = value; return this; },
        async get() { return { data: Object.entries(data[name]).filter(([, value]) => match(value, filter)).slice(offset, offset + max).map(([key, value]) => ({ ...clone(value), _id: key })) }; },
        async remove() { for (const [key, value] of Object.entries(data[name])) if (match(value, filter)) delete data[name][key]; return {}; },
      };
    };
    return {
      limit(value) { return listing().limit(value); },
      doc(key) { return {
        async get() { return { data: data[name][key] ? [{ ...clone(data[name][key]), _id: key }] : [] }; },
        async set(value) { data[name][key] = clone(value); return {}; },
        async delete() { delete data[name][key]; return {}; },
      }; },
      where(filter) { return listing(filter); },
    };
  } });
  return {
    collection(name) { return source(state).collection(name); },
    runTransaction(work) {
      const task = queue.then(async () => { const snapshot = clone(state), result = await work(source(snapshot)); state = snapshot; return result; });
      queue = task.catch(() => {}); return task;
    },
    inspect(name) { return clone(state[name] || {}); },
    async seed(name, key, value) { await this.collection(name).doc(key).set(value); },
  };
}
module.exports = { memoryDb };
