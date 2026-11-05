# InvoiceApp 💼

A modern, SaaS-level web application for generating invoices — perfect for restaurants, auto shops, or freelancers.

### 🚀 Features
- Add and remove invoice items dynamically  
- Auto-calculates subtotal, tax, and total  
- Live invoice preview  
- Validate required customer, business, and item details
- Edit saved invoices and track draft, sent, and paid statuses
- Download and restore JSON backups of saved invoices
- Export to PDF using jsPDF and html2canvas  
- Light/Dark mode toggle  
- Glassmorphism + Tailwind UI  

### 🧩 Tech Stack
- HTML5  
- Tailwind CSS  
- Vanilla JavaScript  
- jsPDF + html2canvas  

### ⚙️ Setup
1. Clone this repository  
   ```bash
   git clone https://github.com/USERNAME/InvoiceApp.git
   cd InvoiceApp
   ```

Invoices are saved in the current browser's local storage; they are not synced to an account or another device. Use **Download backup** on the dashboard to keep a portable copy, and **Restore backup** to replace the current browser's invoices from a backup file. Restore validates the file and asks for confirmation before replacing data.

Run the regression tests with Node.js:

```bash
node --test tests/app.test.js
```
