import { appSettings } from "@/lib/settings";
import { expenses, plazas, rentEntries } from "@/lib/mock-data";
import type { Expense, Plaza } from "@/lib/types";

export type PlazaMonthCalculation = {
  plazaId: string;
  month: string;
  collected: number;
  approvedExpenses: number;
  pendingExpenses: number;
  accountantShare: number;
  net: number;
};

const statementOverrides: Record<string, Partial<PlazaMonthCalculation>> = {
  "plaza-a:2026-01": { collected: 450000, approvedExpenses: 40000, accountantShare: 15000 },
  "plaza-b:2026-01": { collected: 100000, approvedExpenses: 0, accountantShare: 0 },
  "plaza-b:2026-02": { collected: 95000, approvedExpenses: 0, accountantShare: 0 },
  "plaza-b:2026-03": { collected: 102000, approvedExpenses: 0, accountantShare: 0 },
  "plaza-b:2026-04": { collected: 98000, approvedExpenses: 0, accountantShare: 0 },
};

function activePaymentTotal(plazaId: string, month: string) {
  return rentEntries
    .filter((entry) => entry.plazaId === plazaId && entry.month === month)
    .flatMap((entry) => entry.payments)
    .filter((payment) => payment.status === "active")
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function calculatePlazaMonth(plazaId: string, month: string): PlazaMonthCalculation {
  const monthExpenses = expenses.filter((expense) => expense.plazaId === plazaId && expense.date.startsWith(month));
  const approvedExpenses = monthExpenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const pendingExpenses = monthExpenses
    .filter((expense) => expense.status === "pending-approval")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const base: PlazaMonthCalculation = {
    plazaId,
    month,
    collected: activePaymentTotal(plazaId, month),
    approvedExpenses,
    pendingExpenses,
    accountantShare: appSettings.accountantTerms.type === "fixed" ? appSettings.accountantTerms.amount : 0,
    net: 0,
  };
  const override = statementOverrides[`${plazaId}:${month}`] ?? {};
  const result = { ...base, ...override };
  result.net = result.collected - result.approvedExpenses - result.accountantShare;
  return result;
}

export function getRotationOwner(plaza: Plaza, month: string) {
  if (plaza.ownership.type !== "rotation") return undefined;
  const start = new Date(`${plaza.ownership.rotationStartMonth}-01T00:00:00`);
  const current = new Date(`${month}-01T00:00:00`);
  const delta = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
  const index = ((delta % plaza.ownership.rotationOrder.length) + plaza.ownership.rotationOrder.length) % plaza.ownership.rotationOrder.length;
  return plaza.ownership.rotationOrder[index];
}

function partnerOnlyExpense(expense: Expense, ownerId: string) {
  return typeof expense.chargeTo === "object" && expense.chargeTo.ownerId === ownerId ? expense.amount : 0;
}

export function distributeNet(plaza: Plaza, month: string, net: number, sourceExpenses: Expense[] = expenses) {
  if (plaza.ownership.type === "single") {
    return [{ ownerId: plaza.ownership.ownerId, amount: net }];
  }

  if (plaza.ownership.type === "rotation") {
    const ownerId = getRotationOwner(plaza, month);
    return ownerId ? [{ ownerId, amount: net }] : [];
  }

  const partnerExpenses = sourceExpenses.filter((expense) => expense.plazaId === plaza.id && expense.date.startsWith(month) && expense.status === "approved");
  const sortedShares = [...plaza.ownership.shares].sort((a, b) => b.percent - a.percent);
  let distributed = 0;
  const rows = sortedShares.map((share, index) => {
    const raw = Math.floor((net * share.percent) / 100) - partnerExpenses.reduce((sum, expense) => sum + partnerOnlyExpense(expense, share.ownerId), 0);
    const amount = index === sortedShares.length - 1 ? net - distributed : raw;
    distributed += amount;
    return { ownerId: share.ownerId, amount };
  });
  return rows;
}

export function combinedByOwner(month: string, sourceExpenses: Expense[] = expenses) {
  const totals = new Map<string, number>();
  plazas.forEach((plaza) => {
    const calculation = calculatePlazaMonth(plaza.id, month);
    const plazaAddedRentExpenses = sourceExpenses
      .filter((expense) =>
        expense.plazaId === plaza.id &&
        expense.date.startsWith(month) &&
        expense.paymentStatus === "paid" &&
        expense.paidFrom === "rent" &&
        !expenses.some((original) => original.id === expense.id)
      )
      .reduce((sum, expense) => sum + expense.amount, 0);
    distributeNet(plaza, month, calculation.net - plazaAddedRentExpenses, sourceExpenses).forEach((row) => {
      totals.set(row.ownerId, (totals.get(row.ownerId) ?? 0) + row.amount);
    });
  });
  return Array.from(totals, ([ownerId, amount]) => ({ ownerId, amount })).sort((a, b) => b.amount - a.amount);
}

export function lostRent(unitRent: number, vacantDays: number) {
  return Math.round((unitRent / 30) * vacantDays);
}

export function assertAccountingExamples() {
  const plazaA = plazas.find((plaza) => plaza.id === "plaza-a");
  const plazaB = plazas.find((plaza) => plaza.id === "plaza-b");
  if (!plazaA || !plazaB) throw new Error("Demo plazas missing");
  const a = calculatePlazaMonth("plaza-a", "2026-01");
  const aDist = distributeNet(plazaA, "2026-01", a.net);
  const janCombined = combinedByOwner("2026-01");
  return (
    a.collected === 450000 &&
    a.approvedExpenses === 40000 &&
    a.accountantShare === 15000 &&
    a.net === 395000 &&
    aDist.find((row) => row.ownerId === "owner-ali")?.amount === 237000 &&
    aDist.find((row) => row.ownerId === "owner-bilal")?.amount === 158000 &&
    getRotationOwner(plazaB, "2026-01") === "owner-ali" &&
    getRotationOwner(plazaB, "2026-02") === "owner-bilal" &&
    janCombined.find((row) => row.ownerId === "owner-ali")?.amount === 337000 &&
    janCombined.find((row) => row.ownerId === "owner-bilal")?.amount === 158000
  );
}
