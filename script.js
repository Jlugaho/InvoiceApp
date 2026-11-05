// ==== Variables ====
const themeToggle = document.getElementById('themeToggle');
const addItemBtn = document.getElementById('addItemBtn');
const itemsContainer = document.getElementById('itemsContainer');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const saveInvoiceBtn = document.getElementById('saveInvoiceBtn');
const subtotalEl = document.getElementById('subtotal');
const taxEl = document.getElementById('tax');
const discountEl = document.getElementById('discount');
const totalEl = document.getElementById('total');
const previewContent = document.getElementById('previewContent');
const customerNameInput = document.getElementById('customerName');
const businessTypeInput = document.getElementById('businessType');

let invoiceItemsArray = [];
const TAX_RATE = 0.085;
let discount = 0;

customerNameInput.addEventListener('input', updatePreview);
businessTypeInput.addEventListener('input', updatePreview);

// ==== Dark Mode Toggle ====
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  document.body.classList.toggle('bg-gray-900');
  document.body.classList.toggle('text-white');
  themeToggle.classList.toggle('bg-indigo-600');
  themeToggle.classList.toggle('bg-gray-800');
});

// ==== Add Item Functionality ====
addItemBtn.addEventListener('click', () => {
  const item = { name: '', qty: 0, price: 0 };
  const div = document.createElement('div');
  div.classList.add('flex', 'gap-2', 'mb-2', 'items-center');
  const nameInput = createInput('text', 'Item Name', 'flex-1 px-2 py-1 border rounded');
  const quantityInput = createInput('number', 'Qty', 'w-16 px-2 py-1 border rounded');
  const priceInput = createInput('number', 'Price', 'w-24 px-2 py-1 border rounded');
  const removeButton = document.createElement('button');
  removeButton.className = 'remove-item px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600';
  removeButton.textContent = '✕';
  div.append(nameInput, quantityInput, priceInput, removeButton);
  itemsContainer.appendChild(div);

  invoiceItemsArray.push(item);

  nameInput.addEventListener('input', e => {
    item.name = e.target.value;
    updatePreview();
  });
  quantityInput.addEventListener('input', e => {
    item.qty = parseFloat(e.target.value) || 0;
    updateTotals();
    updatePreview();
  });
  priceInput.addEventListener('input', e => {
    item.price = parseFloat(e.target.value) || 0;
    updateTotals();
    updatePreview();
  });

  removeButton.addEventListener('click', () => {
    const itemIndex = invoiceItemsArray.indexOf(item);
    if (itemIndex === -1) return;
    invoiceItemsArray.splice(itemIndex, 1);
    div.remove();
    updateTotals();
    updatePreview();
  });

  updateTotals();
  updatePreview();
});

function createInput(type, placeholder, className) {
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.className = className;
  return input;
}

// ==== Update Totals ====
function updateTotals() {
  const subtotal = invoiceItemsArray.reduce((sum, i) => sum + (i.qty * i.price || 0), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax - discount;

  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  taxEl.textContent = `$${tax.toFixed(2)}`;
  discountEl.textContent = `$${discount.toFixed(2)}`;
  totalEl.textContent = `$${total.toFixed(2)}`;
}

// ==== Update Live Preview ====
function updatePreview() {
  const customer = customerNameInput.value || 'Anonymous';
  const business = businessTypeInput.value || 'General';
  const invoiceDate = new Date().toLocaleDateString();
  previewContent.replaceChildren();

  if (invoiceItemsArray.length === 0) {
    previewContent.appendChild(createElement('p', 'text-gray-400 italic', 'Your items and totals will appear here.'));
    return;
  }

  const heading = createElement('div', 'mb-2');
  const headingRow = createElement('div', 'flex justify-between');
  headingRow.append(
    createElement('h3', 'text-lg font-semibold', business),
    createElement('span', 'text-sm text-gray-500', `Date: ${invoiceDate}`)
  );
  heading.append(
    headingRow,
    createElement('p', 'text-sm text-gray-700', `Customer: ${customer}`)
  );
  previewContent.appendChild(heading);

  const table = createElement('table', 'w-full text-sm border-collapse');
  const tableHead = document.createElement('thead');
  const headerRow = createElement('tr', 'bg-gray-200');
  ['Item', 'Qty', 'Price', 'Total'].forEach(label => {
    headerRow.appendChild(createElement('th', 'border px-2 py-1 text-left', label));
  });
  tableHead.appendChild(headerRow);
  const tableBody = document.createElement('tbody');

  invoiceItemsArray.forEach(i => {
    const itemTotal = (i.qty * i.price || 0).toFixed(2);
    const row = document.createElement('tr');
    row.append(
      createElement('td', 'border px-2 py-1', i.name || '-'),
      createElement('td', 'border px-2 py-1', i.qty || 0),
      createElement('td', 'border px-2 py-1', `$${i.price || 0}`),
      createElement('td', 'border px-2 py-1', `$${itemTotal}`)
    );
    tableBody.appendChild(row);
  });
  table.append(tableHead, tableBody);
  previewContent.appendChild(table);

  const subtotal = invoiceItemsArray.reduce((sum, i) => sum + (i.qty * i.price || 0), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax - discount;
  const totals = createElement('div', 'mt-2 space-y-1 text-sm text-gray-700');
  [
    ['Subtotal:', `$${subtotal.toFixed(2)}`],
    ['Tax (8.5%):', `$${tax.toFixed(2)}`],
    ['Discount:', `$${discount.toFixed(2)}`],
    ['Total:', `$${total.toFixed(2)}`]
  ].forEach(([label, amount], index) => {
    const row = createElement('div', `flex justify-between${index === 3 ? ' font-semibold text-indigo-600' : ''}`);
    row.append(createElement('span', '', label), createElement('span', '', amount));
    totals.appendChild(row);
  });
  previewContent.appendChild(totals);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// ==== Save Invoice ====
saveInvoiceBtn.addEventListener('click', () => {
  if(invoiceItemsArray.length === 0){
    alert("Add some items first!");
    return;
  }

  const customer = customerNameInput.value || "Anonymous";
  const business = businessTypeInput.value || "General";
  const invoiceDate = new Date().toLocaleDateString();

  const newInvoice = {
    customer,
    type: business,
    date: invoiceDate,
    items: invoiceItemsArray,
    subtotal: invoiceItemsArray.reduce((sum, i) => sum + (i.qty * i.price || 0), 0),
    tax: invoiceItemsArray.reduce((sum, i) => sum + (i.qty * i.price || 0), 0) * TAX_RATE,
    discount,
    total: invoiceItemsArray.reduce((sum, i) => sum + (i.qty * i.price || 0), 0) * (1 + TAX_RATE) - discount
  };

  const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
  invoices.push(newInvoice);
  localStorage.setItem('invoices', JSON.stringify(invoices));

  alert('Invoice saved! You can now view it in the dashboard.');
});

// ==== Export PDF ====
exportPdfBtn.addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'pt', 'a4');

  await html2canvas(document.querySelector('#invoicePreview')).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  });

  pdf.save('InvoiceApp.pdf');
});
