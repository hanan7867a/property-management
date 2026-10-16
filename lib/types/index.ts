export type Role = "admin" | "accountant" | "owner";
export type Money = number;

export type User = { id: string; name: string; role: Role; phone: string; avatarUrl?: string };
export type OwnerAccount = { id: string; bank: string; accountNumber: string; accountName?: string };
export type Owner = { id: string; name: string; phone: string; bank: string; accounts?: OwnerAccount[] };
export type OwnershipHistory = { date: string; note: string; actorId: string };

export type OwnershipConfig =
  | { type: "single"; ownerId: string; history: OwnershipHistory[] }
  | { type: "shared"; shares: { ownerId: string; percent: number }[]; history: OwnershipHistory[] }
  | { type: "rotation"; rotationOrder: string[]; rotationStartMonth: string; history: OwnershipHistory[] };

export type Plaza = { id: string; name: string; address: string; floors: number; ownership: OwnershipConfig; photoSeed: string };
export type UnitStatus = "occupied" | "vacant" | "soon-vacant";
export type UnitType = "flat" | "shop" | "office" | "other";

export type Unit = {
  id: string;
  plazaId: string;
  number: string;
  type: UnitType;
  typeName?: string;
  floor: number;
  sizeSqFt: number;
  monthlyRent: Money;
  status: UnitStatus;
  tenantId?: string;
  notes?: string;
  vacantSince?: string;
};

export type Tenant = {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  cnicFrontUrl?: string;
  cnicBackUrl?: string;
  agreementUrl?: string;
  unitId: string;
  monthlyRent?: Money;
  advance: Money;
  tenancyPeriodMonths?: number;
  note?: string;
  agreementStart: string;
  agreementEnd?: string;
  rentIncrease?: { date: string; amount: Money };
  status: "active" | "vacated";
  vacatedAt?: string;
};

export type TenantHistory = { tenantId: string; unitId: string; from: string; to?: string; reason?: string };
export type PaymentMethod = "Cash" | "Bank Transfer" | "JazzCash" | "Easypaisa" | "Cheque";
export type PaymentStatus = "active" | "cancelled";

export type Payment = {
  id: string;
  amount: Money;
  date: string;
  method: PaymentMethod;
  receivedBy?: string;
  reference?: string;
  receiptUrl?: string;
  status: PaymentStatus;
  cancelReason?: string;
};

export type RentEntry = {
  id: string;
  unitId: string;
  tenantId: string;
  plazaId: string;
  month: string;
  dueAmount: Money;
  status: "paid" | "partly-paid" | "unpaid" | "overdue" | "vacant";
  payments: Payment[];
  carriedForward: Money;
};

export type ExpenseCategory =
  | "Repairs"
  | "Electricity"
  | "Water"
  | "Gas"
  | "Cleaning"
  | "Guard"
  | "Tax"
  | "Maintenance"
  | "Legal"
  | "Security"
  | "Salaries"
  | "Property Tax"
  | "Other";

export type Expense = {
  id: string;
  plazaId: string;
  unitId?: string;
  category: ExpenseCategory;
  amount: Money;
  date: string;
  description: string;
  billUrl: string;
  paymentStatus?: "paid" | "unpaid";
  paymentMethod?: "Cash" | "Bank Transfer" | "Cheque" | "Other";
  paidBy?: string;
  paidFrom?: "rent" | "outside";
  status: "approved" | "pending-approval" | "rejected" | "cancelled" | "draft";
  chargeTo: "plaza" | { ownerId: string };
  ownerReason?: string;
  cancelReason?: string;
  rejectionReason?: string;
  recordedBy?: string;
};

export type OwnerPayment = {
  id: string;
  month: string;
  plazaId: string;
  ownerId: string;
  accountNumber?: string;
  amountDue: Money;
  amountSent: Money;
  systemCalculatedAmount?: Money;
  sentBy?: string;
  status: "not-sent" | "sent-awaiting-confirmation" | "confirmed-received" | "disputed" | "cancelled";
  date?: string;
  bankName?: string;
  sendingBankName?: string;
  sendingAccountNumber?: string;
  recipientBankName?: string;
  transactionId?: string;
  receiptUrl?: string;
  paymentMethod?: "Bank Transfer" | "Cash" | "Cheque" | "Other";
  paymentProofUrl?: string;
  notes?: string;
  statementNumber?: string;
  differenceReason?: string;
  disputeReason?: string;
  confirmedAt?: string;
  cancelReason?: string;
};

export type MonthClosure = { month: string; status: "open" | "awaiting-admin-close" | "closed"; closedBy?: string; closedAt?: string };

export type Document = {
  id: string;
  title: string;
  type: "Agreement" | "CNIC" | "Property paper" | "Bill" | "Receipt" | "Other";
  plazaId?: string;
  unitId?: string;
  tenantId?: string;
  uploadedAt: string;
  endDate?: string;
  url: string;
};

export type AppNotification = {
  id: string;
  type: "expense" | "owner-payment" | "agreement" | "rent" | "vacancy";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  ownerId?: string;
  plazaId?: string;
};

export type ActivityLogEntry = {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  plazaId?: string;
  before?: unknown;
  after?: unknown;
  timestamp: string;
};

export type AppSettings = {
  approvalLimit: Money;
  reminderTemplates: Record<"en" | "ur", string>;
  closedMonths: string[];
};
