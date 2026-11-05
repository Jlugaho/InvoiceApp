window.InvoiceAuth.onAuthenticated(() => {
  const tableBody = document.getElementById("invoiceTable");
  const totalInvoices = document.getElementById("totalInvoices");
  const totalRevenue = document.getElementById("totalRevenue");
  const paidRevenue = document.getElementById("paidRevenue");
  const paidCaption = document.getElementById("paidCaption");
  const outstandingRevenue = document.getElementById("outstandingRevenue");
  const outstandingCaption = document.getElementById("outstandingCaption");
  const invoiceCountCaption = document.getElementById("invoiceCountCaption");
  const topBusinessType = document.getElementById("topBusinessType");
  const searchBox = document.getElementById("searchBox");
  const sortSelect = document.getElementById("sortSelect");
  const statusFilter = document.getElementById("statusFilter");
  const backupButton = document.getElementById("backupInvoicesBtn");
  const restoreInput = document.getElementById("restoreInvoicesInput");
  const importButton = document.getElementById("importLocalInvoicesBtn");
  const dashboardError = document.getElementById("dashboardError");
  const validStatuses = ["draft", "sent", "paid"];

  let invoices = [];

  function renderStats(data) {
    totalInvoices.textContent = data.length;
    invoiceCountCaption.textContent = data.length === invoices.length
      ? "In this workspace"
      : `${data.length} shown after filters`;
    const revenue = data.reduce((sum, inv) => sum + Number(inv.total), 0);
    totalRevenue.textContent = `$${revenue.toFixed(2)}`;
    const paid = data.filter(invoice => invoice.status === "paid");
    const unpaid = data.filter(invoice => invoice.status !== "paid");
    paidRevenue.textContent = `$${paid.reduce((sum, inv) => sum + Number(inv.total), 0).toFixed(2)}`;
    paidCaption.textContent = `${paid.length} ${paid.length === 1 ? "invoice" : "invoices"} paid`;
    outstandingRevenue.textContent = `$${unpaid.reduce((sum, inv) => sum + Number(inv.total), 0).toFixed(2)}`;
    outstandingCaption.textContent = unpaid.length
      ? `${unpaid.length} ${unpaid.length === 1 ? "invoice" : "invoices"} still to come`
      : "Nothing waiting right now";

    if (data.length > 0) {
      const counts = data.reduce((acc, inv) => {
        acc[inv.type] = (acc[inv.type] || 0) + 1;
        return acc;
      }, {});
      const topType = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      topBusinessType.textContent = `Most common: ${topType} · ${counts[topType]} ${counts[topType] === 1 ? "invoice" : "invoices"}`;
    } else {
      topBusinessType.textContent = "No invoices yet";
    }
  }

  function createCell(value, className = "") {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function createTextElement(tagName, value, className = "") {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = value;
    return element;
  }

  function formatDate(value) {
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = isoDate
      ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
      : new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function createStatusSelect(invoice) {
    const select = document.createElement("select");
    select.className = `status-select status-${invoice.status}`;
    select.setAttribute("aria-label", `Status for ${invoice.customer}`);
    validStatuses.forEach(status => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      if (invoice.status === status) option.selected = true;
      select.appendChild(option);
    });
    select.value = invoice.status;
    select.addEventListener("change", () => {
      select.className = `status-select status-${select.value}`;
    });
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
    const visible = invoices.filter(inv =>
      `${inv.customer || ""} ${inv.type || ""}`.toLowerCase().includes(term) &&
      (!statusFilter.value || inv.status === statusFilter.value)
    );

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
    if (data.length === 0) {
      const row = document.createElement("tr");
      const cell = createCell(
        invoices.length === 0
          ? "Your first invoice is a few details away. Create one to get started."
          : "No invoices match these filters. Try another search or status.",
        "empty-row"
      );
      cell.colSpan = 6;
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    data.forEach(inv => {
      const row = document.createElement("tr");
      const customerCell = document.createElement("td");
      const customerWrap = document.createElement("div");
      customerWrap.className = "customer-cell";
      const initials = String(inv.customer || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("");
      const avatar = createTextElement("span", initials, "customer-avatar");
      avatar.setAttribute("aria-hidden", "true");
      const customerDetails = document.createElement("div");
      const customerName = createTextElement("span", inv.customer, "customer-primary");
      const customerMeta = createTextElement("span", inv.id ? `Invoice · ${inv.id.slice(0, 8)}` : "Invoice", "customer-subtitle");
      customerDetails.append(customerName, customerMeta);
      customerWrap.append(avatar, customerDetails);
      customerCell.appendChild(customerWrap);
      row.appendChild(customerCell);
      row.appendChild(createCell(inv.type, "business-cell"));
      row.appendChild(createCell(formatDate(inv.date)));
      row.appendChild(createCell(`$${Number(inv.total).toFixed(2)}`));

      const statusCell = document.createElement("td");
      statusCell.appendChild(createStatusSelect(inv));
      row.appendChild(statusCell);

      const actions = document.createElement("td");
      actions.className = "row-actions";

      const editLink = document.createElement("a");
      editLink.className = "edit-btn px-2 py-1 bg-blue-500 text-white rounded";
      editLink.href = `index.html?invoice=${encodeURIComponent(inv.id)}`;
      editLink.textContent = "Edit";

      const exportButton = document.createElement("button");
      exportButton.className = "export-btn";
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
      deleteButton.className = "delete-btn";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm(`Delete the invoice for ${inv.customer}? This cannot be undone.`)) return;
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
  statusFilter.addEventListener("change", updateDashboard);

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
