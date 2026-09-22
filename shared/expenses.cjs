const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const DEFAULT_EXPENSE_CATEGORIES = ["餐饮", "交通", "住宿", "门票", "购物", "其他"];
const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "HKD", "KRW", "GBP", "AUD", "CAD", "SGD"];
const VALID_SPLIT_MODES = ["personal", "equal", "custom"];
const clean = (value, max = 120) => String(value ?? "").trim().slice(0, max);
const dateOnly = (value) => String(value || "").slice(0, 10);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function toMinor(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Object.assign(new Error("金额格式不正确"), { status: 400 });
  const [whole, decimals = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number((decimals + "00").slice(0, 2));
  if (!Number.isSafeInteger(minor) || minor <= 0) throw Object.assign(new Error("金额必须大于 0"), { status: 400 });
  return minor;
}
const formatMinor = (minor, currency = "CNY") => `${currency === "JPY" ? Math.round(minor / 100) : (Number(minor || 0) / 100).toFixed(2)}`;

function equalParts(total, memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!ids.length) throw Object.assign(new Error("请选择参与分账成员"), { status: 400 });
  const base = Math.floor(total / ids.length);
  let remainder = total - base * ids.length;
  return ids.map((memberId) => ({ memberId, amountMinor: base + (remainder-- > 0 ? 1 : 0) }));
}

function validateExpenseInput(input, trip, members) {
  const date = dateOnly(input.date);
  if (!validDate(date) || date < dateOnly(trip.start) || date > dateOnly(trip.end)) throw Object.assign(new Error("费用日期必须在旅行日期范围内"), { status: 400 });
  const amountMinor = input.amountMinor != null ? toMinor(input.amountMinor) : toMinor(input.amount);
  const currency = clean(input.currency || "CNY", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error("币种格式不正确"), { status: 400 });
  const rate = Number(input.exchangeRateToBase == null || input.exchangeRateToBase === "" ? 1 : input.exchangeRateToBase);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw Object.assign(new Error("汇率必须大于 0"), { status: 400 });
  const memberIds = new Set((members || []).map((member) => member.id));
  const payerMemberId = input.payerMemberId || members?.[0]?.id;
  if (!memberIds.has(payerMemberId)) throw Object.assign(new Error("付款成员无效"), { status: 400 });
  const splitMode = input.splitMode || (input.isAA === false ? "personal" : "equal");
  if (!VALID_SPLIT_MODES.includes(splitMode)) throw Object.assign(new Error("分账方式无效"), { status: 400 });
  const participants = Array.isArray(input.participants) ? input.participants : [];
  const selected = participants.map((part) => typeof part === "string" ? ({ memberId: part }) : part).filter((part) => memberIds.has(part.memberId));
  let normalizedParticipants;
  if (splitMode === "personal") normalizedParticipants = [{ memberId: payerMemberId, amountMinor }];
  else if (splitMode === "equal") normalizedParticipants = equalParts(amountMinor, selected.length ? selected.map((part) => part.memberId) : members.map((member) => member.id));
  else {
    normalizedParticipants = selected.map((part) => ({ memberId: part.memberId, amountMinor: toMinor(part.amountMinor ?? part.amount) }));
    if (!normalizedParticipants.length || normalizedParticipants.reduce((sum, part) => sum + part.amountMinor, 0) !== amountMinor) throw Object.assign(new Error("自定义分摊金额必须等于费用总额"), { status: 400 });
  }
  return {
    date, title: clean(input.title || input.what, 120) || "未命名消费", amountMinor, currency,
    exchangeRateToBase: rate, baseAmountMinor: Math.round(amountMinor * rate),
    category: clean(input.category || "其他", 40), payerMemberId, splitMode,
    participants: normalizedParticipants, note: clean(input.note, 500), receiptFileId: clean(input.receiptFileId, 300),
  };
}

function normalizeExpense(input, trip, members, currentMemberId, existing) {
  const data = validateExpenseInput(input, trip, members);
  const createdAt = existing?.createdAt || input.createdAt || Date.now();
  return { ...existing, ...data, id: existing?.id || input.id || id(), tripId: trip.id, createdByMemberId: existing?.createdByMemberId || currentMemberId, createdAt, updatedAt: Date.now() };
}

function buildExpenseSummary(expenses, settlements, members, settings = {}) {
  const memberMap = new Map((members || []).map((member) => [member.id, member]));
  const baseCurrency = settings.baseCurrency || "CNY";
  const balances = new Map((members || []).map((member) => [member.id, { memberId: member.id, name: member.name, avatarId: member.avatarId, paidMinor: 0, owedMinor: 0, netMinor: 0 }]));
  let totalMinor = 0;
  for (const expense of expenses || []) {
    totalMinor += Number(expense.baseAmountMinor || expense.amountMinor || 0);
    const payer = balances.get(expense.payerMemberId);
    if (payer) payer.paidMinor += Number(expense.baseAmountMinor || expense.amountMinor || 0);
    for (const part of expense.participants || []) {
      const entry = balances.get(part.memberId);
      if (entry) entry.owedMinor += Math.round(Number(part.amountMinor || 0) * Number(expense.exchangeRateToBase || 1));
    }
  }
  for (const entry of balances.values()) entry.netMinor = entry.paidMinor - entry.owedMinor;
  let settledMinor = 0;
  for (const settlement of settlements || []) {
    const amount = Number(settlement.amountMinor || 0) * Number(settlement.exchangeRateToBase || 1);
    settledMinor += amount;
    const from = balances.get(settlement.fromMemberId), to = balances.get(settlement.toMemberId);
    if (from) from.netMinor += amount;
    if (to) to.netMinor -= amount;
  }
  const budgetMinor = settings.budgetMinor == null || settings.budgetMinor === "" ? null : Number(settings.budgetMinor);
  const categoryTotals = {};
  const dateTotals = {};
  for (const expense of expenses || []) {
    const amount = Number(expense.baseAmountMinor || expense.amountMinor || 0);
    categoryTotals[expense.category || "其他"] = (categoryTotals[expense.category || "其他"] || 0) + amount;
    dateTotals[dateOnly(expense.date)] = (dateTotals[dateOnly(expense.date)] || 0) + amount;
  }
  return { baseCurrency, totalMinor, settledMinor, unsettledMinor: Math.max(0, totalMinor - settledMinor), budgetMinor, remainingBudgetMinor: budgetMinor == null ? null : budgetMinor - totalMinor, balances: [...balances.values()], categoryTotals, dateTotals, memberCountPending: [...balances.values()].filter((entry) => entry.netMinor !== 0).length };
}

function buildSettlementPlan(summary) {
  const creditors = summary.balances.filter((entry) => entry.netMinor > 0).map((entry) => ({ ...entry, amount: entry.netMinor })).sort((a, b) => b.amount - a.amount);
  const debtors = summary.balances.filter((entry) => entry.netMinor < 0).map((entry) => ({ ...entry, amount: -entry.netMinor })).sort((a, b) => b.amount - a.amount);
  const plan = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) plan.push({ fromMemberId: debtors[i].memberId, toMemberId: creditors[j].memberId, amountMinor: amount });
    debtors[i].amount -= amount; creditors[j].amount -= amount;
    if (!debtors[i].amount) i++; if (!creditors[j].amount) j++;
  }
  return plan;
}

module.exports = { CURRENCIES, DEFAULT_EXPENSE_CATEGORIES, toMinor, formatMinor, equalParts, validateExpenseInput, normalizeExpense, buildExpenseSummary, buildSettlementPlan };
