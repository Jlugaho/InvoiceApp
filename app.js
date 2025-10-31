// app.js - SaaS-level frontend logic
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const itemsContainer = document.getElementById('itemsContainer');
  const previewContent = document.getElementById('previewContent');
  const subtotalEl = document.getElementById('subtotal');
  const taxEl = document.getElementById('tax');
  const discountEl = document.getElementById('discount');
  const totalEl = document.getElementById('total');
  const addItemBtn = document.getElementById('addItemBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  let items = [];

  // Theme toggle
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });

  // Add new item
  function addItem(name = '', qty = 1, price = 0) {
    const id = Date.now();
    items.push({ id, name, qty, price });
    renderItems();
    renderPreview();
  }

  // Remove item
  function removeItem(id) {
    items = items.filter(i => i.id !== id);
    renderItems();
    renderPreview();
  }

  // Render item input fields
  function renderItems() {
    itemsContainer.innerHTML = '';
    items.forEach(i => {
      const div = document.createElement('div');
      div.className = 'flex gap-2 mb-2 items-center';
      div.innerHTML = `
        <input type='text' placeholder='Item Name' value='${i.name}' class='flex-1 p-2 rounded-md border'>
        <input type='number' value='${i.qty}' class='w-16 p-2 rounded-md border'>
        <input type='number' value='${i.price}' class='w-20 p-2 rounded-md border'>
        <button class='px-2 py-1 bg-red-500 text-white rounded-md'>Remove</button>
      `;
      const inputs = div.querySelectorAll('input');
      inputs[0].addEventListener('input', e => { i.name = e.target.value; renderPreview(); });
      inputs[1].addEventListener('input', e => { i.qty = Number(e.target.value); renderPreview(); });
      inputs[2].addEventListener('input', e => { i.price = Number(e.target.value); renderPreview(); });
      div.querySelector('button').addEventListener('click', () => removeItem(i.id));
      itemsContainer.appendChild(div);
    });
    updateTotals();
  }

  // Calculate totals
  function updateTotals() {
    const subtotal = items.reduce((a, b) => a + b.qty * b.price, 0);
    const tax = subtotal * 0.085;
    const discount = 0;
    const total = subtotal + tax - discount;
    subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    taxEl.textContent = `$${tax.toFixed(2)}`;
    discountEl.textContent = `$${discount.toFixed(2)}`;
    totalEl.textContent = `$${total.toFixed(2)}`;
  }

  // Render live preview
  function renderPreview() {
    previewContent.innerHTML = items.map(i => `
      <div class='flex justify-between'>
        <span>${i.name}</span>
        <span>${i.qty} x $${i.price.toFixed(2)}</span>
      </div>
    `).join('');
  }

  // Add item button
  addItemBtn.addEventListener('click', () => addItem());

  // Export PDF
  exportPdfBtn.addEventListener('click', async () => {
    const canvas = await html2canvas(document.getElementById('invoicePreview'));
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF();
    pdf.addImage(imgData, 'PNG', 0, 0);
    pdf.save('invoice.pdf');
  });

  // Initialize with sample item
  addItem('Sample Item', 1, 49.99);
});
