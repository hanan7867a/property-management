"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownLeft,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileText,
  Home,
  Languages,
  LockKeyhole,
  Menu,
  Moon,
  Phone,
  Receipt,
  Search,
  ShieldCheck,
  Sun,
  Wallet,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createOwnerRepositories, type OwnerArrears, type OwnerDistribution, type OwnerRentStatus, type PlazaMonthSummary } from "@/lib/owner-repository";
import { ownerEn, ownerUr } from "@/lib/i18n/owner";
import { demoMonth, users } from "@/lib/mock-data";
import { appSettings } from "@/lib/settings";
import { readSharedDemoState, sharedDemoStorageKey, type SharedDemoState } from "@/lib/shared-demo-store";
import { formatMoney, monthLabel } from "@/lib/format";
import type { SupportedLanguage } from "@/lib/i18n";
import type { Expense, Owner, OwnerPayment, Plaza, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";

type OwnerSection = "home" | "approvals" | "my-money" | "properties" | "vacancy" | "rent" | "expenses" | "statements" | "reports" | "documents" | "calculator" | "activity" | "notifications" | "settings";
type Copy = { [Key in keyof typeof ownerEn]: string };
type TrendPoint = { month: string; share: number; collected: number; expenses: number };

const mobileItems: { id: OwnerSection | "more"; key: keyof Copy; icon: typeof Home }[] = [
  { id: "home", key: "ownerHome", icon: Home },
  { id: "approvals", key: "approvals", icon: ShieldCheck },
  { id: "my-money", key: "myMoney", icon: Wallet },
  { id: "properties", key: "ownerProperties", icon: Building2 },
  { id: "more", key: "ownerMore", icon: Menu },
];

const desktopItems: { id: OwnerSection; key: keyof Copy; icon: typeof Home }[] = [
  { id: "home", key: "ownerHome", icon: Home },
  { id: "approvals", key: "approvals", icon: ShieldCheck },
  { id: "my-money", key: "myMoney", icon: Wallet },
  { id: "properties", key: "ownerProperties", icon: Building2 },
  { id: "vacancy", key: "ownerVacancy", icon: Home },
  { id: "rent", key: "ownerRent", icon: CircleDollarSign },
  { id: "expenses", key: "ownerExpenses", icon: Receipt },
  { id: "statements", key: "ownerStatements", icon: FileText },
  { id: "reports", key: "ownerReports", icon: Download },
  { id: "documents", key: "ownerDocuments", icon: FileText },
  { id: "calculator", key: "ownerCalculator", icon: CircleDollarSign },
  { id: "activity", key: "ownerActivity", icon: ClipboardList },
  { id: "notifications", key: "ownerNotifications", icon: Bell },
  { id: "settings", key: "ownerSettings", icon: ShieldCheck },
];

const months = Array.from({ length: 15 }, (_, index) => {
  const date = new Date(2026, 9 - index, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
});

function monthKeyForOwner(month: string): [number, number] {
  const [year, monthNumber] = month.split("-").map(Number);
  return [year, monthNumber];
}

function statusText(status: OwnerPayment["status"], t: Copy) {
  if (status === "confirmed-received") return t.received;
  if (status === "sent-awaiting-confirmation") return t.awaiting;
  if (status === "disputed") return t.problem;
  if (status === "cancelled") return t.cancelled;
  return t.sent;
}

function OwnerStateBadge({ children, tone = "info" }: { children: React.ReactNode; tone?: "success" | "warning" | "danger" | "info" }) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  }[tone];
  return <Badge className={cn("inline-flex min-h-8 items-center gap-1.5 border px-2.5 text-sm", toneClass)}>{tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : tone === "danger" ? <X className="h-4 w-4" /> : tone === "warning" ? <ArrowDownLeft className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}{children}</Badge>;
}

export function OwnerApp({
  ownerId,
  language,
  setLanguage,
  onLogout,
}: {
  ownerId: string;
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  onLogout: () => void;
}) {
  const [owner, setOwner] = useState<Owner | undefined>(undefined);
  const [allOwners, setAllOwners] = useState<Owner[]>([]);
  const t: Copy = language === "ur" ? ownerUr : ownerEn;
  const direction = language === "ur" ? "rtl" : "ltr";
  const reduceMotion = useReducedMotion();
  const repositories = useMemo(() => createOwnerRepositories(ownerId), [ownerId]);
  const [section, setSection] = useState<OwnerSection>("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [month, setMonth] = useState(demoMonth);
  const [plazaFilter, setPlazaFilter] = useState("all");
  const [plazaList, setPlazaList] = useState<Plaza[]>([]);
  const [distribution, setDistribution] = useState<OwnerDistribution[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PlazaMonthSummary>>({});
  const [payments, setPayments] = useState<OwnerPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rentStatus, setRentStatus] = useState<OwnerRentStatus[]>([]);
  const [arrears, setArrears] = useState<OwnerArrears[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [approvalTab, setApprovalTab] = useState<"money" | "expenses" | "history">("money");
  const [sharedState, setSharedState] = useState<SharedDemoState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmingPayment, setConfirmingPayment] = useState<OwnerPayment | null>(null);
  const [disputingPaymentId, setDisputingPaymentId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [rejectingExpenseId, setRejectingExpenseId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [mutationMessage, setMutationMessage] = useState("");
  const [calculatorAmount, setCalculatorAmount] = useState("");
  const [searchText, setSearchText] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const state = readSharedDemoState();
      const myOwnerRecord = state.owners.find((item) => item.id === ownerId);
      if (!myOwnerRecord) throw new Error("Your owner record could not be found.");
      setOwner(myOwnerRecord);
      // Only id/name, for showing a rotation partner's name — never this owner's own bank details for other owners.
      setAllOwners(state.owners.map((item) => ({ id: item.id, name: item.name, phone: "", bank: "" })));
      const owned = await repositories.plazaRepo.listForMe();
      const ownedPlazaIds = new Set(owned.map((plaza) => plaza.id));
      const allowedUnits = state.units.filter((unit) => ownedPlazaIds.has(unit.plazaId));
      const allowedUnitIds = new Set(allowedUnits.map((unit) => unit.id));
      const ownerState: SharedDemoState = {
        owners: [myOwnerRecord],
        plazas: owned,
        units: allowedUnits,
        tenants: state.tenants
          .filter((tenant) => allowedUnitIds.has(tenant.unitId))
          .map((tenant) => ({ ...tenant, cnic: "", cnicFrontUrl: undefined, cnicBackUrl: undefined })),
        rentEntries: state.rentEntries.filter((entry) => ownedPlazaIds.has(entry.plazaId)),
        expenses: state.expenses.filter((expense) =>
          ownedPlazaIds.has(expense.plazaId) &&
          (expense.chargeTo === "plaza" || expense.chargeTo.ownerId === ownerId)
        ),
        ownerPayments: state.ownerPayments.filter((payment) => payment.ownerId === ownerId && ownedPlazaIds.has(payment.plazaId)),
        documents: state.documents.filter((document) =>
          document.type !== "CNIC" && (!document.plazaId || ownedPlazaIds.has(document.plazaId))
        ),
        notifications: await repositories.notificationRepo.listForMe(),
        activityLog: await repositories.activityRepo.listForMe(),
      };
      const [shares, paymentRows, expenseRows] = await Promise.all([
        repositories.ownerRepo.getMyDistribution(month),
        repositories.ownerPaymentRepo.listForMe(),
        repositories.expenseRepo.listForPlaza(),
      ]);
      const summaryEntries = await Promise.all(owned.map(async (plaza) => [
        plaza.id,
        await repositories.plazaRepo.getMonthSummary(plaza.id, month),
      ] as const));
      const trendMonths = Array.from({ length: 6 }, (_, offset) => {
        const [year, monthNumber] = monthKeyForOwner(month);
        const date = new Date(year, monthNumber - 1 - offset, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      });
      const trendRows = await Promise.all(trendMonths.map(async (trendMonth) => {
        const [shares, monthSummary] = await Promise.all([
          repositories.ownerRepo.getMyDistribution(trendMonth),
          Promise.all(owned.map((plaza) => repositories.plazaRepo.getMonthSummary(plaza.id, trendMonth))),
        ]);
        return {
          month: trendMonth,
          share: shares.reduce((sum, item) => sum + item.amount_due, 0),
          collected: monthSummary.reduce((sum, item) => sum + item.collected, 0),
          expenses: monthSummary.reduce((sum, item) => sum + item.plaza_expenses, 0),
        };
      }));
      const unitEntries = await Promise.all(owned.map((plaza) => repositories.unitRepo.getOverview(plaza.id)));
      const rentEntries = await Promise.all(owned.map((plaza) => repositories.rentRepo.getStatus(plaza.id, month)));
      const arrearsEntries = await Promise.all(owned.map((plaza) => repositories.rentRepo.getArrears(plaza.id)));
      setSharedState(ownerState);
      setPlazaList(owned);
      setDistribution(shares);
      setPayments(paymentRows);
      setExpenses(expenseRows);
      setSummaries(Object.fromEntries(summaryEntries));
      setUnits(unitEntries.flat());
      setRentStatus(rentEntries.flat());
      setArrears(arrearsEntries.flat());
      setTrend(trendRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load owner information.");
    } finally {
      setLoading(false);
    }
  }, [month, ownerId, repositories]);

  useEffect(() => {
    void refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === sharedDemoStorageKey) void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const visiblePlazas = plazaFilter === "all" ? plazaList : plazaList.filter((plaza) => plaza.id === plazaFilter);
  const visibleDistribution = distribution.filter((item) => visiblePlazas.some((plaza) => plaza.id === item.plazaId));
  const activeShare = visibleDistribution.reduce((sum, item) => sum + item.amount_due, 0);
  const sentTotal = visibleDistribution.reduce((sum, item) => sum + item.sent_total, 0);
  const receivedTotal = visibleDistribution.reduce((sum, item) => sum + item.confirmed_total, 0);
  const pendingPayments = payments.filter((payment) => payment.status === "sent-awaiting-confirmation" && !appSettings.closedMonths.includes(payment.month.slice(0, 7)) && visiblePlazas.some((plaza) => plaza.id === payment.plazaId));
  const ownerExpenses = expenses.filter((expense) => visiblePlazas.some((plaza) => plaza.id === expense.plazaId));
  const pendingExpenses = ownerExpenses.filter((expense) => expense.status === "pending-approval" && !appSettings.closedMonths.includes(expense.date.slice(0, 7)));
  const selectedPayments = payments.filter((payment) => payment.month.slice(0, 7) === month.slice(0, 7));
  const filteredUnits = units.filter((unit) => visiblePlazas.some((plaza) => plaza.id === unit.plazaId));
  const filteredRent = rentStatus.filter((entry) => visiblePlazas.some((plaza) => plaza.id === entry.plazaId));
  const filteredExpenses = ownerExpenses.filter((expense) => expense.date.startsWith(month.slice(0, 7)));
  const rentExpected = visiblePlazas.reduce((sum, plaza) => sum + (summaries[plaza.id]?.expected_rent ?? 0), 0);
  const rentCollected = visiblePlazas.reduce((sum, plaza) => sum + (summaries[plaza.id]?.collected ?? 0), 0);
  const rentUnpaid = visiblePlazas.reduce((sum, plaza) => sum + (summaries[plaza.id]?.unpaid ?? 0), 0);
  const vacantUnits = filteredUnits.filter((unit) => unit.status === "vacant");
  const soonVacantUnits = filteredUnits.filter((unit) => unit.status === "soon-vacant");
  const vacancyLoss = vacantUnits.reduce((sum, unit) => sum + unit.monthlyRent, 0);
  const filteredArrears = arrears.filter((row) => filteredRent.some((rentRow) => rentRow.tenantId === row.tenantId));
  const isClosed = appSettings.closedMonths.includes(month);

  async function perform(action: () => Promise<unknown>, successMessage: string) {
    setMutationMessage("");
    setError("");
    try {
      await action();
      setMutationMessage(successMessage);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed.");
    }
  }

  function ownershipLabel(plaza: Plaza) {
    if (plaza.ownership.type === "single") return t.owner;
    if (plaza.ownership.type === "shared") {
      const percent = plaza.ownership.shares.find((share) => share.ownerId === ownerId)?.percent ?? 0;
      return `${percent}%`;
    }
    if (!plaza.ownership.rotationOrder.length) return "Rotation";
    const [startYear, startMonth] = plaza.ownership.rotationStartMonth.split("-").map(Number);
    const [selectedYear, selectedMonth] = monthKeyForOwner(month);
    const offset = (selectedYear - startYear) * 12 + selectedMonth - startMonth;
    const ownerTurnId = plaza.ownership.rotationOrder[((offset % plaza.ownership.rotationOrder.length) + plaza.ownership.rotationOrder.length) % plaza.ownership.rotationOrder.length];
    return ownerTurnId === ownerId
      ? t.rotationYourTurn
      : t.rotationPartnerTurn.replace("{name}", allOwners.find((candidate) => candidate.id === ownerTurnId)?.name ?? "partner");
  }

  function shareFor(plazaId: string) {
    return distribution.find((row) => row.plazaId === plazaId);
  }

  function expenseImpact(expense: Expense) {
    if (expense.chargeTo !== "plaza") return expense.chargeTo.ownerId === ownerId ? expense.amount : 0;
    const plaza = plazaList.find((item) => item.id === expense.plazaId);
    if (!plaza) return 0;
    if (plaza.ownership.type === "shared") {
      const percent = plaza.ownership.shares.find((share) => share.ownerId === ownerId)?.percent ?? 0;
      return Math.round(expense.amount * percent / 100);
    }
    if (plaza.ownership.type === "single") return plaza.ownership.ownerId === ownerId ? expense.amount : 0;
    const [startYear, startMonth] = plaza.ownership.rotationStartMonth.split("-").map(Number);
    const [selectedYear, selectedMonth] = monthKeyForOwner(month);
    const offset = (selectedYear - startYear) * 12 + selectedMonth - startMonth;
    const currentOwner = plaza.ownership.rotationOrder[((offset % plaza.ownership.rotationOrder.length) + plaza.ownership.rotationOrder.length) % plaza.ownership.rotationOrder.length];
    return currentOwner === ownerId ? expense.amount : 0;
  }

  function downloadStatementCsv() {
    const lines = [
      ["Plaza", "Month", "Expected rent", "Rent collected", "Approved expenses", "Your share", "Sent", "Received"],
      ...visiblePlazas.map((plaza) => [
        plaza.name,
        monthLabel(month),
        summaries[plaza.id]?.expected_rent ?? 0,
        summaries[plaza.id]?.collected ?? 0,
        summaries[plaza.id]?.plaza_expenses ?? 0,
        shareFor(plaza.id)?.amount_due ?? 0,
        shareFor(plaza.id)?.sent_total ?? 0,
        shareFor(plaza.id)?.confirmed_total ?? 0,
      ]),
    ];
    const csv = lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `owner-statement-${month}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function OwnerCard({ title, value, icon: Icon, action }: { title: string; value: string; icon: typeof Home; action?: () => void }) {
    const content = <Card className="h-full"><CardContent className="flex items-start justify-between gap-3 p-4"><div><p className="text-sm text-muted">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p></div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Icon className="h-5 w-5" /></span></CardContent></Card>;
    return action ? <button className="block w-full text-start" onClick={action}>{content}</button> : content;
  }

  function paymentCard(payment: OwnerPayment, showActions: boolean) {
    const plaza = plazaList.find((item) => item.id === payment.plazaId);
    const calculated = payment.systemCalculatedAmount ?? payment.amountDue;
    const mismatch = calculated !== payment.amountSent;
    const attachment = payment.receiptUrl ?? payment.paymentProofUrl;
    const attachmentUrl = attachment && (attachment.startsWith("https://") || attachment.startsWith("http://") || attachment.startsWith("data:")) ? attachment : undefined;
    return <Card key={payment.id} className={payment.status === "cancelled" ? "opacity-75" : undefined}><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted">{plaza?.name} · {monthLabel(payment.month)}</p><p className="mt-1 text-3xl font-bold tabular-nums text-ink">{formatMoney(payment.amountSent)}</p><p className="mt-1 text-sm text-muted">{payment.sentBy ? `From ${payment.sentBy}` : "Payment recorded by the accountant"}</p></div><OwnerStateBadge tone={payment.status === "confirmed-received" ? "success" : payment.status === "disputed" || payment.status === "cancelled" ? "danger" : "warning"}>{statusText(payment.status, t)}</OwnerStateBadge></div>
      <div className="grid gap-2 rounded-xl bg-bg p-3 text-sm sm:grid-cols-2"><p><span className="text-muted">{t.paymentDate}: </span>{payment.date ?? "—"}</p><p><span className="text-muted">{t.transaction}: </span><span className="break-all">{payment.transactionId ?? "—"}</span></p><p><span className="text-muted">Bank: </span>{payment.bankName ?? "—"}</p><p><span className="text-muted">{t.paymentDifference}: </span>{formatMoney(calculated)}</p></div>
      {mismatch ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>Calculated share {formatMoney(calculated)} · transfer {formatMoney(payment.amountSent)} · difference {formatMoney(Math.abs(calculated - payment.amountSent))}</p>{payment.differenceReason ? <p className="mt-1">{t.differenceReason}: {payment.differenceReason}</p> : null}</div> : <p className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />Matches your calculated share ({formatMoney(calculated)})</p>}
      {payment.disputeReason ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{payment.disputeReason}</p> : null}
      {payment.cancelReason ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 line-through">{payment.cancelReason}</p> : null}
      {attachment ? <div className="rounded-xl border border-border bg-bg p-4"><p className="text-sm font-medium text-text">Transfer receipt</p>{attachmentUrl ? <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block min-h-11 content-center break-all text-sm text-primary underline">{t.openAttachment}</a> : <p className="mt-1 break-all text-sm text-muted">Receipt reference: {attachment}</p>}</div> : null}
      {showActions && !isClosed && payment.status === "sent-awaiting-confirmation" ? <div className="grid gap-2 sm:grid-cols-2"><Button className="min-h-12 bg-emerald-700 hover:bg-emerald-800" onClick={() => setConfirmingPayment(payment)}><Check className="h-5 w-5" />{t.confirmReceived}</Button><Button className="min-h-12" variant="outline" onClick={() => { setDisputingPaymentId(payment.id); setDisputeReason(""); }}>{t.problem}</Button></div> : null}
    </CardContent></Card>;
  }

  function expenseCard(expense: Expense, showActions: boolean) {
    const plaza = plazaList.find((item) => item.id === expense.plazaId);
    const chargedTo = expense.chargeTo === "plaza" ? t.wholePlaza : expense.chargeTo.ownerId === ownerId ? t.yourAccount : "Other owner";
    const attachmentUrl = expense.billUrl.startsWith("https://") || expense.billUrl.startsWith("http://") || expense.billUrl.startsWith("data:")
      ? expense.billUrl
      : undefined;
    return <Card key={expense.id}><CardContent className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">{plaza?.name} · {expense.date}</p><h3 className="mt-1 font-semibold text-ink">{expense.description}</h3><p className="text-sm text-muted">{expense.category} · {t.chargedTo}: {chargedTo}</p></div><p className="shrink-0 text-xl font-semibold tabular-nums">{formatMoney(expense.amount)}</p></div>
      <div className="rounded-xl border border-border bg-bg p-3"><p className="text-sm font-medium text-text">Bill / receipt</p>{attachmentUrl ? <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block min-h-11 content-center break-all text-sm text-primary underline">{t.openAttachment}</a> : <p className="mt-1 break-all text-sm text-muted">Reference: {expense.billUrl}</p>}</div>
      <p className="text-sm text-muted">{t.recordedBy}: {expense.recordedBy ?? users.find((user) => user.role === "accountant")?.name}</p>
      {expense.status === "approved" ? <p className="text-sm text-muted">{t.expenseApprovedEffect.replace("{amount}", formatMoney(expenseImpact(expense)))}</p> : expense.status === "pending-approval" ? <p className="text-sm text-muted">{t.expenseEffect.replace("{amount}", formatMoney(expenseImpact(expense)))}</p> : null}
      {expense.rejectionReason ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{t.rejectionReason}: {expense.rejectionReason}</p> : null}
      {showActions && !isClosed && expense.status === "pending-approval" ? <div className="grid gap-2 sm:grid-cols-2"><Button className="min-h-12 bg-emerald-700 hover:bg-emerald-800" onClick={() => void perform(() => repositories.expenseRepo.approve(expense.id), "Expense approved.")}><Check className="h-5 w-5" />{t.approve}</Button><Button className="min-h-12" variant="outline" onClick={() => { setRejectingExpenseId(expense.id); setRejectReason(""); }}>{t.reject}</Button></div> : <OwnerStateBadge tone={expense.status === "approved" ? "success" : expense.status === "rejected" ? "danger" : "warning"}>{expense.status === "approved" ? t.approved : expense.status === "rejected" ? t.rejected : t.pending}</OwnerStateBadge>}
      {rejectingExpenseId === expense.id ? <form className="space-y-2 rounded-xl border border-border p-3" onSubmit={(event) => { event.preventDefault(); void perform(() => repositories.expenseRepo.reject(expense.id, rejectReason), "Expense rejected."); setRejectingExpenseId(null); }}><label className="block text-sm font-medium">{t.rejectionReason}<textarea required value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-bg p-3" /></label><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setRejectingExpenseId(null)}>{t.cancel}</Button><Button type="submit">{t.submit}</Button></div></form> : null}
    </CardContent></Card>;
  }

  function pageTitle() {
    const item = desktopItems.find((entry) => entry.id === section);
    return item ? t[item.key] : t.ownerHome;
  }

  const title = pageTitle();
  const sectionBody = (() => {
    if (loading) return <div className="grid gap-3 sm:grid-cols-2"><div className="h-32 animate-pulse rounded-2xl bg-surface" /><div className="h-32 animate-pulse rounded-2xl bg-surface" /><div className="h-32 animate-pulse rounded-2xl bg-surface" /></div>;
    if (section === "home") return <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm text-muted">{t.greeting},</p><h2 className="text-2xl font-semibold text-ink">{owner?.name}</h2><p className="mt-1 text-sm text-muted">{monthLabel(month)}</p></div><label className="grid gap-1 text-sm font-medium">{t.allPlazas}<select value={plazaFilter} onChange={(event) => setPlazaFilter(event.target.value)} className="h-11 min-w-44 rounded-xl border border-border bg-surface px-3"><option value="all">{t.allPlazas}</option>{plazaList.map((plaza) => <option value={plaza.id} key={plaza.id}>{plaza.name}</option>)}</select></label></div>
      {(pendingPayments.length || pendingExpenses.length) ? <Card className="border-amber-300"><CardContent className="space-y-3 p-4"><h2 className="flex items-center gap-2 text-lg font-semibold text-ink"><Bell className="h-5 w-5 text-amber-700" />{t.needsAttention}</h2>{pendingPayments.map((payment) => <button key={payment.id} onClick={() => setSection("approvals")} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-start text-sm text-amber-950"><span>{formatMoney(payment.amountSent)} sent to you. Did you receive it?</span><ChevronRight className="h-5 w-5 shrink-0" /></button>)}{pendingExpenses.length ? <button onClick={() => setSection("approvals")} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-start text-sm text-amber-950"><span>{pendingExpenses.length} {t.pendingExpenses} ({formatMoney(pendingExpenses.reduce((sum, expense) => sum + expense.amount, 0))})</span><ChevronRight className="h-5 w-5 shrink-0" /></button> : null}</CardContent></Card> : <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="h-5 w-5" />{t.allClear}</p>}
      <Card className="overflow-hidden bg-ink text-white"><CardContent className="space-y-4 p-5 sm:p-7"><p className="text-sm text-white/70">{t.yourShare}</p><p className="text-4xl font-bold tabular-nums sm:text-5xl">{formatMoney(activeShare)}</p><div className="grid grid-cols-3 gap-2 text-sm"><div><p className="text-white/60">{t.calculated}</p><p className="font-semibold">{formatMoney(activeShare)}</p></div><div><p className="text-white/60">{t.sent}</p><p className="font-semibold">{formatMoney(sentTotal)}</p></div><div><p className="text-white/60">{t.received}</p><p className="font-semibold">{formatMoney(receivedTotal)}</p></div></div><p className="text-sm text-white/75">{formatMoney(activeShare)} due · {formatMoney(receivedTotal)} received · {formatMoney(Math.max(0, activeShare - sentTotal))} not sent yet</p></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visiblePlazas.map((plaza) => { const share = shareFor(plaza.id); const summary = summaries[plaza.id]; const percent = summary?.expected_rent ? Math.min(100, Math.round((summary.collected / summary.expected_rent) * 100)) : 0; return <button key={plaza.id} onClick={() => { setPlazaFilter(plaza.id); setSection("properties"); }} className="text-start"><Card className="h-full transition hover:border-primary/50"><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-ink">{plaza.name}</h3><p className="text-sm text-muted">{plaza.address}</p></div><OwnerStateBadge>{ownershipLabel(plaza)}</OwnerStateBadge></div><p className="text-2xl font-semibold tabular-nums">{formatMoney(share?.amount_due ?? 0)}</p><p className="text-sm text-muted">{t.yourShare}</p><div className="h-2 rounded-full bg-bg"><div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} /></div><p className="text-sm text-muted">{formatMoney(summary?.collected ?? 0)} / {formatMoney(summary?.expected_rent ?? 0)} {t.rentCollected}</p><p className="text-sm">{filteredUnits.filter((unit) => unit.plazaId === plaza.id && unit.status === "vacant").length} {t.vacant.toLowerCase()} · {t.occupied}: {filteredUnits.filter((unit) => unit.plazaId === plaza.id && unit.status === "occupied").length}</p></CardContent></Card></button>; })}</div>
      <div className="grid gap-3 sm:grid-cols-3"><OwnerCard title={t.rentCollected} value={formatMoney(rentCollected)} icon={CircleDollarSign} action={() => setSection("rent")} /><OwnerCard title={t.stillToCollect} value={formatMoney(rentUnpaid)} icon={ArrowDownLeft} action={() => setSection("rent")} /><OwnerCard title={t.emptyUnits} value={`${vacantUnits.length}`} icon={Building2} action={() => setSection("vacancy")} /></div>
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold">{t.emptyUnits}: {vacantUnits.length}</h3><p className="text-sm text-muted">{t.lostRent}: {formatMoney(vacancyLoss)} · {soonVacantUnits.length} {t.soonVacant.toLowerCase()}</p></div><Button variant="outline" onClick={() => setSection("vacancy")}>{t.seeVacancy}</Button></CardContent></Card>
      <Card><CardContent className="p-4"><h2 className="font-semibold">{t.trend}</h2><div className="mt-4 grid grid-cols-6 items-end gap-2">{[...trend].reverse().map((point) => { const max = Math.max(1, ...trend.map((item) => item.share)); const height = Math.max(4, Math.round(point.share / max * 100)); return <div className="grid min-w-0 gap-2 text-center" key={point.month}><span className="truncate text-xs tabular-nums">{formatMoney(point.share)}</span><div className="flex h-28 items-end"><div className="w-full rounded-t-md bg-primary" style={{ height: `${height}%` }} /></div><span className="text-xs text-muted">{new Date(Number(point.month.slice(0, 4)), Number(point.month.slice(5, 7)) - 1, 1).toLocaleDateString(language === "ur" ? "ur-PK" : "en-PK", { month: "short" })}</span></div>; })}</div></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2"><Button variant="outline" className="min-h-12" onClick={() => setSection("statements")}><Download className="h-4 w-4" />{t.printStatement}</Button><Button variant="outline" className="min-h-12" onClick={() => { const message = `${t.yourShare}: ${formatMoney(activeShare)} · ${monthLabel(month)}`; window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); }}><Phone className="h-4 w-4" />{t.shareWhatsApp}</Button></div>
    </div>;
    if (section === "approvals") return <ApprovalsView />;
    if (section === "my-money") return <div className="space-y-3"><Card><CardContent className="grid gap-3 p-4 sm:grid-cols-3"><OwnerCard title={t.yourShare} value={formatMoney(activeShare)} icon={Wallet} /><OwnerCard title={t.sent} value={formatMoney(sentTotal)} icon={ArrowDownLeft} /><OwnerCard title={t.received} value={formatMoney(receivedTotal)} icon={CheckCircle2} /></CardContent></Card><div className="grid gap-3 xl:grid-cols-2">{visiblePlazas.map((plaza) => { const summary = summaries[plaza.id]; const share = shareFor(plaza.id); return <Card key={plaza.id}><CardContent className="space-y-3 p-4"><h2 className="text-lg font-semibold">{plaza.name} · {monthLabel(month)}</h2><p>{t.rentCollected}: <strong>{formatMoney(summary?.collected ?? 0)}</strong></p><p>{t.expensesApproved}: <strong>{formatMoney(summary?.plaza_expenses ?? 0)}</strong></p><p>{t.accountantPay}: <strong>{formatMoney(summary?.accountant_pay ?? 0)}</strong></p><p>{t.share}: <strong>{formatMoney(share?.amount_due ?? 0)}</strong></p><p className="text-sm text-muted">{t.sent}: {formatMoney(share?.sent_total ?? 0)} · {t.received}: {formatMoney(share?.confirmed_total ?? 0)}</p></CardContent></Card>; })}</div><div className="grid gap-3">{selectedPayments.map((payment) => paymentCard(payment, false))}</div></div>;
    if (section === "properties") return <div className="space-y-4">{visiblePlazas.map((plaza) => { const plazaUnits = filteredUnits.filter((unit) => unit.plazaId === plaza.id); return <Card key={plaza.id}><CardContent className="space-y-4 p-4"><div><h2 className="text-xl font-semibold">{plaza.name}</h2><p className="text-sm text-muted">{plaza.address} · {plaza.floors} floors</p><OwnerStateBadge>{ownershipLabel(plaza)}</OwnerStateBadge></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{plazaUnits.map((unit) => { const tenant = sharedState?.tenants.find((item) => item.id === unit.tenantId); return <div key={unit.id} className="rounded-xl border border-border p-3"><div className="flex justify-between gap-2"><strong>{unit.number}</strong><OwnerStateBadge tone={unit.status === "occupied" ? "success" : unit.status === "vacant" ? "danger" : "warning"}>{unit.status === "occupied" ? t.occupied : unit.status === "vacant" ? t.vacant : t.soonVacant}</OwnerStateBadge></div><p className="mt-2 text-sm text-muted">{tenant?.name ?? "—"} · {formatMoney(unit.monthlyRent)}</p>{tenant?.phone ? <a className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-primary" href={`tel:${tenant.phone}`}><Phone className="h-4 w-4" />{t.contact}</a> : null}</div>; })}</div><p className="text-sm text-muted">{t.readOnly}</p></CardContent></Card>; })}</div>;
    if (section === "vacancy") return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><OwnerCard title={t.vacant} value={`${vacantUnits.length}`} icon={Building2} /><OwnerCard title={t.lostRent} value={formatMoney(vacancyLoss)} icon={ArrowDownLeft} /><OwnerCard title={t.soonVacant} value={`${soonVacantUnits.length}`} icon={Home} /></div><Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2">{filteredUnits.filter((unit) => unit.status !== "occupied").map((unit) => <div key={unit.id} className="rounded-xl border border-border p-3"><p className="font-semibold">{unit.number} · {plazaList.find((plaza) => plaza.id === unit.plazaId)?.name}</p><p className="text-sm text-muted">{unit.status === "vacant" ? t.vacant : t.soonVacant} · {formatMoney(unit.monthlyRent)} / month</p></div>)}</CardContent></Card></div>;
    if (section === "rent") return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><OwnerCard title={t.rentExpected} value={formatMoney(rentExpected)} icon={CircleDollarSign} /><OwnerCard title={t.rentCollected} value={formatMoney(rentCollected)} icon={CheckCircle2} /><OwnerCard title={t.stillToCollect} value={formatMoney(rentUnpaid)} icon={ArrowDownLeft} /></div><Card><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t.ownerRent}</h2><label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3"><Search className="h-4 w-4" /><input aria-label={t.search} value={searchText} onChange={(event) => setSearchText(event.target.value)} className="min-w-0 bg-transparent outline-none" /></label></div>{filteredRent.filter((row) => `${row.tenantName} ${row.unitNumber}`.toLowerCase().includes(searchText.toLowerCase())).map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div><p className="font-medium">{row.tenantName} · {row.unitNumber}</p><p className="text-sm text-muted">{monthLabel(row.month)} · {t.rent}: {formatMoney(row.dueAmount)}</p></div><div className="flex items-center gap-2"><strong>{formatMoney(Math.max(0, row.dueAmount + row.carriedForward - row.payments.filter((payment) => payment.status === "active").reduce((sum, payment) => sum + payment.amount, 0)))}</strong><OwnerStateBadge tone={row.is_overdue ? "danger" : row.status === "paid" ? "success" : "warning"}>{row.is_overdue ? `${t.overdue} · ${row.days_overdue}d` : row.status === "paid" ? t.paid : row.status === "partly-paid" ? t.partlyPaid : t.unpaid}</OwnerStateBadge></div></div>)}</CardContent></Card><Card><CardContent className="space-y-3 p-4"><h2 className="text-lg font-semibold">{t.seeArrears}</h2>{filteredArrears.map((row) => <div key={row.tenantId} className="flex flex-wrap justify-between gap-2 border-t border-border py-3"><span>{row.tenantName} · {row.unitNumber}<span className="block text-sm text-muted">{row.months_unpaid} {t.monthsUnpaid} · {row.max_days_overdue} {t.daysOverdue}</span></span><strong>{formatMoney(row.total_arrears)}</strong></div>)}</CardContent></Card></div>;
    if (section === "expenses") return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><OwnerCard title={t.approved} value={`${filteredExpenses.filter((expense) => expense.status === "approved").length}`} icon={CheckCircle2} /><OwnerCard title={t.pending} value={`${pendingExpenses.length}`} icon={Bell} /><OwnerCard title={t.rejected} value={`${filteredExpenses.filter((expense) => expense.status === "rejected").length}`} icon={X} /></div><div className="grid gap-3 xl:grid-cols-2">{filteredExpenses.map((expense) => expenseCard(expense, true))}</div></div>;
    if (section === "statements") return <div className="space-y-4"><Card><CardContent className="space-y-3 p-5"><div><OwnerStateBadge tone="info"><LockKeyhole className="h-4 w-4" />{monthLabel(month)}</OwnerStateBadge><h2 className="mt-3 text-2xl font-semibold">{t.ownerStatements}</h2><p className="text-muted">{owner?.name} · {monthLabel(month)}</p><p className="text-sm text-muted">{t.statementNote}</p></div><div className="grid gap-2 sm:grid-cols-2">{visiblePlazas.map((plaza) => { const summary = summaries[plaza.id]; return <div key={plaza.id} className="rounded-xl border border-border p-3"><h3 className="font-semibold">{plaza.name}</h3><p>{t.rentExpected}: {formatMoney(summary?.expected_rent ?? 0)}</p><p>{t.rentCollected}: {formatMoney(summary?.collected ?? 0)}</p><p>{t.expensesApproved}: {formatMoney(summary?.plaza_expenses ?? 0)}</p><p>{t.accountantPay}: {formatMoney(summary?.accountant_pay ?? 0)}</p><p>{t.share}: {formatMoney(shareFor(plaza.id)?.amount_due ?? 0)}</p></div>; })}</div><div className="flex flex-wrap gap-2"><Button onClick={() => window.print()}><Download className="h-4 w-4" />{t.printStatement}</Button><Button variant="outline" onClick={downloadStatementCsv}><Download className="h-4 w-4" />{t.downloadCsv}</Button><Button variant="outline" onClick={() => { const text = `${t.ownerStatements} · ${monthLabel(month)} · ${formatMoney(activeShare)}`; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); }}>{t.shareWhatsApp}</Button></div></CardContent></Card><Card><CardContent className="space-y-2 p-4"><h2 className="text-lg font-semibold">{t.ownerRent}</h2>{filteredRent.map((row) => <div key={row.id} className="grid grid-cols-2 gap-2 border-t border-border py-2 text-sm sm:grid-cols-5"><span>{row.tenantName}</span><span>{row.unitNumber}</span><span>{t.due}: {formatMoney(row.dueAmount + row.carriedForward)}</span><span>{t.received}: {formatMoney(row.payments.filter((payment) => payment.status === "active").reduce((sum, payment) => sum + payment.amount, 0))}</span><span>{t.balance}: {formatMoney(Math.max(0, row.dueAmount + row.carriedForward - row.payments.filter((payment) => payment.status === "active").reduce((sum, payment) => sum + payment.amount, 0)))}</span></div>)}</CardContent></Card><div className="grid gap-3">{selectedPayments.map((payment) => paymentCard(payment, false))}{visiblePlazas.flatMap((plaza) => filteredExpenses.filter((expense) => expense.plazaId === plaza.id && expense.status === "approved").map((expense) => expenseCard(expense, false)))}</div></div>;
    if (section === "reports") return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><OwnerCard title={t.yourShare} value={formatMoney(activeShare)} icon={Wallet} /><OwnerCard title={t.expectedReceived} value={formatMoney(rentCollected)} icon={CheckCircle2} /><OwnerCard title={t.unpaidBalance} value={formatMoney(rentUnpaid)} icon={ArrowDownLeft} /></div><Card><CardContent className="p-4"><h2 className="font-semibold">{t.trend}</h2><div className="mt-4 grid gap-2">{[...trend].reverse().map((point) => <div key={point.month} className="grid grid-cols-[1fr_auto] gap-2 border-t border-border py-2"><span>{monthLabel(point.month)}</span><span className="tabular-nums">{t.share}: {formatMoney(point.share)} · {t.expectedReceived}: {formatMoney(point.collected)}</span></div>)}</div></CardContent></Card></div>;
    if (section === "documents") return <Card><CardContent className="space-y-3 p-4"><h2 className="text-lg font-semibold">{t.ownerDocuments}</h2>{(sharedState?.documents ?? []).filter((document) => document.type !== "CNIC" && (!document.plazaId || visiblePlazas.some((plaza) => plaza.id === document.plazaId))).map((document) => { const url = document.url.startsWith("https://") || document.url.startsWith("http://") || document.url.startsWith("data:") ? document.url : undefined; return <div key={document.id} className="flex items-center justify-between gap-3 border-t border-border py-3"><span><strong>{document.title}</strong><span className="block text-sm text-muted">{document.type} · {document.uploadedAt}</span></span>{url ? <a href={url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center text-sm text-primary underline">{t.openAttachment}</a> : <span className="text-sm text-muted">{t.readOnly}</span>}</div>; })}</CardContent></Card>;
    if (section === "calculator") { const amount = Number(calculatorAmount) || 0; const selectedPlaza = visiblePlazas[0]; const selectedShare = selectedPlaza?.ownership.type === "shared" ? selectedPlaza.ownership.shares.find((share) => share.ownerId === ownerId)?.percent ?? 0 : selectedPlaza?.ownership.type === "single" ? 100 : 0; return <Card><CardContent className="space-y-4 p-5"><h2 className="text-xl font-semibold">{t.useCalculator}</h2><label className="block text-sm font-medium">{t.calculatorAmount}<input inputMode="numeric" type="number" min="0" value={calculatorAmount} onChange={(event) => setCalculatorAmount(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3" /></label><p>{t.share} ({selectedShare}%): <strong className="text-2xl tabular-nums">{formatMoney(Math.round(amount * selectedShare / 100))}</strong></p><p className="text-sm text-muted">{selectedPlaza?.name ?? t.allPlazas}</p></CardContent></Card>; }
    if (section === "activity") return <Card><CardContent className="space-y-3 p-4"><h2 className="text-lg font-semibold">{t.ownerActivity}</h2>{(sharedState?.activityLog ?? []).filter((entry) => visiblePlazas.some((plaza) => plaza.id === entry.plazaId)).map((entry) => <div key={entry.id} className="border-t border-border py-3"><p>{entry.actorId === ownerId ? owner?.name : "Accountant"} {entry.action} · {entry.entity}</p><p className="text-sm text-muted">{new Date(entry.timestamp).toLocaleString(language === "ur" ? "ur-PK" : "en-PK")}</p></div>)}</CardContent></Card>;
    if (section === "notifications") return <Card><CardContent className="space-y-3 p-4"><h2 className="text-lg font-semibold">{t.ownerNotifications}</h2>{(sharedState?.notifications ?? []).map((notification) => <div key={notification.id} className="border-t border-border py-3"><p className="font-medium">{notification.title}</p><p className="text-sm text-muted">{notification.body}</p></div>)}</CardContent></Card>;
    if (section === "settings") return <Card><CardContent className="space-y-4 p-5"><h2 className="text-xl font-semibold">{t.profile}</h2><p>{owner?.name} · {owner?.phone}</p><div><h3 className="font-semibold">{t.bankDetails}</h3>{(owner?.accounts ?? []).map((account) => <p key={account.id} className="text-sm text-muted">{account.bank} · ****{account.accountNumber.slice(-4)}</p>)}{owner?.accounts?.length ? null : <p className="text-sm text-muted">{owner?.bank} · {t.readOnly}</p>}</div><Button variant="outline" onClick={onLogout}>{t.logout}</Button></CardContent></Card>;
    return <Card><CardContent className="p-6 text-muted">{t.comingSoon}</CardContent></Card>;
  })();

  function ApprovalsView() {
    const tab = approvalTab;
    const setTab = setApprovalTab;
    const query = searchText.trim().toLocaleLowerCase();
    const historyPayments = payments.filter((payment) => payment.status !== "sent-awaiting-confirmation" && `${plazaList.find((plaza) => plaza.id === payment.plazaId)?.name ?? ""} ${payment.month} ${payment.status} ${payment.transactionId ?? ""}`.toLocaleLowerCase().includes(query));
    const historyExpenses = ownerExpenses.filter((expense) => expense.status !== "pending-approval" && `${plazaList.find((plaza) => plaza.id === expense.plazaId)?.name ?? ""} ${expense.date} ${expense.category} ${expense.description} ${expense.status}`.toLocaleLowerCase().includes(query));
    return <div className="space-y-3"><div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-2"><button className={cn("min-h-12 rounded-xl px-2 text-sm", tab === "money" && "bg-primary-soft text-primary")} onClick={() => setTab("money")}>{t.moneyReceived} ({pendingPayments.length})</button><button className={cn("min-h-12 rounded-xl px-2 text-sm", tab === "expenses" && "bg-primary-soft text-primary")} onClick={() => setTab("expenses")}>{t.expensesWaiting} ({pendingExpenses.length})</button><button className={cn("min-h-12 rounded-xl px-2 text-sm", tab === "history" && "bg-primary-soft text-primary")} onClick={() => setTab("history")}>{t.history}</button></div>
      {tab === "money" ? <div className="grid gap-3 xl:grid-cols-2">{pendingPayments.map((payment) => paymentCard(payment, true))}{pendingPayments.length ? null : <p className="rounded-2xl bg-emerald-50 p-5 text-emerald-900">{t.noPending}</p>}</div> : null}
      {tab === "expenses" ? <div className="grid gap-3 xl:grid-cols-2">{pendingExpenses.map((expense) => expenseCard(expense, true))}{pendingExpenses.length ? null : <p className="rounded-2xl bg-emerald-50 p-5 text-emerald-900">{t.noPending}</p>}</div> : null}
      {tab === "history" ? <><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t.search} aria-label={t.search} className="h-12 w-full rounded-xl border border-border bg-surface px-3" /><div className="grid gap-3 xl:grid-cols-2">{historyPayments.map((payment) => paymentCard(payment, false))}{historyExpenses.map((expense) => expenseCard(expense, false))}{!historyPayments.length && !historyExpenses.length ? <p className="rounded-2xl border border-border bg-surface p-5 text-muted">{t.noRecords}</p> : null}</div></> : null}</div>;
  }

  if (!owner) {
    if (loading) return <main className="p-6 text-sm text-muted">Loading…</main>;
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text">
        <div role="alert" className="max-w-md space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-medium">Your owner record could not be found.</p>
          <p>{error || "Ask the administrator to create your owner record in the app."}</p>
          <Button onClick={onLogout}>Log out</Button>
        </div>
      </main>
    );
  }

  return <div dir={direction} className={cn("min-h-dvh bg-bg text-text", dark && "dark")}>
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 overflow-y-auto bg-ink p-3 text-white lg:block"><div className="mb-5 flex items-center gap-3 px-2 py-3"><Building2 className="h-7 w-7" /><div><p className="font-semibold">Kiraya Hisab</p><p className="text-sm text-white/60">{t.ownerRole}</p></div></div><nav className="space-y-1">{desktopItems.map(({ id, key, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm", section === id ? "bg-white text-ink" : "text-white/75 hover:bg-white/10")}><Icon className="h-4 w-4" />{t[key]}{id === "approvals" && pendingPayments.length + pendingExpenses.length > 0 ? <span className="ms-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{pendingPayments.length + pendingExpenses.length}</span> : null}</button>)}</nav></aside>
    <div className="lg:ps-64"><header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur"><div className="mx-auto flex max-w-[1440px] items-center gap-2 p-3 sm:gap-3 sm:p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{owner.name}</p><p className="text-xs text-muted">{title}</p></div><label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-bg px-2"><span className="sr-only">{t.month}</span><select aria-label={t.month} value={month} onChange={(event) => setMonth(event.target.value)} className="max-w-32 bg-transparent text-sm outline-none sm:max-w-none">{months.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select></label><label className="hidden min-h-11 items-center rounded-xl border border-border bg-bg px-2 sm:flex"><span className="sr-only">{t.allPlazas}</span><select aria-label={t.allPlazas} value={plazaFilter} onChange={(event) => setPlazaFilter(event.target.value)} className="max-w-36 bg-transparent text-sm outline-none"><option value="all">{t.allPlazas}</option>{plazaList.map((plaza) => <option key={plaza.id} value={plaza.id}>{plaza.name}</option>)}</select></label><Button variant="outline" size="icon" aria-label={language === "en" ? "Language: English" : "زبان: اردو"} onClick={() => setLanguage(language === "en" ? "ur" : "en")}><Languages className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Toggle theme" onClick={() => setDark((value) => !value)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button><Button variant="outline" size="icon" aria-label={t.ownerNotifications} onClick={() => setSection("notifications")}><Bell className="h-4 w-4" /></Button></div></header>
      <main className="mx-auto max-w-[1440px] space-y-4 px-3 pb-28 pt-4 sm:px-5 lg:pb-8"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-ink">{title}</h1>{isClosed ? <OwnerStateBadge tone="info"><LockKeyhole className="h-4 w-4" />Month closed, final statement</OwnerStateBadge> : null}</div>{error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}{mutationMessage ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mutationMessage}</p> : null}<motion.div key={section} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{sectionBody}</motion.div></main></div>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">{mobileItems.map(({ id, key, icon: Icon }) => <button key={id} onClick={() => id === "more" ? setMoreOpen((open) => !open) : setSection(id)} className={cn("relative flex min-w-0 min-h-12 flex-col items-center justify-center gap-1 break-words px-0 text-center text-sm leading-tight", id === section ? "text-primary" : "text-muted")}><Icon className="h-5 w-5" />{t[key]}{id === "approvals" && pendingPayments.length + pendingExpenses.length > 0 ? <span className="absolute end-2 top-0 h-2.5 w-2.5 rounded-full bg-rose-600" /> : null}</button>)}</nav>
    {moreOpen ? <div className="fixed inset-x-3 bottom-20 z-50 grid max-h-[65dvh] grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-border bg-surface p-3 shadow-soft sm:grid-cols-3 lg:hidden">{desktopItems.filter((item) => !["home", "approvals", "my-money", "properties"].includes(item.id)).map(({ id, key, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setMoreOpen(false); }} className="flex min-h-12 items-center gap-2 rounded-xl bg-bg px-3 text-start text-sm"><Icon className="h-4 w-4 shrink-0 text-primary" />{t[key]}</button>)}</div> : null}
    <div className="fixed bottom-24 end-3 z-30 lg:hidden"><Button aria-label={t.logout} variant="outline" size="icon" onClick={onLogout}><X className="h-4 w-4" /></Button></div>
    {confirmingPayment ? <div role="presentation" className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmingPayment(null); }}><div role="dialog" aria-modal="true" aria-labelledby="owner-confirm-title" className="w-full rounded-t-3xl bg-surface p-5 sm:max-w-lg sm:rounded-3xl"><h2 id="owner-confirm-title" className="text-xl font-semibold">{t.confirmTitle}</h2><p className="mt-3 text-3xl font-bold tabular-nums">{formatMoney(confirmingPayment.amountSent)}</p><p className="mt-2 text-sm text-muted">{t.confirmWarning}</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => setConfirmingPayment(null)}>{t.cancel}</Button><Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => { const payment = confirmingPayment; setConfirmingPayment(null); void perform(() => repositories.ownerPaymentRepo.confirm(payment.id), "Receipt confirmed."); }}>{t.confirm}</Button></div></div></div> : null}
    {disputingPaymentId ? <div role="presentation" className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"><form role="dialog" aria-modal="true" className="w-full rounded-t-3xl bg-surface p-5 sm:max-w-lg sm:rounded-3xl" onSubmit={(event) => { event.preventDefault(); const id = disputingPaymentId; setDisputingPaymentId(null); void perform(() => repositories.ownerPaymentRepo.dispute(id, disputeReason), "Your payment problem was sent to the accountant."); }}><h2 className="text-xl font-semibold">{t.problem}</h2><label className="mt-4 block text-sm font-medium">{t.paymentProblemReason}<textarea required value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-bg p-3" /></label><div className="mt-4 grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => setDisputingPaymentId(null)}>{t.cancel}</Button><Button type="submit">{t.submit}</Button></div></form></div> : null}
  </div>;
}
