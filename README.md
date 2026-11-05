# InvoiceApp

InvoiceApp is a responsive invoice and small-business finance workspace. The React application includes an invoice dashboard, invoice and estimate management, customer profiles, a reusable products-and-services catalog, payment history, expenses, and revenue reports. Business records are stored in SQLite and protected by the workspace access key.

## What’s included

- React 19 interface built with Vite and Tailwind CSS, Lucide icons, and Recharts
- Dashboard summaries and charts calculated from recorded invoices and payments
- Invoice editor with due dates, currencies, payment terms, line-item tax, discounts, customer notes, a live document preview, and PDF export
- Invoice search, status filters, sorting, pagination, selection, editing, and deletion
- Persistent customer, estimate, product, payment, expense, and business-settings records
- Customer invoice history and payment activity
- Optional realistic example auto-shop workspace; examples are only saved when explicitly selected
- SQLite-backed Node.js API protected by a shared workspace access key

Dashboard figures reflect saved records; empty workspaces are not populated with fabricated financial totals.

## Run locally

Use Node.js 20.19 or newer.

```bash
npm install
```

Set a private access key of at least 32 bytes and start the API / production server:

```powershell
$env:INVOICE_API_TOKEN = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
npm run build
npm start
```

Open `http://127.0.0.1:3000`. The key stays in the current browser tab. Invoice data and business records are stored in `data/invoices.sqlite`; keep that directory on persistent storage when hosting the app.

For frontend development, run the API in one terminal and Vite in another:

```powershell
# Terminal 1
$env:INVOICE_API_TOKEN = "<same private key>"
npm start

# Terminal 2
npm run dev
```

Open the Vite URL shown in the second terminal. API requests are proxied to `http://127.0.0.1:3000`.

## API data

Authenticated endpoints include:

- `/api/invoices` — invoice create, list, update, delete, backup, and restore
- `/api/customers`, `/api/estimates`, `/api/products`, `/api/payments`, `/api/expenses` — persistent business records
- `/api/settings` — business profile and invoice payment instructions

Existing SQLite invoice databases are migrated in place to add invoice number, due date, customer link, currency, terms, notes, and reference fields. Existing invoice items retain the original 8.5% tax behavior unless a saved line item has its own tax rate.

## Checks

```bash
npm run build
npm test
```

This remains a single shared-key workspace, not a multi-account SaaS service. For remote use, host it behind HTTPS, keep the access key private, restrict network access, and use durable storage for the SQLite database.
