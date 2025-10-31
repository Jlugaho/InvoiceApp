document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("invoiceTable");
  const totalInvoices = document.getElementById("totalInvoices");
  const totalRevenue = document.getElementById("totalRevenue");
  const topBusinessType = document.getElementById("topBusinessType");
  const searchBox = document.getElementById("searchBox");
  const sortSelect = document.getElementById("sortSelect");

  let invoices = JSON.parse(localStorage.getItem("invoices")) || [];

  function renderStats(data = invoices) {
    totalInvoices.textContent = data.length;
    const revenue = data.reduce((sum, inv) => sum + parseFloat(inv.total), 0);
    totalRevenue.textContent = `$${revenue.toFixed(2)}`;

    if (data.length > 0) {
      const counts = data.reduce((acc, inv) => {
        acc[inv.type] = (acc[inv.type] || 0) + 1;
        return acc;
      }, {});
      const topType = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      topBusinessType.textContent = topType.charAt(0).toUpperCase() + topType.slice(1);
    } else {
      topBusinessType.textContent = "N/A";
    }
  }

  function renderInvoices(data = invoices) {
    tableBody.innerHTML = "";
    data.forEach((inv, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="px-4 py-2">${index + 1}</td>
        <td class="px-4 py-2">${inv.customer}</td>
        <td class="px-4 py-2">${inv.type}</td>
        <td class="px-4 py-2">$${parseFloat(inv.total).toFixed(2)}</td>
        <td class="px-4 py-2">${inv.date}</td>
        <td class="px-4 py-2 space-x-2">
          <button class="export-btn px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600" data-index="${index}">Export</button>
          <button class="delete-btn px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600" data-index="${index}">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    // Attach event listeners for buttons
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        const idx = e.target.dataset.index;
        invoices.splice(idx, 1);
        localStorage.setItem("invoices", JSON.stringify(invoices));
        renderInvoices();
        renderStats();
      });
    });

    document.querySelectorAll(".export-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        const idx = e.target.dataset.index;
        const inv = invoices[idx];
        const { jsPDF } = window.jspdf;

        const pdf = new jsPDF("p", "pt", "a4");
        const content = `
Invoice for: ${inv.customer}
Business Type: ${inv.type}
Total: $${parseFloat(inv.total).toFixed(2)}
Date: ${inv.date}
Items: ${inv.items ? inv.items.map(i => `${i.name} x${i.qty} $${i.price}`).join(", ") : "N/A"}
        `;
        pdf.text(content, 40, 50);
        pdf.save(`${inv.customer}_Invoice.pdf`);
      });
    });
  }

  // Search
  searchBox.addEventListener("input", e => {
    const term = e.target.value.toLowerCase();
    const filtered = invoices.filter(inv => inv.customer.toLowerCase().includes(term));
    renderInvoices(filtered);
    renderStats(filtered);
  });

  // Sort
  sortSelect.addEventListener("change", e => {
    let sorted = [...invoices];
    switch (e.target.value) {
      case "dateAsc":
        sorted.sort((a, b) => new Date(a.date) - new Date(b.date)); break;
      case "dateDesc":
        sorted.sort((a, b) => new Date(b.date) - new Date(a.date)); break;
      case "totalAsc":
        sorted.sort((a, b) => a.total - b.total); break;
      case "totalDesc":
        sorted.sort((a, b) => b.total - a.total); break;
    }
    renderInvoices(sorted);
    renderStats(sorted);
  });

  renderInvoices();
  renderStats();
});
