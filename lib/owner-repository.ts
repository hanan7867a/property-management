import { appSettings } from "@/lib/settings";
import { ownerCanConfirmPayment, ownerCanReviewExpense, ownerCanViewPayment, ownerCanViewPlaza } from "@/lib/permissions";
import { loadSharedTables, readSharedDemoState, writeSharedDemoState, type SharedDemoState } from "@/lib/shared-demo-store";
import type { ActivityLogEntry, AppNotification, Expense, OwnerPayment, Plaza, RentEntry, Unit } from "@/lib/types";

export type OwnerDistribution = {
  plazaId: string;
  month: string;
  gross_share: number;
  partner_expenses: number;
  amount_due: number;
  sent_total: number;
  confirmed_total: number;
  payment_state: "not_sent" | "sent_awaiting_confirmation" | "confirmed" | "disputed";
};

export type PlazaMonthSummary = {
  expected_rent: number;
  collected: number;
  unpaid: number;
  plaza_expenses: number;
  partner_expenses: number;
  pending_expenses: number;
  accountant_pay: number;
  net_profit: number;
};

export type OwnerRentStatus = RentEntry & {
  tenantName: string;
  unitNumber: string;
  is_overdue: boolean;
  days_overdue: number;
};

export type OwnerArrears = {
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  total_arrears: number;
  months_unpaid: number;
  unpaid_months: string[];
  max_days_overdue: number;
};

function monthKey(month: string) {
  return month.slice(0, 7);
}

function plazaVisibleToOwner(plaza: Plaza, ownerId: string): Plaza {
  if (plaza.ownership.type !== "shared") return plaza;
  return {
    ...plaza,
    ownership: {
      ...plaza.ownership,
      shares: plaza.ownership.shares.filter((share) => share.ownerId === ownerId),
    },
  };
}

function rotationOwner(plaza: Plaza, month: string) {
  if (plaza.ownership.type !== "rotation") return undefined;
  const [startYear, startMonth] = plaza.ownership.rotationStartMonth.split("-").map(Number);
  const [year, monthNumber] = monthKey(month).split("-").map(Number);
  const elapsedMonths = (year - startYear) * 12 + monthNumber - startMonth;
  const order = plaza.ownership.rotationOrder;
  return order.length ? order[((elapsedMonths % order.length) + order.length) % order.length] : undefined;
}

function accountOwnerShare(plaza: Plaza, ownerId: string, month: string, net: number) {
  if (plaza.ownership.type === "single") return plaza.ownership.ownerId === ownerId ? net : 0;
  if (plaza.ownership.type === "rotation") return rotationOwner(plaza, month) === ownerId ? net : 0;
  const share = plaza.ownership.shares.find((item) => item.ownerId === ownerId)?.percent ?? 0;
  return Math.round((net * share) / 100);
}

function activePaid(entry: RentEntry) {
  return entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
}

function monthExpenses(state: SharedDemoState, plazaId: string, month: string) {
  return state.expenses.filter((expense) => expense.plazaId === plazaId && expense.date.startsWith(monthKey(month)));
}

function ensureOpenMonth(month: string) {
  if (appSettings.closedMonths.includes(monthKey(month))) {
    throw new Error("This month is closed. Owner actions are read-only.");
  }
}

function appendOwnerEvent(
  state: SharedDemoState,
  ownerId: string,
  action: string,
  entity: string,
  plazaId: string,
  notificationTitle: string,
  notificationBody: string,
) {
  const timestamp = new Date().toISOString();
  state.activityLog = [{
    id: `owner-log-${Date.now()}`,
    actorId: ownerId,
    action,
    entity,
    plazaId,
    timestamp,
  }, ...state.activityLog];
  state.notifications = [{
    id: `owner-notification-${Date.now()}`,
    type: "owner-payment",
    title: notificationTitle,
    body: notificationBody,
    createdAt: timestamp,
    read: false,
    ownerId,
    plazaId,
  }, ...state.notifications];
}

/** Loads only this owner's plazas and the records that belong to them. Already loaded tables are skipped. */
export async function loadOwnerData(ownerId: string): Promise<void> {
  await loadSharedTables(["owners", "plazas"]);
  const plazaIds = readSharedDemoState().plazas.filter((plaza) => ownerCanViewPlaza(plaza, ownerId)).map((plaza) => plaza.id);
  await loadSharedTables(["units", "rent_entries", "expenses", "owner_payments", "documents", "notifications", "activity_log"], { plazaIds, ownerId, lean: true });
  const plazaIdSet = new Set(plazaIds);
  const unitIds = readSharedDemoState().units.filter((unit) => plazaIdSet.has(unit.plazaId)).map((unit) => unit.id);
  await loadSharedTables(["tenants"], { unitIds, lean: true });
}

export function createOwnerRepositories(ownerId: string) {
  function ownerName(state: SharedDemoState) {
    return state.owners.find((item) => item.id === ownerId)?.name ?? "Owner";
  }

  function ownedPlazas(state: SharedDemoState) {
    return state.plazas.filter((plaza) => ownerCanViewPlaza(plaza, ownerId));
  }

  function distributionFor(state: SharedDemoState, plaza: Plaza, month: string): OwnerDistribution {
    const entries = state.rentEntries.filter((entry) =>
      entry.plazaId === plaza.id && monthKey(entry.month) === monthKey(month) && entry.status !== "vacant"
    );
    const collected = entries.reduce((sum, entry) => sum + activePaid(entry), 0);
    const expenses = monthExpenses(state, plaza.id, month);
    const approved = expenses.filter((expense) => expense.status === "approved");
    const plazaExpenses = approved.filter((expense) => expense.chargeTo === "plaza").reduce((sum, expense) => sum + expense.amount, 0);
    const directOwnerExpenses = approved
      .filter((expense) => expense.chargeTo !== "plaza" && expense.chargeTo.ownerId === ownerId)
      .reduce((sum, expense) => sum + expense.amount, 0);
    const accountantPay = collected > 0
      ? appSettings.accountantTerms.type === "fixed"
        ? appSettings.accountantTerms.amount
        : Math.round(collected * appSettings.accountantTerms.amount / 100)
      : 0;
    const beforeOwnerDeduction = Math.max(0, collected - plazaExpenses - accountantPay);
    const share = accountOwnerShare(plaza, ownerId, month, beforeOwnerDeduction);
    const due = Math.max(0, share - directOwnerExpenses);
    const payments = state.ownerPayments.filter((payment) =>
      payment.ownerId === ownerId && payment.plazaId === plaza.id && monthKey(payment.month) === monthKey(month)
    );
    const sent = payments.reduce((sum, payment) =>
      payment.status === "sent-awaiting-confirmation" || payment.status === "confirmed-received"
        ? sum + payment.amountSent
        : sum, 0
    );
    const confirmed = payments.reduce((sum, payment) =>
      payment.status === "confirmed-received" ? sum + payment.amountSent : sum, 0
    );
    const paymentState: OwnerDistribution["payment_state"] = payments.some((payment) => payment.status === "disputed")
      ? "disputed"
      : due > 0 && confirmed >= due
        ? "confirmed"
        : sent > 0
          ? "sent_awaiting_confirmation"
          : "not_sent";
    return {
      plazaId: plaza.id,
      month: monthKey(month),
      gross_share: share,
      partner_expenses: directOwnerExpenses,
      amount_due: due,
      sent_total: sent,
      confirmed_total: confirmed,
      payment_state: paymentState,
    };
  }

  function updateState(mutator: (state: SharedDemoState) => void) {
    const state = readSharedDemoState();
    mutator(state);
    writeSharedDemoState(state);
    return state;
  }

  return {
    ownerRepo: {
      async getMyDistribution(month: string) {
        const state = readSharedDemoState();
        return ownedPlazas(state).map((plaza) => distributionFor(state, plaza, month));
      },
      async getPendingApprovals() {
        const state = readSharedDemoState();
        const plazaIds = new Set(ownedPlazas(state).map((plaza) => plaza.id));
        return {
          payments_to_confirm: state.ownerPayments.filter((payment) =>
            ownerCanViewPayment(payment, ownerId, plazaIds) && payment.status === "sent-awaiting-confirmation"
          ).length,
          expenses_to_approve: state.expenses.filter((expense) =>
            expense.status === "pending-approval" && ownerCanReviewExpense(expense, ownerId, plazaIds)
          ).length,
        };
      },
    },
    ownerPaymentRepo: {
      async listForMe(filters: { month?: string; plazaId?: string } = {}) {
        const allowedPlazas = new Set(ownedPlazas(readSharedDemoState()).map((plaza) => plaza.id));
        return readSharedDemoState().ownerPayments.filter((payment) =>
          ownerCanViewPayment(payment, ownerId, allowedPlazas) &&
          (!filters.month || monthKey(payment.month) === monthKey(filters.month)) &&
          (!filters.plazaId || payment.plazaId === filters.plazaId)
        );
      },
      async confirm(id: string) {
        let changed!: OwnerPayment;
        const state = updateState((current) => {
          const payment = current.ownerPayments.find((item) => item.id === id && item.ownerId === ownerId);
          if (!payment) throw new Error("This payment is not available to your account.");
          ensureOpenMonth(payment.month);
          if (!ownerCanConfirmPayment(payment, ownerId)) throw new Error("Only a payment waiting for confirmation can be confirmed.");
          payment.status = "confirmed-received";
          payment.confirmedAt = new Date().toISOString();
          changed = payment;
          const plaza = current.plazas.find((item) => item.id === payment.plazaId);
          appendOwnerEvent(current, ownerId, "confirmed owner payment", `${plaza?.name ?? "Plaza"} ${payment.month}`, payment.plazaId, "Owner confirmed payment", `${ownerName(current)} confirmed receipt of ${payment.amountSent}.`);
        });
        return { payment: changed, state };
      },
      async dispute(id: string, reason: string) {
        const trimmedReason = reason.trim();
        if (!trimmedReason) throw new Error("A reason is required to report a payment problem.");
        let changed!: OwnerPayment;
        const state = updateState((current) => {
          const payment = current.ownerPayments.find((item) => item.id === id && item.ownerId === ownerId);
          if (!payment) throw new Error("This payment is not available to your account.");
          ensureOpenMonth(payment.month);
          if (!ownerCanConfirmPayment(payment, ownerId)) throw new Error("Only a payment waiting for confirmation can be disputed.");
          payment.status = "disputed";
          payment.disputeReason = trimmedReason;
          changed = payment;
          const plaza = current.plazas.find((item) => item.id === payment.plazaId);
          appendOwnerEvent(current, ownerId, "reported owner payment problem", `${plaza?.name ?? "Plaza"} ${payment.month}`, payment.plazaId, "Owner reported a payment problem", `${ownerName(current)}: ${trimmedReason}`);
        });
        return { payment: changed, state };
      },
    },
    expenseRepo: {
      async listForPlaza(filters: { plazaId?: string; month?: string } = {}) {
        const state = readSharedDemoState();
        const allowedPlazas = new Set(ownedPlazas(state).map((plaza) => plaza.id));
        return state.expenses.filter((expense) =>
          ownerCanReviewExpense(expense, ownerId, allowedPlazas) &&
          (!filters.plazaId || expense.plazaId === filters.plazaId) &&
          (!filters.month || expense.date.startsWith(monthKey(filters.month)))
        );
      },
      async approve(id: string) {
        return updateState((state) => {
          const expense = state.expenses.find((item) => item.id === id);
          authorizeExpense(state, expense, ownerId);
          if (expense.status !== "pending-approval") throw new Error("Only expenses waiting for owner approval can be approved.");
          ensureOpenMonth(expense.date);
          expense.status = "approved";
          appendOwnerEvent(state, ownerId, "approved expense", expense.description, expense.plazaId, "Expense approved", `${ownerName(state)} approved ${expense.description}.`);
        });
      },
      async reject(id: string, reason: string) {
        const trimmedReason = reason.trim();
        if (!trimmedReason) throw new Error("A reason is required to reject an expense.");
        return updateState((state) => {
          const expense = state.expenses.find((item) => item.id === id);
          authorizeExpense(state, expense, ownerId);
          if (expense.status !== "pending-approval") throw new Error("Only expenses waiting for owner approval can be rejected.");
          ensureOpenMonth(expense.date);
          expense.status = "rejected";
          expense.rejectionReason = trimmedReason;
          appendOwnerEvent(state, ownerId, "rejected expense", expense.description, expense.plazaId, "Expense rejected", `${ownerName(state)}: ${trimmedReason}`);
        });
      },
    },
    plazaRepo: {
      async listForMe() {
        return ownedPlazas(readSharedDemoState()).map((plaza) => plazaVisibleToOwner(plaza, ownerId));
      },
      async getMonthSummary(plazaId: string, month: string): Promise<PlazaMonthSummary> {
        const state = readSharedDemoState();
        const plaza = ownedPlazas(state).find((item) => item.id === plazaId);
        if (!plaza) throw new Error("This plaza is not available to your account.");
        const rows = state.rentEntries.filter((entry) =>
          entry.plazaId === plazaId && monthKey(entry.month) === monthKey(month) && entry.status !== "vacant"
        );
        const expenses = monthExpenses(state, plazaId, month);
        const approved = expenses.filter((expense) => expense.status === "approved");
        const collected = rows.reduce((sum, entry) => sum + activePaid(entry), 0);
        const plazaExpenses = approved.filter((expense) => expense.chargeTo === "plaza").reduce((sum, expense) => sum + expense.amount, 0);
        const directExpenses = approved
          .filter((expense) => expense.chargeTo !== "plaza" && expense.chargeTo.ownerId === ownerId)
          .reduce((sum, expense) => sum + expense.amount, 0);
        const accountantPay = collected > 0
          ? appSettings.accountantTerms.type === "fixed" ? appSettings.accountantTerms.amount : Math.round(collected * appSettings.accountantTerms.amount / 100)
          : 0;
        return {
          expected_rent: rows.reduce((sum, entry) => sum + entry.dueAmount + entry.carriedForward, 0),
          collected,
          unpaid: rows.reduce((sum, entry) => sum + Math.max(0, entry.dueAmount + entry.carriedForward - activePaid(entry)), 0),
          plaza_expenses: plazaExpenses,
          partner_expenses: directExpenses,
          pending_expenses: expenses.filter((expense) => expense.status === "pending-approval").reduce((sum, expense) => sum + expense.amount, 0),
          accountant_pay: accountantPay,
          net_profit: Math.max(0, collected - plazaExpenses - accountantPay),
        };
      },
    },
    unitRepo: {
      async getOverview(plazaId: string): Promise<Unit[]> {
        const state = readSharedDemoState();
        if (!ownedPlazas(state).some((plaza) => plaza.id === plazaId)) throw new Error("This plaza is not available to your account.");
        return state.units.filter((unit) => unit.plazaId === plazaId);
      },
    },
    rentRepo: {
      async getStatus(plazaId: string, month: string): Promise<OwnerRentStatus[]> {
        const state = readSharedDemoState();
        if (!ownedPlazas(state).some((plaza) => plaza.id === plazaId)) throw new Error("This plaza is not available to your account.");
        const today = new Date().toISOString().slice(0, 10);
        return state.rentEntries
          .filter((entry) => entry.plazaId === plazaId && monthKey(entry.month) === monthKey(month) && entry.status !== "vacant")
          .map((entry) => {
            const unit = state.units.find((item) => item.id === entry.unitId);
            const tenant = state.tenants.find((item) => item.id === entry.tenantId);
            const isOverdue = activePaid(entry) < entry.dueAmount + entry.carriedForward && `${entry.month}-01` < today;
            const daysOverdue = isOverdue ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${entry.month}-01T00:00:00Z`)) / 86400000) : 0;
            return { ...entry, tenantName: tenant?.name ?? "Former tenant", unitNumber: unit?.number ?? "—", is_overdue: isOverdue, days_overdue: daysOverdue };
          });
      },
      async getArrears(plazaId: string): Promise<OwnerArrears[]> {
        const state = readSharedDemoState();
        if (!ownedPlazas(state).some((plaza) => plaza.id === plazaId)) throw new Error("This plaza is not available to your account.");
        const byTenant = new Map<string, OwnerArrears>();
        for (const entry of state.rentEntries.filter((row) => row.plazaId === plazaId && row.status !== "vacant")) {
          const balance = Math.max(0, entry.dueAmount + entry.carriedForward - activePaid(entry));
          if (!balance) continue;
          const tenant = state.tenants.find((item) => item.id === entry.tenantId);
          const unit = state.units.find((item) => item.id === entry.unitId);
          const prior = byTenant.get(entry.tenantId) ?? {
            tenantId: entry.tenantId,
            tenantName: tenant?.name ?? "Former tenant",
            unitNumber: unit?.number ?? "—",
            total_arrears: 0,
            months_unpaid: 0,
            unpaid_months: [],
            max_days_overdue: 0,
          };
          prior.total_arrears += balance;
          prior.months_unpaid += 1;
          prior.unpaid_months.push(entry.month);
          const days = Math.max(0, Math.floor((Date.now() - Date.parse(`${entry.month}-01T00:00:00Z`)) / 86400000));
          prior.max_days_overdue = Math.max(prior.max_days_overdue, days);
          byTenant.set(entry.tenantId, prior);
        }
        return Array.from(byTenant.values()).map((row) => ({ ...row, unpaid_months: [...row.unpaid_months].sort() })).sort((a, b) => b.total_arrears - a.total_arrears);
      },
    },
    notificationRepo: {
      async listForMe(): Promise<AppNotification[]> {
        const state = readSharedDemoState();
        const plazaIds = new Set(ownedPlazas(state).map((plaza) => plaza.id));
        const hiddenPlazaNames = state.plazas.filter((plaza) => !plazaIds.has(plaza.id)).map((plaza) => plaza.name);
        return state.notifications.filter((notification) => {
          if (notification.ownerId) return notification.ownerId === ownerId;
          if (notification.type === "owner-payment") return notification.body.includes(ownerName(state)) || notification.title.includes(ownerName(state));
          if (notification.plazaId) return plazaIds.has(notification.plazaId);
          return !hiddenPlazaNames.some((name) => `${notification.title} ${notification.body}`.includes(name));
        });
      },
    },
    activityRepo: {
      async listForMe(filters: { plazaId?: string } = {}): Promise<ActivityLogEntry[]> {
        const state = readSharedDemoState();
        const plazaIds = new Set(ownedPlazas(state).map((plaza) => plaza.id));
        return state.activityLog.filter((entry) => {
          if (!entry.plazaId || !plazaIds.has(entry.plazaId) || (filters.plazaId && entry.plazaId !== filters.plazaId)) return false;
          const description = `${entry.action} ${entry.entity}`;
          const paymentEvent = /owner payment|payment sent|payment confirmed|transfer/i.test(description);
          return !paymentEvent || entry.actorId === ownerId || description.includes(ownerName(state));
        }).map((entry) => ({ ...entry, before: undefined, after: undefined }));
      },
    },
    async saveMutationState(state: SharedDemoState) {
      writeSharedDemoState(state);
    },
  };
}

function authorizeExpense(state: SharedDemoState, expense: Expense | undefined, ownerId: string): asserts expense is Expense {
  if (!expense) throw new Error("This expense no longer exists.");
  const ownedPlazaIds = new Set(state.plazas.filter((plaza) => ownerCanViewPlaza(plaza, ownerId)).map((plaza) => plaza.id));
  if (!ownerCanReviewExpense(expense, ownerId, ownedPlazaIds)) throw new Error("This expense is not available to your account.");
}
