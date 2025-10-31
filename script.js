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
  const itemIndex = invoiceItemsArray.length;
  const div = document.createElement('div');
  div.classList.add('flex', 'gap-2', 'mb-2', 'items-center');
  div.innerHTML = `
    <input type="text" placeholder="Item Name" class="flex-1 px-2 py-1 border rounded" />
    <input type="number" placeholder="Qty" class="w-16 px-2 py-1 border rounded" />
    <input type="number" placeholder="Price" class="w-24 px-2 py-1 border rounded" />
    <button class="remove-item px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600">✕</button>
  `;
  itemsContainer.appendChild(div);

  invoiceItemsArray.push({ name: '', qty: 0, price: 0 });

  const inputs = div.querySelectorAll('input');
  inputs[0].addEventListener('input', e => { 
    invoiceItemsArray[itemIndex].name = e.target.value; 
    updatePreview();
  });
  inputs[1].addEventListener('input', e => { 
    invoiceItemsArray[itemIndex].qty = parseFloat(e.target.value) || 0; 
    updateTotals();
    updatePreview();
  });
  inputs[2].addEventListener('input', e => { 
    invoiceItemsArray[itemIndex].price = parseFloat(e.target.value) || 0; 
    updateTotals();
    updatePreview();
  });

  div.querySelector('.remove-item').addEventListener('click', () => {
    invoiceItemsArray.splice(itemIndex, 1);
    div.remove();
    updateTotals();
    updatePreview();
  });

  updateTotals();
  updatePreview();
});

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

  if (invoiceItemsArray.length === 0) {
    previewContent.innerHTML = '<p class="text-gray-400 italic">Your items and totals will appear here.</p>';
    return;
  }

  let html = `
    <div class="mb-2">
      <div class="flex justify-between">
        <h3 class="text-lg font-semibold">${business}</h3>
        <span class="text-sm text-gray-500">Date: ${invoiceDate}</span>
      </div>
      <p class="text-sm text-gray-700">Customer: ${customer}</p>
    </div>
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-gray-200">
          <th class="border px-2 py-1 text-left">Item</th>
          <th class="border px-2 py-1 text-left">Qty</th>
          <th class="border px-2 py-1 text-left">Price</th>
          <th class="border px-2 py-1 text-left">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  invoiceItemsArray.forEach(i => {
    const itemTotal = (i.qty * i.price || 0).toFixed(2);
    html += `
      <tr>
        <td class="border px-2 py-1">${i.name || '-'}</td>
        <td class="border px-2 py-1">${i.qty || 0}</td>
        <td class="border px-2 py-1">$${i.price || 0}</td>
        <td class="border px-2 py-1">$${itemTotal}</td>
      </tr>
    `;
  });

  const subtotal = invoiceItemsArray.reduce((sum, i) => sum + (i.qty * i.price || 0), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax - discount;

  html += `
      </tbody>
    </table>
    <div class="mt-2 space-y-1 text-sm text-gray-700">
      <div class="flex justify-between"><span>Subtotal:</span> <span>$${subtotal.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>Tax (8.5%):</span> <span>$${tax.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>Discount:</span> <span>$${discount.toFixed(2)}</span></div>
      <div class="flex justify-between font-semibold text-indigo-600"><span>Total:</span> <span>$${total.toFixed(2)}</span></div>
    </div>
  `;

  previewContent.innerHTML = html;
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
