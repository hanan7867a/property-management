import type {
  ActivityLogEntry,
  AppNotification,
  Document,
  Expense,
  Owner,
  OwnerPayment,
  Plaza,
  RentEntry,
  Tenant,
  Unit,
} from "@/lib/types";
import { emptySnapshot, loadTables, saveRemoteState, type LoadScope, type TableName, type TableRows } from "@/lib/supabase-state";

const storageKey = "kiraya-hisab-state-changed";

export type SharedDemoState = {
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

const emptySharedDemoState: SharedDemoState = {
  owners: [],
  plazas: [],
  tenants: [],
  units: [],
  rentEntries: [],
  expenses: [],
  ownerPayments: [],
  documents: [],
  notifications: [],
  activityLog: [],
};

// The app state lives in Supabase. This module keeps an in-memory copy so screens can read
// synchronously, and pushes every change back to the database (only the rows that changed).
let cache: SharedDemoState = emptySharedDemoState;
let saved: TableRows = emptySnapshot();
let hydrated = false;
let saveChain: Promise<void> = Promise.resolve();

function reportError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : fallback;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("kiraya-demo-storage-error", { detail: message }));
}

function enqueueSave(): Promise<void> {
  saveChain = saveChain.then(async () => {
    saved = await saveRemoteState(cache, saved);
  });
  const result = saveChain;
  // Keep the chain alive after a failure so the next write retries the full diff.
  saveChain = saveChain.catch(() => undefined);
  return result;
}

let loaded = new Set<TableName>();

/** Starts an empty session. Nothing is downloaded here; each screen asks for the tables it needs. */
export function startSharedDemoSession(): void {
  cache = emptySharedDemoState;
  saved = emptySnapshot();
  loaded = new Set();
  hydrated = true;
}

export function loadedSharedTables(): TableName[] {
  return Array.from(loaded);
}

export function mergeById<T extends { id: string }>(incoming: T[], current: T[]): T[] {
  const ids = new Set(current.map((item) => item.id));
  return [...incoming.filter((item) => !ids.has(item.id)), ...current];
}

/** Loads the tables that are not loaded yet and merges them into the in-memory state (local rows win). */
export async function loadSharedTables(names: TableName[], scope?: LoadScope): Promise<SharedDemoState> {
  if (!hydrated) throw new Error("The app data session has not started yet.");
  const pending = names.filter((name) => !loaded.has(name));
  if (!pending.length) return cache;
  const result = await loadTables(pending, scope);
  const wants = (name: TableName) => pending.includes(name);
  const incoming = result.state;
  cache = {
    owners: wants("owners") ? mergeById(incoming.owners, cache.owners) : cache.owners,
    plazas: wants("plazas") ? mergeById(incoming.plazas, cache.plazas) : cache.plazas,
    units: wants("units") ? mergeById(incoming.units, cache.units) : cache.units,
    tenants: wants("tenants") ? mergeById(incoming.tenants, cache.tenants) : cache.tenants,
    rentEntries: wants("rent_entries") ? mergeById(incoming.rentEntries, cache.rentEntries) : cache.rentEntries,
    expenses: wants("expenses") ? mergeById(incoming.expenses, cache.expenses) : cache.expenses,
    ownerPayments: wants("owner_payments") ? mergeById(incoming.ownerPayments, cache.ownerPayments) : cache.ownerPayments,
    documents: wants("documents") ? mergeById(incoming.documents, cache.documents) : cache.documents,
    notifications: wants("notifications") ? mergeById(incoming.notifications, cache.notifications) : cache.notifications,
    activityLog: wants("activity_log") ? mergeById(incoming.activityLog, cache.activityLog) : cache.activityLog,
  };
  for (const [table, rows] of Object.entries(result.saved)) {
    saved[table] = new Map([...rows, ...(saved[table] ?? [])]);
  }
  for (const name of pending) loaded.add(name);
  return cache;
}

export function readSharedDemoState(): SharedDemoState {
  return cache;
}

export function writeSharedDemoState(state: SharedDemoState): void {
  if (!hydrated) return; // never overwrite the database with un-loaded state
  cache = state;
  enqueueSave().catch((cause) => reportError(cause, "Changes could not be saved to Supabase."));
}

export const sharedDemoStorageKey = storageKey;
