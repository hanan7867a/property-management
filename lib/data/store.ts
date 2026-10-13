import { activityLog, documents, expenses, notifications, ownerPayments, plazas, rentEntries, tenants, units } from "@/lib/mock-data";

export const store = {
  plazas,
  units,
  tenants,
  rentEntries,
  expenses,
  ownerPayments,
  documents,
  notifications,
  activityLog,
};

export async function readStore() {
  return store;
}
