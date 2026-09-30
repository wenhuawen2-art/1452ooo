const test = require("node:test");
const assert = require("node:assert/strict");
const expenses = require("../shared/expenses.cjs");

const trip = { id: "t1", start: "2026-09-18T08:00", end: "2026-09-21T18:00" };
const members = [{ id: "a", name: "小王" }, { id: "b", name: "小李" }, { id: "c", name: "小张" }];

test("equal split uses integer cents and stable remainder", () => {
  assert.deepEqual(expenses.equalParts(100, ["a", "b", "c"]), [
    { memberId: "a", amountMinor: 34 }, { memberId: "b", amountMinor: 33 }, { memberId: "c", amountMinor: 33 },
  ]);
});

test("personal expense only charges payer", () => {
  const entry = expenses.normalizeExpense({ date: "2026-09-19", title: "咖啡", amount: "12.50", payerMemberId: "a", splitMode: "personal" }, trip, members, "a");
  assert.equal(entry.amountMinor, 1250);
  assert.deepEqual(entry.participants, [{ memberId: "a", amountMinor: 1250 }]);
  const summary = expenses.buildExpenseSummary([entry], [], members);
  assert.equal(summary.balances.find((x) => x.memberId === "a").netMinor, 0);
  assert.equal(summary.balances.find((x) => x.memberId === "b").netMinor, 0);
});

test("AA summary and greedy settlement plan", () => {
  const entry = expenses.normalizeExpense({ date: "2026-09-19", title: "晚餐", amount: "300", payerMemberId: "a", splitMode: "equal", participants: ["a", "b", "c"] }, trip, members, "a");
  const summary = expenses.buildExpenseSummary([entry], [], members);
  assert.equal(summary.totalMinor, 30000);
  assert.equal(summary.balances.find((x) => x.memberId === "a").netMinor, 20000);
  assert.deepEqual(expenses.buildSettlementPlan(summary), [{ fromMemberId: "b", toMemberId: "a", amountMinor: 10000 }, { fromMemberId: "c", toMemberId: "a", amountMinor: 10000 }]);
});

test("custom amounts must equal total", () => {
  assert.throws(() => expenses.normalizeExpense({ date: "2026-09-19", title: "门票", amount: "100", payerMemberId: "a", splitMode: "custom", participants: [{ memberId: "a", amountMinor: 5000 }, { memberId: "b", amountMinor: 4000 }] }, trip, members, "a"), /自定义分摊金额/);
});

test("expense date is restricted to trip range", () => {
  assert.throws(() => expenses.normalizeExpense({ date: "2026-09-17", title: "晚餐", amount: "10", payerMemberId: "a", splitMode: "personal" }, trip, members, "a"), /日期/);
});

test("summary reports real outstanding debt instead of total spend minus settlements", () => {
  const entry = expenses.normalizeExpense({ date: "2026-09-19", title: "民宿", amount: "300", payerMemberId: "a", splitMode: "equal", participants: ["a", "b", "c"] }, trip, members, "a");
  const summary = expenses.buildExpenseSummary([entry], [], members, { today: "2026-09-19" }, trip);
  assert.equal(summary.totalMinor, 30000);
  assert.equal(summary.outstandingMinor, 20000);
  assert.equal(summary.unsettledMinor, 20000);
  assert.equal(summary.averagePerDayMinor, 15000);
  assert.deepEqual(summary.highestSpendDay, { date: "2026-09-19", amountMinor: 30000, count: 1, categoryTotals: { 其他: 30000 } });
});

test("summary exposes category, date and member statistics while keeping legacy totals", () => {
  const entries = [
    expenses.normalizeExpense({ date: "2026-09-18", title: "午餐", amount: "90", category: "餐饮", payerMemberId: "a", splitMode: "equal", participants: ["a", "b", "c"] }, trip, members, "a"),
    expenses.normalizeExpense({ date: "2026-09-19", title: "停车", amount: "30", category: "自驾用车", payerMemberId: "b", splitMode: "personal" }, trip, members, "b"),
  ];
  const summary = expenses.buildExpenseSummary(entries, [], members, { budgetMinor: 20000, today: "2026-09-19" }, trip);
  assert.equal(summary.categoryTotals["餐饮"], 9000);
  assert.equal(summary.dateTotals["2026-09-19"], 3000);
  assert.deepEqual(summary.categoryStats.map(({ category, count, percent }) => ({ category, count, percent })), [
    { category: "餐饮", count: 1, percent: 75 },
    { category: "自驾用车", count: 1, percent: 25 },
  ]);
  assert.equal(summary.dailyStats.length, 2);
  assert.equal(summary.memberStats.length, 3);
  assert.equal(summary.remainingBudgetMinor, 8000);
});
