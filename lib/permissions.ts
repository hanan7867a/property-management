import type { Expense, OwnerPayment, Plaza, Role } from "@/lib/types";

type Action =
  | "add_tenants"
  | "edit_units"
  | "record_rent"
  | "record_expenses"
  | "upload_documents"
  | "send_reminders"
  | "use_calculator"
  | "view_vacancies"
  | "cancel_financial_entry"
  | "delete_financial_entry"
  | "change_owner_shares"
  | "close_months"
  | "finalise_large_expense"
  | "confirm_received_payment"
  | "report_payment_problem"
  | "approve_owner_expense"
  | "reject_owner_expense";

const rolePermissions: Record<Role, Set<Action>> = {
  accountant: new Set([
    "add_tenants",
    "edit_units",
    "record_rent",
    "record_expenses",
    "upload_documents",
    "send_reminders",
    "use_calculator",
    "view_vacancies",
    "cancel_financial_entry",
  ]),
  admin: new Set(["change_owner_shares", "close_months", "finalise_large_expense"]),
  owner: new Set(["confirm_received_payment", "report_payment_problem", "approve_owner_expense", "reject_owner_expense"]),
};

export function can(role: Role, action: Action) {
  if (action === "delete_financial_entry") return false;
  return rolePermissions[role].has(action);
}

export function ownerCanViewPlaza(plaza: Plaza, ownerId: string) {
  if (plaza.ownership.type === "single") return plaza.ownership.ownerId === ownerId;
  if (plaza.ownership.type === "shared") return plaza.ownership.shares.some((share) => share.ownerId === ownerId);
  return plaza.ownership.rotationOrder.includes(ownerId);
}

export function ownerCanViewPayment(payment: OwnerPayment, ownerId: string, plazaIds: ReadonlySet<string>) {
  return payment.ownerId === ownerId && plazaIds.has(payment.plazaId);
}

export function ownerCanConfirmPayment(payment: OwnerPayment, ownerId: string) {
  return payment.ownerId === ownerId && payment.status === "sent-awaiting-confirmation";
}

export function ownerCanReviewExpense(expense: Expense, ownerId: string, ownedPlazaIds: ReadonlySet<string>) {
  const personallyCharged = expense.chargeTo !== "plaza" && expense.chargeTo.ownerId === ownerId;
  return ownedPlazaIds.has(expense.plazaId) && (expense.chargeTo === "plaza" || personallyCharged);
}
