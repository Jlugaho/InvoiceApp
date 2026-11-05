# InvoiceApp 💼

A modern, SaaS-level web application for generating invoices — perfect for restaurants, auto shops, or freelancers.

### 🚀 Features
- Add and remove invoice items dynamically  
- Auto-calculates subtotal, tax, and total  
- Live invoice preview  
- Validate required customer, business, and item details
- Edit saved invoices and track draft, sent, and paid statuses
- Persist invoices in a SQLite-backed API
- Download and restore JSON backups of server invoices
- Export to PDF using jsPDF and html2canvas  
- Light/Dark mode toggle  
- Glassmorphism + Tailwind UI  

### Tech Stack
- HTML5  
- Tailwind CSS  
- Vanilla JavaScript  
- Node.js HTTP server and SQLite
- jsPDF + html2canvas  

### Run locally
1. Install Node.js 20 or newer, then clone the repository.
   ```bash
   git clone https://github.com/USERNAME/InvoiceApp.git
   cd InvoiceApp
   npm install
   ```

2. Set a private server access key of at least 32 bytes and start the app. For example, in PowerShell:
   ```powershell
   $env:INVOICE_API_TOKEN = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   npm start
   ```
3. Open `http://127.0.0.1:3000` and enter the access key. The key stays in the current browser tab's session storage.

Invoices are stored in `data/invoices.sqlite` on the server. Keep that file and its containing directory in persistent storage when hosting the app. **Download backup** and **Restore backup** export and restore server-side invoices; the dashboard can also import older invoices from this browser's local storage once into an empty server database.

This MVP uses one shared access key and one shared invoice collection; it does not yet support individual accounts or per-user data. For remote access, set `HOST=0.0.0.0` only on a private host behind an HTTPS reverse proxy, set the access key as a secret environment variable, and restrict network access. Do not expose the HTTP server directly to the public internet.

Run the frontend and API tests with Node.js:

```bash
npm test
```
