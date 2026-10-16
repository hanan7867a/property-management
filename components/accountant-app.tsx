"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  Building2,
  Calculator,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileText,
  Home,
  Languages,
  Lock,
  Menu,
  Moon,
  Plus,
  Receipt,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { distributeNet, getRotationOwner, lostRent } from "@/lib/accounting";
import { demoMonth, users } from "@/lib/mock-data";
import { createReceiptPdf } from "@/lib/receipt-pdf";
import { appSettings } from "@/lib/settings";
import { dictionaries, type SupportedLanguage } from "@/lib/i18n";
import { daysBetween, formatMoney, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry, AppNotification, Document, Expense, ExpenseCategory, Owner, OwnerPayment, OwnershipConfig, Payment, PaymentMethod, Plaza, RentEntry, Tenant, Unit, User } from "@/lib/types";
import dynamic from "next/dynamic";
import { loadedSharedTables, loadSharedTables, mergeById, readSharedDemoState, startSharedDemoSession, writeSharedDemoState } from "@/lib/shared-demo-store";
import type { TableName } from "@/lib/supabase-state";
import { isViewableFile, migrateInlineFiles, saveFile } from "@/lib/storage";
import { StoredFileLink, StoredImage } from "@/components/stored-file";
import { useAuth } from "@/lib/hooks/useAuth";
import { Login } from "@/components/login";

const OwnerApp = dynamic(() => import("@/components/owner-app").then((module) => module.OwnerApp), {
  ssr: false,
  loading: () => <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text"><p className="text-sm text-muted">Loading data...</p></main>,
});

type SectionId =
  | "dashboard"
  | "properties"
  | "tenants"
  | "rent"
  | "arrears"
  | "vacancy"
  | "expenses"
  | "summary"
  | "owner-payments"
  | "documents"
  | "calculator"
  | "reports"
  | "activity"
  | "notifications"
  | "settings";

const baseTables: TableName[] = ["owners", "plazas", "units"];
const rentTables: TableName[] = [...baseTables, "tenants", "rent_entries"];
const sectionTables: Record<SectionId, TableName[]> = {
  dashboard: [...baseTables, "rent_entries", "expenses", "owner_payments"],
  properties: [...rentTables, "documents"],
  tenants: [...rentTables, "documents"],
  rent: [...rentTables, "expenses", "owner_payments"],
  summary: [...rentTables, "expenses", "owner_payments"],
  arrears: rentTables,
  vacancy: [...rentTables, "documents"],
  expenses: [...baseTables, "expenses"],
  "owner-payments": [...rentTables, "expenses", "owner_payments"],
  documents: [...baseTables, "documents"],
  activity: [...baseTables, "activity_log"],
  notifications: [...baseTables, "notifications"],
  calculator: [...baseTables, "rent_entries", "expenses", "owner_payments"],
  reports: [...baseTables, "rent_entries", "expenses", "owner_payments"],
  settings: baseTables,
};

const ownerLoginTables: TableName[] = ["owners"];

const groups: { title: keyof typeof dictionaries.en; items: { id: SectionId; label: keyof typeof dictionaries.en; icon: typeof Home }[] }[] = [
  { title: "overview", items: [{ id: "dashboard", label: "dashboard", icon: Home }] },
  {
    title: "properties",
    items: [
      { id: "properties", label: "properties", icon: Building2 },
      { id: "vacancy", label: "vacancy", icon: Home },
      { id: "tenants", label: "tenants", icon: Users },
      { id: "documents", label: "documents", icon: FileText },
    ],
  },
  {
    title: "money",
    items: [
      { id: "rent", label: "rent", icon: CircleDollarSign },
      { id: "arrears", label: "arrears", icon: ClipboardList },
      { id: "expenses", label: "expenses", icon: Receipt },
      { id: "owner-payments", label: "ownerPayments", icon: Wallet },
      { id: "summary", label: "summary", icon: ShieldCheck },
    ],
  },
  {
    title: "tools",
    items: [
      { id: "calculator", label: "calculator", icon: Calculator },
      { id: "reports", label: "reports", icon: Download },
    ],
  },
  {
    title: "account",
    items: [
      { id: "activity", label: "activity", icon: ClipboardList },
      { id: "notifications", label: "notifications", icon: Bell },
      { id: "settings", label: "settings", icon: Settings },
    ],
  },
];

const mobileTabs: { id: SectionId | "more"; label: keyof typeof dictionaries.en; icon: typeof Home }[] = [
  { id: "dashboard", label: "home", icon: Home },
  { id: "rent", label: "rent", icon: CircleDollarSign },
  { id: "expenses", label: "expenses", icon: Receipt },
  { id: "properties", label: "properties", icon: Building2 },
  { id: "more", label: "more", icon: Menu },
];

const statusClass = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "partly-paid": "border-amber-200 bg-amber-50 text-amber-700",
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
  unpaid: "border-rose-200 bg-rose-50 text-rose-700",
  vacant: "border-rose-200 bg-rose-50 text-rose-700",
  occupied: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "soon-vacant": "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "pending-approval": "border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-700",
  draft: "border-slate-200 bg-slate-100 text-slate-700",
};

function ownerName(ownerList: Owner[], ownerId: string) {
  return ownerList.find((owner) => owner.id === ownerId)?.name ?? "Owner";
}

function PageFrame({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold leading-7 text-ink sm:text-[28px] sm:leading-8">{title}</h1>
        {action ? <div className="w-full sm:w-auto [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:w-auto">{action}</div> : null}
      </div>
      {children}
    </motion.section>
  );
}

function StatCard({ label, value, chip }: { label: string; value: string; chip?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
        {chip ? <Badge className="mt-3 border-sky-200 bg-sky-50 text-sky-700">{chip}</Badge> : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ value, label }: { value: keyof typeof statusClass; label: string }) {
  return <Badge className={cn("gap-1 border", statusClass[value])}><CheckCircle2 className="h-3 w-3" />{label}</Badge>;
}

function TenantDetailPanel({
  tenantId,
  onClose,
  plazaList,
  tenantList,
  unitList,
  rentEntryList,
  documentList,
}: {
  tenantId: string | null;
  onClose: () => void;
  plazaList: Plaza[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  documentList: Document[];
}) {
  if (!tenantId) return null;
  const tenant = tenantList.find((item) => item.id === tenantId);
  const unit = tenant ? unitList.find((item) => item.id === tenant.unitId) : undefined;
  const plaza = unit ? plazaList.find((item) => item.id === unit.plazaId) : undefined;
  const rentEntry = tenant ? rentEntryList.find((entry) => entry.tenantId === tenant.id && entry.month === demoMonth) : undefined;
  const paid = rentEntry ? activePaymentTotal(rentEntry) : 0;
  const balance = rentEntry ? Math.max(0, rentEntry.dueAmount + rentEntry.carriedForward - paid) : 0;
  const documentsForTenant = tenant ? documentList.filter((document) => document.tenantId === tenant.id) : [];

  if (!tenant || !unit || !plaza) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-2xl sm:rounded-[24px]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{plaza.name} · {unit.number}</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{tenant.name}</h2>
          </div>
          <Button variant="outline" size="icon" aria-label="Close tenant details" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatCard label="Monthly rent" value={formatMoney(tenant.monthlyRent ?? unit.monthlyRent)} />
          <StatCard label="Paid this month" value={formatMoney(paid)} />
          <StatCard label="Balance" value={formatMoney(balance)} chip={rentEntry?.status ?? "No entry"} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-4 text-sm">
              <h3 className="font-semibold text-ink">Personal detail</h3>
              <div className="flex justify-between gap-3"><span className="text-muted">Phone</span><strong>{tenant.phone}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-muted">CNIC</span><strong>{tenant.cnic}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-muted">Advance</span><strong>{formatMoney(tenant.advance)}</strong></div>
              {tenant.note ? <div><span className="text-muted">Note</span><p className="mt-1">{tenant.note}</p></div> : null}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4 text-sm">
              <h3 className="font-semibold text-ink">Agreement</h3>
              <div className="flex justify-between gap-3"><span className="text-muted">Start</span><strong>{tenant.agreementStart}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-muted">End</span><strong>{tenant.agreementEnd ?? "No fixed end date"}</strong></div>
              {tenant.tenancyPeriodMonths ? <div className="flex justify-between gap-3"><span className="text-muted">Tenancy period</span><strong>{tenant.tenancyPeriodMonths} months</strong></div> : null}
              <div className="flex justify-between gap-3"><span className="text-muted">Rent increase</span><strong>{tenant.rentIncrease ? `${tenant.rentIncrease.date} · ${formatMoney(tenant.rentIncrease.amount)}` : "Not scheduled"}</strong></div>
            </CardContent>
          </Card>
        </div>

        {tenant.cnicFrontUrl || tenant.cnicBackUrl || tenant.agreementUrl ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {([
              ["CNIC front", tenant.cnicFrontUrl],
              ["CNIC back", tenant.cnicBackUrl],
              ["Rent agreement", tenant.agreementUrl],
            ] as [string, string | undefined][]).map(([label, url]) => url ? (
              <Card key={label}>
                <CardContent className="p-3">
                  <p className="mb-2 text-sm font-medium text-ink">{label}</p>
                  <StoredImage value={url} alt={label} className="h-36 w-full rounded-xl object-cover" />
                </CardContent>
              </Card>
            ) : null)}
          </div>
        ) : null}

        <Card className="mt-3">
          <CardContent className="p-4">
            <h3 className="font-semibold text-ink">Documents and payment history</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {documentsForTenant.length > 0 ? documentsForTenant.map((document) => (
                <div key={document.id} className="rounded-xl border border-border bg-bg p-3 text-sm">
                  <p className="font-medium text-text">{document.title}</p>
                  <p className="text-xs text-muted">{document.type} · {document.uploadedAt}</p>
                </div>
              )) : <p className="text-sm text-muted">No linked documents yet.</p>}
              {rentEntry?.payments.filter((payment) => payment.status === "active").map((payment) => (
                <div key={payment.id} className="rounded-xl border border-border bg-bg p-3 text-sm">
                  <p className="font-medium text-text">{formatMoney(payment.amount)} · {payment.method}</p>
                  <p className="text-xs text-muted">{payment.date}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}


function Dashboard({ t, plazaList, unitList, rentEntryList, expenseList, ownerPaymentList }: { t: typeof dictionaries.en; plazaList: Plaza[]; unitList: Unit[]; rentEntryList: RentEntry[]; expenseList: Expense[]; ownerPaymentList: OwnerPayment[] }) {
  const currentMonthEntries = rentEntryList.filter((entry) => entry.month === demoMonth);
  const recordedPaidExpenses = expenseList.filter((expense) => expense.date.startsWith(demoMonth) && expenseIsPaid(expense) === "paid").reduce((sum, expense) => sum + expense.amount, 0);
  const expected = currentMonthEntries.filter((entry) => entry.status !== "vacant").reduce((sum, entry) => sum + entry.dueAmount + entry.carriedForward, 0);
  const collected = currentMonthEntries.reduce((sum, entry) => sum + entry.payments.reduce((inner, payment) => inner + (payment.status === "active" ? payment.amount : 0), 0), 0);
  const netProfit = collected - recordedPaidExpenses;
  const progress = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  const overdueCount = currentMonthEntries.filter((entry) => entry.status === "overdue").length;
  return (
    <PageFrame title={t.dashboard}>
      <Card className="overflow-hidden bg-ink text-white">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <p className="text-white/70">{t.greeting}</p>
            <h2 className="mt-2 text-3xl font-semibold">{monthLabel(demoMonth)}</h2>
            <div className="mt-5 h-3 rounded-full bg-white/15"><div className="h-3 rounded-full bg-accent" style={{ width: `${progress}%` }} /></div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div><p className="text-xs text-white/60">{t.expected}</p><p className="font-semibold tabular-nums">{formatMoney(expected)}</p></div>
              <div><p className="text-xs text-white/60">{t.collected}</p><p className="font-semibold tabular-nums">{formatMoney(collected)}</p></div>
              <div><p className="text-xs text-white/60">{t.unpaid}</p><p className="font-semibold tabular-nums">{formatMoney(Math.max(0, expected - collected))}</p></div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-sm text-white/70">{t.summary}</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">{progress}%</p>
            <p className="mt-2 text-sm text-white/70">{t.netProfit}: {formatMoney(netProfit)}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label={t.totalCollected} value={formatMoney(collected)} chip="+12%" />
        <StatCard label={t.totalExpenses} value={formatMoney(recordedPaidExpenses)} />
        <StatCard label={t.netProfit} value={formatMoney(netProfit)} />
        <StatCard label={t.vacantUnits} value={String(unitList.filter((unit) => unit.status === "vacant").length)} chip="red chip" />
        <StatCard label={t.overdueTenants} value={String(overdueCount)} />
        <StatCard label={t.pendingConfirmations} value={String(ownerPaymentList.filter((payment) => payment.status === "sent-awaiting-confirmation").length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {plazaList.map((plaza) => {
          const plazaCollected = currentMonthEntries.filter((entry) => entry.plazaId === plaza.id).reduce((sum, entry) => sum + entry.payments.reduce((inner, payment) => inner + (payment.status === "active" ? payment.amount : 0), 0), 0);
          const plazaPendingExpenses = expenseList.filter((expense) => expense.plazaId === plaza.id && expense.date.startsWith(demoMonth) && expense.status === "pending-approval").reduce((sum, expense) => sum + expense.amount, 0);
          const calc = { collected: plazaCollected, pendingExpenses: plazaPendingExpenses };
          const plazaUnits = unitList.filter((unit) => unit.plazaId === plaza.id);
          return <Card key={plaza.id}><CardContent className="p-4"><div className="h-24 rounded-2xl" style={{ background: plaza.photoSeed }} /><div className="mt-4 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{plaza.name}</h3><p className="text-sm text-muted">{plaza.address}</p></div><Badge className="border-primary/20 bg-primary-soft text-primary">{plaza.ownership.type}</Badge></div><div className="mt-4 h-2 rounded-full bg-bg"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((calc.collected / Math.max(calc.collected + 1, calc.collected + calc.pendingExpenses)) * 100))}%` }} /></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><span>{formatMoney(calc.collected)}</span><span>{plazaUnits.filter((unit) => unit.status === "vacant").length} vacant</span></div></CardContent></Card>;
        })}
      </div>
    </PageFrame>
  );
}

type NewPlazaValues = {
  name: string;
  address: string;
  floors: number;
  units: { name: string; type: Unit["type"]; typeName?: string }[];
  photoSeed: string;
  ownership: OwnershipConfig;
};

function missingRentEntriesForMonth(
  plazaId: string,
  month: string,
  unitList: Unit[],
  tenantList: Tenant[],
  existingEntries: RentEntry[],
) {
  const monthEndDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const monthStartDate = `${month}-01`;
  const monthEndDate = `${month}-${String(monthEndDay).padStart(2, "0")}`;
  return unitList.flatMap((unit): RentEntry[] => {
    if (unit.plazaId !== plazaId || !unit.tenantId || unit.status === "vacant") return [];
    const tenant = tenantList.find((item) => item.id === unit.tenantId);
    if (!tenant || tenant.status !== "active" || tenant.agreementStart > monthEndDate || (tenant.agreementEnd && tenant.agreementEnd < monthStartDate)) return [];
    if (existingEntries.some((entry) =>
      entry.unitId === unit.id &&
      entry.tenantId === tenant.id &&
      entry.plazaId === plazaId &&
      entry.month === month
    )) return [];
    const dueAmount = tenant.rentIncrease && month >= tenant.rentIncrease.date.slice(0, 7)
      ? tenant.rentIncrease.amount
      : tenant.monthlyRent ?? unit.monthlyRent;
    return [{
      id: `rent-${unit.id}-${month}-${tenant.id}`,
      unitId: unit.id,
      tenantId: tenant.id,
      plazaId,
      month,
      dueAmount,
      status: "unpaid",
      payments: [],
      carriedForward: 0,
    }];
  });
}

function EditPlazaForm({
  plaza,
  onClose,
  onSave,
}: {
  plaza: Plaza;
  onClose: () => void;
  onSave: (values: Pick<Plaza, "name" | "address" | "photoSeed">) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const address = String(data.get("address") ?? "").trim();
    const photo = data.get("photo");
    if (!name || !address) {
      setError("Enter both the plaza name and address.");
      return;
    }
    if (photo instanceof File && photo.size && !photo.type.startsWith("image/")) {
      setError("The plaza photo must be an image.");
      return;
    }
    setSaving(true);
    try {
      const photoData = photo instanceof File && photo.size ? await readFileData(photo) : undefined;
      onSave({
        name,
        address,
        photoSeed: photoData ? `url("${photoData}") center / cover` : plaza.photoSeed,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the plaza details.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-xl sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-muted">Properties</p><h2 className="mt-1 text-2xl font-semibold text-ink">Edit plaza details</h2><p className="mt-1 text-sm text-muted">Units, tenant links, ownership, and rent history will remain unchanged.</p></div>
          <Button type="button" variant="outline" size="icon" aria-label="Close edit plaza form" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <label className="text-sm font-medium text-text">Plaza name<input name="name" required defaultValue={plaza.name} className="form-input" /></label>
          <label className="text-sm font-medium text-text">Address<input name="address" required defaultValue={plaza.address} className="form-input" /></label>
          <label className="text-sm font-medium text-text">Replace plaza picture <span className="font-normal text-muted">(optional)</span><input name="photo" type="file" accept="image/*" className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save plaza details"}</Button></div>
        </form>
      </motion.div>
      <style jsx global>{`.form-input{margin-top:.5rem;display:block;min-height:3rem;width:100%;border-radius:.75rem;border:1px solid var(--color-border,#e5e7eb);background:var(--color-bg,#fff);padding:0 .75rem;color:inherit}`}</style>
    </div>
  );
}

function NewPlazaForm({ ownerList, onAddOwner, onClose, onSave }: {
  ownerList: Owner[];
  onAddOwner: (values: { name: string; phone: string; bank: string }) => string;
  onClose: () => void;
  onSave: (values: NewPlazaValues) => void;
}) {
  const [unitCount, setUnitCount] = useState(1);
  const [unitTypes, setUnitTypes] = useState<Record<number, Unit["type"]>>({});
  const [ownershipType, setOwnershipType] = useState<OwnershipConfig["type"]>("single");
  const [ownerId, setOwnerId] = useState(ownerList[0]?.id ?? "");
  const [partnerId, setPartnerId] = useState(ownerList[1]?.id ?? "");
  const [showOwnerForm, setShowOwnerForm] = useState<"ownerId" | "partnerId" | null>(null);
  const [newOwnerError, setNewOwnerError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");
  const [newOwnerBank, setNewOwnerBank] = useState("");

  function addOwner(target: "ownerId" | "partnerId") {
    const name = newOwnerName.trim();
    if (!name) {
      setNewOwnerError("Enter the owner's name.");
      return;
    }
    const id = onAddOwner({ name, phone: newOwnerPhone.trim(), bank: newOwnerBank.trim() });
    if (target === "ownerId") setOwnerId(id); else setPartnerId(id);
    setShowOwnerForm(null);
    setNewOwnerError("");
    setNewOwnerName("");
    setNewOwnerPhone("");
    setNewOwnerBank("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const floors = Number(data.get("floors"));
    const newUnits = Array.from({ length: unitCount }, (_, index) => ({
      name: String(data.get(`unitName-${index}`) ?? "").trim(),
      type: String(data.get(`unitType-${index}`) ?? "flat") as Unit["type"],
      typeName: String(data.get(`unitTypeOther-${index}`) ?? "").trim(),
    }));
    if (!name || !newUnits.every((unit) => unit.name)) {
      setError("Enter a plaza name and a name for every unit.");
      return;
    }
    if (new Set(newUnits.map((unit) => unit.name.toLowerCase())).size !== newUnits.length) {
      setError("Each unit name must be unique within the plaza.");
      return;
    }
    if (newUnits.some((unit) => unit.type === "other" && !unit.typeName)) {
      setError("Enter a custom type for every unit marked Other.");
      return;
    }

    if (!ownerList.some((owner) => owner.id === ownerId)) {
      setError("Choose an owner for this plaza.");
      return;
    }
    if (ownershipType !== "single" && (!ownerList.some((owner) => owner.id === partnerId) || ownerId === partnerId)) {
      setError("Choose two different owners for this partnership rule.");
      return;
    }
    const sharePercent = Number(data.get("sharePercent"));
    if (ownershipType === "shared" && (!Number.isInteger(sharePercent) || sharePercent < 1 || sharePercent > 99)) {
      setError("The primary owner's share must be between 1% and 99%.");
      return;
    }

    const history = [{ date: new Date().toISOString().slice(0, 10), note: "Ownership rules set when plaza was created", actorId: "admin-1" }];
    const ownership: OwnershipConfig = ownershipType === "single"
      ? { type: "single", ownerId, history }
      : ownershipType === "shared"
        ? { type: "shared", shares: [{ ownerId, percent: sharePercent }, { ownerId: partnerId, percent: 100 - sharePercent }], history }
        : { type: "rotation", rotationOrder: [ownerId, partnerId], rotationStartMonth: demoMonth, history };

    const photo = data.get("photo");
    if (photo instanceof File && photo.size && !photo.type.startsWith("image/")) {
      setError("The plaza photo must be an image.");
      return;
    }
    setSaving(true);
    try {
      const photoData = photo instanceof File && photo.size ? await readFileData(photo) : undefined;
      onSave({
        name,
        address: String(data.get("address") ?? "").trim() || "Address not provided",
        floors,
        units: newUnits.map(({ name: unitName, type, typeName }) => ({ name: unitName, type, typeName: type === "other" ? typeName : undefined })),
        photoSeed: photoData ? `url("${photoData}") center / cover` : "linear-gradient(135deg,#0f766e,#38bdf8)",
        ownership,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the plaza photo.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-2xl sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-muted">Properties</p><h2 className="mt-1 text-2xl font-semibold text-ink">Add a plaza or shop</h2></div>
          <Button type="button" variant="outline" size="icon" aria-label="Close add plaza form" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-text">Plaza or shop name<input name="name" required autoFocus className="form-input" /></label>
          <label className="text-sm font-medium text-text">Address <span className="text-muted">(Optional)</span><input name="address" className="form-input" /></label>
          <label className="text-sm font-medium text-text">Number of floors<input name="floors" type="number" min="1" max="100" required defaultValue="1" className="form-input" /></label>
          <label className="text-sm font-medium text-text">Number of units<input type="number" min="1" max="100" required value={unitCount} onChange={(event) => setUnitCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} className="form-input" /></label>
          <label className="text-sm font-medium text-text sm:col-span-2">Plaza picture <span className="text-muted">(Optional)</span><input name="photo" type="file" accept="image/*" className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold text-ink">Partnership rules</legend>
            <label className="text-sm font-medium text-text sm:col-span-2">Ownership rule<select value={ownershipType} onChange={(event) => setOwnershipType(event.target.value as OwnershipConfig["type"])} className="form-input"><option value="single">Single owner</option><option value="shared">Shared ownership percentages</option><option value="rotation">Monthly owner rotation</option></select></label>
            <label className="text-sm font-medium text-text">Owner<select value={ownerId} onChange={(event) => event.target.value === "__add__" ? setShowOwnerForm("ownerId") : setOwnerId(event.target.value)} required className="form-input">{ownerList.length ? null : <option value="">No owners yet</option>}{ownerList.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}<option value="__add__">+ Add new owner…</option></select></label>
            {ownershipType !== "single" ? <label className="text-sm font-medium text-text">Partner / next owner<select value={partnerId} onChange={(event) => event.target.value === "__add__" ? setShowOwnerForm("partnerId") : setPartnerId(event.target.value)} required className="form-input">{ownerList.length ? null : <option value="">No owners yet</option>}{ownerList.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}<option value="__add__">+ Add new owner…</option></select></label> : null}
            {ownershipType === "shared" ? <label className="text-sm font-medium text-text sm:col-span-2">Owner share (%)<input name="sharePercent" type="number" min="1" max="99" step="1" required defaultValue="60" className="form-input" /><span className="mt-1 block text-xs text-muted">The partner receives the remaining percentage.</span></label> : null}
            {showOwnerForm ? (
              <div className="col-span-full grid gap-3 rounded-xl border border-border bg-bg p-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-text">New owner&apos;s name<input value={newOwnerName} onChange={(event) => setNewOwnerName(event.target.value)} required autoFocus className="form-input" /></label>
                <label className="text-sm font-medium text-text">Phone <span className="text-muted">(Optional)</span><input value={newOwnerPhone} onChange={(event) => setNewOwnerPhone(event.target.value)} className="form-input" /></label>
                <label className="text-sm font-medium text-text">Bank <span className="text-muted">(Optional)</span><input value={newOwnerBank} onChange={(event) => setNewOwnerBank(event.target.value)} className="form-input" /></label>
                {newOwnerError ? <p role="alert" className="text-sm text-rose-700 sm:col-span-2">{newOwnerError}</p> : null}
                <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => { setShowOwnerForm(null); setNewOwnerError(""); }}>Cancel</Button><Button type="button" onClick={() => addOwner(showOwnerForm)}>Add owner</Button></div>
              </div>
            ) : null}
          </fieldset>
          <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold text-ink">Name each unit</legend>
            {Array.from({ length: unitCount }, (_, index) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <label className="text-sm font-medium text-text">Unit name<input name={`unitName-${index}`} required defaultValue={`Unit ${index + 1}`} className="form-input" /></label>
                <label className="mt-3 block text-sm font-medium text-text">Unit type<select name={`unitType-${index}`} value={unitTypes[index] ?? "flat"} onChange={(event) => setUnitTypes((current) => ({ ...current, [index]: event.target.value as Unit["type"] }))} className="form-input"><option value="flat">Flat</option><option value="shop">Shop</option><option value="office">Office</option><option value="other">Other</option></select></label>
                {unitTypes[index] === "other" ? <label className="mt-3 block text-sm font-medium text-text">Custom unit type<input name={`unitTypeOther-${index}`} required autoFocus className="form-input" placeholder="Enter unit type" /></label> : null}
              </div>
            ))}
          </fieldset>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save plaza"}</Button></div>
        </form>
      </motion.div>
      <style jsx global>{`.form-input{margin-top:.5rem;display:block;min-height:3rem;width:100%;border-radius:.75rem;border:1px solid var(--color-border,#e5e7eb);background:var(--color-bg,#fff);padding:0 .75rem;color:inherit}`}</style>
    </div>
  );
}

function Properties({
  t,
  plazaList,
  tenantList,
  unitList,
  rentEntryList,
  documentList,
  ownerList,
  onAddOwner,
  onSavePlaza,
  onUpdatePlaza,
  onCreateRentSheet,
}: {
  t: typeof dictionaries.en;
  plazaList: Plaza[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  documentList: Document[];
  ownerList: Owner[];
  onAddOwner: (values: { name: string; phone: string; bank: string }) => string;
  onSavePlaza: (values: NewPlazaValues) => void;
  onUpdatePlaza: (plazaId: string, values: Pick<Plaza, "name" | "address" | "photoSeed">) => void;
  onCreateRentSheet: (plazaId: string) => void;
}) {
  const [selectedPlazaId, setSelectedPlazaId] = useState(plazaList[0]?.id ?? "");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showPlazaForm, setShowPlazaForm] = useState(false);
  const [editingPlazaId, setEditingPlazaId] = useState<string | null>(null);
  const selectedPlaza = plazaList.find((plaza) => plaza.id === selectedPlazaId) ?? plazaList[0];
  const editingPlaza = plazaList.find((plaza) => plaza.id === editingPlazaId);
  return (
    <PageFrame title={t.properties} action={<Button onClick={() => setShowPlazaForm(true)}><Plus className="h-4 w-4" />{t.newPlaza}</Button>}>
      <label className="block max-w-xl text-sm font-medium text-text">
        Plaza Chunein
        <select
          aria-label="Filter plazas"
          value={selectedPlaza?.id ?? ""}
          onChange={(event) => setSelectedPlazaId(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text"
        >
          {plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}
        </select>
      </label>
      <div className="grid gap-4">
        {selectedPlaza ? [selectedPlaza].map((plaza) => {
          const plazaUnits = unitList.filter((unit) => unit.plazaId === plaza.id);
          const occupied = plazaUnits.filter((unit) => unit.status !== "vacant").length;
          const plazaTenants = plazaUnits
            .map((unit) => ({ unit, tenant: tenantList.find((tenant) => tenant.id === unit.tenantId) }))
            .filter((row): row is { unit: typeof plazaUnits[number]; tenant: Tenant } => Boolean(row.tenant));
          return (
            <Card key={plaza.id}>
              <CardContent className="space-y-4 p-4">
                <div className="h-28 rounded-2xl" style={{ background: plaza.photoSeed }} />
                <div>
                  <h3 className="text-lg font-semibold text-ink">{plaza.name}</h3>
                  <p className="text-sm text-muted">{plaza.address}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" className="min-h-11 w-full" onClick={() => setEditingPlazaId(plaza.id)}>Plaza Tabdeel Karein</Button>
                  <Button className="min-h-11 w-full" onClick={() => onCreateRentSheet(plaza.id)}>Kiraya Wasool Karein</Button>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-bg p-3 text-sm">
                  <span><strong className="block text-ink">{plaza.floors}</strong>floors</span>
                  <span><strong className="block text-ink">{plazaUnits.length}</strong>units</span>
                  <span><strong className="block text-ink">{Math.round((occupied / plazaUnits.length) * 100)}%</strong>occupied</span>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-ink">Kirayedar</h4>
                    <Badge className="border-primary/20 bg-primary-soft text-primary">{plazaTenants.length} kirayedar</Badge>
                  </div>
                  <div className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {plazaTenants.map(({ unit, tenant }) => {
                      const entry = rentEntryList.find((rentEntry) => rentEntry.tenantId === tenant.id && rentEntry.month === demoMonth);
                      const paid = entry?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
                      const balance = entry ? entry.dueAmount + entry.carriedForward - paid : 0;
                      return (
                        <button
                          key={tenant.id}
                          onClick={() => setSelectedTenantId(tenant.id)}
                          className="min-h-20 rounded-xl border border-border bg-bg p-3 text-start transition hover:border-primary/50 hover:bg-primary-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <span className="block font-semibold text-ink">{tenant.name}</span>
                          <span className="mt-1 block text-xs text-muted">{unit.number} · {formatMoney(unit.monthlyRent)}</span>
                          <span className={cn("mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", balance > 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                            {balance > 0 ? `Balance ${formatMoney(balance)}` : "Paid"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink"><Lock className="h-4 w-4" />{t.ownershipLocked}</div>
                  <p className="mt-2 text-sm text-muted">{plaza.ownership.type === "shared" ? plaza.ownership.shares.map((share) => `${ownerName(ownerList, share.ownerId)} ${share.percent}%`).join(", ") : plaza.ownership.type === "rotation" ? `This month: ${ownerName(ownerList, getRotationOwner(plaza, demoMonth) ?? "")}` : `${ownerName(ownerList, plaza.ownership.ownerId)}`}</p>
                </div>
              </CardContent>
            </Card>
          );
        }) : null}
      </div>
      <TenantDetailPanel tenantId={selectedTenantId} onClose={() => setSelectedTenantId(null)} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} documentList={documentList} />
      {showPlazaForm ? <NewPlazaForm ownerList={ownerList} onAddOwner={onAddOwner} onClose={() => setShowPlazaForm(false)} onSave={(values) => { onSavePlaza(values); setShowPlazaForm(false); }} /> : null}
      {editingPlaza ? <EditPlazaForm key={editingPlaza.id} plaza={editingPlaza} onClose={() => setEditingPlazaId(null)} onSave={(values) => onUpdatePlaza(editingPlaza.id, values)} /> : null}
    </PageFrame>
  );
}

type NewTenantValues = {
  name: string;
  cnic: string;
  cnicFrontUrl: string;
  cnicBackUrl: string;
  agreementUrl?: string;
  phone: string;
  unitId: string;
  rent: number;
  tenancyPeriodMonths?: number;
  agreementStart: string;
  agreementEnd?: string;
  note?: string;
};

function readFileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the selected file.")));
    reader.addEventListener("error", () => reject(new Error("Could not read the selected file.")));
    reader.readAsDataURL(file);
  });
}

async function shareOrDownloadPdf(pdf: Blob, fileName: string, title: string, text?: string): Promise<"shared" | "downloaded"> {
  const file = new File([pdf], fileName, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], title, text });
    return "shared";
  }
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.startsWith("00")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? `92${digits.slice(1)}`
      : digits;
  return number.length >= 10 && number.length <= 15 ? number : null;
}

function openWhatsAppReminder(phone: string, message: string) {
  const number = whatsappNumber(phone);
  if (!number) return false;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  return true;
}

function activePaymentTotal(entry: RentEntry) {
  return entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
}

function tenantRentHistory(tenant: Tenant, unit: Unit, entries: RentEntry[], now = new Date()) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const withinTenancy = month >= tenant.agreementStart.slice(0, 7) &&
      (!tenant.vacatedAt || month <= tenant.vacatedAt.slice(0, 7));
    if (!withinTenancy) return null;

    const entry = entries.find((item) => item.tenantId === tenant.id && item.unitId === unit.id && item.month === month);
    const due = entry
      ? entry.dueAmount + entry.carriedForward
      : tenant.rentIncrease && month >= tenant.rentIncrease.date.slice(0, 7)
        ? tenant.rentIncrease.amount
        : tenant.monthlyRent ?? unit.monthlyRent;
    const paid = entry ? activePaymentTotal(entry) : 0;
    const balance = Math.max(0, due - paid);
    return {
      month,
      due,
      paid,
      balance,
      status: balance === 0 ? "paid" as const : paid > 0 ? "partly-paid" as const : "unpaid" as const,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
}

function TenantForm({
  plazaList,
  unitList,
  initialUnitId,
  initialTenant,
  onClose,
  onSave,
}: {
  plazaList: Plaza[];
  unitList: Unit[];
  initialUnitId?: string;
  initialTenant?: Tenant;
  onClose: () => void;
  onSave: (values: NewTenantValues) => void;
}) {
  const initialUnit = unitList.find((unit) => unit.id === (initialTenant?.unitId ?? initialUnitId));
  const [plazaId, setPlazaId] = useState(initialUnit?.plazaId ?? plazaList[0]?.id ?? "");
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnit?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const availableUnits = unitList.filter((unit) => unit.plazaId === plazaId && (
    unit.status === "vacant" || unit.id === initialTenant?.unitId
  ));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const front = data.get("cnicFront");
    const back = data.get("cnicBack");
    const agreement = data.get("agreement");
    const agreementStart = String(data.get("agreementStart") ?? "");
    const agreementEnd = String(data.get("agreementEnd") ?? "");
    const name = String(data.get("name") ?? "").trim();
    const cnic = String(data.get("cnic") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    if (!name || !cnic || !phone) {
      setError("Tenant name, CNIC, and WhatsApp number cannot be blank.");
      return;
    }
    if (!initialTenant && (!(front instanceof File) || !front.size || !front.type.startsWith("image/") || !(back instanceof File) || !back.size || !back.type.startsWith("image/"))) {
      setError("Upload both the front and back CNIC photos.");
      return;
    }
    if (front instanceof File && front.size && !front.type.startsWith("image/")) {
      setError("The CNIC front upload must be an image.");
      return;
    }
    if (back instanceof File && back.size && !back.type.startsWith("image/")) {
      setError("The CNIC back upload must be an image.");
      return;
    }
    if (agreement instanceof File && agreement.size && !agreement.type.startsWith("image/")) {
      setError("The rent agreement upload must be an image.");
      return;
    }
    if (agreementEnd && agreementEnd <= agreementStart) {
      setError("The tenancy end date must be after the start date.");
      return;
    }
    const selectedUnit = availableUnits.find((unit) => unit.id === selectedUnitId);
    if (!selectedUnit) {
      setError(availableUnits.length ? "Choose an available unit for this plaza." : "There are no available units in this plaza.");
      return;
    }
    setSaving(true);
    try {
      onSave({
        name,
        cnic,
        cnicFrontUrl: front instanceof File && front.size ? await saveFile(front, "cnic") : initialTenant?.cnicFrontUrl ?? "",
        cnicBackUrl: back instanceof File && back.size ? await saveFile(back, "cnic") : initialTenant?.cnicBackUrl ?? "",
        agreementUrl: agreement instanceof File && agreement.size ? await saveFile(agreement, "agreements") : initialTenant?.agreementUrl,
        phone,
        unitId: selectedUnit.id,
        rent: Number(data.get("rent")),
        tenancyPeriodMonths: String(data.get("tenancyPeriodMonths") ?? "").trim()
          ? Number(data.get("tenancyPeriodMonths"))
          : initialTenant?.tenancyPeriodMonths,
        agreementStart,
        agreementEnd: agreementEnd || undefined,
        note: String(data.get("note") ?? "").trim() || undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save tenant photos.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-2xl sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-muted">Tenant records</p><h2 className="mt-1 text-2xl font-semibold text-ink">{initialTenant ? "Edit tenant details" : dictionaries.en.addTenant}</h2></div>
          <Button type="button" variant="outline" size="icon" aria-label="Close tenant form" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-text">Tenant name<input name="name" defaultValue={initialTenant?.name} required autoFocus className="form-input" /></label>
          <label className="text-sm font-medium text-text">CNIC number<input name="cnic" defaultValue={initialTenant?.cnic} required className="form-input" placeholder="35202-1234567-1" /></label>
          <label className="text-sm font-medium text-text">CNIC front photo <span className="text-muted">{initialTenant ? "(optional replacement)" : "Required"}</span><input name="cnicFront" type="file" accept="image/*" required={!initialTenant} className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          <label className="text-sm font-medium text-text">CNIC back photo <span className="text-muted">{initialTenant ? "(optional replacement)" : "Required"}</span><input name="cnicBack" type="file" accept="image/*" required={!initialTenant} className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          <label className="text-sm font-medium text-text">Rent agreement picture <span className="text-muted">(Optional)</span><input name="agreement" type="file" accept="image/*" className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          <label className="text-sm font-medium text-text">WhatsApp number<input name="phone" type="tel" defaultValue={initialTenant?.phone} required className="form-input" placeholder="03xx-xxxxxxx" /></label>
          <label className="text-sm font-medium text-text">Plaza<select value={plazaId} onChange={(event) => { setPlazaId(event.target.value); setSelectedUnitId(""); }} required disabled={Boolean(initialTenant)} className="form-input">{plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}</select></label>
          <label className="text-sm font-medium text-text">{initialTenant ? "Current unit" : "Available unit"}<select name="unitId" value={selectedUnitId} onChange={(event) => setSelectedUnitId(event.target.value)} required disabled={Boolean(initialTenant) || !availableUnits.length} className="form-input"><option value="">{availableUnits.length ? "Select an available unit" : "No available units"}</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.number}</option>)}</select></label>
          <label className="text-sm font-medium text-text">Monthly rent (PKR)<input name="rent" type="number" min="1" step="1" defaultValue={initialTenant?.monthlyRent ?? initialUnit?.monthlyRent} required className="form-input" /></label>
          <label className="text-sm font-medium text-text">Tenancy period (months)<input name="tenancyPeriodMonths" type="number" min="1" step="1" defaultValue={initialTenant?.tenancyPeriodMonths} required={!initialTenant} className="form-input" /></label>
          <label className="text-sm font-medium text-text">Start date<input name="agreementStart" type="date" defaultValue={initialTenant?.agreementStart} required className="form-input" /></label>
          <label className="text-sm font-medium text-text">End date <span className="font-normal text-muted">(Optional; no end date means current tenant)</span><input name="agreementEnd" type="date" defaultValue={initialTenant?.agreementEnd} className="form-input" /></label>
          <label className="text-sm font-medium text-text sm:col-span-2">Note <span className="text-muted">(Optional)</span><textarea name="note" defaultValue={initialTenant?.note} rows={3} className="form-input h-auto py-3" /></label>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !availableUnits.length}>{saving ? "Saving…" : initialTenant ? "Save changes" : "Save tenant"}</Button></div>
        </form>
      </motion.div>
      <style jsx global>{`.form-input{margin-top:.5rem;display:block;min-height:3rem;width:100%;border-radius:.75rem;border:1px solid var(--color-border,#e5e7eb);background:var(--color-bg,#fff);padding:0 .75rem;color:inherit;outline:none}.form-input:focus{box-shadow:0 0 0 2px rgb(15 118 110 / .2)}`}</style>
    </div>
  );
}

function Tenants({
  t,
  searchTerm,
  plazaList,
  tenantList,
  unitList,
  rentEntryList,
  documentList,
  onSaveTenant,
  onUpdateTenant,
  onVacateTenant,
}: {
  t: typeof dictionaries.en;
  searchTerm: string;
  plazaList: Plaza[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  documentList: Document[];
  onSaveTenant: (values: NewTenantValues) => void;
  onUpdateTenant: (tenantId: string, values: NewTenantValues) => void;
  onVacateTenant: (tenantId: string, leavingDate: string, amountReceivedBy: string, method: PaymentMethod) => void;
}) {
  const [selectedPlazaId, setSelectedPlazaId] = useState("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [vacatingTenantId, setVacatingTenantId] = useState<string | null>(null);
  const [leavingDate, setLeavingDate] = useState("");
  const [balanceConfirmed, setBalanceConfirmed] = useState(false);
  const [balanceReceivedBy, setBalanceReceivedBy] = useState("");
  const [balancePaymentMethod, setBalancePaymentMethod] = useState<PaymentMethod>("Cash");
  const [confirmVacate, setConfirmVacate] = useState(false);
  const vacatingTenant = tenantList.find((tenant) => tenant.id === vacatingTenantId);
  const vacatingBalances = vacatingTenant && leavingDate
    ? rentEntryList
      .filter((entry) => entry.tenantId === vacatingTenant.id && entry.month <= leavingDate.slice(0, 7))
      .map((entry) => {
        const paid = entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
        return { entry, paid, balance: Math.max(0, entry.dueAmount + entry.carriedForward - paid) };
      })
      .filter(({ balance }) => balance > 0)
      .sort((a, b) => a.entry.month.localeCompare(b.entry.month))
    : [];
  const totalVacatingBalance = vacatingBalances.reduce((sum, item) => sum + item.balance, 0);
  function closeVacateDialog() {
    setVacatingTenantId(null);
    setBalanceConfirmed(false);
    setBalanceReceivedBy("");
    setBalancePaymentMethod("Cash");
    setConfirmVacate(false);
  }
  const visibleTenants = tenantList.filter((tenant) => {
    const unit = unitList.find((item) => item.id === tenant.unitId);
    const matchesPlaza = unit && (selectedPlazaId === "all" || unit.plazaId === selectedPlazaId);
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || `${tenant.name} ${unit?.number ?? ""} ${unit?.typeName ?? ""}`.toLowerCase().includes(query);
    return matchesPlaza && matchesSearch;
  });
  const editingTenant = tenantList.find((tenant) => tenant.id === editingTenantId);
  return (
    <PageFrame title={t.tenants} action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />{t.addTenant}</Button>}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{visibleTenants.length} tenants</p>
        <label className="text-sm font-medium text-text">Filter by plaza<select aria-label="Filter tenants by plaza" value={selectedPlazaId} onChange={(event) => setSelectedPlazaId(event.target.value)} className="ms-2 h-10 rounded-xl border border-border bg-surface px-3"><option value="all">All plazas</option>{plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}</select></label>
      </div>
      {visibleTenants.length ? <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{visibleTenants.map((tenant) => {
        const unit = unitList.find((item) => item.id === tenant.unitId);
        const plaza = plazaList.find((item) => item.id === unit?.plazaId);
        const countdown = tenant.agreementEnd ? daysBetween(new Date().toISOString().slice(0, 10), tenant.agreementEnd) : undefined;
        return <Card key={tenant.id} className="h-full transition hover:border-primary/40"><CardContent className="p-4">
          <button type="button" onClick={() => setSelectedTenantId(tenant.id)} className="w-full rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted">{plaza?.name}</p><h3 className="font-semibold text-ink">{tenant.name}</h3><p className="text-sm text-muted">{tenant.phone} · {tenant.cnic}</p></div><Badge className={cn("border", countdown !== undefined && countdown <= 30 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sky-200 bg-sky-50 text-sky-700")}>{countdown === undefined ? "Current tenant" : `${countdown} days`}</Badge></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><span>{unit?.number}</span><span>{formatMoney(tenant.monthlyRent ?? unit?.monthlyRent ?? 0)}</span><span>Advance {formatMoney(tenant.advance)}</span><span>CNIC photos attached</span></div>
            {tenant.status === "vacated" ? <p className="mt-3 text-xs font-medium text-amber-700">Vacated on {tenant.vacatedAt ?? "date not recorded"} · historical records retained</p> : null}
            <p className="mt-4 text-xs font-medium text-primary">View tenant details</p>
          </button>
          <div className="mt-4 flex gap-2"><Button variant="outline" size="sm" onClick={() => setEditingTenantId(tenant.id)}>Tafseel Tabdeel Karein</Button><Button variant="outline" size="sm" onClick={() => { const number = whatsappNumber(tenant.phone); if (number) window.open(`https://wa.me/${number}`, "_blank", "noopener,noreferrer"); }}>WhatsApp</Button><Button variant="secondary" size="sm" disabled={tenant.status !== "active"} onClick={() => { setVacatingTenantId(tenant.id); setLeavingDate(""); setBalanceConfirmed(false); setBalanceReceivedBy(""); setBalancePaymentMethod("Cash"); }}>Dukan Khali Karein</Button></div>
        </CardContent></Card>;
      })}</div> : <Card><CardContent className="p-6 text-center text-sm text-muted">No tenants found for this plaza.</CardContent></Card>}
      {showForm ? <TenantForm plazaList={plazaList} unitList={unitList} onClose={() => setShowForm(false)} onSave={(values) => { onSaveTenant(values); setShowForm(false); }} /> : null}
      {editingTenant ? <TenantForm key={editingTenant.id} plazaList={plazaList} unitList={unitList} initialTenant={editingTenant} onClose={() => setEditingTenantId(null)} onSave={(values) => { onUpdateTenant(editingTenant.id, values); setEditingTenantId(null); }} /> : null}
      <TenantDetailPanel tenantId={selectedTenantId} onClose={() => setSelectedTenantId(null)} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} documentList={documentList} />
      {vacatingTenant ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-xl sm:rounded-[24px]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm text-muted">Tenant move-out</p><h2 className="mt-1 text-xl font-semibold text-ink">{vacatingTenant.name} ki Dukan Khali Karein</h2></div>
              <Button variant="outline" size="icon" aria-label="Close vacate form" onClick={closeVacateDialog}><X className="h-4 w-4" /></Button>
            </div>
            <label className="mt-5 block text-sm font-medium text-text">Leaving date<input type="date" required value={leavingDate} onChange={(event) => { setLeavingDate(event.target.value); setBalanceConfirmed(false); }} className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3" /></label>
            <div className="mt-5 rounded-2xl border border-border">
              <h3 className="border-b border-border p-3 font-semibold text-ink">Outstanding rent to settle</h3>
              {!leavingDate ? <p className="p-3 text-sm text-muted">Choose the leaving date to calculate the balance through that month.</p> : vacatingBalances.length ? (
                <div className="divide-y divide-border">
                  {vacatingBalances.map(({ entry, paid, balance }) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><div><p className="font-medium text-ink">{monthLabel(entry.month)} · Unit {unitList.find((unit) => unit.id === entry.unitId)?.number ?? "—"}</p><p className="text-xs text-muted">Due {formatMoney(entry.dueAmount + entry.carriedForward)} · paid {formatMoney(paid)}</p></div><strong className="text-rose-700">{formatMoney(balance)}</strong></div>)}
                </div>
              ) : <p className="p-3 text-sm text-muted">No outstanding rent through the leaving month.</p>}
              <div className="flex justify-between border-t border-border p-3 font-semibold"><span>Total remaining balance</span><span>{formatMoney(totalVacatingBalance)}</span></div>
            </div>
            {totalVacatingBalance > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-text">Balance payment method<select value={balancePaymentMethod} onChange={(event) => { setBalancePaymentMethod(event.target.value as PaymentMethod); setBalanceConfirmed(false); }} className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3"><option>Cash</option><option>Bank Transfer</option><option>JazzCash</option><option>Easypaisa</option><option>Cheque</option></select></label>
              <label className="text-sm font-medium text-text">Received by<input value={balanceReceivedBy} onChange={(event) => { setBalanceReceivedBy(event.target.value); setBalanceConfirmed(false); }} required className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3" placeholder="Name of the person who received payment" /></label>
            </div> : null}
            <Button type="button" variant={balanceConfirmed ? "secondary" : "outline"} className="mt-4 w-full" aria-pressed={balanceConfirmed} disabled={!leavingDate || (totalVacatingBalance > 0 && !balanceReceivedBy.trim())} onClick={() => setBalanceConfirmed(true)}>{balanceConfirmed ? "Balance settlement confirmed" : `Confirm balance collected (${formatMoney(totalVacatingBalance)})`}</Button>
            <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={closeVacateDialog}>Cancel</Button><Button disabled={!balanceConfirmed || !leavingDate} onClick={() => setConfirmVacate(true)}>Save move-out</Button></div>
          </motion.div>
          {confirmVacate ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-vacate-title">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-soft">
              <h3 id="confirm-vacate-title" className="text-lg font-semibold text-ink">Are you sure?</h3>
              <p className="mt-2 text-sm text-muted">This will mark {vacatingTenant.name} as vacated on {leavingDate} and make the unit empty. Past rent records will be kept.</p>
              <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setConfirmVacate(false)}>No, go back</Button><Button onClick={() => { onVacateTenant(vacatingTenant.id, leavingDate, balanceReceivedBy.trim(), balancePaymentMethod); closeVacateDialog(); }}>Yes, vacate tenant</Button></div>
            </div>
          </div> : null}
        </div>
      ) : null}
    </PageFrame>
  );
}

function Rent({
  statementOnly = false,
  t,
  plazaList,
  tenantList,
  unitList,
  rentEntryList,
  expenseList,
  ownerPaymentList,
  ownerList,
  rentSheetKeys,
  initialPlazaId,
  onRentSheetKeysChange,
  onRentEntriesChange,
  onRecordPayment,
}: {
  statementOnly?: boolean;
  t: typeof dictionaries.en;
  plazaList: Plaza[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  ownerList: Owner[];
  expenseList: Expense[];
  ownerPaymentList: OwnerPayment[];
  rentSheetKeys: string[];
  initialPlazaId?: string;
  onRentSheetKeysChange: React.Dispatch<React.SetStateAction<string[]>>;
  onRentEntriesChange: React.Dispatch<React.SetStateAction<RentEntry[]>>;
  onRecordPayment: (entryId: string, amount: number, method: PaymentMethod, receivedBy: string, reference?: string) => Payment;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [selectedPlazaId, setSelectedPlazaId] = useState(initialPlazaId ?? plazaList[0]?.id ?? "plaza-a");
  const [selectedMonth, setSelectedMonth] = useState(demoMonth);
  const [tenantSearch, setTenantSearch] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [receiptShareMessage, setReceiptShareMessage] = useState("");
  const [sharingReceipt, setSharingReceipt] = useState(false);
  const [rentReminderStatus, setRentReminderStatus] = useState("");
  const [receipt, setReceipt] = useState<{ payment: Payment; entry: RentEntry; tenant: Tenant; unit: Unit } | null>(null);
  const selectedYear = selectedMonth.slice(0, 4);
  const selectedMonthNumber = selectedMonth.slice(5, 7);
  const yearOptions = Array.from(new Set([
    ...Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)),
    ...rentEntryList.map((entry) => entry.month.slice(0, 4)),
  ])).sort((a, b) => Number(b) - Number(a));
  const sheetRows = rentEntryList.filter((entry) => entry.plazaId === selectedPlazaId && entry.month === selectedMonth && entry.status !== "vacant");
  const rows = sheetRows.filter((entry) => {
    const tenant = tenantList.find((item) => item.id === entry.tenantId);
    const unit = unitList.find((item) => item.id === entry.unitId);
    const matchesSearch = `${tenant?.name ?? ""} ${unit?.number ?? ""} ${unit?.typeName ?? ""}`.toLowerCase().includes(tenantSearch.toLowerCase());
    return matchesSearch && (filter === "all" || entry.status === filter);
  });
  const selectedPlaza = plazaList.find((plaza) => plaza.id === selectedPlazaId);
  const selectedEntry = selectedEntryId ? rentEntryList.find((entry) => entry.id === selectedEntryId) : undefined;
  const selectedUnit = selectedEntry ? unitList.find((unit) => unit.id === selectedEntry.unitId) : undefined;
  const selectedTenant = selectedEntry ? tenantList.find((tenant) => tenant.id === selectedEntry.tenantId) : undefined;
  const selectedPaid = selectedEntry ? selectedEntry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0) : 0;
  const selectedBalance = selectedEntry ? Math.max(0, selectedEntry.dueAmount + selectedEntry.carriedForward - selectedPaid) : 0;
  const expected = sheetRows.reduce((sum, entry) => sum + entry.dueAmount + entry.carriedForward, 0);
  const collected = sheetRows.reduce((sum, entry) => sum + entry.payments.reduce((inner, payment) => payment.status === "active" ? inner + payment.amount : inner, 0), 0);
  const missingEntries = missingRentEntriesForMonth(selectedPlazaId, selectedMonth, unitList, tenantList, rentEntryList);
  const monthExpenses = expenseList.filter((expense) => expense.plazaId === selectedPlazaId && expense.date.startsWith(selectedMonth));
  const paidExpenses = monthExpenses.filter((expense) => expenseIsPaid(expense) === "paid");
  const rentFundedExpenses = paidExpenses.filter((expense) => expenseWasPaidFromRent(expense) === "rent");
  const expenseTotal = rentFundedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const distributableNet = collected - expenseTotal;
  const ownerDistribution = selectedPlaza && distributableNet > 0
    ? distributeNet(selectedPlaza, selectedMonth, distributableNet, monthExpenses)
    : [];
  const monthOwnerPayments = ownerPaymentList.filter((payment) => payment.plazaId === selectedPlazaId && payment.month === selectedMonth);
  const paidRows = sheetRows.filter((entry) => {
    const paid = entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
    return entry.dueAmount + entry.carriedForward <= paid;
  });
  const leftThisMonth = tenantList.filter((tenant) =>
    tenant.status === "vacated" &&
    tenant.vacatedAt?.startsWith(selectedMonth) &&
    unitList.find((unit) => unit.id === tenant.unitId)?.plazaId === selectedPlazaId
  );
  const bankAmountSent = monthOwnerPayments.reduce((sum, payment) => sum + payment.amountSent, 0);
  const bankAmountRemaining = Math.max(0, distributableNet - bankAmountSent);

  function createMonthSheet() {
    const newEntries = missingRentEntriesForMonth(selectedPlazaId, selectedMonth, unitList, tenantList, rentEntryList);
    onRentEntriesChange((current) => {
      const uniqueEntries = newEntries.filter((newEntry) => !current.some((entry) =>
        entry.unitId === newEntry.unitId && entry.tenantId === newEntry.tenantId && entry.month === newEntry.month
      ));
      return uniqueEntries.length ? [...current, ...uniqueEntries] : current;
    });
    const key = `${selectedPlazaId}:${selectedMonth}`;
    onRentSheetKeysChange((current) => current.includes(key) ? current : [...current, key]);
  }
  function sendRentReminder(entry: RentEntry) {
    const tenant = tenantList.find((item) => item.id === entry.tenantId);
    if (!tenant) {
      setRentReminderStatus("No tenant record is linked to this rent entry.");
      return;
    }
    const balance = Math.max(0, entry.dueAmount + entry.carriedForward - activePaymentTotal(entry));
    if (balance <= 0) {
      setRentReminderStatus("This rent entry has no outstanding balance.");
      return;
    }
    const message = `Assalam-o-alaikum ${tenant.name}, this is a reminder to pay your rent for ${monthLabel(entry.month)}. Remaining rent: ${formatMoney(balance)}. Thank you.`;
    if (!openWhatsAppReminder(tenant.phone, message)) {
      setRentReminderStatus(`The saved WhatsApp number for ${tenant.name} is invalid. Update the tenant phone number and try again.`);
      return;
    }
    setRentReminderStatus(`WhatsApp reminder prepared for ${tenant.name} (${monthLabel(entry.month)} · ${formatMoney(balance)}).`);
  }
  function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");
    if (!selectedEntry || !selectedTenant || !selectedUnit) return;
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const receivedBy = String(data.get("receivedBy") ?? "").trim();
    if (!receivedBy) {
      setPaymentError("Enter the name of the person who received the payment.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedBalance) {
      setPaymentError("Enter a payment amount greater than zero and no more than the remaining balance.");
      return;
    }
    const payment = onRecordPayment(
      selectedEntry.id,
      amount,
      String(data.get("method")) as PaymentMethod,
      receivedBy,
      String(data.get("reference") ?? "").trim() || undefined,
    );
    const savedEntry = {
      ...selectedEntry,
      payments: [...selectedEntry.payments, payment],
    };
    setReceipt({ payment, entry: savedEntry, tenant: selectedTenant, unit: selectedUnit });
    setReceiptShareMessage("");
    setSelectedEntryId(null);
  }
  async function shareReceiptPdf() {
    if (!receipt) return;
    setSharingReceipt(true);
    setReceiptShareMessage("");
    try {
      const number = whatsappNumber(receipt.tenant.phone);
      if (!number) {
        setReceiptShareMessage("The tenant's saved WhatsApp number is invalid. Update the tenant phone number and try again.");
        return;
      }
      const plazaName = plazaList.find((plaza) => plaza.id === receipt.entry.plazaId)?.name ?? "Rent receipt";
      const balance = Math.max(0, receipt.entry.dueAmount + receipt.entry.carriedForward - receipt.entry.payments
        .filter((payment) => payment.status === "active")
        .reduce((sum, payment) => sum + payment.amount, 0));
      const safePlazaName = plazaName.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "plaza";
      const fileName = `${safePlazaName}-${receipt.payment.id}.pdf`;
      const message = [
        `Rent receipt ${receipt.payment.id}`,
        `${plazaName} · ${receipt.unit.number} · ${monthLabel(receipt.entry.month)}`,
        `Amount received: ${formatMoney(receipt.payment.amount)}`,
        "Please find the PDF receipt attached.",
      ].join("\n");
      const supportsFileSharing = typeof navigator.share === "function" &&
        Boolean(navigator.canShare?.({ files: [new File([], fileName, { type: "application/pdf" })] }));
      if (!supportsFileSharing) openWhatsAppReminder(receipt.tenant.phone, message);
      const pdf = await createReceiptPdf({
        title: "Rent payment receipt",
        subtitle: plazaName,
        reference: `Receipt ${receipt.payment.id}`,
        rows: [
          ["Tenant", receipt.tenant.name],
          ["Unit", receipt.unit.number],
          ["Rent month", monthLabel(receipt.entry.month)],
          ["Paid on", receipt.payment.date],
          ["Payment method", receipt.payment.method],
          ["Amount received", formatMoney(receipt.payment.amount)],
          ["Received by", receipt.payment.receivedBy ?? "—"],
          ["Reference", receipt.payment.reference ?? "—"],
          ["Balance remaining", formatMoney(balance)],
        ],
      });
      const sharingResult = await shareOrDownloadPdf(pdf, fileName, "Rent payment receipt", message);
      if (sharingResult === "shared") {
        setReceiptShareMessage("The PDF and message are ready in your device's share sheet. Choose WhatsApp, then select the tenant to send.");
      } else {
        setReceiptShareMessage(`WhatsApp opened for ${receipt.tenant.phone}. The PDF was downloaded; attach it in the chat, then send.`);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setReceiptShareMessage(cause instanceof Error ? cause.message : "Could not share the receipt PDF.");
    } finally {
      setSharingReceipt(false);
    }
  }
  return (
    <PageFrame title={statementOnly ? t.summary : t.rent} action={!statementOnly ? <Button><CircleDollarSign className="h-4 w-4" />{t.recordRent}</Button> : undefined}>
      {statementOnly ? <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-text">Plaza<select value={selectedPlazaId} onChange={(event) => setSelectedPlazaId(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-bg px-3">{plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium text-text">{t.month}<select value={selectedMonthNumber} onChange={(event) => setSelectedMonth(`${selectedYear}-${event.target.value}`)} className="h-11 w-full rounded-xl border border-border bg-bg px-3">{Array.from({ length: 12 }, (_, index) => { const value = String(index + 1).padStart(2, "0"); return <option key={value} value={value}>{new Date(Number(selectedYear), index, 1).toLocaleDateString("en-PK", { month: "long" })}</option>; })}</select></label>
        <label className="grid gap-1 text-sm font-medium text-text">{t.year}<select value={selectedYear} onChange={(event) => setSelectedMonth(`${event.target.value}-${selectedMonthNumber}`)} className="h-11 w-full rounded-xl border border-border bg-bg px-3">{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      </div> : null}
      {!statementOnly ? <>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="grid gap-1 text-sm font-medium text-text">{t.month}
          <select value={selectedMonthNumber} onChange={(event) => setSelectedMonth(`${selectedYear}-${event.target.value}`)} className="h-11 min-w-36 rounded-xl border border-border bg-bg px-3">
            {Array.from({ length: 12 }, (_, index) => {
              const value = String(index + 1).padStart(2, "0");
              return <option key={value} value={value}>{new Date(Number(selectedYear), index, 1).toLocaleDateString("en-PK", { month: "long" })}</option>;
            })}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-text">{t.year}
          <select value={selectedYear} onChange={(event) => setSelectedMonth(`${event.target.value}-${selectedMonthNumber}`)} className="h-11 min-w-28 rounded-xl border border-border bg-bg px-3">
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="grid min-w-56 flex-1 gap-1 text-sm font-medium text-text">{t.searchRentRecords}
          <input value={tenantSearch} onChange={(event) => setTenantSearch(event.target.value)} className="h-11 rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder={t.searchRentRecords} />
        </label>
        {missingEntries.length > 0 || !rentSheetKeys.includes(`${selectedPlazaId}:${selectedMonth}`) ? <Button variant="outline" onClick={createMonthSheet}>{rentSheetKeys.includes(`${selectedPlazaId}:${selectedMonth}`) ? t.addMissingRentRows : t.createMonthSheet}{missingEntries.length ? ` (${missingEntries.length})` : ""}</Button> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {plazaList.map((plaza) => {
          const plazaRows = rentEntryList.filter((entry) => entry.plazaId === plaza.id && entry.month === selectedMonth && entry.status !== "vacant");
          const plazaCollected = plazaRows.reduce((sum, entry) => sum + entry.payments.reduce((inner, payment) => payment.status === "active" ? inner + payment.amount : inner, 0), 0);
          const plazaExpected = plazaRows.reduce((sum, entry) => sum + entry.dueAmount + entry.carriedForward, 0);
          return (
            <button
              key={plaza.id}
              onClick={() => {
                setSelectedPlazaId(plaza.id);
                setSelectedEntryId(null);
              }}
              className={cn(
                "rounded-2xl border bg-surface p-4 text-start shadow-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selectedPlazaId === plaza.id ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/40"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{plaza.name}</h3>
                  <p className="text-sm text-muted">{monthLabel(selectedMonth)} · {plazaRows.length} tenants</p>
                </div>
                <Badge className="border-primary/20 bg-primary-soft text-primary">{t.rent}</Badge>
              </div>
              <div className="mt-4 h-2 rounded-full bg-bg">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round((plazaCollected / Math.max(plazaExpected, 1)) * 100)}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted">{formatMoney(plazaCollected)} of {formatMoney(plazaExpected)}</p>
            </button>
          );
        })}
      </div>
      <Card className="bg-ink text-white"><CardContent className="p-4"><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-white/60">{t.expected}</p><p className="text-2xl font-semibold tabular-nums">{formatMoney(expected)}</p></div><div><p className="text-white/60">{t.collected}</p><p className="text-2xl font-semibold tabular-nums">{formatMoney(collected)}</p></div><div><p className="text-white/60">{t.unpaid}</p><p className="text-2xl font-semibold tabular-nums">{formatMoney(expected - collected)}</p></div></div></CardContent></Card>
      <div className="flex flex-wrap items-center gap-2"><Badge className="border-sky-200 bg-sky-50 text-sky-700">{selectedPlaza?.name}</Badge><Badge className="border-slate-200 bg-slate-50 text-slate-700">{monthLabel(selectedMonth)}</Badge>{["all", "paid", "partly-paid", "unpaid", "overdue"].map((item) => <Button key={item} variant={filter === item ? "default" : "outline"} size="sm" onClick={() => setFilter(item)}>{item === "all" ? "All" : item}</Button>)}</div>
      {rows.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted">{sheetRows.length === 0 ? missingEntries.length === 0 ? rentSheetKeys.includes(`${selectedPlazaId}:${selectedMonth}`) ? "This monthly sheet has no active tenant rent rows." : t.noActiveTenants : t.noRentRecords : "No matching rent records."}</CardContent></Card> : null}
      {rentReminderStatus ? <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{rentReminderStatus}</p> : null}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface lg:block"><table className="w-full min-w-[980px] text-sm"><thead className="bg-bg text-muted"><tr><th className="p-3 text-start">Unit</th><th className="p-3 text-start">Tenant</th><th className="p-3 text-start">Due</th><th className="p-3 text-start">Paid</th><th className="p-3 text-start">{t.paymentDates}</th><th className="p-3 text-start">Balance</th><th className="p-3 text-start">Status</th><th className="p-3 text-start">Actions</th></tr></thead><tbody>{rows.map((entry) => {
        const unit = unitList.find((item) => item.id === entry.unitId);
        const tenant = tenantList.find((item) => item.id === entry.tenantId);
        const activePayments = entry.payments.filter((payment) => payment.status === "active");
        const paid = activePayments.reduce((sum, payment) => sum + payment.amount, 0);
        const balance = Math.max(0, entry.dueAmount + entry.carriedForward - paid);
        return <tr key={entry.id} className="border-t border-border"><td className="p-3">{unit?.number}</td><td className="p-3">{tenant?.name}</td><td className="p-3 tabular-nums">{formatMoney(entry.dueAmount)}</td><td className="p-3 tabular-nums">{formatMoney(paid)}</td><td className="p-3">{activePayments.length ? activePayments.map((payment) => <div key={payment.id} className="whitespace-nowrap">{payment.date} · {payment.method}</div>) : "—"}</td><td className="p-3 tabular-nums">{formatMoney(balance)}</td><td className="p-3"><StatusBadge value={balance === 0 ? "paid" : paid > 0 ? "partly-paid" : "overdue"} label={balance === 0 ? t.paid : paid > 0 ? t.partlyPaid : t.overdue} /></td><td className="p-3"><div className="flex flex-wrap gap-2"><Button className="whitespace-nowrap" size="sm" disabled={balance === 0} onClick={() => setSelectedEntryId(entry.id)}>{t.markPaid}</Button><Button className="whitespace-nowrap" variant="outline" size="sm" disabled={balance === 0} onClick={() => setSelectedEntryId(entry.id)}>{t.partPayment}</Button><Button className="whitespace-nowrap" variant="ghost" size="sm" disabled={balance === 0} onClick={() => sendRentReminder(entry)}>Reminder</Button></div></td></tr>;
      })}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{rows.map((entry) => {
        const unit = unitList.find((item) => item.id === entry.unitId);
        const tenant = tenantList.find((item) => item.id === entry.tenantId);
        const activePayments = entry.payments.filter((payment) => payment.status === "active");
        const paid = activePayments.reduce((sum, payment) => sum + payment.amount, 0);
        const balance = Math.max(0, entry.dueAmount + entry.carriedForward - paid);
        return <Card key={entry.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold text-ink">{unit?.number}</h3><p className="break-words text-sm text-muted">{tenant?.name}</p></div><StatusBadge value={balance === 0 ? "paid" : paid > 0 ? "partly-paid" : "overdue"} label={balance === 0 ? t.paid : paid > 0 ? t.partlyPaid : t.overdue} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><span><strong className="block">{formatMoney(entry.dueAmount)}</strong>Due</span><span><strong className="block">{formatMoney(paid)}</strong>Paid</span><span><strong className="block">{formatMoney(balance)}</strong>Balance</span></div>{activePayments.length ? <div className="mt-3 break-words text-xs text-muted">{t.paymentDates}: {activePayments.map((payment) => `${payment.date} (${payment.method})`).join(", ")}</div> : null}<div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"><Button className="min-h-11 w-full whitespace-normal px-2 text-xs leading-tight sm:text-sm" size="sm" disabled={balance === 0} onClick={() => setSelectedEntryId(entry.id)}>{t.markPaid}</Button><Button className="min-h-11 w-full whitespace-normal px-2 text-xs leading-tight sm:text-sm" variant="outline" size="sm" disabled={balance === 0} onClick={() => setSelectedEntryId(entry.id)}>{t.partPayment}</Button><Button className="min-h-11 w-full whitespace-normal px-2 text-xs leading-tight sm:text-sm" variant="ghost" size="sm" disabled={balance === 0} onClick={() => sendRentReminder(entry)}>Reminder</Button></div></CardContent></Card>;
      })}</div>
      </> : null}
      {statementOnly ? <section className="print-rent-statement space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{selectedPlaza?.name}</p>
            <h2 className="text-xl font-semibold text-ink">{t.monthlyStatement} · {monthLabel(selectedMonth)}</h2>
            <p className="mt-1 text-sm text-muted">{selectedPlaza?.address}</p>
          </div>
          <Button onClick={() => window.print()}><Download className="h-4 w-4" />{t.downloadPdf}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t.expected} value={formatMoney(expected)} />
          <StatCard label={t.rentReceived} value={formatMoney(collected)} />
          <StatCard label={t.outstandingRent} value={formatMoney(Math.max(0, expected - collected))} />
          <StatCard label={t.totalExpenses} value={formatMoney(expenseTotal)} />
          <StatCard label="Net amount to send to bank" value={formatMoney(distributableNet)} />
          <StatCard label="Sent from bank" value={formatMoney(bankAmountSent)} />
          <StatCard label="Remaining bank transfers" value={formatMoney(bankAmountRemaining)} />
        </div>
        {leftThisMonth.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><h3 className="font-semibold">Tenants who left this month</h3><ul className="mt-2 space-y-1">{leftThisMonth.map((tenant) => <li key={tenant.id}>{tenant.name} · Unit {unitList.find((unit) => unit.id === tenant.unitId)?.number ?? "—"} · left {tenant.vacatedAt}</li>)}</ul></div> : null}
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-border">
            <div className="border-b border-border p-3"><h3 className="font-semibold text-ink">Paid rent</h3></div>
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-bg text-muted"><tr><th className="p-3 text-start">Unit</th><th className="p-3 text-start">Tenant</th><th className="p-3 text-start">{t.expected}</th><th className="p-3 text-start">{t.rentReceived}</th><th className="p-3 text-start">Balance</th></tr></thead>
              <tbody>{paidRows.map((entry) => {
                const paid = entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
                return <tr key={entry.id} className="border-t border-border"><td className="p-3">{unitList.find((unit) => unit.id === entry.unitId)?.number ?? "—"}</td><td className="p-3">{tenantList.find((tenant) => tenant.id === entry.tenantId)?.name ?? "—"}</td><td className="p-3">{formatMoney(entry.dueAmount + entry.carriedForward)}</td><td className="p-3">{formatMoney(paid)}</td><td className="p-3">{formatMoney(Math.max(0, entry.dueAmount + entry.carriedForward - paid))}</td></tr>;
              })}</tbody>
            </table>
            {paidRows.length === 0 ? <p className="p-3 text-sm text-muted">No fully paid rent rows for this month.</p> : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <div className="border-b border-border p-3"><h3 className="font-semibold text-ink">{t.unpaidTenants}</h3></div>
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-bg text-muted"><tr><th className="p-3 text-start">Unit</th><th className="p-3 text-start">Tenant</th><th className="p-3 text-start">{t.expected}</th><th className="p-3 text-start">{t.rentReceived}</th><th className="p-3 text-start">{t.outstandingRent}</th></tr></thead>
              <tbody>{sheetRows.filter((entry) => {
                const paid = entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
                return entry.dueAmount + entry.carriedForward > paid;
              }).map((entry) => {
                const paid = entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
                return <tr key={entry.id} className="border-t border-border"><td className="p-3">{unitList.find((unit) => unit.id === entry.unitId)?.number ?? "—"}</td><td className="p-3">{tenantList.find((tenant) => tenant.id === entry.tenantId)?.name ?? "—"}</td><td className="p-3">{formatMoney(entry.dueAmount + entry.carriedForward)}</td><td className="p-3">{formatMoney(paid)}</td><td className="p-3">{formatMoney(Math.max(0, entry.dueAmount + entry.carriedForward - paid))}</td></tr>;
              })}</tbody>
            </table>
            {sheetRows.length > 0 && sheetRows.every((entry) => entry.dueAmount + entry.carriedForward <= entry.payments.filter((payment) => payment.status === "active").reduce((sum, payment) => sum + payment.amount, 0)) ? <p className="p-3 text-sm text-muted">No outstanding rent for this month.</p> : null}
          </div>
          <div className="rounded-xl border border-border">
            <div className="border-b border-border p-3"><h3 className="font-semibold text-ink">{t.operatingExpenses}</h3></div>
            {monthExpenses.length ? <div className="divide-y divide-border">{monthExpenses.map((expense) => <div key={expense.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><div><p className="font-medium text-ink">{expense.description}</p><p className="text-muted">{expense.date} · {expense.category} · {expense.paymentStatus === "unpaid" ? "Unpaid" : expense.paymentMethod ?? expense.paidBy ?? "Paid"}</p><p className="text-xs text-muted">{expenseIsPaid(expense) === "paid" ? expenseWasPaidFromRent(expense) === "rent" ? "Paid from rent collection" : "Paid from outside rent" : "Not deducted from rent (unpaid)"} · Bill/receipt: {expense.billUrl ? "Attached" : t.notRecorded}</p></div><strong className="text-ink">{formatMoney(expense.amount)}</strong></div>)}</div> : <p className="p-3 text-sm text-muted">No expenses recorded for this month.</p>}
            <div className="flex justify-between border-t border-border p-3 text-sm font-semibold"><span>Paid from rent collection</span><span>{formatMoney(expenseTotal)}</span></div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="border-b border-border p-3"><h3 className="font-semibold text-ink">{t.rentLedger}</h3></div>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-bg text-muted"><tr><th className="p-3 text-start">Date</th><th className="p-3 text-start">Unit</th><th className="p-3 text-start">Tenant</th><th className="p-3 text-start">Amount</th><th className="p-3 text-start">Method</th><th className="p-3 text-start">Reference</th></tr></thead>
            <tbody>{sheetRows.flatMap((entry) => entry.payments.filter((payment) => payment.status === "active").map((payment) => <tr key={payment.id} className="border-t border-border"><td className="p-3">{payment.date}</td><td className="p-3">{unitList.find((unit) => unit.id === entry.unitId)?.number ?? "—"}</td><td className="p-3">{tenantList.find((tenant) => tenant.id === entry.tenantId)?.name ?? "—"}</td><td className="p-3">{formatMoney(payment.amount)}</td><td className="p-3">{payment.method}</td><td className="p-3">{payment.reference ?? "—"}</td></tr>))}</tbody>
          </table>
          {collected === 0 ? <p className="p-3 text-sm text-muted">No rent payments recorded for this month.</p> : null}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="border-b border-border p-3"><h3 className="font-semibold text-ink">{t.ownerTransfers}</h3><p className="mt-1 text-xs text-muted">{t.netProfit}: {formatMoney(distributableNet)}</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-bg text-muted"><tr><th className="p-3 text-start">Owner</th><th className="p-3 text-start">{t.expectedShare}</th><th className="p-3 text-start">{t.sentSoFar}</th><th className="p-3 text-start">Sent by</th><th className="p-3 text-start">Bank</th><th className="p-3 text-start">{t.accountNumber}</th><th className="p-3 text-start">Transaction</th><th className="p-3 text-start">{t.bankReceipt}</th></tr></thead>
            <tbody>{ownerDistribution.map((row) => {
              const transfer = monthOwnerPayments.find((payment) => payment.ownerId === row.ownerId);
              const owner = ownerList.find((item) => item.id === row.ownerId);
              return <tr key={row.ownerId} className="border-t border-border"><td className="p-3">{ownerName(ownerList, row.ownerId)}</td><td className="p-3">{formatMoney(row.amount)}</td><td className="p-3">{formatMoney(transfer?.amountSent ?? 0)} · {transfer?.status ?? "not-sent"}</td><td className="p-3">{transfer?.sentBy ?? t.notRecorded}</td><td className="p-3">{transfer?.sendingBankName ?? transfer?.bankName ?? owner?.bank ?? t.notRecorded}</td><td className="p-3">{transfer?.accountNumber ?? t.notRecorded}</td><td className="p-3">{transfer?.transactionId ?? t.notRecorded}</td><td className="p-3">{transfer?.receiptUrl ?? t.notRecorded}</td></tr>;
            })}</tbody>
          </table>
          {ownerDistribution.length === 0 ? <p className="p-3 text-sm text-muted">No owner allocation available for this month.</p> : null}
        </div>
      </section> : null}
      {!statementOnly && selectedEntry && selectedTenant && selectedUnit ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-lg sm:rounded-[24px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted">{selectedPlaza?.name} · {selectedUnit.number}</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">{selectedTenant.name}</h2>
              </div>
              <Button variant="outline" size="icon" aria-label="Close payment form" onClick={() => setSelectedEntryId(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-bg p-3 text-sm">
              <span><strong className="block text-ink">{formatMoney(selectedEntry.dueAmount)}</strong>due</span>
              <span><strong className="block text-ink">{formatMoney(selectedPaid)}</strong>paid</span>
              <span><strong className="block text-ink">{formatMoney(selectedBalance)}</strong>balance</span>
            </div>
            <form onSubmit={savePayment}>
              <div className="mt-5 grid gap-3">
                <label className="text-sm font-medium text-text">Amount received<input name="amount" type="number" min="1" max={selectedBalance} step="1" required className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3 tabular-nums outline-none focus:ring-2 focus:ring-primary/30" defaultValue={selectedBalance} /></label>
                <label className="text-sm font-medium text-text">Received by<input name="receivedBy" type="text" required onChange={() => setPaymentError("")} placeholder="Name of the person who received payment" className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3 outline-none focus:ring-2 focus:ring-primary/30" /></label>
                <label className="text-sm font-medium text-text">Method<select name="method" className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3 outline-none focus:ring-2 focus:ring-primary/30" defaultValue="Cash"><option>Cash</option><option>Bank Transfer</option><option>JazzCash</option><option>Easypaisa</option><option>Cheque</option></select></label>
                <label className="text-sm font-medium text-text">Reference / note<input name="reference" className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3 outline-none focus:ring-2 focus:ring-primary/30" placeholder="Optional payment reference" /></label>
              </div>
              {paymentError ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{paymentError}</p> : null}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedEntryId(null)}>Cancel</Button>
                <Button type="submit">Save payment</Button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
      {!statementOnly && receipt ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-lg sm:rounded-[24px]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm text-muted">Rent payment recorded</p><h2 className="mt-1 text-xl font-semibold text-ink">Receipt / payment slip</h2></div>
              <Button variant="outline" size="icon" aria-label="Close receipt" onClick={() => setReceipt(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="print-receipt mt-5 space-y-3 rounded-2xl border border-border bg-white p-5 text-sm text-slate-800">
              <div className="border-b border-dashed border-slate-300 pb-3 text-center"><p className="text-xs uppercase tracking-wide text-slate-500">{plazaList.find((plaza) => plaza.id === receipt.entry.plazaId)?.name}</p><h3 className="mt-1 text-lg font-bold">Rent payment receipt</h3><p className="mt-1 text-xs text-slate-500">{receipt.payment.id}</p></div>
              <div className="grid grid-cols-2 gap-3"><span className="text-slate-500">Tenant</span><strong>{receipt.tenant.name}</strong><span className="text-slate-500">Unit</span><strong>{receipt.unit.number}</strong><span className="text-slate-500">Rent month</span><strong>{monthLabel(receipt.entry.month)}</strong><span className="text-slate-500">Paid on</span><strong>{receipt.payment.date}</strong><span className="text-slate-500">Method</span><strong>{receipt.payment.method}</strong><span className="text-slate-500">Amount received</span><strong>{formatMoney(receipt.payment.amount)}</strong><span className="text-slate-500">Received by</span><strong>{receipt.payment.receivedBy ?? "—"}</strong><span className="text-slate-500">Reference</span><strong>{receipt.payment.reference ?? "—"}</strong><span className="text-slate-500">Balance remaining</span><strong>{formatMoney(Math.max(0, receipt.entry.dueAmount + receipt.entry.carriedForward - receipt.entry.payments.filter((payment) => payment.status === "active").reduce((sum, payment) => sum + payment.amount, 0)))}</strong></div>
              <p className="border-t border-dashed border-slate-300 pt-3 text-center text-xs text-slate-500">Thank you. Keep this receipt for your records.</p>
            </div>
            {receiptShareMessage ? <p role="status" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{receiptShareMessage}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => window.print()}>Print receipt</Button><Button onClick={shareReceiptPdf} disabled={sharingReceipt}><Receipt className="h-4 w-4" />{sharingReceipt ? "Preparing PDF…" : t.shareWhatsAppReceipt}</Button><Button className="col-span-2" variant="outline" onClick={() => setReceipt(null)}>Done</Button></div>
          </motion.div>
        </div>
      ) : null}
      <style jsx global>{`@media print{body *{visibility:hidden!important}.print-receipt,.print-receipt *,.print-rent-statement,.print-rent-statement *{visibility:visible!important}.print-receipt,.print-rent-statement{margin:0!important;width:100%!important;border:0!important;box-shadow:none!important;color:#111!important;background:#fff!important}.print-receipt{position:fixed!important;inset:0!important}.print-rent-statement{position:absolute!important;inset:0 auto auto 0!important;overflow:visible!important;padding:0!important}@page{margin:12mm}}`}</style>
    </PageFrame>
  );
}

const expenseCategories: ExpenseCategory[] = [
  "Electricity",
  "Water",
  "Maintenance",
  "Cleaning",
  "Security",
  "Repairs",
  "Salaries",
  "Property Tax",
  "Other",
];

function expenseIsPaid(expense: Expense) {
  return expense.paymentStatus ?? (expense.status === "approved" ? "paid" : "unpaid");
}

function expenseWasPaidFromRent(expense: Expense) {
  return expense.paidFrom ?? (expense.status === "approved" ? "rent" : "outside");
}

function ExpenseForm({
  plazaList,
  onClose,
  onSave,
}: {
  plazaList: Plaza[];
  onClose: () => void;
  onSave: (expense: Omit<Expense, "id">) => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("paid");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    const description = String(data.get("description") ?? "").trim();
    const attachment = data.get("attachment");
    const paymentMethod = String(data.get("paymentMethod") ?? "") as NonNullable<Expense["paymentMethod"]>;
    const paidBy = String(data.get("paidBy") ?? "").trim();
    const paidFrom = String(data.get("paidFrom") ?? "") as NonNullable<Expense["paidFrom"]>;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Enter an expense amount greater than zero in whole rupees.");
      return;
    }
    if (paymentStatus === "paid" && (!paidBy || !paymentMethod || !paidFrom)) {
      setError("Enter who paid, the payment method, and which funds were used.");
      return;
    }
    if (attachment instanceof File && attachment.size && !(
      attachment.type.startsWith("image/") || attachment.type === "application/pdf"
    )) {
      setError("Upload the bill or receipt as an image or PDF.");
      return;
    }
    setSaving(true);
    try {
      onSave({
        plazaId: String(data.get("plazaId")),
        category: String(data.get("category")) as ExpenseCategory,
        amount,
        date: String(data.get("date")),
        description,
        billUrl: attachment instanceof File && attachment.size ? await saveFile(attachment, "bills") : "",
        paymentStatus,
        paymentMethod: paymentStatus === "paid" ? paymentMethod : undefined,
        paidBy: paymentStatus === "paid" ? paidBy : "",
        paidFrom: paymentStatus === "paid" ? paidFrom : undefined,
        status: "approved",
        chargeTo: "plaza",
        ownerReason: undefined,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this expense.");
      setSaving(false);
    }
  }

  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-2xl sm:rounded-[24px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-primary">Expense records</p><h2 className="mt-1 text-2xl font-semibold text-ink">Add an expense</h2><p className="mt-1 text-sm text-muted">Record what it was for and whether it came from rent collections.</p></div>
          <Button type="button" variant="outline" size="icon" aria-label="Close add expense form" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-text">Plaza<select name="plazaId" required defaultValue={plazaList[0]?.id} className="form-input">{plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}</select></label>
          <label className="text-sm font-medium text-text">Expense date<input name="date" type="date" required defaultValue={localToday} className="form-input" /><span className="mt-1 block text-xs font-normal text-muted">This date determines the monthly statement.</span></label>
          <label className="text-sm font-medium text-text">Expense category<select name="category" required defaultValue="Maintenance" className="form-input">{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="text-sm font-medium text-text">Amount (PKR)<input name="amount" type="number" min="1" step="1" required className="form-input" placeholder="e.g. 5000" /></label>
          <label className="text-sm font-medium text-text sm:col-span-2">Description / reason<input name="description" required maxLength={240} className="form-input" placeholder="Generator repair or electricity bill for common areas" /></label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-text">Payment status</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["paid", "unpaid"] as const).map((status) => <button key={status} type="button" aria-pressed={paymentStatus === status} onClick={() => setPaymentStatus(status)} className={cn("rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition", paymentStatus === status ? "border-primary bg-primary-soft text-primary ring-2 ring-primary/15" : "border-border bg-bg text-muted hover:border-primary/40")}>{status}</button>)}
            </div>
          </fieldset>
          {paymentStatus === "paid" ? (
            <>
              <label className="text-sm font-medium text-text">Paid by<input name="paidBy" required className="form-input" placeholder="Name of the person who paid" /></label>
              <label className="text-sm font-medium text-text">Payment method<select name="paymentMethod" required defaultValue="Cash" className="form-input"><option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Other</option></select></label>
              <label className="text-sm font-medium text-text sm:col-span-2">Paid from<select name="paidFrom" required defaultValue="rent" className="form-input"><option value="rent">This month&apos;s rent collection</option><option value="outside">Outside rent (personal / other funds)</option></select><span className="mt-1 block text-xs font-normal text-muted">Only expenses paid from rent collections reduce this month&apos;s rent balance.</span></label>
            </>
          ) : null}
          <label className="text-sm font-medium text-text sm:col-span-2">Bill / receipt / invoice <span className="font-normal text-muted">(optional)</span><input name="attachment" type="file" accept="image/*,application/pdf,.pdf" className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save expense"}</Button></div>
        </form>
      </motion.div>
      <style jsx global>{`.form-input{margin-top:.5rem;display:block;min-height:3rem;width:100%;border-radius:.75rem;border:1px solid var(--color-border,#e5e7eb);background:var(--color-bg,#fff);padding:0 .75rem;color:inherit;outline:none}.form-input:focus{box-shadow:0 0 0 2px rgb(15 118 110 / .2)}`}</style>
    </div>
  );
}

function Expenses({ t, plazaList, expenseList, onSaveExpense }: { t: typeof dictionaries.en; plazaList: Plaza[]; expenseList: Expense[]; onSaveExpense: (expense: Omit<Expense, "id">) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedPlazaId, setSelectedPlazaId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filteredExpenses = expenseList.filter((expense) =>
    (selectedPlazaId === "all" || expense.plazaId === selectedPlazaId) &&
    (!dateFrom || expense.date >= dateFrom) &&
    (!dateTo || expense.date <= dateTo)
  );
  const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const paidTotal = filteredExpenses.filter((expense) => expenseIsPaid(expense) === "paid").reduce((sum, expense) => sum + expense.amount, 0);
  const unpaidTotal = filteredExpenses.filter((expense) => expenseIsPaid(expense) === "unpaid").reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <PageFrame title={t.expenses} action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />{t.addExpense}</Button>}>
      <section aria-labelledby="expense-summary-title" className="space-y-3">
        <div><h2 id="expense-summary-title" className="text-lg font-semibold text-ink">Expense summary</h2><p className="mt-1 text-sm text-muted">Summary and receipts below use the selected plaza and date range.</p></div>
        <div className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-3 sm:p-4">
          <label className="text-sm font-medium text-text">Plaza<select aria-label="Filter expenses by plaza" value={selectedPlazaId} onChange={(event) => setSelectedPlazaId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg px-3"><option value="all">All plazas</option>{plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}</select></label>
          <label className="text-sm font-medium text-text">From date<input aria-label="Expenses from date" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg px-3" /></label>
          <label className="text-sm font-medium text-text">To date<input aria-label="Expenses to date" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg px-3" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Total recorded expenses" value={formatMoney(expenseTotal)} /><StatCard label="Paid expenses" value={formatMoney(paidTotal)} /><StatCard label="Unpaid expenses" value={formatMoney(unpaidTotal)} /></div>
      </section>
      <section aria-labelledby="expense-records-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3"><div><h2 id="expense-records-title" className="text-lg font-semibold text-ink">Expense receipts & records</h2><p className="mt-1 text-sm text-muted">Each card is one expense in the selected filters.</p></div><Badge className="border-primary/20 bg-primary-soft text-primary">{filteredExpenses.length} records</Badge></div>
        <div className="grid gap-3 lg:grid-cols-2">{[...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date)).map((expense) => {
        const plaza = plazaList.find((item) => item.id === expense.plazaId);
        const paid = expenseIsPaid(expense) === "paid";
        const source = paid ? expenseWasPaidFromRent(expense) === "rent" ? "Rent collection" : "Outside rent funds" : "Not paid";
        const hasAttachment = isViewableFile(expense.billUrl);
        return <Card key={expense.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted">{plaza?.name ?? "Plaza"} · {expense.date}</p><h3 className="mt-1 break-words font-semibold text-ink">{expense.description}</h3><p className="text-sm text-muted">{expense.category} · paid by {expense.paidBy || "—"}</p></div><Badge className={cn("shrink-0 border", paid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{paid ? "Paid" : "Unpaid"}</Badge></div><div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3"><div><p className="text-2xl font-semibold tabular-nums text-ink">{formatMoney(expense.amount)}</p><p className="mt-1 text-xs text-muted">{source}{expense.paymentMethod ? ` · ${expense.paymentMethod}` : ""}</p></div>{hasAttachment ? <StoredFileLink value={expense.billUrl} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-soft">View receipt</StoredFileLink> : <span className="text-xs text-muted">No receipt attached</span>}</div></CardContent></Card>;
      })}</div>
      {filteredExpenses.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted">{expenseList.length ? "No expenses match the selected plaza and date filters." : "No individual expense records yet. Use Add expense to record one; summary totals above will update."}</CardContent></Card> : null}
      </section>
      {showForm ? <ExpenseForm plazaList={plazaList} onClose={() => setShowForm(false)} onSave={onSaveExpense} /> : null}
    </PageFrame>
  );
}

function UnitRentHistoryPanel({
  unit,
  tenantList,
  rentEntryList,
  onClose,
}: {
  unit: Unit;
  tenantList: Tenant[];
  rentEntryList: RentEntry[];
  onClose: () => void;
}) {
  const tenant = tenantList
    .filter((item) => item.unitId === unit.id)
    .sort((a, b) => b.agreementStart.localeCompare(a.agreementStart))[0];
  const history = tenant ? tenantRentHistory(tenant, unit, rentEntryList) : [];
  const totalDue = history.reduce((sum, month) => sum + month.due, 0);
  const totalPaid = history.reduce((sum, month) => sum + month.paid, 0);
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-2xl sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-muted">{unit.number} · Rent ledger</p><h2 className="mt-1 text-2xl font-semibold text-ink">{tenant?.name ?? "Tenant rent history"}</h2></div>
          <Button variant="outline" size="icon" aria-label="Close rent history" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {tenant ? (
          <>
            <p className="mt-2 text-sm text-muted">Rent status for the last 12 months through the current month.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><StatCard label="Rent due in period" value={formatMoney(totalDue)} /><StatCard label="Rent paid in period" value={formatMoney(totalPaid)} /></div>
            {history.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[560px] text-sm"><thead className="bg-bg text-muted"><tr><th className="p-3 text-start">Month</th><th className="p-3 text-start">Due</th><th className="p-3 text-start">Paid</th><th className="p-3 text-start">Balance</th><th className="p-3 text-start">Status</th></tr></thead><tbody>{history.map((month) => <tr key={month.month} className="border-t border-border"><td className="p-3">{monthLabel(month.month)}</td><td className="p-3">{formatMoney(month.due)}</td><td className="p-3">{formatMoney(month.paid)}</td><td className="p-3">{formatMoney(month.balance)}</td><td className="p-3"><StatusBadge value={month.status} label={month.status === "partly-paid" ? "Part paid" : month.status === "paid" ? "Paid" : "Unpaid"} /></td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-xl bg-bg p-4 text-sm text-muted">This tenant&apos;s tenancy did not overlap the last 12 months.</p>}
          </>
        ) : <p className="mt-4 rounded-xl bg-bg p-4 text-sm text-muted">No tenant record is linked to this unit yet.</p>}
      </motion.div>
    </div>
  );
}

function Vacancy({
  t,
  plazaList,
  tenantList,
  unitList,
  rentEntryList,
  documentList,
  onSaveTenant,
}: {
  t: typeof dictionaries.en;
  plazaList: Plaza[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  documentList: Document[];
  onSaveTenant: (values: NewTenantValues) => void;
}) {
  const [selectedPlazaId, setSelectedPlazaId] = useState(plazaList[0]?.id ?? "plaza-a");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [relettingUnitId, setRelettingUnitId] = useState<string | null>(null);
  const [historyUnitId, setHistoryUnitId] = useState<string | null>(null);
  const selectedPlaza = plazaList.find((plaza) => plaza.id === selectedPlazaId);
  const plazaUnits = unitList.filter((unit) => unit.plazaId === selectedPlazaId);
  const historyUnit = historyUnitId ? unitList.find((unit) => unit.id === historyUnitId) : undefined;
  const vacantUnits = plazaUnits.filter((unit) => unit.status === "vacant");
  const occupiedUnits = plazaUnits.filter((unit) => unit.status === "occupied");
  const soonVacantUnits = plazaUnits.filter((unit) => unit.status === "soon-vacant");
  const floors = Array.from(new Set(plazaUnits.map((unit) => unit.floor))).sort((a, b) => b - a);
  return (
    <PageFrame title={t.vacancy}>
      <div className="grid gap-3 lg:grid-cols-3">
        {plazaList.map((plaza) => {
          const plazaUnitRows = unitList.filter((unit) => unit.plazaId === plaza.id);
          const plazaVacant = plazaUnitRows.filter((unit) => unit.status === "vacant").length;
          const plazaSoon = plazaUnitRows.filter((unit) => unit.status === "soon-vacant").length;
          const plazaOccupied = plazaUnitRows.filter((unit) => unit.status === "occupied").length;
          return (
            <button
              key={plaza.id}
              onClick={() => setSelectedPlazaId(plaza.id)}
              className={cn(
                "rounded-2xl border bg-surface p-4 text-start shadow-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selectedPlazaId === plaza.id ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/40"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{plaza.name}</h3>
                  <p className="text-sm text-muted">{plazaUnitRows.length} units · {plaza.floors} floors</p>
                </div>
                <Badge className="border-primary/20 bg-primary-soft text-primary">Filter</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <span className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700"><strong className="block text-base">{plazaOccupied}</strong>occupied</span>
                <span className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700"><strong className="block text-base">{plazaVacant}</strong>vacant</span>
                <span className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-amber-700"><strong className="block text-base">{plazaSoon}</strong>soon</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label={t.occupied} value={String(occupiedUnits.length)} />
        <StatCard label={t.vacantUnits} value={String(vacantUnits.length)} />
        <StatCard label={t.soonVacant} value={String(soonVacantUnits.length)} />
        <StatCard label={t.lostRent} value={formatMoney(vacantUnits.reduce((sum, unit) => sum + lostRent(unit.monthlyRent, 12), 0))} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">{selectedPlaza?.name} vacancy grid</h3>
              <p className="text-sm text-muted">Green occupied, red vacant, amber soon vacant. Filtered plaza-wise.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{t.occupied}</Badge>
              <Badge className="border-rose-200 bg-rose-50 text-rose-700">{t.vacant}</Badge>
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">{t.soonVacant}</Badge>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {floors.map((floor) => {
              const floorUnits = plazaUnits.filter((unit) => unit.floor === floor);
              return (
                <section key={floor} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    <h4 className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-semibold text-muted">
                      Floor {floor}
                    </h4>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {floorUnits.map((unit) => {
                      const tenant = tenantList.find((item) => item.id === unit.tenantId && item.status === "active");
                      const isVacant = unit.status === "vacant";
                      const isSoon = unit.status === "soon-vacant";
                      return (
                        <div key={unit.id} className={cn("rounded-2xl border p-3", statusClass[unit.status])}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-ink">{unit.number}</p>
                              <p className="text-xs capitalize text-muted">{unit.typeName ?? unit.type} · {unit.sizeSqFt} sq ft</p>
                            </div>
                            <StatusBadge value={unit.status} label={isSoon ? t.soonVacant : isVacant ? "Empty" : t.occupied} />
                          </div>
                          <div className="mt-3 rounded-xl bg-white/60 p-3 text-sm dark:bg-black/10">
                            {isVacant ? <><p className="font-medium text-text">Empty</p><p className="mt-1 text-xs text-rose-700">Vacant since {unit.vacantSince ?? "—"}</p></> : <><p className="font-medium text-text">{tenant?.name ?? "No tenant"}</p><p className="mt-1 text-xs text-muted">{formatMoney(unit.monthlyRent)} monthly rent</p>{isSoon && tenant ? <p className="mt-1 text-xs text-amber-700">Agreement ends {tenant.agreementEnd}</p> : null}</>}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {isVacant ? (
                              <Button size="sm" onClick={() => setRelettingUnitId(unit.id)}>Re-let unit</Button>
                            ) : (
                              <Button variant="outline" size="sm" disabled={!tenant} onClick={() => tenant && setSelectedTenantId(tenant.id)}>View tenant</Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setHistoryUnitId(unit.id)}>History</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {relettingUnitId ? <TenantForm key={relettingUnitId} plazaList={plazaList} unitList={unitList} initialUnitId={relettingUnitId} onClose={() => setRelettingUnitId(null)} onSave={(values) => { onSaveTenant(values); setRelettingUnitId(null); }} /> : null}
      <TenantDetailPanel tenantId={selectedTenantId} onClose={() => setSelectedTenantId(null)} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} documentList={documentList} />
      {historyUnit ? <UnitRentHistoryPanel unit={historyUnit} tenantList={tenantList} rentEntryList={rentEntryList} onClose={() => setHistoryUnitId(null)} /> : null}
    </PageFrame>
  );
}

type OwnerPaymentValues = Omit<OwnerPayment, "id">;

function maskAccountNumber(accountNumber: string | undefined) {
  if (!accountNumber) return "Not recorded";
  const visible = accountNumber.length > 4 ? accountNumber.slice(-4) : "";
  return `${"*".repeat(Math.max(4, accountNumber.length - visible.length))}${visible}`;
}

function ownerMonthCalculation(
  plaza: Plaza | undefined,
  month: string,
  ownerId: string,
  unitList: Unit[],
  tenantList: Tenant[],
  rentEntryList: RentEntry[],
  expenseList: Expense[],
) {
  const rows = plaza
    ? [...rentEntryList, ...missingRentEntriesForMonth(plaza.id, month, unitList, tenantList, rentEntryList)]
      .filter((entry) => entry.plazaId === plaza.id && entry.month === month && entry.status !== "vacant")
    : [];
  const totalRentDue = rows.reduce((sum, entry) => sum + entry.dueAmount + entry.carriedForward, 0);
  const rentCollected = rows.reduce((sum, entry) => sum + activePaymentTotal(entry), 0);
  const monthExpenses = expenseList.filter((expense) => expense.plazaId === plaza?.id && expense.date.startsWith(month));
  const paidRentExpenses = monthExpenses.filter((expense) =>
    expenseIsPaid(expense) === "paid" && expenseWasPaidFromRent(expense) === "rent"
  );
  const expensesPaid = paidRentExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const afterDeductions = Math.max(0, rentCollected - expensesPaid);
  const allocation = plaza
    ? distributeNet(plaza, month, afterDeductions, monthExpenses)
    : [];
  const amountDue = Math.max(0, allocation.find((row) => row.ownerId === ownerId)?.amount ?? 0);
  const expenseSummary = paidRentExpenses.reduce<Record<string, number>>((summary, expense) => {
    summary[expense.category] = (summary[expense.category] ?? 0) + expense.amount;
    return summary;
  }, {});

  return {
    totalRentDue,
    rentCollected,
    outstandingRent: Math.max(0, totalRentDue - rentCollected),
    expensesPaid,
    otherDeductions: Math.max(0, afterDeductions - amountDue),
    expenseSummary,
    amountDue,
  };
}

function OwnerPaymentForm({
  plazaList,
  ownerList,
  userList,
  tenantList,
  unitList,
  rentEntryList,
  expenseList,
  paymentList,
  onClose,
  onSave,
}: {
  plazaList: Plaza[];
  ownerList: Owner[];
  userList: User[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  expenseList: Expense[];
  paymentList: OwnerPayment[];
  onClose: () => void;
  onSave: (payment: OwnerPaymentValues) => void;
}) {
  const localDate = new Date();
  const currentMonth = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}`;
  const initialPlaza = plazaList[0];
  const initialOwners = initialPlaza ? associatedOwnerIds(initialPlaza) : [];
  const [plazaId, setPlazaId] = useState(initialPlaza?.id ?? "");
  const [month, setMonth] = useState(currentMonth);
  const [ownerId, setOwnerId] = useState(initialOwners[0] ?? "");
  const [amountSent, setAmountSent] = useState("");
  const [accountChoice, setAccountChoice] = useState("custom");
  const [sentByChoice, setSentByChoice] = useState(userList.find((user) => user.role === "accountant")?.id ?? "other");
  const [paymentMethod, setPaymentMethod] = useState<NonNullable<OwnerPayment["paymentMethod"]>>("Bank Transfer");
  const [sendingBank, setSendingBank] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const plaza = plazaList.find((item) => item.id === plazaId);
  const ownerIds = plaza ? associatedOwnerIds(plaza) : [];
  const plazaOwners = ownerList.filter((owner) => ownerIds.includes(owner.id));
  const selectedOwner = plazaOwners.find((owner) => owner.id === ownerId) ?? plazaOwners[0];
  const selectedOwnerId = selectedOwner?.id ?? "";
  const savedAccounts = selectedOwner?.accounts ?? [];
  const currentCalculation = ownerMonthCalculation(plaza, month, selectedOwnerId, unitList, tenantList, rentEntryList, expenseList);
  const availableUsers = userList.filter((user) => user.role !== "owner");
  const periodMonths = (() => {
    const knownMonths = [...rentEntryList.map((entry) => entry.month), ...expenseList.map((expense) => expense.date.slice(0, 7)), currentMonth];
    const oldest = knownMonths.sort()[0] ?? currentMonth;
    const first = new Date(Number(oldest.slice(0, 4)), Number(oldest.slice(5, 7)) - 1, 1);
    const last = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)) - 1, 1);
    const months: string[] = [];
    for (const date = new Date(first); date <= last; date.setMonth(date.getMonth() + 1)) {
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    }
    if (!months.includes(demoMonth)) months.push(demoMonth);
    return Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));
  })();
  const parsedAmountSent = Number(amountSent);
  const amountDiffers = amountSent !== "" && parsedAmountSent !== currentCalculation.amountDue;
  const accountValue = accountChoice === "custom"
    ? ""
    : savedAccounts.find((account) => account.id === accountChoice)?.accountNumber ?? "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!plaza || !selectedOwner || !selectedOwnerId) {
      setError("Choose a plaza and an owner associated with it.");
      return;
    }
    const data = new FormData(form);
    const otherSendingBank = String(data.get("otherSendingBank") ?? "").trim();
    const sendingBankName = sendingBank === "Other" ? otherSendingBank : sendingBank;
    const sendingAccountNumber = String(data.get("sendingAccountNumber") ?? "").trim();
    if (paymentMethod === "Bank Transfer" && (!sendingBankName || !sendingAccountNumber)) {
      setError("Select the sending bank and enter the sending account number for a bank transfer.");
      return;
    }
    const customAccount = String(data.get("customAccount") ?? "").trim();
    const recipientAccount = accountChoice === "custom" ? customAccount : accountValue;
    if (!recipientAccount) {
      setError("Choose a saved recipient account or enter a custom account number.");
      return;
    }
    const sentBy = sentByChoice === "other"
      ? String(data.get("sentByOther") ?? "").trim()
      : availableUsers.find((user) => user.id === sentByChoice)?.name ?? "";
    if (!sentBy) {
      setError("Enter who sent this payment.");
      return;
    }
    const proof = data.get("paymentProof");
    if (proof instanceof File && proof.size && !proof.type.startsWith("image/") && proof.type !== "application/pdf") {
      setError("Payment proof must be an image or PDF.");
      return;
    }
    setSaving(true);
    try {
      const paymentProofUrl = proof instanceof File && proof.size ? await saveFile(proof, "payments") : undefined;
      const selectedAccount = savedAccounts.find((account) => account.id === accountChoice);
      const nextNumber = paymentList.filter((payment) => payment.month.slice(0, 4) === month.slice(0, 4)).length + 1;
      onSave({
        month,
        plazaId: plaza.id,
        ownerId: selectedOwnerId,
        accountNumber: recipientAccount,
        amountDue: currentCalculation.amountDue,
        systemCalculatedAmount: currentCalculation.amountDue,
        amountSent: parsedAmountSent,
        sentBy,
        status: "sent-awaiting-confirmation",
        date: String(data.get("paymentDate") ?? ""),
        bankName: selectedAccount?.bank ?? (accountChoice === "custom" ? String(data.get("customBank") ?? "").trim() || undefined : undefined),
        sendingBankName: paymentMethod === "Bank Transfer" ? sendingBankName : undefined,
        sendingAccountNumber: paymentMethod === "Bank Transfer" ? sendingAccountNumber : undefined,
        recipientBankName: selectedAccount?.bank ?? (accountChoice === "custom" ? String(data.get("customBank") ?? "").trim() || undefined : undefined),
        transactionId: String(data.get("transactionId") ?? "").trim() || undefined,
        paymentMethod,
        paymentProofUrl,
        notes: String(data.get("notes") ?? "").trim() || undefined,
        statementNumber: `OPS-${month.slice(0, 4)}-${String(nextNumber).padStart(4, "0")}`,
        differenceReason: amountDiffers ? String(data.get("differenceReason") ?? "").trim() || undefined : undefined,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the owner payment.");
      setSaving(false);
    }
  }

  function changePlaza(nextPlazaId: string) {
    setPlazaId(nextPlazaId);
    const nextPlaza = plazaList.find((item) => item.id === nextPlazaId);
    setOwnerId(nextPlaza ? associatedOwnerIds(nextPlaza)[0] ?? "" : "");
    setAccountChoice("custom");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-soft sm:max-w-3xl sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm text-muted">Owner payment</p><h2 className="mt-1 text-2xl font-semibold text-ink">Record Owner Payment</h2></div>
          <Button type="button" variant="outline" size="icon" aria-label="Close owner payment form" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-text">Plaza<select value={plazaId} onChange={(event) => changePlaza(event.target.value)} required className="form-input">{plazaList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium text-text">Rent month<select value={month} onChange={(event) => setMonth(event.target.value)} required className="form-input">{periodMonths.map((period) => <option key={period} value={period}>{monthLabel(period)}</option>)}</select></label>
          <section className="rounded-2xl border border-border bg-bg p-4 sm:col-span-2">
            <h3 className="font-semibold text-ink">System calculation · {plaza?.name ?? "Select plaza"} · {monthLabel(month)}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StatCard label="Total rent due" value={formatMoney(currentCalculation.totalRentDue)} />
              <StatCard label="Rent collected" value={formatMoney(currentCalculation.rentCollected)} />
              <StatCard label="Outstanding rent" value={formatMoney(currentCalculation.outstandingRent)} />
              <StatCard label="Expenses paid from rent" value={formatMoney(currentCalculation.expensesPaid)} />
              <StatCard label="Other deductions / allocations" value={formatMoney(currentCalculation.otherDeductions)} />
              <StatCard label="System calculated amount" value={formatMoney(currentCalculation.amountDue)} />
            </div>
            {currentCalculation.rentCollected === 0 ? <p className="mt-3 text-xs text-muted">No rent collections are recorded for this plaza and period yet.</p> : null}
          </section>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-text">Amount sent (PKR)<input name="amountSent" type="number" min="1" step="1" value={amountSent} onChange={(event) => setAmountSent(event.target.value)} required className="form-input" /></label>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setAmountSent(String(currentCalculation.amountDue))}>Use {formatMoney(currentCalculation.amountDue)}</Button>
          </div>
          {amountDiffers ? <label className="text-sm font-medium text-text sm:col-span-2">Reason for difference <span className="font-normal text-muted">(Optional)</span><input name="differenceReason" maxLength={240} className="form-input" placeholder="Partial payment, previous balance adjustment, etc." /></label> : null}
          <label className="text-sm font-medium text-text">Payment date<input name="paymentDate" type="date" defaultValue={`${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`} required className="form-input" /></label>
          <label className="text-sm font-medium text-text">Payment method<select name="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as NonNullable<OwnerPayment["paymentMethod"]>)} required className="form-input"><option>Bank Transfer</option><option>Cash</option><option>Cheque</option><option>Other</option></select></label>
          {paymentMethod === "Bank Transfer" ? <>
            <label className="text-sm font-medium text-text">Sending bank name<select value={sendingBank} onChange={(event) => setSendingBank(event.target.value)} required className="form-input"><option value="">Select sending bank</option>{["HBL — Habib Bank Limited", "UBL — United Bank Limited", "MCB Bank", "Allied Bank", "NBP — National Bank of Pakistan", "Meezan Bank", "Bank Alfalah", "Askari Bank", "Faysal Bank", "Standard Chartered Pakistan", "Bank Al Habib", "JS Bank", "Soneri Bank", "Habib Metro Bank", "Bank of Punjab", "Bank of Khyber", "Other"].map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select></label>
            {sendingBank === "Other" ? <label className="text-sm font-medium text-text">Other sending bank<input name="otherSendingBank" required maxLength={120} className="form-input" /></label> : null}
            <label className="text-sm font-medium text-text">Sending account number<input name="sendingAccountNumber" required maxLength={80} autoComplete="off" className="form-input" /></label>
          </> : null}
          <label className="text-sm font-medium text-text">Sent by<select value={sentByChoice} onChange={(event) => setSentByChoice(event.target.value)} required className="form-input">{availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}<option value="other">Other</option></select></label>
          {sentByChoice === "other" ? <label className="text-sm font-medium text-text">Sender name<input name="sentByOther" required maxLength={120} className="form-input" /></label> : null}
          <label className="text-sm font-medium text-text">Recipient / owner<select value={selectedOwnerId} onChange={(event) => { setOwnerId(event.target.value); setAccountChoice("custom"); }} required disabled={!plazaOwners.length} className="form-input">{plazaOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
          <label className="text-sm font-medium text-text">Recipient account<select value={accountChoice} onChange={(event) => setAccountChoice(event.target.value)} className="form-input">{savedAccounts.map((account) => <option key={account.id} value={account.id}>{account.bank} · {maskAccountNumber(account.accountNumber)}</option>)}<option value="custom">Use custom account number</option></select></label>
          {accountChoice === "custom" ? <>
            <label className="text-sm font-medium text-text">Custom account number<input name="customAccount" required maxLength={80} className="form-input" autoComplete="off" /></label>
            <label className="text-sm font-medium text-text">Recipient bank name<input name="customBank" required maxLength={120} className="form-input" /></label>
          </> : null}
          <label className="text-sm font-medium text-text">Transaction reference <span className="font-normal text-muted">(Optional)</span><input name="transactionId" maxLength={120} className="form-input" /></label>
          <label className="text-sm font-medium text-text">Payment proof / bank receipt <span className="font-normal text-muted">(Optional)</span><input name="paymentProof" type="file" accept="image/*,application/pdf,.pdf" className="form-input file:me-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-2 file:py-1" /></label>
          <label className="text-sm font-medium text-text sm:col-span-2">Notes <span className="font-normal text-muted">(Optional)</span><textarea name="notes" rows={3} maxLength={1000} className="form-input h-auto py-3" /></label>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !plazaOwners.length}>{saving ? "Saving…" : "Save Owner Payment"}</Button></div>
        </form>
      </motion.div>
      <style jsx global>{`.form-input{margin-top:.5rem;display:block;min-height:3rem;width:100%;border-radius:.75rem;border:1px solid var(--color-border,#e5e7eb);background:var(--color-bg,#fff);padding:0 .75rem;color:inherit;outline:none}.form-input:focus{box-shadow:0 0 0 2px rgb(15 118 110 / .2)}`}</style>
    </div>
  );
}

function associatedOwnerIds(plaza: Plaza) {
  if (plaza.ownership.type === "single") return [plaza.ownership.ownerId];
  if (plaza.ownership.type === "shared") return plaza.ownership.shares.map((share) => share.ownerId);
  return plaza.ownership.rotationOrder;
}

function OwnerPayments({ t, plazaList, ownerPaymentList, ownerList, userList, tenantList, unitList, rentEntryList, expenseList, onSave }: {
  t: typeof dictionaries.en;
  plazaList: Plaza[];
  ownerPaymentList: OwnerPayment[];
  ownerList: Owner[];
  userList: User[];
  tenantList: Tenant[];
  unitList: Unit[];
  rentEntryList: RentEntry[];
  expenseList: Expense[];
  onSave: (payment: OwnerPaymentValues) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [sharingPaymentId, setSharingPaymentId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<{ id: string; message: string } | null>(null);
  async function shareOwnerReceipt(payment: OwnerPayment) {
    setSharingPaymentId(payment.id);
    setShareStatus(null);
    try {
      const plaza = plazaList.find((item) => item.id === payment.plazaId);
      const plazaName = plaza?.name ?? "Property";
      const calculation = ownerMonthCalculation(plaza, payment.month, payment.ownerId, unitList, tenantList, rentEntryList, expenseList);
      const expenseRows = Object.entries(calculation.expenseSummary)
        .map(([category, amount]) => [category, formatMoney(amount)] as [string, string]);
      const calculated = payment.systemCalculatedAmount ?? payment.amountDue;
      const isDifferent = calculated !== payment.amountSent;
      const sections: NonNullable<Parameters<typeof createReceiptPdf>[0]["sections"]> = [
        {
          title: "Property & Owner",
          rows: [
            ["Plaza", plazaName],
            ["Owner", ownerName(ownerList, payment.ownerId)],
            ["Statement Month", monthLabel(payment.month)],
          ],
        },
        {
          title: "Payment Summary",
          rows: [
            ["Total Rent Due", formatMoney(calculation.totalRentDue)],
            ["Rent Collected", formatMoney(calculation.rentCollected)],
            ["Unpaid Rent", formatMoney(calculation.outstandingRent)],
            ["Total Expenses", formatMoney(calculation.expensesPaid)],
            ["Other Deductions", formatMoney(calculation.otherDeductions)],
            ["Net Amount Payable to Owner", formatMoney(calculated)],
            ["Actual Amount Sent", formatMoney(payment.amountSent)],
          ],
        },
      ];
      if (isDifferent) {
        sections.push({
          title: "Amount Difference",
          rows: [
            ["System Calculated Amount", formatMoney(calculated)],
            ["Actual Amount Sent", formatMoney(payment.amountSent)],
            ["Difference", formatMoney(calculated - payment.amountSent)],
            ["Reason for Difference", payment.differenceReason ?? "Not provided"],
          ],
        });
      }
      sections.push(
        {
          title: "Payment Details",
          rows: [
            ["Amount Sent", formatMoney(payment.amountSent)],
            ["Payment Date", payment.date ?? "Not recorded"],
            ["Payment Method", payment.paymentMethod ?? "Not recorded"],
            ["Sent By", payment.sentBy ?? "Not recorded"],
            ["Sending Bank", payment.sendingBankName ?? "Not recorded"],
            ["Sending Account Number", maskAccountNumber(payment.sendingAccountNumber)],
            ["Recipient / Owner", ownerName(ownerList, payment.ownerId)],
            ["Recipient Bank", payment.recipientBankName ?? payment.bankName ?? "Not recorded"],
            ["Recipient Account Number", maskAccountNumber(payment.accountNumber)],
            ["Transaction Reference", payment.transactionId ?? "Not recorded"],
          ],
        },
        {
          title: "Expense Summary",
          table: {
            headers: ["Expense Category", "Amount"],
            rows: expenseRows,
            total: ["Total Expenses", formatMoney(calculation.expensesPaid)],
          },
        },
      );
      if (payment.notes) {
        sections.push({ title: "Notes", rows: [["Additional Notes", payment.notes]] });
      }
      const pdf = await createReceiptPdf({
        title: "Owner Payment Statement",
        subtitle: plazaName,
        companyName: "Kiraya Hisab · Property Management",
        reference: payment.statementNumber ?? `OPS-${payment.month.slice(0, 4)}-${payment.id}`,
        headerFields: [
          ["Statement Number", payment.statementNumber ?? `OPS-${payment.month.slice(0, 4)}-${payment.id}`],
          ["Statement Period", monthLabel(payment.month)],
          ["Payment Date", payment.date ?? "Not recorded"],
        ],
        sections,
      });
      const safePlazaName = plazaName.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "property";
      const result = await shareOrDownloadPdf(pdf, `${safePlazaName}-${payment.statementNumber ?? payment.id}.pdf`, "Owner Payment Statement");
      setShareStatus({
        id: payment.id,
        message: result === "shared" ? "Owner Payment Statement PDF shared." : "The PDF was downloaded. Attach this PDF in your messaging app to share the statement.",
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareStatus({ id: payment.id, message: cause instanceof Error ? cause.message : "Could not share the receipt PDF." });
    } finally {
      setSharingPaymentId(null);
    }
  }
  return (
    <PageFrame title={t.ownerPayments} action={<Button onClick={() => setShowForm(true)}><Send className="h-4 w-4" />{t.recordOwnerPayment}</Button>}>
      <div className="grid gap-3 lg:grid-cols-2">
        {ownerPaymentList.map((payment) => (
          <Card key={payment.id}><CardContent className="p-4">
            <div className="flex items-start justify-between"><div><h3 className="font-semibold text-ink">{ownerName(ownerList, payment.ownerId)}</h3><p className="text-sm text-muted">{plazaList.find((plaza) => plaza.id === payment.plazaId)?.name} · {monthLabel(payment.month)}</p></div><Badge className={cn("border", payment.status === "confirmed-received" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : payment.status === "disputed" ? "border-rose-200 bg-rose-50 text-rose-700" : payment.status === "cancelled" ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{payment.status === "sent-awaiting-confirmation" ? "Waiting for owner" : payment.status === "confirmed-received" ? "Confirmed received" : payment.status === "disputed" ? "Problem reported" : payment.status === "cancelled" ? "Cancelled" : "Not sent"}</Badge></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><span>System calculated<strong className="block">{formatMoney(payment.systemCalculatedAmount ?? payment.amountDue)}</strong></span><span>Amount sent<strong className="block">{formatMoney(payment.amountSent)}</strong></span><span>Difference<strong className="block">{formatMoney((payment.systemCalculatedAmount ?? payment.amountDue) - payment.amountSent)}</strong></span><span>Recipient account<strong className="block">{maskAccountNumber(payment.accountNumber)}</strong></span></div>
            <p className="mt-3 text-xs text-muted">{payment.date ?? "Date not recorded"} · {payment.paymentMethod ?? "Method not recorded"} · sent by {payment.sentBy ?? "—"}</p>
            {payment.disputeReason || payment.cancelReason || payment.differenceReason ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{payment.disputeReason ? `Owner problem: ${payment.disputeReason}` : payment.cancelReason ? `Cancellation: ${payment.cancelReason}` : `Difference: ${payment.differenceReason}`}</p> : null}
            {shareStatus?.id === payment.id ? <p role="status" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{shareStatus.message}</p> : null}
            <Button className="mt-4 w-full" variant="outline" disabled={payment.amountSent <= 0 || sharingPaymentId === payment.id} onClick={() => shareOwnerReceipt(payment)}><Receipt className="h-4 w-4" />{sharingPaymentId === payment.id ? "Preparing PDF…" : t.shareReceipt}</Button>
          </CardContent></Card>
        ))}
      </div>
      {!ownerPaymentList.length ? <Card><CardContent className="p-6 text-center text-sm text-muted">No owner payments recorded yet.</CardContent></Card> : null}
      {showForm ? <OwnerPaymentForm plazaList={plazaList} ownerList={ownerList} userList={userList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} expenseList={expenseList} paymentList={ownerPaymentList} onClose={() => setShowForm(false)} onSave={onSave} /> : null}
    </PageFrame>
  );
}

function SupportScreens({ id, t, documentList, activityEntries, notificationEntries, ownerList }: { id: SectionId; t: typeof dictionaries.en; documentList: Document[]; activityEntries: ActivityLogEntry[]; notificationEntries: AppNotification[]; ownerList: Owner[] }) {
  if (id === "documents") return <PageFrame title={t.documents} action={<Button><Camera className="h-4 w-4" />Upload</Button>}><div className="grid gap-3 lg:grid-cols-3">{documentList.map((doc) => <Card key={doc.id}><CardContent className="p-4"><FileText className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold text-ink">{doc.title}</h3><p className="text-sm text-muted">{doc.type} · {doc.uploadedAt}</p>{doc.endDate ? <Badge className="mt-3 border-amber-200 bg-amber-50 text-amber-700">{t.expiringSoon}</Badge> : null}</CardContent></Card>)}</div></PageFrame>;
  if (id === "calculator") return <PageFrame title={t.calculator}><div className="grid gap-4 lg:grid-cols-2"><Card><CardContent className="p-4"><h3 className="font-semibold text-ink">{t.standardCalculator}</h3><div className="mt-4 rounded-xl bg-ink p-4 text-3xl font-semibold text-white">450000*0.4-5000 = {formatMoney(175000)}</div></CardContent></Card><Card><CardContent className="p-4"><h3 className="font-semibold text-ink">{t.shareCalculator}</h3><div className="mt-4 space-y-3">{[{ name: "Ali Raza", amount: 270000 }, { name: "Bilal Ahmed", amount: 180000 }].map((row) => <div key={row.name} className="flex justify-between rounded-xl bg-bg p-3"><span>{row.name}</span><strong>{formatMoney(row.amount)}</strong></div>)}</div><Button className="mt-4" variant="outline">{t.useDashboardFigure}</Button></CardContent></Card></div></PageFrame>;
  if (id === "reports") return <PageFrame title={t.reports} action={<Button variant="outline">{t.exportCsv}</Button>}><div className="grid gap-4 lg:grid-cols-3">{["Income vs expenses", "Vacancy by plaza", "Tenant reliability"].map((label) => <Card key={label}><CardContent className="p-4"><h3 className="font-semibold text-ink">{label}</h3><div className="mt-4 flex h-40 items-end gap-2">{[45, 80, 60, 90, 50, 72].map((height, index) => <span key={index} className="flex-1 rounded-t-lg bg-primary/80" style={{ height: `${height}%` }} />)}</div></CardContent></Card>)}</div></PageFrame>;
  if (id === "activity") return <PageFrame title={t.activity}><div className="space-y-3">{activityEntries.map((entry) => <Card key={entry.id}><CardContent className="p-4"><p className="font-semibold text-ink">{entry.actorId === "accountant-1" ? "Tariq Mehmood" : ownerList.find((owner) => owner.id === entry.actorId)?.name ?? "User"} {entry.action} {entry.entity}</p><p className="text-sm text-muted">{new Date(entry.timestamp).toLocaleString("en-PK")}</p><pre className="mt-3 overflow-auto rounded-xl bg-bg p-3 text-xs">{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></CardContent></Card>)}</div></PageFrame>;
  if (id === "notifications") return <PageFrame title={t.notifications} action={<Button variant="outline">{t.markAllRead}</Button>}><div className="space-y-3">{notificationEntries.map((note) => <Card key={note.id}><CardContent className="flex items-start justify-between gap-3 p-4"><div><h3 className="font-semibold text-ink">{note.title}</h3><p className="text-sm text-muted">{note.body}</p></div>{!note.read ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" /> : null}</CardContent></Card>)}</div></PageFrame>;
  return <PageFrame title={t.settings}><div className="grid gap-4 lg:grid-cols-2"><Card><CardContent className="p-4"><h3 className="font-semibold text-ink">Tariq Mehmood</h3><p className="text-sm text-muted">0301-2222222</p><div className="mt-4 grid gap-2"><input className="h-11 rounded-xl border border-border bg-bg px-3" placeholder="New password" /><Button>{t.save}</Button></div></CardContent></Card><Card><CardContent className="p-4"><h3 className="font-semibold text-ink">{t.assignedPermissions}</h3><p className="mt-2 text-sm text-muted">Al-Noor Plaza, Gulshan Arcade, City Heights. Can record rent, expenses, documents and reminders. Ownership and month closing are locked.</p></CardContent></Card></div></PageFrame>;
}

function Arrears({ t, tenantList, unitList, rentEntryList }: { t: typeof dictionaries.en; tenantList: Tenant[]; unitList: Unit[]; rentEntryList: RentEntry[] }) {
  const [reminderStatus, setReminderStatus] = useState("");
  const arrearsByTenant = new Map<string, { tenant: Tenant; balances: { month: string; amount: number; unitId: string }[]; total: number }>();
  rentEntryList.forEach((entry) => {
    if (entry.status === "vacant") return;
    const balance = Math.max(0, entry.dueAmount + entry.carriedForward - activePaymentTotal(entry));
    const tenant = tenantList.find((item) => item.id === entry.tenantId);
    if (!tenant || balance <= 0) return;
    const summary = arrearsByTenant.get(tenant.id) ?? { tenant, balances: [], total: 0 };
    summary.balances.push({ month: entry.month, amount: balance, unitId: entry.unitId });
    summary.total += balance;
    arrearsByTenant.set(tenant.id, summary);
  });
  const arrears = Array.from(arrearsByTenant.values()).sort((a, b) => b.total - a.total);
  function sendArrearsReminder(summary: (typeof arrears)[number]) {
    const details = [...summary.balances]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => `${monthLabel(item.month)}: ${formatMoney(item.amount)}`)
      .join("\n");
    const message = `Assalam-o-alaikum ${summary.tenant.name}, your total outstanding rent balance is ${formatMoney(summary.total)}.\n${details}\nPlease pay this balance. Thank you.`;
    if (!openWhatsAppReminder(summary.tenant.phone, message)) {
      setReminderStatus(`The saved WhatsApp number for ${summary.tenant.name} is invalid. Update the tenant phone number and try again.`);
      return;
    }
    setReminderStatus(`WhatsApp arrears reminder prepared for ${summary.tenant.name} (${formatMoney(summary.total)} outstanding).`);
  }
  return (
    <PageFrame title={t.arrears}>
      {reminderStatus ? <p role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{reminderStatus}</p> : null}
      {arrears.length ? <div className="grid gap-3 lg:grid-cols-2">{arrears.map((summary) => {
        const unitNames = Array.from(new Set(summary.balances
          .map(({ unitId }) => unitList.find((unit) => unit.id === unitId)?.number)
          .filter((name): name is string => Boolean(name))));
        return <Card key={summary.tenant.id}><CardContent className="p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{summary.tenant.name}</h3><p className="text-sm text-muted">{unitNames.join(", ") || "Unit not found"} · {summary.balances.length} unpaid rent {summary.balances.length === 1 ? "record" : "records"}</p></div><Badge className="border-rose-200 bg-rose-50 text-rose-700">{formatMoney(summary.total)}</Badge></div>
          <ul className="mt-3 space-y-1 text-sm text-muted">{[...summary.balances].sort((a, b) => a.month.localeCompare(b.month)).map((item, index) => <li key={`${item.month}-${index}`} className="flex justify-between gap-3"><span>{monthLabel(item.month)}</span><span>{formatMoney(item.amount)}</span></li>)}</ul>
          <Button className="mt-4" size="sm" onClick={() => sendArrearsReminder(summary)}><Send className="h-4 w-4" />{t.sendReminder}</Button>
        </CardContent></Card>;
      })}</div> : <Card><CardContent className="p-6 text-center text-sm text-muted">There are no outstanding rent balances.</CardContent></Card>}
    </PageFrame>
  );
}

export function AccountantApp() {
  const { user, loading, login, logout, role, ownerId, error: authError } = useAuth();
  const userId = user?.id;
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const sharedDataReady = Boolean(userId) && readyUserId === userId;
  const [sharedDataError, setSharedDataError] = useState("");
  const [loadedTables, setLoadedTables] = useState<TableName[]>([]);
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const [section, setSection] = useState<SectionId>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [rentInitialPlazaId, setRentInitialPlazaId] = useState<string | undefined>(undefined);
  const [dark, setDark] = useState(false);
  const [quick, setQuick] = useState(false);
  const [ownerList, setOwnerList] = useState<Owner[]>([]);
  const [plazaList, setPlazaList] = useState<Plaza[]>([]);
  const [tenantList, setTenantList] = useState<Tenant[]>([]);
  const [unitList, setUnitList] = useState<Unit[]>([]);
  const [rentEntryList, setRentEntryList] = useState<RentEntry[]>([]);
  const [expenseList, setExpenseList] = useState<Expense[]>([]);
  const [ownerPaymentList, setOwnerPaymentList] = useState<OwnerPayment[]>([]);
  const [rentSheetKeys, setRentSheetKeys] = useState<string[]>([]);
  const [documentList, setDocumentList] = useState<Document[]>([]);
  const [notificationList, setNotificationList] = useState<AppNotification[]>([]);
  const [activityList, setActivityList] = useState<ActivityLogEntry[]>([]);
  if (userId && readyUserId !== userId) {
    setReadyUserId(userId);
    setOwnerList([]);
    setPlazaList([]);
    setTenantList([]);
    setUnitList([]);
    setRentEntryList([]);
    setExpenseList([]);
    setOwnerPaymentList([]);
    setRentSheetKeys([]);
    setDocumentList([]);
    setNotificationList([]);
    setActivityList([]);
    setLoadedTables([]);
    setSharedDataError("");
  }
  const t = dictionaries[language];
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!userId) return;
    startSharedDemoSession();
    const onStorageError = (event: Event) => setSharedDataError((event as CustomEvent<string>).detail);
    window.addEventListener("kiraya-demo-storage-error", onStorageError);
    return () => {
      window.removeEventListener("kiraya-demo-storage-error", onStorageError);
    };
  }, [userId]);
  const sectionReady = (role === "owner" ? ownerLoginTables : sectionTables[section]).every((table) => loadedTables.includes(table));
  useEffect(() => {
    if (!sharedDataReady || !role) return;
    let cancelled = false;
    const requiredTables = role === "owner" ? ownerLoginTables : sectionTables[section];
    const load = async () => {
      try {
        const state = await loadSharedTables(requiredTables);
        if (cancelled) return;
        const has = (table: TableName) => requiredTables.includes(table);
        if (has("owners")) setOwnerList((current) => mergeById(state.owners, current));
        if (has("plazas")) setPlazaList((current) => mergeById(state.plazas, current));
        if (has("units")) setUnitList((current) => mergeById(state.units, current));
        if (has("tenants")) setTenantList((current) => mergeById(state.tenants, current));
        if (has("rent_entries")) {
          setRentEntryList((current) => mergeById(state.rentEntries, current));
          setRentSheetKeys((current) => Array.from(new Set([...current, ...state.rentEntries.map((entry) => `${entry.plazaId}:${entry.month}`)])));
        }
        if (has("expenses")) setExpenseList((current) => mergeById(state.expenses, current));
        if (has("owner_payments")) setOwnerPaymentList((current) => mergeById(state.ownerPayments, current));
        if (has("documents")) setDocumentList((current) => mergeById(state.documents, current));
        if (has("notifications")) setNotificationList((current) => mergeById(state.notifications, current));
        if (has("activity_log")) setActivityList((current) => mergeById(state.activityLog, current));
        setLoadedTables(loadedSharedTables());
      } catch (cause) {
        if (!cancelled) setSharedDataError(cause instanceof Error ? cause.message : "Data could not be loaded from Supabase.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sharedDataReady, role, section]);
  const loadedKey = loadedTables.join(",");
  useEffect(() => {
    if (!sharedDataReady || (role !== "accountant" && role !== "admin")) return;
    void migrateInlineFiles(readSharedDemoState()).then((replacements) => {
      if (!replacements.size) return;
      const swap = (value: string) => replacements.get(value) ?? value;
      const swapOptional = (value?: string) => (value === undefined ? value : swap(value));
      setTenantList((current) => current.map((tenant) => ({ ...tenant, cnicFrontUrl: swapOptional(tenant.cnicFrontUrl), cnicBackUrl: swapOptional(tenant.cnicBackUrl), agreementUrl: swapOptional(tenant.agreementUrl) })));
      setDocumentList((current) => current.map((document) => ({ ...document, url: swap(document.url) })));
      setExpenseList((current) => current.map((expense) => ({ ...expense, billUrl: swap(expense.billUrl) })));
      setOwnerPaymentList((current) => current.map((payment) => ({ ...payment, paymentProofUrl: swapOptional(payment.paymentProofUrl), receiptUrl: swapOptional(payment.receiptUrl) })));
    });
  }, [sharedDataReady, role, loadedKey]);
  useEffect(() => {
    if (!sharedDataReady || role === "owner" || !role) return;
    try {
      writeSharedDemoState({
        owners: ownerList,
        plazas: plazaList,
        tenants: tenantList,
        units: unitList,
        rentEntries: rentEntryList,
        expenses: expenseList,
        ownerPayments: ownerPaymentList,
        documents: documentList,
        notifications: notificationList,
        activityLog: activityList,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Demo data could not be saved.";
      window.dispatchEvent(new CustomEvent("kiraya-demo-storage-error", { detail: message }));
    }
  }, [sharedDataReady, role, ownerList, plazaList, tenantList, unitList, rentEntryList, expenseList, ownerPaymentList, documentList, notificationList, activityList]);
  const addOwner = useCallback((values: { name: string; phone: string; bank: string }) => {
    const id = `owner-${Date.now()}`;
    setOwnerList((current) => [...current, { id, name: values.name, phone: values.phone, bank: values.bank }]);
    return id;
  }, []);
  const savePlaza = useCallback((values: NewPlazaValues) => {
    const plazaId = `plaza-new-${Date.now()}`;
    const createdPlaza: Plaza = {
      id: plazaId,
      name: values.name,
      address: values.address,
      floors: values.floors,
      ownership: values.ownership,
      photoSeed: values.photoSeed,
    };
    const createdUnits: Unit[] = values.units.map((unit, index) => ({
      id: `${plazaId}-unit-${index + 1}`,
      plazaId,
      number: unit.name,
      type: unit.type,
      typeName: unit.typeName,
      floor: Math.floor((index * values.floors) / values.units.length) + 1,
      sizeSqFt: 0,
      monthlyRent: 0,
      status: "vacant",
    }));
    setPlazaList((current) => [...current, createdPlaza]);
    setUnitList((current) => [...current, ...createdUnits]);
  }, []);
  const updatePlaza = useCallback((plazaId: string, values: Pick<Plaza, "name" | "address" | "photoSeed">) => {
    setPlazaList((current) => current.map((plaza) => plaza.id === plazaId ? { ...plaza, ...values } : plaza));
  }, []);
  const openPlazaRentSheet = useCallback((plazaId: string) => {
    const missingEntries = missingRentEntriesForMonth(plazaId, demoMonth, unitList, tenantList, rentEntryList);
    setRentEntryList((current) => {
      const uniqueEntries = missingEntries.filter((newEntry) => !current.some((entry) =>
        entry.unitId === newEntry.unitId && entry.tenantId === newEntry.tenantId && entry.month === newEntry.month
      ));
      return uniqueEntries.length ? [...current, ...uniqueEntries] : current;
    });
    const key = `${plazaId}:${demoMonth}`;
    setRentSheetKeys((current) => current.includes(key) ? current : [...current, key]);
    setRentInitialPlazaId(plazaId);
    setSection("rent");
  }, [unitList, tenantList, rentEntryList]);
  const saveTenant = useCallback((values: NewTenantValues) => {
    const tenantId = `tenant-new-${Date.now()}`;
    const unit = unitList.find((item) => item.id === values.unitId);
    if (!unit || unit.status !== "vacant") throw new Error("That unit is no longer available. Choose an empty unit and try again.");
    const createdTenant: Tenant = {
      id: tenantId,
      name: values.name,
      phone: values.phone,
      cnic: values.cnic,
      cnicFrontUrl: values.cnicFrontUrl,
      cnicBackUrl: values.cnicBackUrl,
      agreementUrl: values.agreementUrl,
      unitId: unit.id,
      monthlyRent: values.rent,
      advance: 0,
      tenancyPeriodMonths: values.tenancyPeriodMonths,
      note: values.note,
      agreementStart: values.agreementStart,
      agreementEnd: values.agreementEnd,
      status: "active",
    };
    const entryId = `rent-${unit.id}-${demoMonth}-${tenantId}`;
    setTenantList((current) => [...current, createdTenant]);
    setUnitList((current) => current.map((item) => item.id === unit.id
      ? { ...item, status: "occupied", tenantId, monthlyRent: values.rent, vacantSince: undefined }
      : item));
    setRentSheetKeys((current) => {
      const key = `${unit.plazaId}:${demoMonth}`;
      return current.includes(key) ? current : [...current, key];
    });
    setRentEntryList((current) => {
      const newEntry: RentEntry = {
        id: entryId,
        unitId: unit.id,
        tenantId,
        plazaId: unit.plazaId,
        month: demoMonth,
        dueAmount: values.rent,
        status: "unpaid",
        payments: [],
        carriedForward: 0,
      };
      return current.some((entry) => entry.id === entryId) ? current : [...current, newEntry];
    });
    const uploadedAt = new Date().toISOString().slice(0, 10);
    const tenantDocuments: Document[] = [
      { id: `${tenantId}-cnic-front`, title: `CNIC front - ${values.name}`, type: "CNIC", plazaId: unit.plazaId, unitId: unit.id, tenantId, uploadedAt, url: values.cnicFrontUrl },
      { id: `${tenantId}-cnic-back`, title: `CNIC back - ${values.name}`, type: "CNIC", plazaId: unit.plazaId, unitId: unit.id, tenantId, uploadedAt, url: values.cnicBackUrl },
      ...(values.agreementUrl ? [{ id: `${tenantId}-agreement`, title: `Rent agreement - ${values.name}`, type: "Agreement" as const, plazaId: unit.plazaId, unitId: unit.id, tenantId, uploadedAt, url: values.agreementUrl }] : []),
    ];
    setDocumentList((current) => [...current, ...tenantDocuments]);
  }, [unitList]);
  const updateTenant = useCallback((tenantId: string, values: NewTenantValues) => {
    const existingTenant = tenantList.find((item) => item.id === tenantId);
    if (!existingTenant) throw new Error("Tenant record was not found. Refresh the list and try again.");
    if (values.unitId !== existingTenant.unitId) throw new Error("A tenant's unit cannot be changed from this form.");
    const monthlyRent = values.rent;
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    setTenantList((current) => current.map((tenant) => tenant.id === tenantId
      ? {
          ...tenant,
          name: values.name,
          phone: values.phone,
          cnic: values.cnic,
          cnicFrontUrl: values.cnicFrontUrl || undefined,
          cnicBackUrl: values.cnicBackUrl || undefined,
          agreementUrl: values.agreementUrl,
          monthlyRent,
          tenancyPeriodMonths: values.tenancyPeriodMonths,
          agreementStart: values.agreementStart,
          agreementEnd: values.agreementEnd,
          note: values.note,
        }
      : tenant));
    setUnitList((current) => current.map((unit) => unit.id === existingTenant.unitId && unit.tenantId === tenantId
      ? { ...unit, monthlyRent }
      : unit));
    setRentEntryList((current) => current.map((entry) => {
      if (entry.tenantId !== tenantId || entry.month < currentMonth || entry.payments.some((payment) => payment.status === "active")) return entry;
      return { ...entry, dueAmount: monthlyRent, status: "unpaid" };
    }));
    setDocumentList((current) => {
      const uploadedAt = new Date().toISOString().slice(0, 10);
      const docs: Document[] = [
        { id: `${tenantId}-cnic-front`, title: `CNIC front - ${values.name}`, type: "CNIC" as const, plazaId: unitList.find((unit) => unit.id === existingTenant.unitId)?.plazaId, unitId: existingTenant.unitId, tenantId, uploadedAt, url: values.cnicFrontUrl },
        { id: `${tenantId}-cnic-back`, title: `CNIC back - ${values.name}`, type: "CNIC" as const, plazaId: unitList.find((unit) => unit.id === existingTenant.unitId)?.plazaId, unitId: existingTenant.unitId, tenantId, uploadedAt, url: values.cnicBackUrl },
        ...(values.agreementUrl ? [{ id: `${tenantId}-agreement`, title: `Rent agreement - ${values.name}`, type: "Agreement" as const, plazaId: unitList.find((unit) => unit.id === existingTenant.unitId)?.plazaId, unitId: existingTenant.unitId, tenantId, uploadedAt, url: values.agreementUrl }] : []),
      ].filter((document) => Boolean(document.url));
      const retained = current.filter((document) => document.tenantId !== tenantId || !["CNIC", "Agreement"].includes(document.type));
      return [...retained, ...docs.map((document) => {
        const previous = current.find((item) => item.tenantId === tenantId && item.id === document.id);
        return { ...document, uploadedAt: previous?.uploadedAt ?? uploadedAt };
      })];
    });
  }, [tenantList, unitList]);
  const saveExpense = useCallback((expense: Omit<Expense, "id">) => {
    const expenseId = `expense-${Date.now()}`;
    setExpenseList((current) => [...current, { ...expense, id: expenseId }]);
    if (expense.billUrl) {
      setDocumentList((current) => [...current, {
        id: `${expenseId}-attachment`,
        title: `Expense attachment - ${expense.description}`,
        type: "Bill",
        plazaId: expense.plazaId,
        uploadedAt: expense.date,
        url: expense.billUrl,
      }]);
    }
  }, []);
  const saveOwnerPayment = useCallback((payment: OwnerPaymentValues) => {
    const paymentId = `owner-payment-${Date.now()}`;
    setOwnerPaymentList((current) => [...current, { ...payment, id: paymentId }]);
    if (payment.paymentProofUrl) {
      const paymentProofUrl = payment.paymentProofUrl;
      setDocumentList((current) => [...current, {
        id: `${paymentId}-proof`,
        title: `Owner payment proof - ${payment.statementNumber ?? paymentId}`,
        type: "Receipt",
        plazaId: payment.plazaId,
        uploadedAt: payment.date ?? new Date().toISOString().slice(0, 10),
        url: paymentProofUrl,
      }]);
    }
  }, []);
  const recordPayment = useCallback((entryId: string, amount: number, method: PaymentMethod, receivedBy: string, reference?: string): Payment => {
    const payment: Payment = {
      id: `receipt-${Date.now()}`,
      amount,
      date: new Date().toISOString().slice(0, 10),
      method,
      receivedBy,
      reference,
      status: "active",
    };
    setRentEntryList((current) => current.map((entry) => {
      if (entry.id !== entryId) return entry;
      const paid = entry.payments.reduce((sum, existingPayment) => existingPayment.status === "active" ? sum + existingPayment.amount : sum, 0) + amount;
      const total = entry.dueAmount + entry.carriedForward;
      return {
        ...entry,
        status: paid >= total ? "paid" : paid > 0 ? "partly-paid" : "unpaid",
        payments: [...entry.payments, payment],
      };
    }));
    return payment;
  }, []);
  const vacateTenant = useCallback((tenantId: string, leavingDate: string, amountReceivedBy: string, method: PaymentMethod) => {
    const tenant = tenantList.find((item) => item.id === tenantId);
    if (!tenant || tenant.status !== "active") return;
    const leavingMonth = leavingDate.slice(0, 7);
    const paymentDate = new Date().toISOString().slice(0, 10);
    setRentEntryList((current) => current.map((entry) => {
      if (entry.tenantId !== tenantId || entry.month > leavingMonth) return entry;
      const paid = entry.payments.reduce((sum, payment) => payment.status === "active" ? sum + payment.amount : sum, 0);
      const balance = Math.max(0, entry.dueAmount + entry.carriedForward - paid);
      if (balance === 0) return entry;
      const settlement: Payment = {
        id: `receipt-moveout-${tenantId}-${entry.id}-${Date.now()}`,
        amount: balance,
        date: paymentDate,
        method,
        receivedBy: amountReceivedBy,
        reference: `Move-out balance settlement through ${leavingMonth}`,
        status: "active",
      };
      return {
        ...entry,
        status: "paid",
        payments: [...entry.payments, settlement],
      };
    }));
    setTenantList((current) => current.map((item) => item.id === tenantId
      ? { ...item, status: "vacated", vacatedAt: leavingDate }
      : item));
    setUnitList((current) => current.map((unit) => unit.tenantId === tenantId
      ? { ...unit, status: "vacant", tenantId: undefined, vacantSince: leavingDate }
      : unit));
  }, [tenantList]);
  const body = useMemo(() => {
    if (!sectionReady) return <Card><CardContent className="p-6 text-center text-sm text-muted">{sharedDataError ? "This screen could not be loaded. Open it again to retry." : "Loading…"}</CardContent></Card>;
    if (section === "dashboard") return <Dashboard t={t} plazaList={plazaList} unitList={unitList} rentEntryList={rentEntryList} expenseList={expenseList} ownerPaymentList={ownerPaymentList} />;
    if (section === "properties") return <Properties t={t} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} documentList={documentList} ownerList={ownerList} onAddOwner={addOwner} onSavePlaza={savePlaza} onUpdatePlaza={updatePlaza} onCreateRentSheet={openPlazaRentSheet} />;
    if (section === "tenants") return <Tenants t={t} searchTerm={searchTerm} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} documentList={documentList} onSaveTenant={saveTenant} onUpdateTenant={updateTenant} onVacateTenant={vacateTenant} />;
    if (section === "rent") return <Rent t={t} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} expenseList={expenseList} ownerPaymentList={ownerPaymentList} ownerList={ownerList} rentSheetKeys={rentSheetKeys} initialPlazaId={rentInitialPlazaId} onRentSheetKeysChange={setRentSheetKeys} onRentEntriesChange={setRentEntryList} onRecordPayment={recordPayment} />;
    if (section === "arrears") return <Arrears t={t} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} />;
    if (section === "vacancy") return <Vacancy t={t} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} documentList={documentList} onSaveTenant={saveTenant} />;
    if (section === "expenses") return <Expenses t={t} plazaList={plazaList} expenseList={expenseList} onSaveExpense={saveExpense} />;
    if (section === "summary") return <Rent statementOnly t={t} plazaList={plazaList} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} expenseList={expenseList} ownerPaymentList={ownerPaymentList} ownerList={ownerList} rentSheetKeys={rentSheetKeys} initialPlazaId={rentInitialPlazaId} onRentSheetKeysChange={setRentSheetKeys} onRentEntriesChange={setRentEntryList} onRecordPayment={recordPayment} />;
    if (section === "owner-payments") return <OwnerPayments t={t} plazaList={plazaList} ownerPaymentList={ownerPaymentList} ownerList={ownerList} userList={users} tenantList={tenantList} unitList={unitList} rentEntryList={rentEntryList} expenseList={expenseList} onSave={saveOwnerPayment} />;
    return <SupportScreens id={section} t={t} documentList={documentList} activityEntries={activityList} notificationEntries={notificationList} ownerList={ownerList} />;
  }, [section, sectionReady, sharedDataError, t, searchTerm, ownerList, plazaList, tenantList, unitList, rentEntryList, expenseList, ownerPaymentList, rentSheetKeys, rentInitialPlazaId, documentList, activityList, notificationList, savePlaza, addOwner, updatePlaza, openPlazaRentSheet, saveTenant, updateTenant, saveExpense, saveOwnerPayment, vacateTenant, recordPayment]);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text">
        <p className="text-sm text-muted">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <Login
        language={language}
        setLanguage={setLanguage}
        onLogin={login}
        isLoading={loading}
      />
    );
  }

  if (!role) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text">
        <div role="alert" className="max-w-md space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-medium">Access is not set up for this account.</p>
          <p>{authError || "No role is assigned to this account."}</p>
          <Button onClick={() => void logout()}>Log out</Button>
        </div>
      </main>
    );
  }

  if (!sharedDataReady) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text">
        {sharedDataError ? (
          <div role="alert" className="max-w-md space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-medium">Could not connect to the database.</p>
            <p>{sharedDataError}</p>
            <p>If the tables are missing, run supabase/migrations/002_app_schema.sql in the Supabase SQL Editor.</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        ) : <p className="text-sm text-muted">Loading data...</p>}
      </main>
    );
  }

  if (role === "owner") {
    if (!sectionReady && !sharedDataError) {
      return <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text"><p className="text-sm text-muted">Loading data...</p></main>;
    }
    if (!ownerId || !ownerList.some((owner) => owner.id === ownerId)) {
      return (
        <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text">
          <div role="alert" className="max-w-md space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-medium">Your owner account is not linked to an owner record yet.</p>
            <p>Ask the administrator to link this login to your owner profile.</p>
            <Button onClick={() => void logout()}>Log out</Button>
          </div>
        </main>
      );
    }
    return <OwnerApp ownerId={ownerId} language={language} setLanguage={setLanguage} onLogout={() => void logout()} />;
  }

  return (
    <div dir={language === "ur" ? "rtl" : "ltr"} className={cn("min-h-dvh bg-bg text-text", dark && "dark")}>
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-72 overflow-y-auto bg-ink p-4 text-white lg:block">
        <div className="mb-6 flex items-center gap-3 px-2"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Building2 /></span><div><p className="text-sm text-white/60">{t.appName}</p><p className="font-semibold">{t.role}</p></div></div>
        <nav className="space-y-5">{groups.map((group) => <div key={group.title}><p className="mb-2 px-2 text-xs uppercase text-white/40">{t[group.title]}</p><div className="space-y-1">{group.items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition", section === id ? "bg-white text-ink" : "text-white/75 hover:bg-white/10")}><Icon className="h-4 w-4" />{t[label]}</button>)}</div></div>)}</nav>
      </aside>
      <div className="lg:ps-72">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1440px] items-center gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-bg px-3"><Search className="h-4 w-4 shrink-0 text-muted" /><input aria-label={t.search} value={searchTerm} onChange={(event) => { const value = event.target.value; setSearchTerm(value); if (value.trim()) setSection("tenants"); }} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={t.search} /></div>
            <Button variant="outline" size="sm">{t.allPlazas}</Button>
            <Button variant="outline" size="icon" aria-label={t.language} onClick={() => setLanguage(language === "en" ? "ur" : "en")}><Languages className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" aria-label={t.theme} onClick={() => setDark((value) => !value)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            <Button variant="outline" size="icon" aria-label={t.notifications} onClick={() => setSection("notifications")}><Bell className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => void logout()}>Logout</Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-3 pb-28 pt-4 sm:px-5 lg:pb-8">
          {sharedDataError ? <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{sharedDataError}</div> : null}
          {appSettings.closedMonths.includes(demoMonth) ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><Lock className="me-2 inline h-4 w-4" />{t.closedMonth}</div> : null}
          {body}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        {mobileTabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => id === "more" ? setSection("summary") : setSection(id)} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px]", (id === "more" ? section === "summary" : section === id) ? "text-primary" : "text-muted")}><Icon className="h-5 w-5" />{t[label]}</button>)}
      </nav>
      <div className="fixed bottom-20 end-4 z-50 lg:bottom-6">
        {quick ? <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-3 grid gap-2 rounded-2xl border border-border bg-surface p-3 shadow-soft">{[
          ["rent", t.recordRent],
          ["expenses", t.addExpense],
          ["owner-payments", t.recordOwnerPayment],
          ["tenants", t.addTenant],
          ["vacancy", t.vacancy],
          ["arrears", t.arrears],
        ].map(([target, label]) => <button key={target} onClick={() => { setSection(target as SectionId); setQuick(false); }} className="rounded-xl bg-bg px-4 py-3 text-start text-sm font-medium">{label}</button>)}</motion.div> : null}
        <button aria-label="Quick actions" onClick={() => setQuick((value) => !value)} className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-soft">{quick ? <X /> : <Plus />}</button>
      </div>
    </div>
  );
}
