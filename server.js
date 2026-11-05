const { randomUUID, timingSafeEqual } = require("node:crypto");
const { createServer: createHttpServer } = require("node:http");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const TAX_RATE = 0.085;
const MAX_BODY_BYTES = 1024 * 1024;
const VALID_STATUSES = new Set(["draft", "sent", "paid"]);
const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_TYPES = new Set(["customers", "estimates", "products", "payments", "expenses"]);
const CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP"]);
const STATIC_FILES = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["dashboard.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["app.js", "text/javascript; charset=utf-8"],
  ["script.js", "text/javascript; charset=utf-8"],
  ["auth.js", "text/javascript; charset=utf-8"]
]);

function validateInvoice(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Invoice must be an object." };
  }
  const customer = typeof input.customer === "string" ? input.customer.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : "";
  if (!customer || customer.length > 200) return { error: "Customer is required and must be 200 characters or fewer." };
  if (!type || type.length > 200) return { error: "Business type is required and must be 200 characters or fewer." };
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 200) {
    return { error: "Invoice must have between 1 and 200 items." };
  }

  const items = [];
  let subtotal = 0;
  let tax = 0;
  let itemDiscountTotal = 0;
  for (const item of input.items) {
    const name = item && typeof item.name === "string" ? item.name.trim() : "";
    const qty = Number(item && item.qty);
    const price = Number(item && item.price);
    if (!name || name.length > 200) return { error: "Each item needs a name of 1 to 200 characters." };
    if (item.qty === "" || !Number.isFinite(qty) || qty <= 0 || qty > 1000000) {
      return { error: "Each item quantity must be greater than zero." };
    }
    if (item.price === "" || !Number.isFinite(price) || price < 0 || price > 1000000000) {
      return { error: "Each item price must be a non-negative number." };
    }
    const taxRate = item.taxRate === undefined ? 8.5 : Number(item.taxRate);
    const lineDiscount = item.discount === undefined ? 0 : Number(item.discount);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      return { error: "Each item tax rate must be between zero and 100 percent." };
    }
    if (!Number.isFinite(lineDiscount) || lineDiscount < 0 || lineDiscount > qty * price) {
      return { error: "Each item discount must be between zero and its line subtotal." };
    }
    subtotal += qty * price;
    tax += Math.max(0, qty * price - lineDiscount) * taxRate / 100;
    itemDiscountTotal += lineDiscount;
    items.push({ name, qty, price, taxRate, discount: lineDiscount });
  }

  const discount = input.discount === undefined ? 0 : Number(input.discount);
  if (!Number.isFinite(discount) || discount < 0 || discount + itemDiscountTotal > subtotal + tax) {
    return { error: "Discount must be between zero and the invoice subtotal and tax." };
  }
  const status = input.status || "draft";
  if (!VALID_STATUSES.has(status)) return { error: "Status must be draft, sent, or paid." };
  const currency = input.currency || "USD";
  if (!CURRENCIES.has(currency)) return { error: "Currency must be USD, CAD, EUR, or GBP." };
  const date = typeof input.date === "string" && input.date.trim()
    ? input.date.trim().slice(0, 40)
    : new Date().toISOString().slice(0, 10);
  const dueDate = typeof input.dueDate === "string" && input.dueDate.trim()
    ? input.dueDate.trim().slice(0, 40)
    : date;
  const invoiceNumber = typeof input.invoiceNumber === "string" && input.invoiceNumber.trim()
    ? input.invoiceNumber.trim().slice(0, 60)
    : "";

  return {
    value: {
      customer,
      type,
      date,
      dueDate,
      invoiceNumber,
      customerId: typeof input.customerId === "string" ? input.customerId.slice(0, 80) : "",
      currency,
      terms: typeof input.terms === "string" ? input.terms.trim().slice(0, 100) : "Net 30",
      notes: typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : "",
      reference: typeof input.reference === "string" ? input.reference.trim().slice(0, 100) : "",
      items,
      subtotal: roundMoney(subtotal),
      tax: roundMoney(tax),
      discount: roundMoney(discount + itemDiscountTotal),
      total: roundMoney(subtotal + tax - discount - itemDiscountTotal),
      status
    }
  };
}

function validateRecord(type, input, database, existingId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Record must be an object." };
  const text = (key, max = 500) => typeof input[key] === "string" ? input[key].trim().slice(0, max) : "";
  const amount = (key, allowZero = false) => {
    if (input[key] === undefined || input[key] === null || input[key] === "") return null;
    const value = Number(input[key]);
    return Number.isFinite(value) && value >= (allowZero ? 0 : 0.01) && value <= 1000000000 ? value : null;
  };
  const currency = CURRENCIES.has(input.currency) ? input.currency : "USD";
  const value = { currency };

  if (type === "customers") {
    value.name = text("name", 200);
    value.company = text("company", 200);
    value.email = text("email", 254);
    value.phone = text("phone", 60);
    value.address = text("address", 500);
    if (!value.name) return { error: "Customer name is required." };
    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return { error: "Customer email is invalid." };
  } else if (type === "estimates") {
    value.number = text("number", 60);
    value.customer = text("customer", 200);
    value.description = text("description", 2000);
    value.date = text("date", 40) || new Date().toISOString().slice(0, 10);
    value.validUntil = text("validUntil", 40);
    value.total = amount("total", true);
    value.status = ["draft", "sent", "accepted", "declined"].includes(input.status) ? input.status : "draft";
    if (!value.customer || value.total === null) return { error: "Estimate customer and a non-negative total are required." };
  } else if (type === "products") {
    value.name = text("name", 200);
    value.description = text("description", 1000);
    value.category = text("category", 100);
    value.price = amount("price", true);
    value.taxRate = input.taxRate === undefined ? 8.5 : Number(input.taxRate);
    if (!value.name || value.price === null || !Number.isFinite(value.taxRate) || value.taxRate < 0 || value.taxRate > 100) {
      return { error: "Product name, a non-negative price, and a tax rate from zero to 100 percent are required." };
    }
  } else if (type === "expenses") {
    value.description = text("description", 500);
    value.vendor = text("vendor", 200);
    value.category = text("category", 100);
    value.date = text("date", 40) || new Date().toISOString().slice(0, 10);
    value.amount = amount("amount");
    if (!value.description || value.amount === null) return { error: "Expense description and a positive amount are required." };
  } else if (type === "payments") {
    value.invoiceId = text("invoiceId", 80);
    value.amount = amount("amount");
    value.date = text("date", 40) || new Date().toISOString().slice(0, 10);
    value.method = text("method", 60) || "Other";
    value.reference = text("reference", 120);
    value.status = "paid";
    if (!VALID_ID.test(value.invoiceId) || !database.prepare("SELECT id FROM invoices WHERE id = ?").get(value.invoiceId)) {
      return { error: "Choose an existing invoice for this payment." };
    }
    if (value.amount === null) return { error: "Payment amount must be greater than zero." };
    const invoice = database.prepare("SELECT total FROM invoices WHERE id = ?").get(value.invoiceId);
    const paid = database.prepare(`
      SELECT COALESCE(SUM(CAST(json_extract(payload_json, '$.amount') AS REAL)), 0) AS total
      FROM business_records WHERE kind = 'payments' AND json_extract(payload_json, '$.invoiceId') = ? AND id != ?
    `).get(value.invoiceId, existingId || "");
    if (value.amount > invoice.total - paid.total + 0.00001) return { error: "Payment amount exceeds the invoice balance." };
  }
  return { value };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    let settled = false;
    const chunks = [];
    request.on("data", chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        settled = true;
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        settled = true;
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", error => {
      if (!settled) reject(error);
    });
  });
}

function createServer(options = {}) {
  const apiToken = options.apiToken || process.env.INVOICE_API_TOKEN;
  if (typeof apiToken !== "string" || Buffer.byteLength(apiToken) < 32) {
    throw new Error("Set INVOICE_API_TOKEN to a secret of at least 32 bytes before starting InvoiceApp.");
  }
  const root = path.resolve(options.staticRoot || path.join(__dirname, "dist"));
  const databasePath = options.dbPath || process.env.INVOICE_DB_PATH || path.join(__dirname, "data", "invoices.sqlite");
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      business_type TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      invoice_number TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      customer_id TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'USD',
      terms TEXT NOT NULL DEFAULT 'Net 30',
      notes TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      discount REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'sent', 'paid')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('customers', 'estimates', 'products', 'payments', 'expenses')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS business_records_kind ON business_records(kind, created_at);
    CREATE TABLE IF NOT EXISTS workspace_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const existingColumns = new Set(database.prepare("PRAGMA table_info(invoices)").all().map(column => column.name));
  const invoiceMigrations = [
    ["invoice_number", "TEXT NOT NULL DEFAULT ''"],
    ["due_date", "TEXT NOT NULL DEFAULT ''"],
    ["customer_id", "TEXT NOT NULL DEFAULT ''"],
    ["currency", "TEXT NOT NULL DEFAULT 'USD'"],
    ["terms", "TEXT NOT NULL DEFAULT 'Net 30'"],
    ["notes", "TEXT NOT NULL DEFAULT ''"],
    ["reference", "TEXT NOT NULL DEFAULT ''"]
  ];
  invoiceMigrations.forEach(([column, definition]) => {
    if (!existingColumns.has(column)) database.exec(`ALTER TABLE invoices ADD COLUMN ${column} ${definition}`);
  });

  const statements = {
    list: database.prepare(`
      SELECT invoices.*,
        COALESCE((SELECT SUM(CAST(json_extract(payload_json, '$.amount') AS REAL))
          FROM business_records WHERE kind = 'payments' AND json_extract(payload_json, '$.invoiceId') = invoices.id), 0) AS amount_paid
      FROM invoices ORDER BY created_at DESC, id
    `),
    get: database.prepare(`
      SELECT invoices.*,
        COALESCE((SELECT SUM(CAST(json_extract(payload_json, '$.amount') AS REAL))
          FROM business_records WHERE kind = 'payments' AND json_extract(payload_json, '$.invoiceId') = invoices.id), 0) AS amount_paid
      FROM invoices WHERE id = ?
    `),
    insert: database.prepare(`
      INSERT INTO invoices
      (id, customer, business_type, invoice_date, invoice_number, due_date, customer_id, currency, terms, notes, reference,
       items_json, subtotal, tax, discount, total, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    update: database.prepare(`
      UPDATE invoices SET customer = ?, business_type = ?, invoice_date = ?, invoice_number = ?, due_date = ?,
      customer_id = ?, currency = ?, terms = ?, notes = ?, reference = ?, items_json = ?,
      subtotal = ?, tax = ?, discount = ?, total = ?, status = ?, updated_at = ? WHERE id = ?
    `),
    delete: database.prepare("DELETE FROM invoices WHERE id = ?"),
    deletePaymentsForInvoice: database.prepare("DELETE FROM business_records WHERE kind = 'payments' AND json_extract(payload_json, '$.invoiceId') = ?"),
    count: database.prepare("SELECT COUNT(*) AS count FROM invoices"),
    clear: database.prepare("DELETE FROM invoices"),
    listRecords: database.prepare("SELECT * FROM business_records WHERE kind = ? ORDER BY created_at DESC, id"),
    getRecord: database.prepare("SELECT * FROM business_records WHERE kind = ? AND id = ?"),
    insertRecord: database.prepare("INSERT INTO business_records (id, kind, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"),
    updateRecord: database.prepare("UPDATE business_records SET payload_json = ?, updated_at = ? WHERE kind = ? AND id = ?"),
    deleteRecord: database.prepare("DELETE FROM business_records WHERE kind = ? AND id = ?"),
    getSettings: database.prepare("SELECT payload_json FROM workspace_settings WHERE id = 1"),
    saveSettings: database.prepare(`
      INSERT INTO workspace_settings (id, payload_json, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
    `)
  };

  function toInvoice(row) {
    if (!row) return null;
    return {
      id: row.id,
      customer: row.customer,
      type: row.business_type,
      date: row.invoice_date,
      invoiceNumber: row.invoice_number || "",
      dueDate: row.due_date || "",
      customerId: row.customer_id || "",
      currency: row.currency || "USD",
      terms: row.terms || "Net 30",
      notes: row.notes || "",
      reference: row.reference || "",
      items: JSON.parse(row.items_json),
      subtotal: row.subtotal,
      tax: row.tax,
      discount: row.discount,
      total: row.total,
      amountPaid: row.amount_paid || 0,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function saveInvoice(input, id, existing) {
    const result = validateInvoice(input);
    if (result.error) return result;
    if (existing?.amount_paid > result.value.total) {
      return { error: "Invoice total cannot be lower than payments already recorded." };
    }
    const now = new Date().toISOString();
    const value = result.value;
    const invoice = {
      ...value,
      id,
      createdAt: existing ? existing.created_at : now,
      updatedAt: now
    };
    const fields = [
      invoice.id, invoice.customer, invoice.type, invoice.date, invoice.invoiceNumber, invoice.dueDate,
      invoice.customerId, invoice.currency, invoice.terms, invoice.notes, invoice.reference, JSON.stringify(invoice.items),
      invoice.subtotal, invoice.tax, invoice.discount, invoice.total, invoice.status,
      invoice.createdAt, invoice.updatedAt
    ];
    if (existing) {
      statements.update.run(
        invoice.customer, invoice.type, invoice.date, invoice.invoiceNumber, invoice.dueDate,
        invoice.customerId, invoice.currency, invoice.terms, invoice.notes, invoice.reference,
        JSON.stringify(invoice.items), invoice.subtotal, invoice.tax, invoice.discount, invoice.total, invoice.status, now, id
      );
    } else {
      statements.insert.run(...fields);
    }
    return { value: { ...invoice, amountPaid: existing?.amount_paid || 0 } };
  }

  function toRecord(row) {
    if (!row) return null;
    return {
      ...JSON.parse(row.payload_json),
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function saveRecord(type, input, id, existingId) {
    const validated = validateRecord(type, input, database, existingId);
    if (validated.error) return validated;
    const existing = id ? statements.getRecord.get(type, id) : null;
    const now = new Date().toISOString();
    const value = {
      ...validated.value,
      id,
      createdAt: existing ? existing.created_at : now,
      updatedAt: now
    };
    if (type === "payments") {
      const invoice = statements.get.get(value.invoiceId);
      value.customer = invoice.customer;
      value.invoiceNumber = invoice.invoice_number || "";
      value.currency = invoice.currency || "USD";
    }
    if (existing) statements.updateRecord.run(JSON.stringify(validated.value), now, type, id);
    else statements.insertRecord.run(id, type, JSON.stringify(validated.value), now, now);
    return { value };
  }

  function validateSettings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Settings must be an object." };
    const limits = {
      businessName: 200, ownerName: 200, ownerEmail: 254, phone: 60,
      address: 500, website: 200, paymentInstructions: 2000
    };
    const value = {};
    for (const [key, limit] of Object.entries(limits)) {
      if (input[key] !== undefined && typeof input[key] !== "string") {
        return { error: `${key} must be text.` };
      }
      value[key] = typeof input[key] === "string" ? input[key].trim().slice(0, limit) : "";
    }
    if (value.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.ownerEmail)) {
      return { error: "Business email is invalid." };
    }
    return { value };
  }

  function authorized(request) {
    const header = request.headers.authorization || "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) return false;
    const supplied = Buffer.from(match[1]);
    const expected = Buffer.from(apiToken);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  function sendJson(response, status, body) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify(body));
  }

  function sendError(response, status, message) {
    sendJson(response, status, { error: message });
  }

  async function handleApi(request, response, pathname) {
    if (pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (pathname === "/api/auth/me" && request.method === "GET") {
      if (!authorized(request)) {
        sendError(response, 401, "Invalid access key.");
        return;
      }
      sendJson(response, 200, { authenticated: true });
      return;
    }
    if (!authorized(request)) {
      sendError(response, 401, "Invalid access key.");
      return;
    }

    if (pathname === "/api/invoices" && request.method === "GET") {
      sendJson(response, 200, statements.list.all().map(toInvoice));
      return;
    }
    if (pathname === "/api/invoices" && request.method === "POST") {
      const body = await readJson(request);
      const id = randomUUID();
      const saved = saveInvoice(body, id, null);
      if (saved.error) {
        sendError(response, 400, saved.error);
        return;
      }
      sendJson(response, 201, saved.value);
      return;
    }
    if (pathname === "/api/invoices/import" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || !Array.isArray(body.invoices) || body.invoices.length > 10000) {
        sendError(response, 400, "Import must contain an invoices array with at most 10,000 invoices.");
        return;
      }
      const prepared = body.invoices.map(invoice => validateInvoice(invoice));
      const invalid = prepared.find(result => result.error);
      if (invalid) {
        sendError(response, 400, invalid.error);
        return;
      }
      const imported = database.transaction(() => {
        if (statements.count.get().count !== 0) return null;
        const importedIds = new Set();
        return body.invoices.map((invoice, index) => {
          let id = typeof invoice.id === "string" && VALID_ID.test(invoice.id) && !importedIds.has(invoice.id)
            ? invoice.id
            : randomUUID();
          while (importedIds.has(id)) id = randomUUID();
          importedIds.add(id);
          const saved = saveInvoice({ ...prepared[index].value, id }, id, null);
          if (saved.error) throw new Error(saved.error);
          return saved.value;
        });
      })();
      if (imported === null) {
        sendError(response, 409, "Invoices can only be imported into an empty account.");
        return;
      }
      sendJson(response, 201, imported);
      return;
    }
    if (pathname === "/api/invoices" && request.method === "PUT") {
      const body = await readJson(request);
      if (!body || !Array.isArray(body.invoices) || body.invoices.length > 10000) {
        sendError(response, 400, "A backup must contain an invoices array with at most 10,000 invoices.");
        return;
      }
      const prepared = body.invoices.map(invoice => validateInvoice(invoice));
      const invalid = prepared.find(result => result.error);
      if (invalid) {
        sendError(response, 400, invalid.error);
        return;
      }

      const replace = database.transaction(() => {
        statements.clear.run();
        database.prepare("DELETE FROM business_records WHERE kind = 'payments'").run();
        const restoredIds = new Set();
        const restored = body.invoices.map((invoice, index) => {
          let id = typeof invoice.id === "string" && VALID_ID.test(invoice.id) && !restoredIds.has(invoice.id)
            ? invoice.id
            : randomUUID();
          while (restoredIds.has(id)) id = randomUUID();
          restoredIds.add(id);
          const saved = saveInvoice({ ...prepared[index].value, id }, id, null);
          if (saved.error) throw new Error(saved.error);
          return saved.value;
        });
        return restored;
      });
      sendJson(response, 200, replace());
      return;
    }

    if (pathname === "/api/settings" && request.method === "GET") {
      const row = statements.getSettings.get();
      sendJson(response, 200, row ? JSON.parse(row.payload_json) : {});
      return;
    }
    if (pathname === "/api/settings" && request.method === "PUT") {
      const body = await readJson(request);
      const validated = validateSettings(body);
      if (validated.error) {
        sendError(response, 400, validated.error);
        return;
      }
      statements.saveSettings.run(JSON.stringify(validated.value), new Date().toISOString());
      sendJson(response, 200, validated.value);
      return;
    }

    const collectionMatch = /^\/api\/(customers|estimates|products|payments|expenses)$/.exec(pathname);
    if (collectionMatch) {
      const type = collectionMatch[1];
      if (request.method === "GET") {
        sendJson(response, 200, statements.listRecords.all(type).map(toRecord));
        return;
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const saved = saveRecord(type, body, randomUUID(), null);
        if (saved.error) {
          sendError(response, 400, saved.error);
          return;
        }
        sendJson(response, 201, saved.value);
        return;
      }
      sendError(response, 405, "Method not allowed.");
      return;
    }
    const recordMatch = /^\/api\/(customers|estimates|products|payments|expenses)\/([0-9a-f-]{36})$/i.exec(pathname);
    if (recordMatch) {
      const [, type, id] = recordMatch;
      if (!VALID_ID.test(id)) {
        sendError(response, 404, "Record not found.");
        return;
      }
      if (request.method === "GET") {
        const record = toRecord(statements.getRecord.get(type, id));
        if (!record) {
          sendError(response, 404, "Record not found.");
          return;
        }
        sendJson(response, 200, record);
        return;
      }
      if (request.method === "PUT") {
        if (!statements.getRecord.get(type, id)) {
          sendError(response, 404, "Record not found.");
          return;
        }
        const body = await readJson(request);
        const saved = saveRecord(type, body, id, id);
        if (saved.error) {
          sendError(response, 400, saved.error);
          return;
        }
        sendJson(response, 200, saved.value);
        return;
      }
      if (request.method === "DELETE") {
        const result = statements.deleteRecord.run(type, id);
        if (result.changes === 0) {
          sendError(response, 404, "Record not found.");
          return;
        }
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      sendError(response, 405, "Method not allowed.");
      return;
    }

    const match = /^\/api\/invoices\/([0-9a-f-]{36})$/i.exec(pathname);
    if (match && !VALID_ID.test(match[1])) {
      sendError(response, 404, "Invoice not found.");
      return;
    }
    if (!match) {
      sendError(response, 404, "Not found.");
      return;
    }
    const id = match[1];
    if (request.method === "GET") {
      const invoice = toInvoice(statements.get.get(id));
      if (!invoice) {
        sendError(response, 404, "Invoice not found.");
        return;
      }
      sendJson(response, 200, invoice);
      return;
    }
    if (request.method === "PUT") {
      const existing = statements.get.get(id);
      if (!existing) {
        sendError(response, 404, "Invoice not found.");
        return;
      }
      const body = await readJson(request);
      const saved = saveInvoice(body, id, existing);
      if (saved.error) {
        sendError(response, 400, saved.error);
        return;
      }
      sendJson(response, 200, saved.value);
      return;
    }
    if (request.method === "DELETE") {
      const result = database.transaction(() => {
        statements.deletePaymentsForInvoice.run(id);
        return statements.delete.run(id);
      })();
      if (result.changes === 0) {
        sendError(response, 404, "Invoice not found.");
        return;
      }
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    sendError(response, 405, "Method not allowed.");
  }

  async function handler(request, response) {
    const parsedUrl = new URL(request.url, "http://localhost");
    if (parsedUrl.pathname.startsWith("/api/")) {
      try {
        await handleApi(request, response, parsedUrl.pathname);
      } catch (error) {
        if (error.status) {
          sendError(response, error.status, error.message);
        } else {
          console.error("Invoice API request failed:", error);
          if (!response.headersSent) sendError(response, 500, "Internal server error.");
          else response.destroy();
        }
      }
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "Method not allowed.");
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(parsedUrl.pathname);
    } catch {
      sendError(response, 400, "Invalid URL path.");
      return;
    }
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const servedPath = requested === "dashboard.html" ? "index.html" : requested;
    const filePath = path.resolve(root, servedPath);
    if (!filePath.startsWith(`${root}${path.sep}`) || path.basename(filePath).startsWith(".")) {
      sendError(response, 404, "Not found.");
      return;
    }
    const relativePath = path.relative(root, filePath).replace(/\\/g, "/");
    let contentType = STATIC_FILES.get(relativePath);
    if (!contentType && /^assets\/[A-Za-z0-9._-]+\.(js|css)$/.test(relativePath)) {
      contentType = relativePath.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8";
    }
    if (!contentType) {
      sendError(response, 404, "Not found.");
      return;
    }
    let content;
    try {
      content = await fs.promises.readFile(filePath);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        sendError(response, 404, "Not found.");
        return;
      }
      console.error("Static file read failed:", error);
      sendError(response, 500, "Internal server error.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self' https:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data: https:; connect-src 'self';"
    });
    if (request.method === "HEAD") response.end();
    else response.end(content);
  }

  const server = createHttpServer(handler);
  server.on("close", () => database.close());
  return server;
}

if (require.main === module) {
  const server = createServer();
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3000);
  server.listen(port, host, () => {
    console.log(`InvoiceApp listening at http://${host}:${port}`);
  });
}

module.exports = { createServer, validateInvoice };
