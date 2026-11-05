const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
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
  assert.match(await page.text(), /InvoiceApp/);
  const hidden = await fetch(`${baseUrl}/.git/config`);
  assert.equal(hidden.status, 404);
  const source = await fetch(`${baseUrl}/server.js`);
  assert.equal(source.status, 404);
  const traversal = await fetch(`${baseUrl}/..%5C..%5CWindows%5Cwin.ini`);
  assert.equal(traversal.status, 404);
});
