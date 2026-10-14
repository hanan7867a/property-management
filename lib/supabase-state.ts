import { createClient } from "@/utils/supabase/client";
import type {
  ActivityLogEntry,
  AppNotification,
  Document,
  Expense,
  Owner,
  OwnerPayment,
  Payment,
  Plaza,
  RentEntry,
  Tenant,
  Unit,
} from "@/lib/types";

// Maps the app's camelCase state to the snake_case tables in supabase/migrations/002_app_schema.sql
// and supabase/migrations/005_owners_table.sql.

export type AppState = {
  owners: Owner[];
  plazas: Plaza[];
  tenants: Tenant[];
  units: Unit[];
  rentEntries: RentEntry[];
  expenses: Expense[];
  ownerPayments: OwnerPayment[];
  documents: Document[];
  notifications: AppNotification[];
  activityLog: ActivityLogEntry[];
};

type Row = Record<string, unknown> & { id: string };
export type TableRows = Record<string, Map<string, string>>;

// Order matters only for readability; the schema has no foreign keys.
const tables = ["owners", "plazas", "units", "tenants", "rent_entries", "payments", "expenses", "owner_payments", "documents", "notifications", "activity_log"] as const;
type Table = (typeof tables)[number];

const orNull = <T,>(value: T | undefined) => value ?? null;
const orUndef = <T,>(value: T | null | undefined) => value ?? undefined;

function toRows(state: AppState): Record<Table, Row[]> {
  return {
    owners: state.owners.map((o) => ({ id: o.id, name: o.name, phone: o.phone, bank: o.bank, accounts: orNull(o.accounts) })),
    plazas: state.plazas.map((p) => ({ id: p.id, name: p.name, address: p.address, floors: p.floors, ownership: p.ownership, photo_seed: p.photoSeed })),
    units: state.units.map((u) => ({
      id: u.id, plaza_id: u.plazaId, number: u.number, type: u.type, type_name: orNull(u.typeName), floor: u.floor,
      size_sqft: u.sizeSqFt, monthly_rent: u.monthlyRent, status: u.status, tenant_id: orNull(u.tenantId),
      notes: orNull(u.notes), vacant_since: orNull(u.vacantSince),
    })),
    tenants: state.tenants.map((t) => ({
      id: t.id, name: t.name, phone: t.phone, cnic: t.cnic, cnic_front_url: orNull(t.cnicFrontUrl), cnic_back_url: orNull(t.cnicBackUrl),
      agreement_url: orNull(t.agreementUrl), unit_id: t.unitId, monthly_rent: orNull(t.monthlyRent), advance: t.advance,
      tenancy_period_months: orNull(t.tenancyPeriodMonths), note: orNull(t.note), agreement_start: t.agreementStart,
      agreement_end: orNull(t.agreementEnd), rent_increase: orNull(t.rentIncrease), status: t.status, vacated_at: orNull(t.vacatedAt),
    })),
    rent_entries: state.rentEntries.map((e) => ({
      id: e.id, unit_id: e.unitId, tenant_id: e.tenantId, plaza_id: e.plazaId, month: e.month,
      due_amount: e.dueAmount, status: e.status, carried_forward: e.carriedForward,
    })),
    payments: state.rentEntries.flatMap((e) => e.payments.map((p) => ({
      id: p.id, rent_entry_id: e.id, amount: p.amount, date: p.date, method: p.method, received_by: orNull(p.receivedBy),
      reference: orNull(p.reference), receipt_url: orNull(p.receiptUrl), status: p.status, cancel_reason: orNull(p.cancelReason),
    }))),
    expenses: state.expenses.map((x) => ({
      id: x.id, plaza_id: x.plazaId, unit_id: orNull(x.unitId), category: x.category, amount: x.amount, date: x.date,
      description: x.description, bill_url: x.billUrl ?? "", payment_status: orNull(x.paymentStatus), payment_method: orNull(x.paymentMethod),
      paid_by: orNull(x.paidBy), paid_from: orNull(x.paidFrom), status: x.status, charge_to: x.chargeTo,
      owner_reason: orNull(x.ownerReason), cancel_reason: orNull(x.cancelReason), rejection_reason: orNull(x.rejectionReason),
      recorded_by: orNull(x.recordedBy),
    })),
    owner_payments: state.ownerPayments.map((o) => ({
      id: o.id, month: o.month, plaza_id: o.plazaId, owner_id: o.ownerId, account_number: orNull(o.accountNumber),
      amount_due: o.amountDue, amount_sent: o.amountSent, system_calculated_amount: orNull(o.systemCalculatedAmount),
      sent_by: orNull(o.sentBy), status: o.status, date: orNull(o.date), bank_name: orNull(o.bankName),
      sending_bank_name: orNull(o.sendingBankName), sending_account_number: orNull(o.sendingAccountNumber),
      recipient_bank_name: orNull(o.recipientBankName), transaction_id: orNull(o.transactionId), receipt_url: orNull(o.receiptUrl),
      payment_method: orNull(o.paymentMethod), payment_proof_url: orNull(o.paymentProofUrl), notes: orNull(o.notes),
      statement_number: orNull(o.statementNumber), difference_reason: orNull(o.differenceReason), dispute_reason: orNull(o.disputeReason),
      confirmed_at: orNull(o.confirmedAt), cancel_reason: orNull(o.cancelReason),
    })),
    documents: state.documents.map((d) => ({
      id: d.id, title: d.title, type: d.type, plaza_id: orNull(d.plazaId), unit_id: orNull(d.unitId), tenant_id: orNull(d.tenantId),
      uploaded_at: d.uploadedAt, end_date: orNull(d.endDate), url: d.url ?? "",
    })),
    notifications: state.notifications.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body, created_at: n.createdAt, read: n.read,
      owner_id: orNull(n.ownerId), plaza_id: orNull(n.plazaId),
    })),
    activity_log: state.activityLog.map((a) => ({
      id: a.id, actor_id: a.actorId, action: a.action, entity: a.entity, plaza_id: orNull(a.plazaId),
      before_state: orNull(a.before), after_state: orNull(a.after), timestamp: a.timestamp,
    })),
  };
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fromRows(data: Record<Table, Raw[]>): AppState {
  const paymentsByEntry = new Map<string, Payment[]>();
  for (const p of data.payments) {
    const payment: Payment = {
      id: p.id, amount: p.amount, date: p.date, method: p.method, receivedBy: orUndef(p.received_by),
      reference: orUndef(p.reference), receiptUrl: orUndef(p.receipt_url), status: p.status, cancelReason: orUndef(p.cancel_reason),
    };
    const list = paymentsByEntry.get(p.rent_entry_id) ?? [];
    list.push(payment);
    paymentsByEntry.set(p.rent_entry_id, list);
  }
  return {
    owners: data.owners.map((o): Owner => ({ id: o.id, name: o.name, phone: o.phone, bank: o.bank, accounts: orUndef(o.accounts) })),
    plazas: data.plazas.map((p): Plaza => ({ id: p.id, name: p.name, address: p.address, floors: p.floors, ownership: p.ownership, photoSeed: p.photo_seed })),
    units: data.units.map((u): Unit => ({
      id: u.id, plazaId: u.plaza_id, number: u.number, type: u.type, typeName: orUndef(u.type_name), floor: u.floor,
      sizeSqFt: u.size_sqft, monthlyRent: u.monthly_rent, status: u.status, tenantId: orUndef(u.tenant_id),
      notes: orUndef(u.notes), vacantSince: orUndef(u.vacant_since),
    })),
    tenants: data.tenants.map((t): Tenant => ({
      id: t.id, name: t.name, phone: t.phone, cnic: t.cnic, cnicFrontUrl: orUndef(t.cnic_front_url), cnicBackUrl: orUndef(t.cnic_back_url),
      agreementUrl: orUndef(t.agreement_url), unitId: t.unit_id, monthlyRent: orUndef(t.monthly_rent), advance: t.advance,
      tenancyPeriodMonths: orUndef(t.tenancy_period_months), note: orUndef(t.note), agreementStart: t.agreement_start,
      agreementEnd: orUndef(t.agreement_end), rentIncrease: orUndef(t.rent_increase), status: t.status, vacatedAt: orUndef(t.vacated_at),
    })),
    rentEntries: data.rent_entries.map((e): RentEntry => ({
      id: e.id, unitId: e.unit_id, tenantId: e.tenant_id, plazaId: e.plaza_id, month: e.month, dueAmount: e.due_amount,
      status: e.status, carriedForward: e.carried_forward, payments: paymentsByEntry.get(e.id) ?? [],
    })),
    expenses: data.expenses.map((x): Expense => ({
      id: x.id, plazaId: x.plaza_id, unitId: orUndef(x.unit_id), category: x.category, amount: x.amount, date: x.date,
      description: x.description, billUrl: x.bill_url, paymentStatus: orUndef(x.payment_status), paymentMethod: orUndef(x.payment_method),
      paidBy: orUndef(x.paid_by), paidFrom: orUndef(x.paid_from), status: x.status, chargeTo: x.charge_to,
      ownerReason: orUndef(x.owner_reason), cancelReason: orUndef(x.cancel_reason), rejectionReason: orUndef(x.rejection_reason),
      recordedBy: orUndef(x.recorded_by),
    })),
    ownerPayments: data.owner_payments.map((o): OwnerPayment => ({
      id: o.id, month: o.month, plazaId: o.plaza_id, ownerId: o.owner_id, accountNumber: orUndef(o.account_number),
      amountDue: o.amount_due, amountSent: o.amount_sent, systemCalculatedAmount: orUndef(o.system_calculated_amount),
      sentBy: orUndef(o.sent_by), status: o.status, date: orUndef(o.date), bankName: orUndef(o.bank_name),
      sendingBankName: orUndef(o.sending_bank_name), sendingAccountNumber: orUndef(o.sending_account_number),
      recipientBankName: orUndef(o.recipient_bank_name), transactionId: orUndef(o.transaction_id), receiptUrl: orUndef(o.receipt_url),
      paymentMethod: orUndef(o.payment_method), paymentProofUrl: orUndef(o.payment_proof_url), notes: orUndef(o.notes),
      statementNumber: orUndef(o.statement_number), differenceReason: orUndef(o.difference_reason), disputeReason: orUndef(o.dispute_reason),
      confirmedAt: orUndef(o.confirmed_at), cancelReason: orUndef(o.cancel_reason),
    })),
    documents: data.documents.map((d): Document => ({
      id: d.id, title: d.title, type: d.type, plazaId: orUndef(d.plaza_id), unitId: orUndef(d.unit_id), tenantId: orUndef(d.tenant_id),
      uploadedAt: d.uploaded_at, endDate: orUndef(d.end_date), url: d.url,
    })),
    notifications: data.notifications.map((n): AppNotification => ({
      id: n.id, type: n.type, title: n.title, body: n.body, createdAt: n.created_at, read: n.read,
      ownerId: orUndef(n.owner_id), plazaId: orUndef(n.plaza_id),
    })),
    activityLog: data.activity_log.map((a): ActivityLogEntry => ({
      id: a.id, actorId: a.actor_id, action: a.action, entity: a.entity, plazaId: orUndef(a.plaza_id),
      before: orUndef(a.before_state), after: orUndef(a.after_state), timestamp: a.timestamp,
    })),
  };
}

function snapshot(rows: Record<Table, Row[]>): TableRows {
  const result: TableRows = {};
  for (const table of tables) result[table] = new Map(rows[table].map((row) => [row.id, JSON.stringify(row)]));
  return result;
}

const PAGE = 1000;
const CHUNK = 400;

export type TableName = Table;
export type LoadScope = { plazaIds?: string[]; unitIds?: string[]; ownerId?: string };

const IN_CHUNK = 100;
const plazaScoped: Table[] = ["units", "rent_entries", "expenses", "owner_payments", "activity_log"];
const plazaOrGlobal: Table[] = ["documents", "notifications"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

async function fetchPaged(table: Table, apply: (query: QueryBuilder) => QueryBuilder = (query) => query): Promise<Raw[]> {
  const supabase = createClient();
  const all: Raw[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(supabase.from(table).select("*")).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read ${table} from Supabase: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

async function fetchInChunks(table: Table, column: string, ids: string[]): Promise<Raw[]> {
  const rows: Raw[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    rows.push(...(await fetchPaged(table, (query) => query.in(column, chunk))));
  }
  return rows;
}

async function fetchTable(table: Table, scope?: LoadScope): Promise<Raw[]> {
  const plazaIds = scope?.plazaIds;
  if (plazaIds && plazaScoped.includes(table)) {
    const rows = await fetchInChunks(table, "plaza_id", plazaIds);
    return table === "owner_payments" && scope?.ownerId ? rows.filter((row) => row.owner_id === scope.ownerId) : rows;
  }
  if (plazaIds && plazaOrGlobal.includes(table)) {
    const rows = await fetchInChunks(table, "plaza_id", plazaIds);
    const global = await fetchPaged(table, (query) => query.is("plaza_id", null));
    return [...rows, ...global];
  }
  if (table === "tenants" && scope?.unitIds) return fetchInChunks("tenants", "unit_id", scope.unitIds);
  return fetchPaged(table);
}

/** Loads only the requested tables (rent entries always bring their payments). Returns the mapped rows and their saved snapshot. */
export async function loadTables(names: Table[], scope?: LoadScope): Promise<{ state: AppState; saved: TableRows }> {
  const wanted = new Set<Table>(names);
  if (wanted.has("rent_entries")) wanted.add("payments");
  const data = Object.fromEntries(tables.map((table) => [table, [] as Raw[]])) as Record<Table, Raw[]>;
  await Promise.all([...wanted].filter((table) => table !== "payments").map(async (table) => {
    data[table] = await fetchTable(table, scope);
  }));
  if (wanted.has("payments")) {
    data.payments = scope?.plazaIds ? await fetchInChunks("payments", "rent_entry_id", data.rent_entries.map((row) => row.id)) : await fetchPaged("payments");
  }
  const state = fromRows(data);
  const full = snapshot(toRows(state));
  const saved: TableRows = {};
  for (const table of wanted) saved[table] = full[table];
  return { state, saved };
}

/** Writes only what changed since `saved`. Returns the new snapshot. */
export async function saveRemoteState(state: AppState, saved: TableRows): Promise<TableRows> {
  const supabase = createClient();
  const next = toRows(state);
  const nextSnapshot = snapshot(next);
  for (const table of tables) {
    const before = saved[table] ?? new Map<string, string>();
    const after = nextSnapshot[table];
    const upserts = next[table].filter((row) => before.get(row.id) !== after.get(row.id));
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const { error } = await supabase.from(table).upsert(upserts.slice(i, i + CHUNK), { onConflict: "id" });
      if (error) throw new Error(`Could not save ${table} to Supabase: ${error.message}`);
    }
    const removed = [...before.keys()].filter((id) => !after.has(id));
    for (let i = 0; i < removed.length; i += CHUNK) {
      const { error } = await supabase.from(table).delete().in("id", removed.slice(i, i + CHUNK));
      if (error) throw new Error(`Could not delete from ${table} in Supabase: ${error.message}`);
    }
  }
  return nextSnapshot;
}

export function emptySnapshot(): TableRows {
  return snapshot({ owners: [], plazas: [], units: [], tenants: [], rent_entries: [], payments: [], expenses: [], owner_payments: [], documents: [], notifications: [], activity_log: [] });
}
