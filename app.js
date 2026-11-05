window.InvoiceAuth.onAuthenticated(() => {
  const tableBody = document.getElementById("invoiceTable");
  const totalInvoices = document.getElementById("totalInvoices");
  const totalRevenue = document.getElementById("totalRevenue");
  const topBusinessType = document.getElementById("topBusinessType");
  const searchBox = document.getElementById("searchBox");
  const sortSelect = document.getElementById("sortSelect");
  const backupButton = document.getElementById("backupInvoicesBtn");
  const restoreInput = document.getElementById("restoreInvoicesInput");
  const importButton = document.getElementById("importLocalInvoicesBtn");
  const dashboardError = document.getElementById("dashboardError");
  const validStatuses = ["draft", "sent", "paid"];

  let invoices = [];

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

  function createStatusSelect(invoice) {
    const select = document.createElement("select");
    select.className = "px-2 py-1 border rounded";
    select.setAttribute("aria-label", `Status for ${invoice.customer}`);
    validStatuses.forEach(status => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      if (invoice.status === status) option.selected = true;
      select.appendChild(option);
    });
    select.value = invoice.status;
    select.addEventListener("change", async () => {
      invoice.status = select.value;
      try {
        await window.InvoiceAuth.request(`/api/invoices/${encodeURIComponent(invoice.id)}`, {
          method: "PUT",
          body: invoice
        });
        dashboardError.textContent = "";
      } catch (error) {
        dashboardError.textContent = error.message;
        await loadInvoices();
      }
    });
    return select;
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

      const statusCell = document.createElement("td");
      statusCell.className = "px-4 py-2";
      statusCell.appendChild(createStatusSelect(inv));
      row.appendChild(statusCell);

      const actions = document.createElement("td");
      actions.className = "px-4 py-2 space-x-2";

      const editLink = document.createElement("a");
      editLink.className = "edit-btn px-2 py-1 bg-blue-500 text-white rounded";
      editLink.href = `index.html?invoice=${encodeURIComponent(inv.id)}`;
      editLink.textContent = "Edit";

      const exportButton = document.createElement("button");
      exportButton.className = "export-btn px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600";
      exportButton.textContent = "Export";
      exportButton.addEventListener("click", () => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "pt", "a4");
        const content = `
Invoice for: ${inv.customer}
Business Type: ${inv.type}
Status: ${inv.status}
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
      deleteButton.addEventListener("click", async () => {
        try {
          await window.InvoiceAuth.request(`/api/invoices/${encodeURIComponent(inv.id)}`, {
            method: "DELETE"
          });
          dashboardError.textContent = "";
          await loadInvoices();
        } catch (error) {
          dashboardError.textContent = error.message;
        }
      });

      actions.append(editLink, exportButton, deleteButton);
      row.appendChild(actions);
      tableBody.appendChild(row);
    });
  }

  function updateDashboard() {
    const visible = getVisibleInvoices();
    renderInvoices(visible);
    renderStats(visible);
  }

  backupButton.addEventListener("click", () => {
    const backup = {
      format: "invoiceapp-backup",
      version: 1,
      invoices
    };
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoiceapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== "invoiceapp-backup" || backup.version !== 1 || !Array.isArray(backup.invoices)) {
        throw new Error("This file is not a supported InvoiceApp backup.");
      }
      if (!window.confirm(`Replace your ${invoices.length} saved invoices with ${backup.invoices.length} backed-up invoices?`)) {
        restoreInput.value = "";
        return;
      }
      invoices = await window.InvoiceAuth.request("/api/invoices", {
        method: "PUT",
        body: { invoices: backup.invoices }
      });
      restoreInput.value = "";
      updateDashboard();
      dashboardError.textContent = "Backup restored.";
    } catch (error) {
      restoreInput.value = "";
      dashboardError.textContent = error.message;
    }
  });

  importButton.addEventListener("click", async () => {
    let localInvoices;
    try {
      localInvoices = JSON.parse(localStorage.getItem("invoices")) || [];
      if (!Array.isArray(localInvoices)) throw new Error("The saved browser data is not a valid invoice list.");
      if (!window.confirm(`Import ${localInvoices.length} invoices from this browser into the server?`)) return;
      invoices = await window.InvoiceAuth.request("/api/invoices/import", {
        method: "POST",
        body: { invoices: localInvoices }
      });
      dashboardError.textContent = "Invoices imported. Your browser copy was kept unchanged.";
      updateDashboard();
      importButton.hidden = true;
    } catch (error) {
      dashboardError.textContent = error.message;
    }
  });

  searchBox.addEventListener("input", updateDashboard);
  sortSelect.addEventListener("change", updateDashboard);

  async function loadInvoices() {
    try {
      invoices = await window.InvoiceAuth.request("/api/invoices");
      importButton.hidden = true;
      if (invoices.length === 0) {
        try {
          const localInvoices = JSON.parse(localStorage.getItem("invoices")) || [];
          importButton.hidden = !Array.isArray(localInvoices) || localInvoices.length === 0;
        } catch {
          importButton.hidden = true;
        }
      }
      dashboardError.textContent = "";
      updateDashboard();
    } catch (error) {
      dashboardError.textContent = error.message;
    }
  }

  return loadInvoices();
});
