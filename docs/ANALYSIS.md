# Stage A — current system and Supabase gap analysis

## Scope and baseline

- App route today: `/`; Accountant and Owner are client-side views selected by demo login, not protected routes.
- Supabase baseline supplied in `C:\Users\tawab\Downloads\files`: schema, owner additions, two-role patch, test data, and ER diagram. Stage B must copy the three SQL inputs unchanged as migrations `001`–`003`.
- Current business state is seeded from `lib/mock-data.ts`, held in React state, and mirrored to browser `localStorage` by `lib/shared-demo-store.ts` under `kiraya-hisab-demo-state-v1`. This is not server persistence, authentication, or cross-device sharing.
- Role target: `accountant` and `owner`; lead-owner powers are represented by `owners.is_lead` and the supplied SQL patch.

## Screens

| Screen / route | Role | Data read | Data written | Computed values | Search / filters / sort | Uploads | Current data location |
|---|---|---|---|---|---|---|---|
| Demo login `/` | Demo user | `users`, seeded roles | React login selection only | role dispatch | demo account selector | — | `mock-data.ts`; selection is React state |
| Dashboard | Accountant | plazas, units, current-month rent, expenses, owner payments | — | rent due/collected/unpaid, expenses, sample net, vacancies, arrears, approvals | current demo month only | — | mock seed + React state |
| Properties / units | Accountant | plazas, ownership, units, tenants, rent sheets | create/edit plaza, units, create a rent sheet | ownership label, occupied/vacant counts | plaza/unit display; no server paging | plaza image; saved as data URL in `photoSeed` | React state → localStorage |
| Tenants / vacancy | Accountant | tenants, units, plazas, rent entries, documents | create/edit tenant; vacate tenant; settle move-out rent; mark unit vacant | agreement countdown, move-out balance | plaza + name/unit search; phone is omitted from matching; no paging | CNIC front/back, agreement; data URLs | React state → localStorage |
| Rent collection | Accountant | monthly rent entries, tenants, units, payments, expenses, owner payments | create month sheet; record rent payment | paid balance, outstanding, monthly collection, rent-funded expenses, owner distribution | plaza/month/status; search tenant name/unit; no paging | generated PDF receipt is shared/downloaded, not stored as a record | React state → localStorage; sheet-key list itself is only React state |
| Arrears | Accountant | rent entries, tenants, units | opens WhatsApp reminder; does not save a reminder record | tenant/month balances and total arrears | local list; no server paging | — | React state → localStorage; reminder history is not written |
| Expenses | Accountant | expenses, plazas | create expense | paid/unpaid totals and rent-funded deductions | plaza + date range; no paging | optional bill image/PDF stored as data URL | React state → localStorage |
| Monthly summary | Accountant | rent, expenses, ownership, owner payments | — | monthly rent/expense/owner-payment calculation | plaza/month | generated statement PDF is not stored | React state + TypeScript accounting functions |
| Owner payments | Accountant | plazas, owners, users, rent, expenses, payments | create transfer/payment-proof record | system payable, actual sent, difference, statement/PDF | current list, no paging | optional payment proof as data URL; generated statement PDF is shared/downloaded, not stored | React state → localStorage |
| Documents | Accountant | documents | Upload control is present but has no working handler | expiry badge | no search/filter/paging | upload UI is currently a stub | mock seed + React state → localStorage |
| Reports / calculator | Accountant | some current app state | Export control is a stub | displayed charts/calculator examples are hard-coded, not query results | no year/range filter | — | literals + React state |
| Activity / notifications / settings | Accountant | activity, notifications, profile/permissions | notification mark-all-read and password controls are stubs | unread indicator | no search/filter/paging | mock seed + React state → localStorage |
| Home / properties / vacancy | Owner | only owned plazas, units, current-month summaries, distribution | plaza/month filter state only | rent collection, owner share, vacancy and lost-rent estimates | plaza and month; no paging | — | shared localStorage demo state via owner repository |
| Approvals / My Money | Owner | own payments; plaza expenses; rent distribution | confirm/dispute owner payment; approve/reject expense | share, sent/received, expense impact | approval tabs; history search by plaza/month/status/reference; no paging | displays usable proof URLs; demo references are not files | shared localStorage demo state |
| Rent / arrears / expenses | Owner | owned plaza rent/tenant/unit data, arrears, expenses | — | tenant balances, outstanding rent, expenses | plaza/month filters, local search where present | attached files only if URL is usable | shared localStorage demo state |
| Statements / reports / documents | Owner | owned-plaza summaries, six-month trend, rent, payments, expenses, docs | print, CSV download, WhatsApp text link | owner share and six-month trend | month/plaza; no paging | print/CSV generated client-side; not stored | shared localStorage demo state |
| Calculator / activity / notifications / settings | Owner | owned-plaza data, own profile, notifications | calculator input only | sample share calculation | none | — | localStorage data + React state; settings are read-only |

## Entities in code

| Type | Fields / role in app | Defining file | Baseline table / mapping |
|---|---|---|---|
| `Role`, `User` | role, id, name, phone, avatar | `lib/types/index.ts` | `profiles` + `auth.users`; role must be accountant/owner, with lead flag on `owners` |
| `Money` | whole-rupee numeric values | `lib/types/index.ts` | `bigint` monetary columns |
| `OwnerAccount`, `Owner` | bank/account identity and owner contact | `lib/types/index.ts` | `owners` currently holds one bank/account; multiple accounts used as an optional owner-payment choice need a child table |
| `OwnershipHistory`, `OwnershipConfig` | single/shared/rotation and history | `lib/types/index.ts` | `plaza_ownership_versions`, `plaza_ownership_members`, `activity_log` |
| `Plaza` | name/address/floors/ownership/photoSeed | `lib/types/index.ts` | `plazas` + ownership tables; `photo_path` exists in SQL but is omitted from the supplied diagram |
| `Unit`, `UnitStatus`, `UnitType` | unit number/type/custom type/floor/size/rent/status/notes | `lib/types/index.ts` | `units`; `type_name` is missing; `tenantId` is current `tenancies`; `soon-vacant` is derived, not a stored DB status |
| `Tenant`, `TenantHistory` | identity/docs/phone/tenancy terms and move-out | `lib/types/index.ts` | `tenants`, `tenancies`, `rent_increases`, `documents`; term-month count needs preserving or deriving |
| `PaymentMethod`, `PaymentStatus`, `Payment` | rent amount/date/method/received-by/reference/receipt/cancel | `lib/types/index.ts` | `rent_payments`; received-by is missing; UI uses `Other`, absent from baseline `payment_method` |
| `RentEntry` | tenancy/month/due/status/payments/carried-forward | `lib/types/index.ts` | `rent_entries` + `rent_payments`; `carriedForward` is missing; overdue/vacant/partial are derived/status-mapped |
| `ExpenseCategory`, `Expense` | category/date/amount/description/bill/payment/funding/charge/approval | `lib/types/index.ts` | `expense_categories`, `expenses`; payment status/source/payer and optional bill mismatch baseline columns/constraints |
| `OwnerPayment` | period/owner/calculated and sent amounts/payment method/accounts/proof/reference/status | `lib/types/index.ts` | `owner_payments`; payment method, sender/bank-account snapshots, recipient account, proof optionality, and unique statement number are missing |
| `MonthClosure`, `AppSettings` | close status/settings/approval/pay/reminder values | `lib/types/index.ts` | `month_closures`, `app_settings`, `accountant_terms`; code's `awaiting-admin-close` status is unsupported by baseline and no Manage screen exists |
| `Document` | type/title/links/upload/expiry/url | `lib/types/index.ts` | `documents`; map `url` to private Storage `file_path` |
| `AppNotification` | type/title/body/read/owner/plaza recipient | `lib/types/index.ts` | `notifications`; user read state exists, but plaza-scoping is missing |
| `ActivityLogEntry` | actor/action/entity/plaza/before/after/time | `lib/types/index.ts` | `activity_log`; map JSON snapshots, actor/plaza soft links |
| Owner calculation result types | distribution, month summary, rent status, arrears | `lib/owner-repository.ts` | Existing SQL functions/views: `my_distribution`, `plaza_month_summary`, `v_rent_status`, `v_tenant_arrears`; do not duplicate as write tables |

## Not persisted in Supabase today — Stage C definition of done

- [ ] All business entities currently seeded/mutated in browser `localStorage`: plazas, units, tenants, rent entries/payments, expenses, owner payments, documents, notifications, activity. Reload in the same browser retains these local changes, but there is no database, shared server source, or cross-device durability.
- [ ] Rent-sheet existence keys are kept in React state separately from rent rows; a created sheet can cease to be listed after reload even if rows were saved locally.
- [ ] Login/session, selected section, current month/plaza, search, form state, theme, and language are client-only state; there is no Supabase Auth session or protected route.
- [ ] Uploaded images/PDFs are converted to data URLs and placed in `localStorage`; they are not private Storage objects, and browser quota/backup/access control is not provided.
- [ ] Rent reminder messages open WhatsApp but no `reminders` row/history is created.
- [ ] Generated rent and owner-payment PDFs are transient share/download artifacts, not stored receipts/documents.
- [ ] Document upload, Accountant notification “mark all read”, password save, report export, and several report/calculator examples have UI controls but no persisted/working operation.
- [ ] `appSettings` is a code constant, not database state; notification read state and owner mutations exist only in browser storage.
- [ ] Stage C acceptance must prove server-backed creation/update/cancel and correct status after a hard reload for tenant, rent/payment, expense with bill, and owner transfer.

## Gaps — verified against the current UI and supplied baseline

| Code needs | Baseline has | Change | Why |
|---|---|---|---|
| Store arbitrary unit type label | `units.unit_type` enum with `other` | Add nullable `units.type_name` | Unit form records a custom label as well as `other` |
| Preserve lease term-month input | `tenancies.start_date/end_date` | Add nullable `tenancy_period_months` or deterministically derive it when end date exists; retain explicit term when end date is optional | Tenant form includes a tenancy-period value |
| Carry-forward rent per rent row | `rent_entries.due_amount`, paid amount/status | Add checked nonnegative `carried_forward` bigint; include it in monthly due/arrears calculations | The UI and worked accounting paths add carried-forward balances separately |
| Record who received rent | `rent_payments.created_by` identifies login, not the free-text receiver | Add `received_by` text (keep `created_by` for audit) | Rent form requires a receiver name that may differ from the signed-in user |
| Distinguish expense settled status/funding/payer | `expenses.paid_via` and workflow `status` only | Add `payment_status` (`paid`/`unpaid`), `paid_from` (`rent`/`outside`), `paid_by`; allow nullable `bill_path`; extend payment-method enum with `other` | Expense screen has separate unpaid/paid, funding-source, payer and optional attachment inputs |
| Keep plaza image | `plazas.photo_path` exists in SQL | Include it in the diagram and persist as a private Storage path, not CSS/data URL | Create/edit plaza accepts an image; current code stores its data URL in `photoSeed` |
| Multiple saved recipient accounts | `owners` has one bank/account set | Add normalized `owner_accounts` (owner FK, bank/title/account/IBAN/default) with RLS; preserve a payment-time masked-safe snapshot | Owner payment form exposes saved-account selection and custom per-payment account |
| Preserve owner transfer details used by form/PDF | `owner_payments` has amount, expected, sent date, bank, transaction, receipt, status, difference reason | Add method, sent-by display, sending bank/account, saved recipient-account FK + bank/account snapshot, unique `statement_number`; make bank/transaction/proof optional for non-bank methods; keep `receipt_path` optional | UI/PDF uses those fields; baseline requires bank, transaction and receipt for every method and has no statement number |
| Store expense and transfer proof privately | `bill_path`/`receipt_path` are path columns; expense bill and owner receipt currently `NOT NULL` | Make proof paths optional per UI and use private Storage; keep generated PDF separate from uploaded proof | Attachments are optional in both forms; current data URLs are not object storage |
| Filter owner notifications by property | `notifications.user_id`/read state | Add nullable `plaza_id` FK or use an explicit supported link; map owner recipient to profile id | Shared demo notifications carry `plazaId`; the owner repository scopes by plaza |
| Persist reminder history | `reminders` already captures tenancy/entry/plaza/channel/message | Wire send/prepared reminder operation to insert a row after WhatsApp launch; do not add a duplicate table | Current rent and arrears reminder handlers only open WhatsApp |
| Preserve vacate-notice details | `tenancies.notice_given_on`, `vacate_reason`, `vacated_on`, `advance_returned` | Keep the supplied columns; Stage C should map the existing move-out fields and only collect notice/reason/advance-return values if the existing workflow is expanded | Current vacate UI saves a leaving date, settles rent balances, and marks the unit vacant; it does not collect notice date, reason, or returned advance |
| Agreement expiry alerts | `tenancies.end_date`, `documents.expiry_date`, `app_settings.agreement_alert_days`, notifications | Use the existing expiry dates/setting and notification rows; no new entity | UI shows tenant countdown/document expiry labels, but no scheduled expiry alert is generated |
| Persist sheet availability | Rent rows and unique tenancy/month exist | Derive sheet existence from `rent_entries`/month closure; do not add a separate sheet table for a local `rentSheetKeys` UI flag | The flag is React-only and duplicates the monthly rows |
| Update real notifications/preferences | `notifications.is_read`; `profiles.notification_prefs` | Wire mark-read and settings controls to existing columns; no new entity | Current controls are no-ops; baseline already has storage |
| Tenant search by name/unit/phone | Tenant, tenancy and unit tables; current B-tree/search joins | Search phone as well as name/unit; add `pg_trgm` indexes for substring name/phone (and unit number if contains-search retained) | UI currently omits phone; database query must preserve its intended search |
| Reports and exports | Historical rent/payment/expense data and summary functions/views | Replace fixed chart arrays/calculator examples and inert export buttons with database aggregates; owner trend currently six months only | Current displays are hard-coded and not a yearly report |
| Lead-owner management | `is_lead()`/`is_admin()` mapping and RPCs in supplied patch | Add minimal lead-owner Manage screen calling existing ownership/pay/approval/close RPCs; no new admin role | Current UI has no management screen; ownership is labelled “Only Admin” |
| Session and authorization | `profiles`, owner link, RLS, role patch, `log_login` | Replace demo login/role switch with Supabase Auth; route roles and protect data in RLS; use only anon key in browser | Client-side demo roles do not provide authentication or enforcement |

No new table is proposed for tenancy history, rent reminders, recurring-expense templates, cash rent payments, agreement expiry alerts, owner distributions, or month statements: those are already represented by baseline `tenancies`, `reminders`, `recurring_expense_templates`, `rent_payments`, `documents.expiry_date`, `monthly_distributions`, and `month_closures`. The current UI does not expose recurring-expense drafts or unit-photo upload; do not add workflows for them solely because the baseline supports them.

## Admin references found

| Current reference | Lead-owner conversion |
|---|---|
| `Role = "admin" | "accountant" | "owner"` and `admin-1` / “Sadia Admin” demo account | Remove admin as a role/login; use owner profile plus `owners.is_lead = true` |
| `permissions.ts` admin permission set | Gate management permissions with `is_lead()`; accountant remains staff |
| Ownership-history actor `admin-1` and “Ownership locked by Admin” mock history | Replace with the actual lead-owner profile/actor; wording “lead owner” |
| “Only Admin can change” ownership message | “Only the lead owner can change” or equivalent |
| Owner settings “Ask the Admin” copy | “Ask the lead owner” |
| `MonthClosure.awaiting-admin-close` | Remove/translate to the database’s open/closed state; close/reopen via lead-owner RPC |
| Demo login currently dispatches selected role in `AccountantApp` | Replace with Auth profile role; route lead owner to the same owner app plus Manage |

## Search/list queries and index plan

| Query | Current behavior | Baseline coverage | Stage B index/query work |
|---|---|---|---|
| Rent sheet by plaza and month; status filter | In-memory filter, no paging | `rent_entries(plaza_id, month)`, `(tenancy_id)`; FK unique `(tenancy_id, month)` | Keep composite; keyset by stable `(unit_id, id)` or `(created_at,id)`; consider `(plaza_id,month,status)` if plan shows benefit |
| Tenant list by plaza; name/unit/phone substring search | Local filter, no paging; phone not matched | `tenancies(plaza_id/tenant_id)`, `units(plaza_id)`, unique `(plaza_id,unit_number)` | `pg_trgm` GIN on tenant name and phone; unit number trigram only for contains search; keyset on tenant `(full_name,id)` |
| Expense list by plaza/date/payment/workflow status | Local filter, no paging | `expenses(plaza_id,expense_date)` plus status index | Retain date composite; add partial pending-approval index and payment-status/funding query support if plans require |
| Owner payment by plaza/month/owner/status | Local list | `(plaza_id,month,owner_id)` | Add partial pending sent/disputed lookup by owner/plaza/month |
| Arrears by plaza and month, grouped tenant | In-memory grouping of all loaded rent entries/payments | rent entry plaza/month and tenancy/payment FKs | Use supplied arrears view/function; indexes on tenancy/unit and payment entry; benchmark seeded query |
| Documents by plaza/expiry; search | Current list has no search | documents `(plaza_id)`, `(expiry_date)` | Keep; no title trigram index unless document-search is actually exposed; if exposed, `pg_trgm` GIN on title |
| Notifications unread by recipient/time | Client list | `(user_id,is_read,created_at desc)` | Keep; keyset `(created_at,id)` |
| Activity by plaza/time | Client list | `(plaza_id,created_at desc)` | Keep; keyset `(created_at,id)` |

The supplied baseline already has relevant FK/list indexes, `security_invoker` views, RLS, private storage, statement/month close functions, month generation, and accounting RPCs. Stage B will verify index plans after the required generated-series seed; it should add partial/search indexes only where needed, not duplicate the baseline.
