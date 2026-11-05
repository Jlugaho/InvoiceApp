document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("invoiceTable");
  const totalInvoices = document.getElementById("totalInvoices");
  const totalRevenue = document.getElementById("totalRevenue");
  const topBusinessType = document.getElementById("topBusinessType");
  const searchBox = document.getElementById("searchBox");
  const sortSelect = document.getElementById("sortSelect");

  let invoices = JSON.parse(localStorage.getItem("invoices")) || [];

  function renderStats(data) {
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

  function createCell(value, className) {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function getVisibleInvoices() {
    const term = searchBox.value.trim().toLowerCase();
    const visible = invoices.filter(inv => String(inv.customer || "").toLowerCase().includes(term));

    switch (sortSelect.value) {
      case "dateAsc":
        visible.sort((a, b) => new Date(a.date) - new Date(b.date));
        break;
      case "dateDesc":
        visible.sort((a, b) => new Date(b.date) - new Date(a.date));
        break;
      case "totalAsc":
        visible.sort((a, b) => Number(a.total) - Number(b.total));
        break;
      case "totalDesc":
        visible.sort((a, b) => Number(b.total) - Number(a.total));
        break;
    }
    return visible;
  }

  function renderInvoices(data) {
    tableBody.replaceChildren();
    data.forEach((inv, index) => {
      const row = document.createElement("tr");
      row.appendChild(createCell(index + 1, "px-4 py-2"));
      row.appendChild(createCell(inv.customer, "px-4 py-2"));
      row.appendChild(createCell(inv.type, "px-4 py-2"));
      row.appendChild(createCell(`$${parseFloat(inv.total).toFixed(2)}`, "px-4 py-2"));
      row.appendChild(createCell(inv.date, "px-4 py-2"));

      const actions = document.createElement("td");
      actions.className = "px-4 py-2 space-x-2";

      const exportButton = document.createElement("button");
      exportButton.className = "export-btn px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600";
      exportButton.textContent = "Export";
      exportButton.addEventListener("click", () => {
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

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-btn px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
        const invoiceIndex = invoices.indexOf(inv);
        if (invoiceIndex === -1) return;
        invoices.splice(invoiceIndex, 1);
        localStorage.setItem("invoices", JSON.stringify(invoices));
        updateDashboard();
      });

      actions.append(exportButton, deleteButton);
      row.appendChild(actions);
      tableBody.appendChild(row);
    });
  }

  function updateDashboard() {
    const visible = getVisibleInvoices();
    renderInvoices(visible);
    renderStats(visible);
  }

  searchBox.addEventListener("input", updateDashboard);
  sortSelect.addEventListener("change", updateDashboard);

  updateDashboard();
});
