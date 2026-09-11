import { id } from "./lib.mjs";

// Preserve item identity and confirmations when upgrading pre-category trips.
export function upgradeTrip(t) {
  t.categories ??= [];
  const ensure = (name, owner) => {
    let c = t.categories.find((c) => c.name === name && c.owner === owner);
    if (!c) {
      c = { id: id(), name, owner };
      t.categories.push(c);
    }
    return c;
  };
  for (const owner of [null, ...t.members.map((m) => m.id)]) {
    for (const name of ["携带物品", "准备事项"]) ensure(name, owner);
  }
  for (const i of t.items) {
    const c =
      t.categories.find((c) => c.id === i.categoryId && c.owner === i.owner) ||
      ensure(i.category || "携带物品", i.owner);
    i.categoryId = c.id;
    i.category = c.name;
  }
  for (const e of t.events) {
    e.startTime ??= e.time || "";
    e.endTime ??= ""; // Historical end times are unknown, not invented.
  }
  t.schemaVersion = 2;
  return t;
}
