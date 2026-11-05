const { randomUUID, timingSafeEqual } = require("node:crypto");
const { createServer: createHttpServer } = require("node:http");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const TAX_RATE = 0.085;
const MAX_BODY_BYTES = 1024 * 1024;
const VALID_STATUSES = new Set(["draft", "sent", "paid"]);
const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    subtotal += qty * price;
    items.push({ name, qty, price });
  }

  const discount = input.discount === undefined ? 0 : Number(input.discount);
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
    return { error: "Discount must be between zero and the subtotal." };
  }
  const status = input.status || "draft";
  if (!VALID_STATUSES.has(status)) return { error: "Status must be draft, sent, or paid." };

  return {
    value: {
      customer,
      type,
      date: typeof input.date === "string" && input.date.trim()
        ? input.date.trim().slice(0, 40)
        : new Date().toISOString().slice(0, 10),
      items,
      subtotal: roundMoney(subtotal),
      tax: roundMoney(subtotal * TAX_RATE),
      discount: roundMoney(discount),
      total: roundMoney(subtotal + subtotal * TAX_RATE - discount),
      status
    }
  };
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
  const root = path.resolve(options.staticRoot || __dirname);
  const databasePath = options.dbPath || process.env.INVOICE_DB_PATH || path.join(root, "data", "invoices.sqlite");
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

  const statements = {
    list: database.prepare("SELECT * FROM invoices ORDER BY created_at DESC, id"),
    get: database.prepare("SELECT * FROM invoices WHERE id = ?"),
    insert: database.prepare(`
      INSERT INTO invoices
      (id, customer, business_type, invoice_date, items_json, subtotal, tax, discount, total, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    update: database.prepare(`
      UPDATE invoices SET customer = ?, business_type = ?, invoice_date = ?, items_json = ?,
      subtotal = ?, tax = ?, discount = ?, total = ?, status = ?, updated_at = ? WHERE id = ?
    `),
    delete: database.prepare("DELETE FROM invoices WHERE id = ?"),
    count: database.prepare("SELECT COUNT(*) AS count FROM invoices"),
    clear: database.prepare("DELETE FROM invoices")
  };

  function toInvoice(row) {
    if (!row) return null;
    return {
      id: row.id,
      customer: row.customer,
      type: row.business_type,
      date: row.invoice_date,
      items: JSON.parse(row.items_json),
      subtotal: row.subtotal,
      tax: row.tax,
      discount: row.discount,
      total: row.total,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function saveInvoice(input, id, existing) {
    const result = validateInvoice(input);
    if (result.error) return result;
    const now = new Date().toISOString();
    const value = result.value;
    const invoice = {
      ...value,
      id,
      createdAt: existing ? existing.created_at : now,
      updatedAt: now
    };
    const fields = [
      invoice.id, invoice.customer, invoice.type, invoice.date, JSON.stringify(invoice.items),
      invoice.subtotal, invoice.tax, invoice.discount, invoice.total, invoice.status,
      invoice.createdAt, invoice.updatedAt
    ];
    if (existing) {
      statements.update.run(
        invoice.customer, invoice.type, invoice.date, JSON.stringify(invoice.items), invoice.subtotal,
        invoice.tax, invoice.discount, invoice.total, invoice.status, now, id
      );
    } else {
      statements.insert.run(...fields);
    }
    return { value: invoice };
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
      const result = statements.delete.run(id);
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
    const filePath = path.resolve(root, requested);
    if (!filePath.startsWith(`${root}${path.sep}`) || path.basename(filePath).startsWith(".")) {
      sendError(response, 404, "Not found.");
      return;
    }
    const relativePath = path.relative(root, filePath).replace(/\\/g, "/");
    const contentType = STATIC_FILES.get(relativePath);
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
