const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const { createServer } = require("../server");

const accessKey = "test-access-key-with-at-least-thirty-two-bytes";

test("authenticated SQLite API validates, persists, edits, deletes, imports, and backs up invoices", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "invoiceapp-test-"));
  const dbPath = path.join(directory, "test.sqlite");
  let server = createServer({ apiToken: accessKey, dbPath });

  async function listen(instance) {
    await new Promise(resolve => instance.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${instance.address().port}`;
  }

  async function close(instance) {
    await new Promise((resolve, reject) => {
      instance.close(error => error ? reject(error) : resolve());
    });
  }

  let baseUrl = await listen(server);
  t.after(async () => {
    if (server.listening) await close(server);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function request(url, route, { method = "GET", body, token = accessKey } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${url}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  }

  const unauthorized = await request(baseUrl, "/api/invoices", { token: "" });
  assert.equal(unauthorized.response.status, 401);
  const incorrectKey = await request(baseUrl, "/api/invoices", { token: "incorrect-key" });
  assert.equal(incorrectKey.response.status, 401);
  assert.equal((await request(baseUrl, "/api/auth/me")).data.authenticated, true);

  const invalid = await request(baseUrl, "/api/invoices", {
    method: "POST",
    body: { customer: "A", type: "Shop", items: [{ name: "Work", qty: -1, price: 10 }] }
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.error, /quantity/);

  const invoiceInput = {
    customer: "Taylor",
    type: "Consulting",
    items: [{ name: "Review", qty: 2, price: 10 }]
  };
  const created = await request(baseUrl, "/api/invoices", { method: "POST", body: invoiceInput });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.total, 21.7);
  assert.equal(created.data.status, "draft");
  const id = created.data.id;

  const updated = await request(baseUrl, `/api/invoices/${id}`, {
    method: "PUT",
    body: { ...created.data, status: "paid", items: [{ name: "Review", qty: 1, price: 10 }] }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.status, "paid");
  assert.equal(updated.data.total, 10.85);

  const backup = await request(baseUrl, "/api/invoices");
  assert.equal(backup.data.length, 1);
  assert.equal(backup.data[0].id, id);

  const replacement = await request(baseUrl, "/api/invoices", {
    method: "PUT",
    body: { invoices: [{ ...updated.data, customer: "Restored", status: "sent" }] }
  });
  assert.equal(replacement.response.status, 200);
  assert.equal(replacement.data[0].customer, "Restored");
  assert.equal(replacement.data[0].status, "sent");

  const invalidReplacement = await request(baseUrl, "/api/invoices", {
    method: "PUT",
    body: {
      invoices: [
        { ...replacement.data[0], customer: "Must remain" },
        { ...replacement.data[0], items: [{ name: "Bad quantity", qty: 0, price: 5 }] }
      ]
    }
  });
  assert.equal(invalidReplacement.response.status, 400);
  const unchangedAfterInvalidReplacement = await request(baseUrl, "/api/invoices");
  assert.equal(unchangedAfterInvalidReplacement.data.length, 1);
  assert.equal(unchangedAfterInvalidReplacement.data[0].customer, "Restored");

  const importedAfterReplacement = await request(baseUrl, "/api/invoices/import", {
    method: "POST",
    body: { invoices: [] }
  });
  assert.equal(importedAfterReplacement.response.status, 409);

  const deleted = await request(baseUrl, `/api/invoices/${id}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 204);
  const missing = await request(baseUrl, `/api/invoices/${id}`);
  assert.equal(missing.response.status, 404);

  const importResult = await request(baseUrl, "/api/invoices/import", {
    method: "POST",
    body: { invoices: [{ ...invoiceInput, id: "legacy-id", date: "01/02/2025" }] }
  });
  assert.equal(importResult.response.status, 201);
  assert.notEqual(importResult.data[0].id, "legacy-id");

  await close(server);
  server = createServer({ apiToken: accessKey, dbPath });
  baseUrl = await listen(server);
  const afterRestart = await request(baseUrl, "/api/invoices");
  assert.equal(afterRestart.data.length, 1);
  assert.equal(afterRestart.data[0].id, importResult.data[0].id);
});

test("server requires a runtime API key and only serves allowed static files", async t => {
  assert.throws(() => createServer({ dbPath: ":memory:" }), /INVOICE_API_TOKEN/);
  const server = createServer({ apiToken: accessKey, dbPath: ":memory:" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /InvoiceApp/);
  const scriptPath = /src="([^"]+\.js)"/.exec(html)?.[1];
  assert.ok(scriptPath);
  assert.equal((await fetch(`${baseUrl}${scriptPath}`)).status, 200);
  const hidden = await fetch(`${baseUrl}/.git/config`);
  assert.equal(hidden.status, 404);
  const source = await fetch(`${baseUrl}/server.js`);
  assert.equal(source.status, 404);
  const traversal = await fetch(`${baseUrl}/..%5C..%5CWindows%5Cwin.ini`);
  assert.equal(traversal.status, 404);
});

test("business records persist and invoice payments update balances", async t => {
  const server = createServer({ apiToken: accessKey, dbPath: ":memory:" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(route, { method = "GET", body } = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { response, data: response.status === 204 ? null : await response.json() };
  }

  const customer = await request("/api/customers", {
    method: "POST",
    body: { name: "Jordan Lee", company: "Northline Workshop", email: "jordan@example.com", phone: "555-0104", address: "10 Market St" }
  });
  assert.equal(customer.response.status, 201);
  assert.ok(customer.data.id);
  assert.equal((await request("/api/customers")).data[0].name, "Jordan Lee");
  const invalidCustomer = await request("/api/customers", { method: "POST", body: { name: "Bad email", email: "not-an-email" } });
  assert.equal(invalidCustomer.response.status, 400);

  const product = await request("/api/products", { method: "POST", body: { name: "Brake inspection", price: 89, category: "Auto service", taxRate: 7.5 } });
  assert.equal(product.data.price, 89);
  const estimate = await request("/api/estimates", { method: "POST", body: { customer: "Jordan Lee", total: 250, status: "accepted" } });
  assert.equal(estimate.data.status, "accepted");
  const expense = await request("/api/expenses", { method: "POST", body: { description: "Replacement parts", amount: 42.55, vendor: "Parts Supply", category: "Materials" } });
  assert.equal(expense.data.amount, 42.55);

  const invoice = await request("/api/invoices", {
    method: "POST",
    body: {
      customer: "Jordan Lee",
      customerId: customer.data.id,
      type: "Northline Workshop",
      invoiceNumber: "INV-2025-0001",
      date: "2025-03-01",
      dueDate: "2025-04-01",
      currency: "USD",
      terms: "Net 30",
      notes: "Thank you.",
      status: "sent",
      items: [{ name: "Brake inspection", qty: 1, price: 100, taxRate: 5 }]
    }
  });
  assert.equal(invoice.data.total, 105);
  assert.equal(invoice.data.invoiceNumber, "INV-2025-0001");
  assert.equal(invoice.data.customerId, customer.data.id);

  const payment = await request("/api/payments", {
    method: "POST",
    body: { invoiceId: invoice.data.id, amount: 45, method: "Bank transfer", reference: "TRX-0042", date: "2025-03-15" }
  });
  assert.equal(payment.response.status, 201);
  assert.equal(payment.data.customer, "Jordan Lee");
  assert.equal((await request(`/api/invoices/${invoice.data.id}`)).data.amountPaid, 45);
  const overpayment = await request("/api/payments", { method: "POST", body: { invoiceId: invoice.data.id, amount: 61 } });
  assert.equal(overpayment.response.status, 400);
  const secondPayment = await request("/api/payments", { method: "POST", body: { invoiceId: invoice.data.id, amount: 60, method: "Cash" } });
  assert.equal((await request(`/api/invoices/${invoice.data.id}`)).data.amountPaid, 105);
  await request(`/api/payments/${secondPayment.data.id}`, { method: "DELETE" });
  assert.equal((await request(`/api/invoices/${invoice.data.id}`)).data.amountPaid, 45);

  const settings = await request("/api/settings", { method: "PUT", body: { businessName: "Northline Workshop", ownerEmail: "hello@northline.example", paymentInstructions: "Bank transfer preferred." } });
  assert.equal(settings.data.businessName, "Northline Workshop");
  assert.equal((await request("/api/settings")).data.paymentInstructions, "Bank transfer preferred.");

  await request(`/api/customers/${customer.data.id}`, { method: "PUT", body: { name: "Jordan Lee", company: "Northline Garage" } });
  assert.equal((await request("/api/customers")).data[0].company, "Northline Garage");
});

test("existing invoice databases migrate without losing saved invoices", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "invoiceapp-legacy-"));
  const dbPath = path.join(directory, "legacy.sqlite");
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      business_type TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      discount REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'sent', 'paid')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const id = "11b9aacc-1c85-4be4-8e02-84b25d376355";
  legacy.prepare(`
    INSERT INTO invoices
    (id, customer, business_type, invoice_date, items_json, subtotal, tax, discount, total, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, "Maya Chen", "Northline Auto & Repair", "2025-03-01", JSON.stringify([{ name: "Oil service", qty: 1, price: 100 }]), 100, 8.5, 0, 108.5, "sent", "2025-03-01T10:00:00.000Z", "2025-03-01T10:00:00.000Z");
  legacy.close();

  const server = createServer({ apiToken: accessKey, dbPath });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/invoices`, {
    headers: { Authorization: `Bearer ${accessKey}` }
  });
  assert.equal(response.status, 200);
  const [invoice] = await response.json();
  assert.equal(invoice.id, id);
  assert.equal(invoice.customer, "Maya Chen");
  assert.equal(invoice.dueDate, "");
  assert.equal(invoice.currency, "USD");
  assert.equal(invoice.items[0].name, "Oil service");
});
