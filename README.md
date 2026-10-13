# Kiraya Hisab - Rent Management App

A responsive rent management web app for plazas, flats and shops in Pakistan, with separate Accountant and property-owner demo experiences.

## Included

- Demo login for the Accountant, Ali Raza and Bilal Ahmed, with a role-specific owner workspace and a development-only demo-data reset.
- Responsive Accountant and owner app shells with desktop sidebars, mobile navigation, language toggle and theme toggle.
- Dashboard, properties, tenants, rent collection, arrears, vacancy, expenses, monthly summary, owner payments, documents, calculator, reports, activity, notifications and settings screens.
- Typed mock data for Pakistani tenants, plazas, units, rent, expenses, owner payments, documents, notifications and activity.
- Create plazas or shops with floor and named-unit details, optional custom unit types, an optional photo, and single-owner, shared-percentage or rotation ownership rules; new units feed the tenant, rent and vacancy views.
- Add expense records with plaza, date, category, payment status, payer, payment method, funding source and an optional bill attachment. Only paid expenses funded from rent collections are deducted from the rent statement; outside-funded and unpaid expenses remain recorded without reducing rent.
- Tenant details can be edited while preserving existing documents, and a monthly rent sheet can be created for a plaza even before it has active tenants.
- Tenant agreement end dates are optional; an active tenant with no end date remains current until the tenant is vacated or otherwise marked inactive.
- Owner payments can be recorded against a plaza and rent month using rent, collection, and paid-from-rent expense data already in the app state. The form records the calculated and actual amounts, payment details, recipient account, proof and notes, and generates an Owner Payment Statement PDF with the period's calculation and expense summary.
- Plaza cards can open/create the January 2026 rent sheet for that plaza; the action creates any missing rent rows for its occupied tenants whose agreements cover that month. Plaza names, addresses and pictures can be edited without changing units, ownership, or rent history.
- Rent receipts are generated as PDFs and shared with the receipt message through the device's file-sharing sheet when supported; choose WhatsApp and then the tenant. Browsers cannot preselect a WhatsApp contact and attach a PDF through a WhatsApp link. If file sharing is unsupported, the app opens the tenant's WhatsApp chat and downloads the PDF for attachment.
- Owner Payment Statements can be generated as PDF files and shared with the device's file-sharing options, or downloaded when file sharing is unavailable.
- Owner approvals support confirming or disputing sent transfers and approving or rejecting plaza expenses with a required reason for rejection. Owner access is restricted to owned plazas and that owner's payment records.
- Owner home, My Money, properties, vacancy, rent/arrears, expenses, statements, reports, documents, calculator, activity, notifications and read-only settings views.
- Typed asynchronous owner repositories and role/entity checks under `lib/owner-repository.ts` and `lib/permissions.ts`.
- Shared demo data persists in browser `localStorage`, allowing Accountant and Owner actions to be demonstrated in the same browser profile.
- Plaza-specific rent sheets can be selected by month and year, with monthly statements for unpaid rent, expenses, ownership allocations and recorded bank transfers; statements can be printed or saved as PDF.
- Pure accounting functions under `lib/accounting` for plaza month totals, rotation ownership, distribution, combined owner totals and lost rent.
- English and Urdu dictionaries with RTL switching.

## Run Locally

```bash
npm install
npm run dev
```

Open the local address shown by Next.js, usually `http://localhost:3000`.

## Supabase

Supabase browser and server clients are configured in `utils/supabase`, and the Next.js 16 `proxy.ts` refreshes auth cookies. Local credentials are read from `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The clients are ready for auth and database queries, but rent-management records still use seeded mock data and browser `localStorage`. Moving those records to Supabase requires creating the tables and row-level security policies, then migrating the repositories.

## Verify

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Notes

- Money is stored as integer PKR and displayed as `Rs 450,000`.
- Rent-management records use seeded mock data and browser `localStorage`; no Supabase tables or remote data synchronization are configured yet. Demo changes persist in the current browser profile until reset.
- Owner actions are enforced by the mock repository for the demo only. A production deployment must enforce the same access rules and approval transitions in the database.
- Financial entries are cancellable with a reason in the UI model; there is no delete permission.
- Expense approval limit and Accountant terms live in `lib/settings.ts`.
