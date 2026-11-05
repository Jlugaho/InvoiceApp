const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.value = '';
    this._text = '';
    this.classList = {
      add: (...names) => {
        this.className = [...new Set(`${this.className} ${names.join(' ')}`.trim().split(/\s+/))].join(' ');
      },
      toggle: name => {
        const names = this.className.split(/\s+/).filter(Boolean);
        this.className = names.includes(name)
          ? names.filter(existing => existing !== name).join(' ')
          : [...names, name].join(' ');
      }
    };
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }

  set innerHTML(value) {
    this.children = [];
    this._text = '';
    if (/<\/?[a-z][^>]*>/i.test(String(value))) {
      this.appendChild(new Element('parsed'));
    } else {
      this._text = String(value);
    }
  }

  get textContent() {
    return this._text + this.children.map(child => child.textContent).join('');
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach(child => this.appendChild(child));
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  click() {
    this.trigger('click');
  }

  replaceChildren(...children) {
    this.children.forEach(child => { child.parent = null; });
    this.children = [];
    this._text = '';
    this.append(...children);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  trigger(type) {
    return Promise.all((this.listeners[type] || []).map(listener => listener({ target: this })));
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(child => child !== this);
    }
  }
}

function createDocument(ids) {
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  return {
    elements,
    body: new Element('body'),
    getElementById: id => elements[id],
    createElement: tagName => new Element(tagName),
    addEventListener(type, listener) {
      if (type === 'DOMContentLoaded') listener();
    }
  };
}

function runDashboard(invoices) {
  const document = createDocument([
    'invoiceTable', 'totalInvoices', 'totalRevenue', 'topBusinessType', 'searchBox', 'sortSelect',
    'backupInvoicesBtn', 'restoreInvoicesInput', 'importLocalInvoicesBtn', 'dashboardError'
  ]);
  const saved = new Map([['invoices', JSON.stringify(invoices)]]);
  const storage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value)
  };
  const exported = [];
  const downloaded = [];
  const alerts = [];
  let ready;
  const invoiceRequest = (route, options = {}) => {
    let invoices = JSON.parse(saved.get('invoices'));
    if (route === '/api/invoices' && !options.method) {
      invoices = invoices.map((invoice, index) => ({
        ...invoice,
        id: invoice.id || `existing-${index}`,
        status: invoice.status || 'draft'
      }));
      saved.set('invoices', JSON.stringify(invoices));
      return Promise.resolve(invoices);
    }
    if (route === '/api/invoices/import' || (route === '/api/invoices' && options.method === 'PUT')) {
      const invalid = options.body.invoices.find(invoice =>
        !invoice.customer || !invoice.type || !invoice.date ||
        !Array.isArray(invoice.items) ||
        invoice.items.some(item => !item.name || Number(item.qty) <= 0 || Number(item.price) < 0)
      );
      if (invalid) return Promise.reject(new Error('The backup contains invalid invoice data and was not restored.'));
      invoices = options.body.invoices.map((invoice, index) => ({
        ...invoice,
        id: invoice.id || `imported-${index}`,
        status: invoice.status || 'draft'
      }));
      saved.set('invoices', JSON.stringify(invoices));
      return Promise.resolve(invoices);
    }
    if (route.startsWith('/api/invoices/') && options.method === 'PUT') {
      const id = decodeURIComponent(route.split('/').pop());
      const index = invoices.findIndex(invoice => invoice.id === id);
      invoices[index] = options.body;
      saved.set('invoices', JSON.stringify(invoices));
      return Promise.resolve(options.body);
    }
    if (route.startsWith('/api/invoices/') && options.method === 'DELETE') {
      const id = decodeURIComponent(route.split('/').pop());
      saved.set('invoices', JSON.stringify(invoices.filter(invoice => invoice.id !== id)));
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`Unexpected request: ${options.method || 'GET'} ${route}`));
  };
  class JsPdf {
    text(content) { this.content = content; }
    save(filename) { exported.push({ content: this.content, filename }); }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
    document,
    localStorage: storage,
    window: {
      jspdf: { jsPDF: JsPdf },
      InvoiceAuth: {
        onAuthenticated: callback => { ready = callback(); },
        request: invoiceRequest
      },
      crypto: { randomUUID: () => `generated-${Math.random()}` },
      confirm: () => true,
      alert: message => alerts.push(message)
    },
    Blob,
    URL: {
      createObjectURL: blob => {
        downloaded.push(blob);
        return 'blob:backup';
      },
      revokeObjectURL() {}
    }
  });
  return { document, saved, exported, downloaded, alerts, ready };
}

function runInvoiceEditor(invoices = [], query = '') {
  const document = createDocument([
    'themeToggle', 'addItemBtn', 'itemsContainer', 'exportPdfBtn', 'saveInvoiceBtn',
    'subtotal', 'tax', 'discount', 'total', 'previewContent', 'customerName', 'businessType',
    'invoiceFormError'
  ]);
  const saved = new Map([['invoices', JSON.stringify(invoices)]]);
  const invoiceRequest = (route, options = {}) => {
    const stored = JSON.parse(saved.get('invoices'));
    if (!options.method && route === '/api/invoices') return Promise.resolve(stored);
    if (!options.method && route.startsWith('/api/invoices/')) {
      return Promise.resolve(stored.find(invoice => invoice.id === decodeURIComponent(route.split('/').pop())));
    }
    if (options.method === 'POST') {
      const invoice = { ...options.body, id: 'new-invoice', status: 'draft' };
      stored.push(invoice);
      saved.set('invoices', JSON.stringify(stored));
      return Promise.resolve(invoice);
    }
    if (options.method === 'PUT') {
      const id = decodeURIComponent(route.split('/').pop());
      const index = stored.findIndex(invoice => invoice.id === id);
      stored[index] = options.body;
      saved.set('invoices', JSON.stringify(stored));
      return Promise.resolve(options.body);
    }
    return Promise.reject(new Error(`Unexpected request: ${options.method || 'GET'} ${route}`));
  };
  let ready;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), {
    document,
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value)
    },
    window: {
      location: { search: query },
      InvoiceAuth: {
        onAuthenticated: callback => { ready = callback(); },
        request: invoiceRequest
      }
    },
    URLSearchParams,
    alert() {},
    html2canvas() {}
  });
  return { document, saved, ready };
}

test('dashboard delete and export actions keep targeting their invoice after search and sort', async () => {
  const invoices = [
    { customer: 'Alex', type: 'shop', total: 40, date: '2024-01-01' },
    { customer: 'Sam', type: 'cafe', total: 10, date: '2024-01-02' },
    { customer: 'Alexandra', type: 'shop', total: 20, date: '2024-01-03' }
  ];
  const { document, saved, exported, ready } = runDashboard(invoices);
  await ready;
  const search = document.elements.searchBox;
  const sort = document.elements.sortSelect;
  search.value = 'alex';
  search.trigger('input');
  sort.value = 'totalDesc';
  sort.trigger('change');

  const rows = document.elements.invoiceTable.children;
  assert.equal(rows.length, 2);
  await rows[1].children[6].children[1].trigger('click');
  assert.match(exported[0].content, /Invoice for: Alexandra/);
  assert.equal(exported[0].filename, 'Alexandra_Invoice.pdf');

  await rows[0].children[6].children[2].trigger('click');
  assert.deepEqual(JSON.parse(saved.get('invoices')).map(invoice => invoice.customer), ['Sam', 'Alexandra']);
  assert.equal(document.elements.invoiceTable.children.length, 1);
});

test('dashboard renders customer and business text without interpreting it as markup', async () => {
  const maliciousText = '<img src=x onerror=alert(1)>';
  const { document, ready } = runDashboard([
    { customer: maliciousText, type: '<b>Shop</b>', total: 5, date: '2024-01-01' }
  ]);
  await ready;
  const row = document.elements.invoiceTable.children[0];
  assert.equal(row.children[1].textContent, maliciousText);
  assert.equal(row.children[2].textContent, '<b>Shop</b>');
  assert.equal(row.children[1].children.length, 0);
});

test('removing an invoice item keeps remaining input handlers attached to the right item', () => {
  const { document } = runInvoiceEditor();
  const addButton = document.elements.addItemBtn;
  const items = document.elements.itemsContainer;
  addButton.trigger('click');
  addButton.trigger('click');
  addButton.trigger('click');

  items.children[0].children[0].value = 'First';
  items.children[0].children[0].trigger('input');
  items.children[1].children[0].value = 'Second';
  items.children[1].children[0].trigger('input');
  items.children[2].children[0].value = 'Third';
  items.children[2].children[0].trigger('input');

  items.children[0].children[3].trigger('click');
  const remainingInput = items.children[0].children[0];
  remainingInput.value = 'Updated second';
  remainingInput.trigger('input');
  items.children[0].children[1].value = '3';
  items.children[0].children[1].trigger('input');
  items.children[0].children[2].value = '7';
  items.children[0].children[2].trigger('input');

  assert.match(document.elements.previewContent.textContent, /Updated second/);
  assert.match(document.elements.previewContent.textContent, /Third/);
  assert.doesNotMatch(document.elements.previewContent.textContent, /First/);
  assert.equal(document.elements.subtotal.textContent, '$21.00');
});

test('preview customer, business, and item text remains text when it contains markup', () => {
  const { document } = runInvoiceEditor();
  const customer = document.elements.customerName;
  const business = document.elements.businessType;
  const maliciousText = '<img src=x onerror=alert(1)>';
  customer.value = maliciousText;
  customer.trigger('input');
  business.value = '<script>alert(1)</script>';
  business.trigger('input');
  document.elements.addItemBtn.trigger('click');
  const itemName = document.elements.itemsContainer.children[0].children[0];
  itemName.value = maliciousText;
  itemName.trigger('input');

  const preview = document.elements.previewContent;
  assert.match(preview.textContent, new RegExp(maliciousText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(preview.textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(preview.children[0].children[0].children[0].children.length, 0);
  assert.equal(preview.children[0].children[1].children.length, 0);
});

test('invoice creation validates required customer and item fields before saving', async () => {
  const { document, saved } = runInvoiceEditor();
  await document.elements.saveInvoiceBtn.trigger('click');
  assert.match(document.elements.invoiceFormError.textContent, /customer name and business type/);
  assert.deepEqual(JSON.parse(saved.get('invoices')), []);

  document.elements.customerName.value = 'Taylor';
  document.elements.businessType.value = 'Consulting';
  document.elements.addItemBtn.trigger('click');
  document.elements.itemsContainer.children[0].children[0].value = 'Review';
  document.elements.itemsContainer.children[0].children[0].trigger('input');
  document.elements.itemsContainer.children[0].children[1].value = '-2';
  document.elements.itemsContainer.children[0].children[1].trigger('input');
  document.elements.itemsContainer.children[0].children[2].value = '10';
  document.elements.itemsContainer.children[0].children[2].trigger('input');
  await document.elements.saveInvoiceBtn.trigger('click');
  assert.match(document.elements.invoiceFormError.textContent, /quantity greater than zero/);
  assert.deepEqual(JSON.parse(saved.get('invoices')), []);

  document.elements.itemsContainer.children[0].children[1].value = '2';
  document.elements.itemsContainer.children[0].children[1].trigger('input');
  await document.elements.saveInvoiceBtn.trigger('click');
  const [invoice] = JSON.parse(saved.get('invoices'));
  assert.equal(invoice.customer, 'Taylor');
  assert.equal(invoice.status, 'draft');
  assert.equal(invoice.subtotal, 20);
  assert.ok(invoice.id);
});

test('editing a saved invoice updates it without changing its id, status, or invoice date', async () => {
  const original = {
    id: 'invoice-123',
    status: 'sent',
    customer: 'Taylor',
    type: 'Consulting',
    date: '01/02/2025',
    items: [{ name: 'Review', qty: 1, price: 10 }],
    subtotal: 10,
    tax: 0.85,
    total: 10.85
  };
  const { document, saved, ready } = runInvoiceEditor([original], '?invoice=invoice-123');
  await ready;
  assert.equal(document.elements.saveInvoiceBtn.textContent, 'Update Invoice');
  assert.equal(document.elements.itemsContainer.children.length, 1);
  document.elements.itemsContainer.children[0].children[2].value = '20';
  document.elements.itemsContainer.children[0].children[2].trigger('input');
  await document.elements.saveInvoiceBtn.trigger('click');

  const invoices = JSON.parse(saved.get('invoices'));
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].id, 'invoice-123');
  assert.equal(invoices[0].status, 'sent');
  assert.equal(invoices[0].date, '01/02/2025');
  assert.equal(invoices[0].total, 21.7);
});

test('dashboard persists invoice status changes and exports a versioned backup', async () => {
  const invoice = { customer: 'Taylor', type: 'Consulting', total: 10, date: '2025-01-02' };
  const { document, saved, downloaded, ready } = runDashboard([invoice]);
  await ready;
  const row = document.elements.invoiceTable.children[0];
  assert.equal(row.children[5].children[0].value, 'draft');
  row.children[5].children[0].value = 'paid';
  await row.children[5].children[0].trigger('change');
  assert.equal(JSON.parse(saved.get('invoices'))[0].status, 'paid');

  document.elements.backupInvoicesBtn.trigger('click');
  const backup = JSON.parse(await downloaded[0].text());
  assert.equal(backup.format, 'invoiceapp-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.invoices[0].status, 'paid');
});

test('restoring a versioned backup replaces saved invoices and preserves its data', async () => {
  const { document, saved, ready } = runDashboard([
    { customer: 'Existing', type: 'Shop', total: 5, date: '2025-01-01' }
  ]);
  await ready;
  const restoredInvoice = {
    id: 'restored-1',
    status: 'paid',
    customer: 'Restored',
    type: 'Cafe',
    total: 25,
    date: '2025-02-01',
    items: []
  };
  document.elements.restoreInvoicesInput.files = [{
    text: async () => JSON.stringify({
      format: 'invoiceapp-backup',
      version: 1,
      invoices: [restoredInvoice]
    })
  }];
  await document.elements.restoreInvoicesInput.trigger('change');

  assert.deepEqual(JSON.parse(saved.get('invoices')).map(invoice => invoice.customer), ['Restored']);
  assert.equal(JSON.parse(saved.get('invoices'))[0].status, 'paid');
});

test('invalid backup invoice data is rejected without replacing saved invoices', async () => {
  const { document, saved, ready } = runDashboard([
    { customer: 'Existing', type: 'Shop', total: 5, date: '2025-01-01' }
  ]);
  await ready;
  const previous = saved.get('invoices');
  document.elements.restoreInvoicesInput.files = [{
    text: async () => JSON.stringify({
      format: 'invoiceapp-backup',
      version: 1,
      invoices: [{ customer: '', type: 'Cafe', date: '2025-02-01', total: 10, items: [] }]
    })
  }];
  await document.elements.restoreInvoicesInput.trigger('change');
  assert.equal(saved.get('invoices'), previous);
  assert.match(document.elements.dashboardError.textContent, /invalid invoice data/);
});
