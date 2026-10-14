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
import { emptySnapshot, loadRemoteStateEssential, loadTableGroup, saveRemoteState, type TableRows } from "@/lib/supabase-state";

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

/** Loads essential state from Supabase (plazas, units, tenants, owners). Other tables load on demand. */
export async function hydrateSharedDemoState(): Promise<SharedDemoState> {
  const remote = await loadRemoteStateEssential();
  if (remote) {
    cache = remote.state;
    saved = remote.saved;
  } else {
    cache = emptySharedDemoState;
    saved = emptySnapshot();
  }
  hydrated = true;
  return cache;
}

/** Load additional table groups on demand (rent, expenses, documents, activity). Merges with existing cache. */
export async function loadTableGroupOnDemand(group: "rent" | "expenses" | "documents" | "activity"): Promise<void> {
  const newData = await loadTableGroup(group);
  if (group === "rent") {
    cache.rentEntries = (newData.rent_entries as RentEntry[]) || [];
    cache.ownerPayments = (newData.owner_payments as OwnerPayment[]) || [];
  } else if (group === "expenses") {
    cache.expenses = (newData.expenses as Expense[]) || [];
  } else if (group === "documents") {
    cache.documents = (newData.documents as Document[]) || [];
  } else if (group === "activity") {
    cache.notifications = (newData.notifications as AppNotification[]) || [];
    cache.activityLog = (newData.activity_log as ActivityLogEntry[]) || [];
  }
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
