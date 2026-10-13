import { can } from "@/lib/permissions";
import { appSettings } from "@/lib/settings";
import { store } from "@/lib/data/store";
import type { Expense, Role } from "@/lib/types";

export async function createExpense(role: Role, input: Omit<Expense, "id" | "status">) {
  if (!can(role, "record_expenses")) throw new Error("Permission denied");
  const status: Expense["status"] = input.amount > appSettings.approvalLimit ? "pending-approval" : "approved";
  const expense: Expense = { ...input, id: `expense-${Date.now()}`, status };
  store.expenses.unshift(expense);
  store.activityLog.unshift({
    id: `log-${Date.now()}`,
    actorId: "accountant-1",
    action: "created expense",
    entity: expense.description,
    plazaId: expense.plazaId,
    before: {},
    after: expense,
    timestamp: new Date().toISOString(),
  });
  return expense;
}
