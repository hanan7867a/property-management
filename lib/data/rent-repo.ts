import { can } from "@/lib/permissions";
import { store } from "@/lib/data/store";
import type { PaymentMethod, Role } from "@/lib/types";

export async function getMonth(month: string) {
  return store.rentEntries.filter((entry) => entry.month === month);
}

export async function recordPayment(input: {
  role: Role;
  rentEntryId: string;
  amount: number;
  method: PaymentMethod;
  receivedBy?: string;
  reference?: string;
}) {
  if (!can(input.role, "record_rent")) throw new Error("Permission denied");
  const entry = store.rentEntries.find((item) => item.id === input.rentEntryId);
  if (!entry) throw new Error("Rent entry not found");
  const before = { status: entry.status, payments: entry.payments.length };
  const nextPayment = {
    id: `payment-${Date.now()}`,
    amount: input.amount,
    date: new Date().toISOString().slice(0, 10),
    method: input.method,
    receivedBy: input.receivedBy,
    reference: input.reference,
    status: "active" as const,
  };
  entry.payments = [...entry.payments, nextPayment];
  const paid = entry.payments.reduce((sum, payment) => (payment.status === "active" ? sum + payment.amount : sum), 0);
  entry.status = paid >= entry.dueAmount + entry.carriedForward ? "paid" : "partly-paid";
  store.activityLog.unshift({
    id: `log-${Date.now()}`,
    actorId: "accountant-1",
    action: "recorded rent",
    entity: entry.id,
    plazaId: entry.plazaId,
    before,
    after: { status: entry.status, paid },
    timestamp: new Date().toISOString(),
  });
  return entry;
}
