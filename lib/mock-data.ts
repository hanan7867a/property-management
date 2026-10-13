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
  User,
} from "@/lib/types";

export const demoMonth = "2026-01";

export const users: User[] = [
  { id: "admin-1", name: "Sadia Admin", role: "admin", phone: "0300-1111111" },
  { id: "accountant-1", name: "Tariq Mehmood", role: "accountant", phone: "0301-2222222" },
  { id: "owner-ali", name: "Ali Raza", role: "owner", phone: "0302-3333333" },
  { id: "owner-bilal", name: "Bilal Ahmed", role: "owner", phone: "0303-4444444" },
  { id: "owner-hamza", name: "Hamza Khan", role: "owner", phone: "0304-5555555" },
];

export const owners: Owner[] = [
  { id: "owner-ali", name: "Ali Raza", phone: "0302-3333333", bank: "HBL" },
  { id: "owner-bilal", name: "Bilal Ahmed", phone: "0303-4444444", bank: "Meezan Bank" },
  { id: "owner-hamza", name: "Hamza Khan", phone: "0304-5555555", bank: "UBL" },
];

export const plazas: Plaza[] = [
  {
    id: "plaza-a",
    name: "Al-Noor Plaza",
    address: "Main Boulevard, Gulberg III, Lahore",
    floors: 6,
    photoSeed: "linear-gradient(135deg,#4f46e5,#0284c7)",
    ownership: {
      type: "shared",
      shares: [
        { ownerId: "owner-ali", percent: 60 },
        { ownerId: "owner-bilal", percent: 40 },
      ],
      history: [{ date: "2024-01-01", note: "Ownership locked by Admin", actorId: "admin-1" }],
    },
  },
  {
    id: "plaza-b",
    name: "Gulshan Arcade",
    address: "University Road, Karachi",
    floors: 4,
    photoSeed: "linear-gradient(135deg,#059669,#f5b544)",
    ownership: {
      type: "rotation",
      rotationOrder: ["owner-ali", "owner-bilal"],
      rotationStartMonth: "2026-01",
      history: [{ date: "2024-01-01", note: "Rotation order set by Admin", actorId: "admin-1" }],
    },
  },
  {
    id: "plaza-c",
    name: "City Heights",
    address: "Jinnah Avenue, Islamabad",
    floors: 5,
    photoSeed: "linear-gradient(135deg,#0b1b3a,#e11d48)",
    ownership: {
      type: "single",
      ownerId: "owner-hamza",
      history: [{ date: "2024-01-01", note: "Single owner record imported", actorId: "admin-1" }],
    },
  },
];

const tenantNames = [
  "Ahmed Farooq",
  "Nida Yousaf",
  "Kamran Shah",
  "Javed Iqbal",
  "Sana Malik",
  "Usman Tariq",
  "Hira Qureshi",
  "Faisal Noor",
  "Rabia Anwar",
  "Adnan Saeed",
  "Ayesha Khan",
  "Danish Raza",
  "Mariam Gul",
  "Shahbaz Ali",
  "Noman Arif",
  "Farah Jamil",
  "Bilal Qasim",
  "Zainab Sheikh",
  "Rizwan Akhtar",
  "Mehwish Ilyas",
  "Omar Latif",
  "Iqra Saleem",
  "Talha Masood",
  "Mahnoor Aslam",
  "Hassan Waqas",
  "Kiran Tahir",
  "Salman Butt",
  "Noor Fatima",
  "Asim Waheed",
  "Laiba Riaz",
  "Arif Mehmood",
  "Sobia Nasir",
  "Waqar Ahmed",
  "Fariha Batool",
  "Saad Zafar",
  "Muneeb Khalid",
  "Rida Amjad",
  "Imran Haider",
  "Zeeshan Abbas",
  "Amna Sohail",
  "Hamid Javed",
  "Kinza Iftikhar",
  "Taimoor Rehman",
  "Saira Nadeem",
  "Babar Hussain",
];

export const units: Unit[] = [
  ...Array.from({ length: 24 }, (_, index): Unit => {
    const floor = Math.floor(index / 4);
    const status: Unit["status"] = index === 4 || index === 11 || index === 19 ? "vacant" : index === 7 ? "soon-vacant" : "occupied";
    return {
      id: `a-unit-${index + 1}`,
      plazaId: "plaza-a",
      number: `${index % 4 === 0 ? "Shop" : "Flat"} A-${index + 1}`,
      type: index % 4 === 0 ? "shop" : "flat",
      floor,
      sizeSqFt: index % 4 === 0 ? 420 : 850,
      monthlyRent: index < 10 ? 37500 : 30000,
      status,
      tenantId: status === "vacant" ? undefined : `tenant-${index + 1}`,
      vacantSince: status === "vacant" ? "2026-01-05" : undefined,
    };
  }),
  ...Array.from({ length: 16 }, (_, index): Unit => {
    const status: Unit["status"] = index === 3 || index === 12 ? "vacant" : index === 9 ? "soon-vacant" : "occupied";
    return {
      id: `b-unit-${index + 1}`,
      plazaId: "plaza-b",
      number: `${index % 3 === 0 ? "Shop" : "Office"} B-${index + 1}`,
      type: index % 3 === 0 ? "shop" : "office",
      floor: Math.floor(index / 4),
      sizeSqFt: index % 3 === 0 ? 360 : 650,
      monthlyRent: index < 5 ? 25000 : 20000,
      status,
      tenantId: status === "vacant" ? undefined : `tenant-${24 + index + 1}`,
      vacantSince: status === "vacant" ? "2026-01-10" : undefined,
    };
  }),
  ...Array.from({ length: 12 }, (_, index): Unit => {
    const status: Unit["status"] = index === 2 || index === 8 ? "vacant" : index === 5 ? "soon-vacant" : "occupied";
    return {
      id: `c-unit-${index + 1}`,
      plazaId: "plaza-c",
      number: `${index % 2 === 0 ? "Flat" : "Shop"} C-${index + 1}`,
      type: index % 2 === 0 ? "flat" : "shop",
      floor: Math.floor(index / 3),
      sizeSqFt: index % 2 === 0 ? 780 : 300,
      monthlyRent: index % 2 === 0 ? 42000 : 52000,
      status,
      tenantId: status === "vacant" ? undefined : `tenant-${40 + index + 1}`,
      vacantSince: status === "vacant" ? "2026-01-02" : undefined,
    };
  }),
];

const occupiedUnits = units.filter((unit) => unit.status !== "vacant");

export const tenants: Tenant[] = occupiedUnits.map((unit, index) => ({
  id: unit.tenantId ?? `tenant-${index + 1}`,
  name: tenantNames[index % tenantNames.length],
  phone: `03${String(10 + (index % 80)).padStart(2, "0")}-${String(1000000 + index * 7319).slice(0, 7)}`,
  cnic: `${String(35200 + index).padStart(5, "0")}-${String(1000000 + index * 97).slice(0, 7)}-${index % 10}`,
  unitId: unit.id,
  advance: unit.monthlyRent * 2,
  agreementStart: "2025-02-01",
  agreementEnd: unit.status === "soon-vacant" ? "2026-01-24" : index % 6 === 0 ? "2026-02-02" : "2026-12-31",
  rentIncrease: index % 5 === 0 ? { date: "2026-07-01", amount: unit.monthlyRent + 5000 } : undefined,
  status: "active",
}));

function payment(amount: number, id: string) {
  return { id, amount, date: "2026-01-05", method: "Cash" as const, status: "active" as const };
}

const januaryRentEntries: RentEntry[] = units.map((unit, index) => {
  const paidPattern = index % 7;
  const dueAmount = unit.plazaId === "plaza-a" ? (index < 10 ? 37500 : 30000) : unit.monthlyRent;
  const paid = unit.status === "vacant" ? 0 : paidPattern === 0 ? 0 : paidPattern === 1 ? Math.floor(dueAmount / 2) : dueAmount;
  return {
    id: `rent-${unit.id}`,
    unitId: unit.id,
    tenantId: unit.tenantId ?? "vacant",
    plazaId: unit.plazaId,
    month: demoMonth,
    dueAmount,
    status: unit.status === "vacant" ? "vacant" : paid === dueAmount ? "paid" : paid > 0 ? "partly-paid" : "overdue",
    payments: paid > 0 ? [payment(paid, `pay-${unit.id}`)] : [],
    carriedForward: index % 11 === 0 ? 5000 : 0,
  };
});

function setSeededCollection(plazaId: string, target: number) {
  const entries = januaryRentEntries.filter((entry) => entry.plazaId === plazaId);
  let amountToReduce = Math.max(0, entries.reduce((sum, entry) => sum + entry.payments.reduce((paid, item) => paid + item.amount, 0), 0) - target);
  for (const entry of [...entries].reverse()) {
    for (const payment of [...entry.payments].reverse()) {
      const reduction = Math.min(payment.amount, amountToReduce);
      payment.amount -= reduction;
      amountToReduce -= reduction;
    }
    entry.payments = entry.payments.filter((payment) => payment.amount > 0);
    const paid = entry.payments.reduce((sum, payment) => sum + payment.amount, 0);
    entry.status = paid >= entry.dueAmount + entry.carriedForward
      ? "paid"
      : paid > 0
        ? "partly-paid"
        : "overdue";
  }
}

setSeededCollection("plaza-a", 450000);
setSeededCollection("plaza-b", 115000);

export const rentEntries: RentEntry[] = Array.from({ length: 6 }, (_, offset) => {
  const date = new Date(2026, -offset, 1);
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return januaryRentEntries.map((entry) => ({
    ...entry,
    id: offset === 0 ? entry.id : `${entry.id}-${month}`,
    month,
    payments: entry.payments.map((existingPayment) => ({
      ...existingPayment,
      id: offset === 0 ? existingPayment.id : `${existingPayment.id}-${month}`,
      date: `${month}-05`,
    })),
  }));
}).flat();

const januaryExpenses: Expense[] = [
  { id: "exp-a-1", plazaId: "plaza-a", category: "Repairs", amount: 12000, date: "2026-01-07", description: "Water pump repair", billUrl: "bill-a-1", status: "approved", chargeTo: "plaza", paidBy: "cash" },
  { id: "exp-a-2", plazaId: "plaza-a", category: "Electricity", amount: 14000, date: "2026-01-11", description: "Common area electricity", billUrl: "bill-a-2", status: "approved", chargeTo: "plaza", paidBy: "bank" },
  { id: "exp-a-3", plazaId: "plaza-a", category: "Cleaning", amount: 9000, date: "2026-01-14", description: "Cleaning staff", billUrl: "bill-a-3", status: "approved", chargeTo: "plaza", paidBy: "cash" },
  { id: "exp-a-4", plazaId: "plaza-a", category: "Guard", amount: 5000, date: "2026-01-21", description: "Night guard balance", billUrl: "bill-a-4", status: "approved", chargeTo: "plaza", paidBy: "cash" },
  { id: "exp-a-5", plazaId: "plaza-a", category: "Legal", amount: 18000, date: "2026-01-23", description: "Notice drafting", billUrl: "bill-a-5", status: "pending-approval", chargeTo: { ownerId: "owner-bilal" }, paidBy: "bank" },
  { id: "exp-a-6", plazaId: "plaza-a", category: "Repairs", amount: 24000, date: "2026-01-25", description: "Lift motor maintenance", billUrl: "bill-a-6", status: "pending-approval", chargeTo: "plaza", paidBy: "bank", recordedBy: "Tariq Mehmood" },
  { id: "exp-a-7", plazaId: "plaza-a", category: "Electricity", amount: 20000, date: "2026-01-26", description: "Backup generator fuel", billUrl: "bill-a-7", status: "pending-approval", chargeTo: "plaza", paidBy: "cash", recordedBy: "Tariq Mehmood" },
  { id: "exp-b-1", plazaId: "plaza-b", category: "Maintenance", amount: 0, date: "2026-01-10", description: "Included in rotation example", billUrl: "bill-b-1", status: "approved", chargeTo: "plaza", paidBy: "cash" },
  { id: "exp-b-2", plazaId: "plaza-b", category: "Security", amount: 18000, date: "2026-01-22", description: "Entry camera replacement", billUrl: "bill-b-2", status: "pending-approval", chargeTo: "plaza", paidBy: "bank", recordedBy: "Tariq Mehmood" },
  { id: "exp-c-1", plazaId: "plaza-c", category: "Tax", amount: 22000, date: "2026-01-17", description: "Property tax advance", billUrl: "bill-c-1", status: "pending-approval", chargeTo: "plaza", paidBy: "bank" },
];

export const expenses: Expense[] = [
  ...januaryExpenses,
  ...Array.from({ length: 5 }, (_, offset) => {
    const date = new Date(2026, -offset - 1, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return januaryExpenses.filter((expense) => expense.status === "approved" && expense.amount > 0).map((expense) => ({
      ...expense,
      id: `${expense.id}-${month}`,
      date: `${month}-${expense.date.slice(-2)}`,
      description: `${expense.description} (${monthLabelForSeed(month)})`,
    }));
  }).flat(),
];

export const ownerPayments: OwnerPayment[] = [
  { id: "op-1", month: demoMonth, plazaId: "plaza-a", ownerId: "owner-ali", amountDue: 237000, amountSent: 237000, sentBy: "Tariq Mehmood", status: "confirmed-received", date: "2026-01-29", bankName: "HBL", transactionId: "HBL-8821", receiptUrl: "receipt-op-1" },
  { id: "op-2", month: demoMonth, plazaId: "plaza-a", ownerId: "owner-bilal", amountDue: 158000, amountSent: 150000, sentBy: "Tariq Mehmood", status: "sent-awaiting-confirmation", date: "2026-01-29", bankName: "Meezan", transactionId: "MZ-1893", receiptUrl: "receipt-op-2", differenceReason: "Bank transfer limit; balance tomorrow" },
  { id: "op-3", month: demoMonth, plazaId: "plaza-b", ownerId: "owner-ali", amountDue: 100000, amountSent: 0, status: "not-sent" },
  { id: "op-4", month: demoMonth, plazaId: "plaza-b", ownerId: "owner-ali", amountDue: 100000, amountSent: 100000, status: "sent-awaiting-confirmation", date: "2026-01-30", sentBy: "Tariq Mehmood", bankName: "HBL", transactionId: "HBL-9001", receiptUrl: "receipt-op-4", systemCalculatedAmount: 100000 },
  { id: "op-5", month: "2025-12", plazaId: "plaza-a", ownerId: "owner-ali", amountDue: 237000, amountSent: 237000, sentBy: "Tariq Mehmood", status: "confirmed-received", date: "2025-12-29", bankName: "HBL", transactionId: "HBL-8710", systemCalculatedAmount: 237000, confirmedAt: "2025-12-30T10:20:00.000Z" },
  { id: "op-6", month: "2025-11", plazaId: "plaza-a", ownerId: "owner-bilal", amountDue: 158000, amountSent: 158000, sentBy: "Tariq Mehmood", status: "confirmed-received", date: "2025-11-29", bankName: "Meezan", transactionId: "MZ-1604", systemCalculatedAmount: 158000, confirmedAt: "2025-11-30T08:30:00.000Z" },
  { id: "op-7", month: "2025-10", plazaId: "plaza-a", ownerId: "owner-ali", amountDue: 237000, amountSent: 237000, sentBy: "Tariq Mehmood", status: "confirmed-received", date: "2025-10-29", bankName: "HBL", transactionId: "HBL-8340", systemCalculatedAmount: 237000, confirmedAt: "2025-10-30T09:10:00.000Z" },
  { id: "op-8", month: "2025-09", plazaId: "plaza-a", ownerId: "owner-ali", amountDue: 237000, amountSent: 210000, sentBy: "Tariq Mehmood", status: "disputed", date: "2025-09-29", bankName: "HBL", transactionId: "HBL-8212", systemCalculatedAmount: 237000, differenceReason: "Partial transfer", disputeReason: "Only Rs 180,000 reached my account." },
  { id: "op-9", month: "2025-08", plazaId: "plaza-a", ownerId: "owner-bilal", amountDue: 158000, amountSent: 158000, sentBy: "Tariq Mehmood", status: "cancelled", date: "2025-08-29", bankName: "Meezan", transactionId: "MZ-1201", systemCalculatedAmount: 158000, cancelReason: "Transfer was reversed by the bank." },
];

function monthLabelForSeed(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-PK", { month: "long", year: "numeric" });
}

export const documents: Document[] = [
  { id: "doc-1", title: "Agreement - Shop A-1", type: "Agreement", plazaId: "plaza-a", unitId: "a-unit-1", tenantId: "tenant-1", uploadedAt: "2026-01-01", endDate: "2026-02-02", url: "agreement-a-1" },
  { id: "doc-2", title: "CNIC - Ahmed Farooq", type: "CNIC", plazaId: "plaza-a", unitId: "a-unit-1", tenantId: "tenant-1", uploadedAt: "2026-01-02", url: "cnic-a-1" },
  { id: "doc-3", title: "Electricity bill", type: "Bill", plazaId: "plaza-a", uploadedAt: "2026-01-11", url: "bill-a-2" },
  { id: "doc-4", title: "Bank receipt Ali Raza", type: "Receipt", plazaId: "plaza-a", uploadedAt: "2026-01-29", url: "receipt-op-1" },
];

export const notifications: AppNotification[] = [
  { id: "n-1", type: "rent", title: "Rent overdue", body: "7 tenants still have a balance for January.", createdAt: "2026-01-18T10:00:00", read: false },
  { id: "n-2", type: "agreement", title: "Agreement expiring", body: "Shop A-8 agreement ends within 30 days.", createdAt: "2026-01-17T12:00:00", read: false },
  { id: "n-3", type: "owner-payment", title: "Owner confirmed receipt", body: "Ali Raza confirmed the January transfer.", createdAt: "2026-01-30T09:30:00", read: true },
  { id: "n-4", type: "expense", title: "Expense pending approval", body: "City Heights tax expense needs owner approval.", createdAt: "2026-01-17T16:30:00", read: true },
];

export const activityLog: ActivityLogEntry[] = [
  { id: "log-1", actorId: "accountant-1", action: "recorded rent", entity: "Shop A-1", plazaId: "plaza-a", before: { paid: 0 }, after: { paid: 37500 }, timestamp: "2026-01-05T08:40:00" },
  { id: "log-2", actorId: "accountant-1", action: "created expense", entity: "Water pump repair", plazaId: "plaza-a", before: {}, after: { amount: 12000 }, timestamp: "2026-01-07T13:20:00" },
  { id: "log-3", actorId: "accountant-1", action: "sent reminder", entity: "Office B-6", plazaId: "plaza-b", before: {}, after: { channel: "WhatsApp" }, timestamp: "2026-01-16T11:12:00" },
  { id: "log-4", actorId: "owner-ali", action: "confirmed owner payment", entity: "January transfer", plazaId: "plaza-a", before: { status: "sent-awaiting-confirmation" }, after: { status: "confirmed-received" }, timestamp: "2026-01-30T09:30:00" },
];
