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
    for (const listener of this.listeners[type] || []) {
      listener({ target: this });
    }
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
    'invoiceTable', 'totalInvoices', 'totalRevenue', 'topBusinessType', 'searchBox', 'sortSelect'
  ]);
  const saved = new Map([['invoices', JSON.stringify(invoices)]]);
  const storage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value)
  };
  const exported = [];
  class JsPdf {
    text(content) { this.content = content; }
    save(filename) { exported.push({ content: this.content, filename }); }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
    document,
    localStorage: storage,
    window: { jspdf: { jsPDF: JsPdf } }
  });
  return { document, saved, exported };
}

function runInvoiceEditor() {
  const document = createDocument([
    'themeToggle', 'addItemBtn', 'itemsContainer', 'exportPdfBtn', 'saveInvoiceBtn',
    'subtotal', 'tax', 'discount', 'total', 'previewContent', 'customerName', 'businessType'
  ]);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), {
    document,
    localStorage: { getItem: () => '[]', setItem() {} },
    window: {},
    alert() {},
    html2canvas() {}
  });
  return document;
}

test('dashboard delete and export actions keep targeting their invoice after search and sort', () => {
  const invoices = [
    { customer: 'Alex', type: 'shop', total: 40, date: '2024-01-01' },
    { customer: 'Sam', type: 'cafe', total: 10, date: '2024-01-02' },
    { customer: 'Alexandra', type: 'shop', total: 20, date: '2024-01-03' }
  ];
  const { document, saved, exported } = runDashboard(invoices);
  const search = document.elements.searchBox;
  const sort = document.elements.sortSelect;
  search.value = 'alex';
  search.trigger('input');
  sort.value = 'totalDesc';
  sort.trigger('change');

  const rows = document.elements.invoiceTable.children;
  assert.equal(rows.length, 2);
  rows[1].children[5].children[0].trigger('click');
  assert.match(exported[0].content, /Invoice for: Alexandra/);
  assert.equal(exported[0].filename, 'Alexandra_Invoice.pdf');

  rows[0].children[5].children[1].trigger('click');
  assert.deepEqual(JSON.parse(saved.get('invoices')).map(invoice => invoice.customer), ['Sam', 'Alexandra']);
  assert.equal(document.elements.invoiceTable.children.length, 1);
});

test('dashboard renders customer and business text without interpreting it as markup', () => {
  const maliciousText = '<img src=x onerror=alert(1)>';
  const { document } = runDashboard([
    { customer: maliciousText, type: '<b>Shop</b>', total: 5, date: '2024-01-01' }
  ]);
  const row = document.elements.invoiceTable.children[0];
  assert.equal(row.children[1].textContent, maliciousText);
  assert.equal(row.children[2].textContent, '<b>Shop</b>');
  assert.equal(row.children[1].children.length, 0);
});

test('removing an invoice item keeps remaining input handlers attached to the right item', () => {
  const document = runInvoiceEditor();
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
  const document = runInvoiceEditor();
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
