import type { Expense, Plaza } from "@/lib/types";

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

export function distributeNet(plaza: Plaza, month: string, net: number, sourceExpenses: Expense[]) {
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

export function lostRent(unitRent: number, vacantDays: number) {
  return Math.round((unitRent / 30) * vacantDays);
}
