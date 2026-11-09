import React from "react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getGreeting } from "./format.js";
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeDollarSign,
  Banknote, Bell, BriefcaseBusiness, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, CreditCard, Download, Ellipsis, FileChartColumnIncreasing,
  FilePlus2, FileText, Filter, LayoutDashboard, LogOut, Menu, MoreHorizontal, Package,
  PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Trash2, TrendingDown, TrendingUp, Users, Wallet, X
} from "lucide-react";

const DashboardCharts = lazy(() => import("./Charts.jsx").then(module => ({ default: module.DashboardCharts })));
const MonthlyRevenueChart = lazy(() => import("./Charts.jsx").then(module => ({ default: module.MonthlyRevenueChart })));
const navigation = [
  { section: "WORKSPACE", items: [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "invoices", label: "Invoices", icon: FileText, badge: true },
    { id: "estimates", label: "Estimates", icon: FilePlus2 },
    { id: "customers", label: "Customers", icon: Users }
  ] },
  { section: "MONEY", items: [
    { id: "products", label: "Products & services", icon: Package },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "reports", label: "Reports", icon: FileChartColumnIncreasing }
  ] }
];
const emptyData = { invoices: [], customers: [], estimates: [], products: [], payments: [], expenses: [], settings: {} };
const currencyOptions = ["USD", "CAD", "EUR", "GBP"];
const statusNames = { paid: "Paid", pending: "Pending", overdue: "Overdue", draft: "Draft", partial: "Partially paid", sent: "Pending", accepted: "Accepted", declined: "Declined" };

function money(value, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
}
function shortDate(value) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}
function todayString() { return new Date().toISOString().slice(0, 10); }
function invoiceStatus(invoice) {
  if (invoice.status === "draft") return "draft";
  if (invoice.status === "paid" || Number(invoice.amountPaid) >= Number(invoice.total)) return "paid";
  if (Number(invoice.amountPaid) > 0) return "partial";
  if (invoice.dueDate && invoice.dueDate < todayString()) return "overdue";
  return "pending";
}
function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
}
function toastText(error) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }

export default function App() {
  const [data, setData] = useState(emptyData);
  const [activePage, setActivePage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [dateRange, setDateRange] = useState("30");
  const [invoiceEditor, setInvoiceEditor] = useState(null);
  const [recordEditor, setRecordEditor] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const notify = useCallback(message => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3400);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const [invoices, customers, estimates, products, payments, expenses, settings] = await Promise.all([
        window.InvoiceAuth.request("/api/invoices"),
        window.InvoiceAuth.request("/api/customers"),
        window.InvoiceAuth.request("/api/estimates"),
        window.InvoiceAuth.request("/api/products"),
        window.InvoiceAuth.request("/api/payments"),
        window.InvoiceAuth.request("/api/expenses"),
        window.InvoiceAuth.request("/api/settings")
      ]);
      setData({ invoices, customers, estimates, products, payments, expenses, settings });
    } catch (error) {
      setPageError(toastText(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.InvoiceAuth.onAuthenticated(refresh);
  }, [refresh]);

  useEffect(() => {
    const navigate = event => {
      setActivePage(event.detail);
      setGlobalSearch("");
      setPage(1);
    };
    window.addEventListener("ledgerly:navigate", navigate);
    return () => window.removeEventListener("ledgerly:navigate", navigate);
  }, []);

  const saveRecord = async (type, record) => {
    const collection = type === "setting" ? "settings" : type;
    try {
      if (type === "setting") {
        await window.InvoiceAuth.request("/api/settings", { method: "PUT", body: record });
      } else {
        const method = record.id ? "PUT" : "POST";
        const url = record.id ? `/api/${collection}/${encodeURIComponent(record.id)}` : `/api/${collection}`;
        const saved = await window.InvoiceAuth.request(url, { method, body: record });
        setData(current => ({ ...current, [collection]: record.id
          ? current[collection].map(item => item.id === saved.id ? saved : item)
          : [saved, ...current[collection]] }));
      }
      if (type === "invoices") {
        await refresh();
        setInvoiceEditor(null);
      } else {
        if (type === "setting") setData(current => ({ ...current, settings: record }));
        setRecordEditor(null);
      }
      notify(type === "invoices" ? "Invoice saved to your workspace." : "Changes saved.");
    } catch (error) {
      notify(toastText(error));
      throw error;
    }
  };

  const removeRecord = async (type, id) => {
    try {
      await window.InvoiceAuth.request(`/api/${type}/${encodeURIComponent(id)}`, { method: "DELETE" });
      setData(current => ({ ...current, [type]: current[type].filter(record => record.id !== id) }));
      setSelectedInvoices(current => current.filter(selected => selected !== id));
      notify("Record deleted.");
    } catch (error) {
      notify(toastText(error));
    }
  };

  const savePayment = async payment => {
    await saveRecord("payments", payment);
    await refresh();
  };

  const saveSettings = async settings => {
    try {
      const saved = await window.InvoiceAuth.request("/api/settings", { method: "PUT", body: settings });
      setData(current => ({ ...current, settings: saved }));
      notify("Business details saved.");
    } catch (error) {
      notify(toastText(error));
      throw error;
    }
  };

  const loadSampleWorkspace = async () => {
    if (!window.confirm("Add a realistic sample workshop, customers, invoices, payments, and expenses to this workspace? These records will be saved and can be deleted later.")) return;
    setSampleLoading(true);
    try {
      const sampleCustomers = await Promise.all([
        window.InvoiceAuth.request("/api/customers", { method: "POST", body: { name: "Maya Chen", company: "Greenline Coffee Co.", email: "maya@greenline.example", phone: "(415) 555-0182", address: "28 Valencia St, San Francisco, CA" } }),
        window.InvoiceAuth.request("/api/customers", { method: "POST", body: { name: "Dominic Reyes", company: "Summit Delivery Co.", email: "dominic@summit.example", phone: "(510) 555-0127", address: "940 Harbor Way, Oakland, CA" } }),
        window.InvoiceAuth.request("/api/customers", { method: "POST", body: { name: "Priya Patel", company: "Patel Family Motors", email: "priya@patelmotors.example", phone: "(408) 555-0139", address: "1630 Bascom Ave, San Jose, CA" } })
      ]);
      await Promise.all([
        window.InvoiceAuth.request("/api/settings", { method: "PUT", body: { businessName: "Northline Auto & Repair", ownerName: "Jordan Davis", ownerEmail: "hello@northline.example", phone: "(415) 555-0144", address: "410 Bryant St, San Francisco, CA", website: "northline.example", paymentInstructions: "Bank transfer or card accepted. Thank you for keeping local business moving." } }),
        window.InvoiceAuth.request("/api/products", { method: "POST", body: { name: "Multi-point vehicle inspection", description: "Safety and condition inspection with written report", category: "Workshop service", price: 89, taxRate: 8.5 } }),
        window.InvoiceAuth.request("/api/products", { method: "POST", body: { name: "Synthetic oil service", description: "Oil and filter replacement with fluid check", category: "Maintenance", price: 145, taxRate: 8.5 } }),
        window.InvoiceAuth.request("/api/expenses", { method: "POST", body: { description: "Shop supplies and cleaning materials", vendor: "Bay Industrial Supply", category: "Workshop supplies", amount: 186.42, date: todayString() } }),
        window.InvoiceAuth.request("/api/estimates", { method: "POST", body: { customer: "Dominic Reyes", number: "EST-2026-0012", description: "Fleet brake inspection and service", date: todayString(), validUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), total: 685, status: "accepted" } })
      ]);
      const dateOffset = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      const invoices = await Promise.all([
        window.InvoiceAuth.request("/api/invoices", { method: "POST", body: { customer: sampleCustomers[0].name, customerId: sampleCustomers[0].id, type: "Northline Auto & Repair", invoiceNumber: "INV-2026-0148", date: dateOffset(-6), dueDate: dateOffset(24), currency: "USD", terms: "Net 30", status: "sent", items: [{ name: "Vehicle inspection and diagnostics", qty: 1, price: 189, taxRate: 8.5 }] } }),
        window.InvoiceAuth.request("/api/invoices", { method: "POST", body: { customer: sampleCustomers[1].name, customerId: sampleCustomers[1].id, type: "Northline Auto & Repair", invoiceNumber: "INV-2026-0142", date: dateOffset(-36), dueDate: dateOffset(-6), currency: "USD", terms: "Net 30", status: "sent", items: [{ name: "Fleet brake service", qty: 2, price: 225, taxRate: 8.5 }, { name: "Shop materials", qty: 1, price: 48, taxRate: 8.5 }] } }),
        window.InvoiceAuth.request("/api/invoices", { method: "POST", body: { customer: sampleCustomers[2].name, customerId: sampleCustomers[2].id, type: "Northline Auto & Repair", invoiceNumber: "INV-2026-0136", date: dateOffset(-52), dueDate: dateOffset(-22), currency: "USD", terms: "Net 30", status: "sent", items: [{ name: "Synthetic oil service", qty: 1, price: 145, taxRate: 8.5 }, { name: "Multi-point vehicle inspection", qty: 1, price: 89, taxRate: 8.5 }] } })
      ]);
      await Promise.all([
        window.InvoiceAuth.request("/api/payments", { method: "POST", body: { invoiceId: invoices[0].id, amount: 100, method: "Bank transfer", reference: "ACH-8042", date: dateOffset(-2) } }),
        window.InvoiceAuth.request("/api/payments", { method: "POST", body: { invoiceId: invoices[2].id, amount: invoices[2].total, method: "Credit card", reference: "CARD-2197", date: dateOffset(-20) } })
      ]);
      await refresh();
      notify("Sample workshop records added to your workspace.");
    } catch (error) {
      await refresh();
      notify(`Sample records could not all be added: ${toastText(error)}`);
    } finally {
      setSampleLoading(false);
    }
  };

  const downloadInvoice = async invoice => {
    let target = document.getElementById(`invoice-paper-${invoice.id || "draft"}`);
    let temporaryHost;
    let temporaryRoot;
    try {
      if (!target) {
        temporaryHost = document.createElement("div");
        temporaryHost.className = "pdf-render-host";
        document.body.appendChild(temporaryHost);
        temporaryRoot = createRoot(temporaryHost);
        temporaryRoot.render(<InvoicePaper invoice={invoice} settings={data.settings} />);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        target = temporaryHost.querySelector(".invoice-paper");
      }
      if (!target) throw new Error("Invoice preview could not be prepared.");
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
      ]);
      const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF("p", "mm", "a4");
      const width = pdf.internal.pageSize.getWidth();
      const height = canvas.height * width / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
      pdf.save(`${(invoice.invoiceNumber || invoice.id || "invoice").replace(/[^\w-]/g, "_")}.pdf`);
    } catch (error) {
      notify(`Could not create PDF: ${toastText(error)}`);
    } finally {
      temporaryRoot?.unmount();
      temporaryHost?.remove();
    }
  };

  const currentLabel = [...navigation.flatMap(group => group.items), { id: "settings", label: "Settings" }]
    .find(item => item.id === activePage)?.label || "Overview";
  const matchedInvoices = data.invoices.filter(invoice => {
    const term = globalSearch.trim().toLowerCase();
    return !term || `${invoice.invoiceNumber || ""} ${invoice.customer || ""} ${invoice.type || ""}`.toLowerCase().includes(term);
  });

  const selectPage = id => {
    setActivePage(id);
    setMobileSidebarOpen(false);
    setGlobalSearch("");
    setPage(1);
  };

  const renderPage = () => {
    if (loading) return <LoadingState />;
    if (pageError) return <ErrorState message={pageError} onRetry={refresh} />;
    const common = { data, notify, onEditInvoice: invoice => setInvoiceEditor(invoice), onNewInvoice: initial => setInvoiceEditor(initial || {}), onAddRecord: (type, initial = {}) => setRecordEditor({ type, record: initial }), onDelete: removeRecord, onSavePayment: savePayment, onSaveSettings: saveSettings, onDownload: downloadInvoice, onPreview: setPreviewInvoice };
    switch (activePage) {
      case "invoices": return <InvoicesPage {...common} invoices={matchedInvoices} query={globalSearch} selected={selectedInvoices} setSelected={setSelectedInvoices} page={page} setPage={setPage} pageSize={pageSize} />;
      case "estimates": return <RecordsPage {...common} type="estimates" title="Estimates" subtitle="Put a clear proposal in front of every customer." records={data.estimates} columns={["Estimate", "Customer", "Date", "Amount", "Status"]} />;
      case "customers": return <CustomersPage {...common} customers={data.customers} />;
      case "products": return <RecordsPage {...common} type="products" title="Products & services" subtitle="A consistent catalog makes every invoice quicker to create." records={data.products} columns={["Item", "Category", "Unit price", "Tax", ""]} />;
      case "payments": return <PaymentsPage {...common} payments={data.payments} invoices={data.invoices} />;
      case "expenses": return <RecordsPage {...common} type="expenses" title="Expenses" subtitle="Keep business spending organized alongside incoming revenue." records={data.expenses} columns={["Description", "Category", "Date", "Amount", ""]} />;
      case "reports": return <ReportsPage {...common} />;
      case "settings": return <SettingsPage {...common} />;
      default: return <DashboardPage {...common} dateRange={dateRange} setDateRange={setDateRange} onLoadSample={loadSampleWorkspace} sampleLoading={sampleLoading} />;
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {mobileSidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className={`sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">L</span>
          {!sidebarCollapsed && <span className="brand-name">InvoiceApp</span>}
          <button className="icon-button sidebar-collapse" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed(value => !value)}>
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <button className="workspace-switcher" onClick={() => selectPage("settings")}>
          <span className="workspace-avatar">{initials(data.settings.businessName || "Acme Studio")}</span>
          {!sidebarCollapsed && <span className="workspace-switcher-copy"><strong>{data.settings.businessName || "Your workspace"}</strong><small>Business account</small></span>}
          {!sidebarCollapsed && <ChevronDown size={15} />}
        </button>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(group => <div className="nav-group" key={group.section}>
            {!sidebarCollapsed && <p className="nav-section-label">{group.section}</p>}
            {group.items.map(item => {
              const Icon = item.icon;
              return <button key={item.id} className={`nav-item ${activePage === item.id ? "active" : ""}`} title={sidebarCollapsed ? item.label : ""} onClick={() => selectPage(item.id)}>
                <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
                {item.badge && data.invoices.length > 0 && <span className="nav-count">{data.invoices.length}</span>}
              </button>;
            })}
          </div>)}
          <div className="nav-group">
            {!sidebarCollapsed && <p className="nav-section-label">PREFERENCES</p>}
            <button className={`nav-item ${activePage === "settings" ? "active" : ""}`} onClick={() => selectPage("settings")} title={sidebarCollapsed ? "Settings" : ""}><Settings size={17} strokeWidth={1.8} /><span>Settings</span></button>
          </div>
        </nav>
        <div className="sidebar-spacer" />
        {!sidebarCollapsed && <div className="sidebar-plan"><div className="plan-icon"><Sparkles size={16} /></div><strong>All your numbers, together.</strong><p>A simpler view of the work behind your business.</p><button onClick={() => selectPage("reports")}>Explore reports <ArrowRight size={13} /></button></div>}
        <button className="sidebar-user" onClick={() => setProfileMenuOpen(value => !value)}>
          <span className="user-avatar">JD</span>
          {!sidebarCollapsed && <span className="user-copy"><strong>{data.settings.ownerName || "Workspace owner"}</strong><small>{data.settings.ownerEmail || "Manage your account"}</small></span>}
          {!sidebarCollapsed && <MoreHorizontal size={17} />}
        </button>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileSidebarOpen(true)}><Menu size={19} /></button>
          <div className="topbar-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{currentLabel}</strong></div>
          <label className="global-search"><Search size={16} /><input value={globalSearch} onChange={event => { setGlobalSearch(event.target.value); setPage(1); if (event.target.value) setActivePage("invoices"); }} placeholder="Search invoices…" aria-label="Search invoices" /><kbd>⌘ K</kbd></label>
          <div className="topbar-actions">
            <select className="date-range-select" aria-label="Dashboard date range" value={dateRange} onChange={event => setDateRange(event.target.value)}>
              <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">This year</option><option value="all">All time</option>
            </select>
            <button className={`icon-button ${notificationsOpen ? "selected" : ""}`} aria-label="Notifications" onClick={() => setNotificationsOpen(value => !value)}><Bell size={17} />{data.invoices.some(invoice => invoiceStatus(invoice) === "overdue") && <i className="notification-dot" />}</button>
            <button className="icon-button help-button" aria-label="Help center" title="Help center" onClick={() => notify("For help, contact your workspace administrator.")}><CircleHelp size={17} /></button>
            <button className="topbar-avatar" aria-label="Account menu" onClick={() => setProfileMenuOpen(value => !value)}>JD</button>
            <button className="button button-primary top-create" onClick={() => setInvoiceEditor({})}><Plus size={16} /> Create invoice</button>
          </div>
          {profileMenuOpen && <div className="popover account-popover"><strong>{data.settings.ownerName || "Workspace owner"}</strong><small>{data.settings.ownerEmail || "Shared-key workspace"}</small><button onClick={() => selectPage("settings")}><Settings size={15} /> Settings</button><button onClick={() => { sessionStorage.removeItem("invoiceapp-api-key"); window.location.reload(); }}><LogOut size={15} /> Sign out</button></div>}
          {notificationsOpen && <div className="popover notification-popover"><div className="popover-heading"><strong>Payment reminders</strong><span>{data.invoices.filter(invoice => invoiceStatus(invoice) === "overdue").length}</span></div>{data.invoices.filter(invoice => invoiceStatus(invoice) === "overdue").slice(0, 4).map(invoice => <button key={invoice.id} onClick={() => { setInvoiceEditor(invoice); setNotificationsOpen(false); }}><span className="notification-icon"><Clock3 size={15} /></span><span><strong>{invoice.customer}</strong><small>{invoice.invoiceNumber || "Invoice"} · {money(invoice.total - (invoice.amountPaid || 0), invoice.currency)}</small></span></button>)}{!data.invoices.some(invoice => invoiceStatus(invoice) === "overdue") && <p className="empty-notification">You’re all caught up. No overdue invoices.</p>}</div>}
        </header>
        <main className="page-content">
          {renderPage()}
        </main>
      </div>

      {invoiceEditor && <InvoiceEditor
        invoice={invoiceEditor}
        data={data}
        onClose={() => setInvoiceEditor(null)}
        onSave={invoice => saveRecord("invoices", invoice)}
        onDownload={downloadInvoice}
        onPreview={setPreviewInvoice}
      />}
      {recordEditor && <RecordEditor
        type={recordEditor.type}
        record={recordEditor.record}
        data={data}
        onClose={() => setRecordEditor(null)}
        onSave={record => recordEditor.type === "payments" ? savePayment(record) : saveRecord(recordEditor.type, record)}
      />}
      {previewInvoice && <PreviewModal invoice={previewInvoice} settings={data.settings} onClose={() => setPreviewInvoice(null)} onDownload={downloadInvoice} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle, action, children }) {
  return <div className="page-heading"><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="heading-actions">{children}{action}</div></div>;
}
function PrimaryButton({ children, onClick, icon: Icon = Plus, type = "button" }) {
  return <button type={type} className="button button-primary" onClick={onClick}><Icon size={16} />{children}</button>;
}
function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status === "paid" ? <Check size={12} /> : status === "overdue" ? <Clock3 size={12} /> : null}{statusNames[status] || status}</span>;
}
function MetricCard({ label, value, note, change, icon: Icon, tone }) {
  return <article className={`metric-card tone-${tone}`}><div className="metric-card-top"><span className="metric-label">{label}</span><span className="metric-icon"><Icon size={17} /></span></div><strong className="metric-value">{value}</strong><div className="metric-foot"><span>{note}</span>{change !== undefined && <span className={`metric-change ${change >= 0 ? "positive" : "negative"}`}>{change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(change).toFixed(1)}%</span>}</div><span className="metric-glow" /></article>;
}
function LoadingState() {
  return <div className="loading-state"><div className="skeleton skeleton-title" /><div className="skeleton-grid">{[1, 2, 3, 4].map(item => <div className="skeleton skeleton-card" key={item} />)}</div><div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel short" /></div>;
}
function ErrorState({ message, onRetry }) {
  return <section className="empty-state error-state"><span className="empty-icon"><ShieldCheck size={22} /></span><h2>Couldn’t load your workspace</h2><p>{message}</p><button className="button button-secondary" onClick={onRetry}>Try again</button></section>;
}
function EmptyState({ icon: Icon = FileText, title, message, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><h3>{title}</h3><p>{message}</p>{action}</div>;
}

function DashboardPage({ data, onNewInvoice, onEditInvoice, onAddRecord, onDownload, dateRange, onLoadSample, sampleLoading }) {
  const [greeting, setGreeting] = useState(getGreeting);
  useEffect(() => {
    const timer = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const today = new Date();
  const cutoff = dateRange === "all" ? 0 : new Date(today.getTime() - Number(dateRange) * 86400000).getTime();
  const rangeInvoices = data.invoices.filter(invoice => !cutoff || new Date(`${invoice.date}T00:00:00`).getTime() >= cutoff);
  const paidRevenue = rangeInvoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid || (invoice.status === "paid" ? invoice.total : 0)), 0);
  const outstanding = rangeInvoices.filter(invoice => invoiceStatus(invoice) !== "paid" && invoiceStatus(invoice) !== "draft").reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amountPaid || 0)), 0);
  const overdue = rangeInvoices.filter(invoice => invoiceStatus(invoice) === "overdue").reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amountPaid || 0)), 0);
  const paidCount = rangeInvoices.filter(invoice => invoiceStatus(invoice) === "paid").length;
  const monthlyRevenue = new Map();
  data.payments.forEach(payment => {
    const date = new Date(`${payment.date || payment.createdAt || ""}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyRevenue.set(key, (monthlyRevenue.get(key) || 0) + Number(payment.amount));
    }
  });
  const revenueChart = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    return { month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(month), revenue: monthlyRevenue.get(`${month.getFullYear()}-${month.getMonth()}`) || 0 };
  });
  const statusCounts = ["paid", "pending", "partial", "overdue", "draft"].map(status => ({
    status, name: statusNames[status], value: rangeInvoices.filter(invoice => invoiceStatus(invoice) === status).length
  })).filter(item => item.value > 0);
  const reminders = data.invoices.filter(invoice => ["overdue", "pending"].includes(invoiceStatus(invoice))).sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || ""))).slice(0, 4);
  const activity = [...data.payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);

  return <>
    <PageHeading eyebrow="BUSINESS AT A GLANCE" title={greeting} subtitle="Here’s how things are moving across your business." action={<PrimaryButton onClick={onNewInvoice}>Create invoice</PrimaryButton>}>
      <span className="range-context"><CalendarDays size={14} /> {dateRange === "all" ? "All time" : dateRange === "365" ? "This year" : `Last ${dateRange} days`}</span>
    </PageHeading>
    <section className="metrics-grid">
      <MetricCard label="TOTAL REVENUE" value={money(paidRevenue)} note={`${paidCount} invoices paid`} icon={Banknote} tone="indigo" />
      <MetricCard label="OUTSTANDING" value={money(outstanding)} note={`${rangeInvoices.filter(invoice => !["paid", "draft"].includes(invoiceStatus(invoice))).length} awaiting payment`} icon={ArrowDownLeft} tone="blue" />
      <MetricCard label="PAID INVOICES" value={String(paidCount)} note={rangeInvoices.length ? `${Math.round(paidCount / rangeInvoices.length * 100)}% of invoices in range` : "No invoices in this period"} icon={CheckCheck} tone="green" />
      <MetricCard label="OVERDUE" value={money(overdue)} note={`${rangeInvoices.filter(invoice => invoiceStatus(invoice) === "overdue").length} need your attention`} icon={Clock3} tone="amber" />
    </section>
    <section className="dashboard-grid">
      <Suspense fallback={<div className="skeleton skeleton-panel" />}><DashboardCharts revenueChart={revenueChart} statusCounts={statusCounts} totalInvoices={rangeInvoices.length} onNewInvoice={onNewInvoice} /></Suspense>
    </section>
    <section className="dashboard-bottom">
      <article className="panel recent-panel"><div className="panel-heading"><div><span className="panel-kicker">LATEST ACTIVITY</span><h2>Recent invoices</h2></div><button className="text-action" onClick={() => window.dispatchEvent(new CustomEvent("ledgerly:navigate", { detail: "invoices" }))}>View all <ArrowRight size={14} /></button></div>
        {rangeInvoices.length ? <InvoiceTable invoices={[...rangeInvoices].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)} onEdit={onEditInvoice} compact onDownload={onDownload} /> : <EmptyState icon={FileText} title="No invoices yet" message="Start with a polished invoice and keep the rest of your work in one place." action={<PrimaryButton onClick={onNewInvoice}>Create an invoice</PrimaryButton>} />}
      </article>
      <article className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">KEEP THINGS MOVING</span><h2>Payment reminders</h2></div><span className="reminder-count">{reminders.length}</span></div>
        {reminders.length ? <div className="reminder-list">{reminders.map(invoice => <button className="reminder-row" key={invoice.id} onClick={() => onEditInvoice(invoice)}><span className={`reminder-symbol ${invoiceStatus(invoice)}`}><Clock3 size={15} /></span><span className="reminder-main"><strong>{invoice.customer}</strong><small>{invoice.invoiceNumber || "Invoice"} · due {shortDate(invoice.dueDate)}</small></span><strong className="reminder-amount">{money(invoice.total - (invoice.amountPaid || 0), invoice.currency)}</strong><ChevronRight size={15} /></button>)}</div>
          : <EmptyState icon={CheckCheck} title="Nothing overdue" message="A quiet reminder list is a good sign. We’ll keep an eye on due dates here." />}
        <div className="activity-divider" /><div className="activity-label">RECENT PAYMENTS</div>
        {activity.length ? activity.slice(0, 3).map(payment => <div className="activity-row" key={payment.id}><span className="payment-avatar"><ArrowDownLeft size={15} /></span><span><strong>{payment.customer || "Customer payment"}</strong><small>{shortDate(payment.date)} · {payment.method || "Payment"}</small></span><b>+{money(payment.amount, payment.currency)}</b></div>) : <p className="quiet-note">Payments you record will show up here.</p>}
      </article>
    </section>
    {data.invoices.length === 0 && data.customers.length === 0 && data.estimates.length === 0 && data.products.length === 0 && data.payments.length === 0 && data.expenses.length === 0 && <section className="onboarding-banner"><div className="onboarding-icon"><BriefcaseBusiness size={19} /></div><div><strong>Make this workspace yours</strong><p>Add your business details and create an invoice, or try a realistic auto-shop sample with customers, payments, and expenses.</p></div><button className="button button-secondary" onClick={() => window.dispatchEvent(new CustomEvent("ledgerly:navigate", { detail: "settings" }))}>Set up business <ArrowRight size={14} /></button><button className="button button-demo" disabled={sampleLoading} onClick={onLoadSample}>{sampleLoading ? "Adding examples…" : "Load sample workspace"}</button></section>}
  </>;
}

function InvoiceTable({ invoices, onEdit, onDelete, onDownload, selected = [], setSelected, compact = false }) {
  const toggleAll = event => {
    if (event.target.checked) {
      setSelected([...new Set([...selected, ...invoices.map(invoice => invoice.id)])]);
    } else {
      setSelected(selected.filter(id => !invoices.some(invoice => invoice.id === id)));
    }
  };
  return <div className="table-scroll"><table className="data-table invoice-data-table"><thead><tr>
    {setSelected && <th className="check-column"><input type="checkbox" aria-label="Select all invoices" checked={invoices.length > 0 && invoices.every(invoice => selected.includes(invoice.id))} onChange={toggleAll} /></th>}
    <th>INVOICE</th><th>CUSTOMER</th>{!compact && <th>ISSUE DATE</th>}<th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th><th></th>
  </tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.id}>
    {setSelected && <td className="check-column"><input type="checkbox" aria-label={`Select ${invoice.invoiceNumber || "invoice"}`} checked={selected.includes(invoice.id)} onChange={event => setSelected(event.target.checked ? [...selected, invoice.id] : selected.filter(id => id !== invoice.id))} /></td>}
    <td><button className="invoice-number-link" onClick={() => onEdit(invoice)}>{invoice.invoiceNumber || `INV-${String(invoice.id).slice(0, 6).toUpperCase()}`}</button></td>
    <td><div className="table-customer"><span className="table-avatar">{initials(invoice.customer)}</span><span><strong>{invoice.customer}</strong><small>{invoice.type || "Business invoice"}</small></span></div></td>
    {!compact && <td>{shortDate(invoice.date)}</td>}<td>{shortDate(invoice.dueDate)}</td><td className="amount-cell">{money(invoice.total, invoice.currency)}</td><td><StatusBadge status={invoiceStatus(invoice)} /></td>
    <td><div className="row-actions"><button title="Download invoice PDF" aria-label="Download invoice PDF" onClick={() => onDownload(invoice)}><Download size={15} /></button><button title="Edit invoice" aria-label="Edit invoice" onClick={() => onEdit(invoice)}><MoreHorizontal size={17} /></button>{onDelete && <button title="Delete invoice" aria-label="Delete invoice" className="danger-action" onClick={() => onDelete("invoices", invoice.id)}><Trash2 size={15} /></button>}</div></td>
  </tr>)}</tbody></table></div>;
}

function InvoicesPage({ data, invoices, query, onNewInvoice, onEditInvoice, onDelete, onDownload, selected, setSelected, page, setPage, pageSize }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const filtered = invoices.filter(invoice => statusFilter === "all" || invoiceStatus(invoice) === statusFilter);
  const sorted = [...filtered].sort((a, b) => sortBy === "amount" ? Number(b.total) - Number(a.total) : sortBy === "oldest" ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date)));
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);
  const selectedIds = selected.filter(id => filtered.some(invoice => invoice.id === id));
  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected invoices? This cannot be undone.`)) return;
    for (const id of selectedIds) await onDelete("invoices", id);
    setSelected([]);
  };
  return <>
    <PageHeading eyebrow="BILLING" title="Invoices" subtitle="Create, track, and keep every customer invoice moving." action={<PrimaryButton onClick={onNewInvoice}>Create invoice</PrimaryButton>} />
    <div className="list-summary-row"><span><strong>{filtered.length}</strong> invoices <span className="summary-dot">·</span> {money(filtered.reduce((sum, invoice) => sum + Number(invoice.total), 0))} total value</span><span className="inline-search"><Search size={15} /><span>{query ? `Matching “${query}”` : "All workspace invoices"}</span></span></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="filter-control"><Filter size={15} /><select aria-label="Filter by payment status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option>{["paid", "pending", "overdue", "partial", "draft"].map(status => <option value={status} key={status}>{statusNames[status]}</option>)}</select></div><div className="toolbar-right">{selectedIds.length > 0 && <button className="button button-danger-soft" onClick={bulkDelete}><Trash2 size={15} /> Delete {selectedIds.length}</button>}<select className="sort-control" aria-label="Sort invoices" value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Highest amount</option></select><button className="icon-button quiet" aria-label="Refresh invoices" onClick={() => window.location.reload()}><SlidersHorizontal size={16} /></button></div></div>
      {visible.length ? <InvoiceTable invoices={visible} onEdit={onEditInvoice} onDelete={onDelete} onDownload={onDownload} selected={selectedIds} setSelected={setSelected} /> : <EmptyState icon={FileText} title={data.invoices.length ? "No invoices match this filter" : "Your invoices start here"} message={data.invoices.length ? "Try a different status or clear your search." : "Create a professional invoice and track the payment from sent to settled."} action={!data.invoices.length && <PrimaryButton onClick={onNewInvoice}>Create an invoice</PrimaryButton>} />}
      <div className="table-footer"><span>Showing {sorted.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} invoices</span><div className="pagination"><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft size={16} /></button><span>Page {page} of {pageCount}</span><button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}><ChevronRight size={16} /></button></div></div>
    </section>
  </>;
}

function CustomersPage({ data, customers, onAddRecord, onDelete }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const customerRecords = [...customers];
  data.invoices.forEach(invoice => {
    const alreadySaved = customerRecords.some(customer =>
      (invoice.customerId && customer.id === invoice.customerId) ||
      customer.name.toLowerCase() === invoice.customer.toLowerCase()
    );
    if (!alreadySaved) {
      customerRecords.push({
        id: `invoice-customer:${invoice.customer.toLowerCase()}`,
        name: invoice.customer,
        company: invoice.type || "",
        isDerived: true
      });
    }
  });
  const customerStats = customerRecords.map(customer => {
    const invoices = data.invoices.filter(invoice => invoice.customerId === customer.id || invoice.customer.toLowerCase() === customer.name.toLowerCase());
    const balance = invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amountPaid || (invoice.status === "paid" ? invoice.total : 0))), 0);
    return { ...customer, invoiceCount: invoices.length, totalInvoiced: invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0), balance };
  });
  return <>
    <PageHeading eyebrow="RELATIONSHIPS" title="Customers" subtitle="Know who you’re working with and what’s outstanding." action={<PrimaryButton onClick={() => onAddRecord("customers")}>Add customer</PrimaryButton>} />
    <div className="mini-stat-row"><div><span>ACTIVE CUSTOMERS</span><strong>{customerStats.length}</strong></div><div><span>INVOICED TO CUSTOMERS</span><strong>{money(customerStats.reduce((sum, item) => sum + item.totalInvoiced, 0))}</strong></div><div><span>OPEN BALANCES</span><strong>{money(customerStats.reduce((sum, item) => sum + item.balance, 0))}</strong></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2 className="toolbar-title">Your customers</h2><p>Customer details stay organized and ready for the next invoice.</p></div><span className="small-count">{customers.length} records</span></div>
      {customerStats.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>CUSTOMER</th><th>CONTACT</th><th>INVOICES</th><th>TOTAL INVOICED</th><th>OUTSTANDING</th><th></th></tr></thead><tbody>{customerStats.map(customer => <tr key={customer.id}><td><button className="customer-profile-link" onClick={() => setSelectedCustomer(customer)}><span className="table-avatar accent-avatar">{initials(customer.name)}</span><span><strong>{customer.name}</strong><small>{customer.company || "Individual customer"}</small></span></button></td><td><span className="contact-lines">{customer.email || "—"}<small>{customer.phone || ""}</small></span></td><td>{customer.invoiceCount}</td><td className="amount-cell">{money(customer.totalInvoiced)}</td><td className="amount-cell">{money(customer.balance)}</td><td><div className="row-actions"><button aria-label={`${customer.isDerived ? "Save profile for" : "Edit"} ${customer.name}`} onClick={() => onAddRecord("customers", customer.isDerived ? { name: customer.name, company: customer.company } : customer)}><MoreHorizontal size={17} /></button>{!customer.isDerived && <button className="danger-action" aria-label={`Delete ${customer.name}`} onClick={() => onDelete("customers", customer.id)}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="Build your customer book" message="Save customer details once and keep invoice history and balances together." action={<PrimaryButton onClick={() => onAddRecord("customers")}>Add a customer</PrimaryButton>} />}
    </section>
    {selectedCustomer && <CustomerProfile customer={selectedCustomer} data={data} onClose={() => setSelectedCustomer(null)} onEdit={() => { onAddRecord("customers", selectedCustomer.isDerived ? { name: selectedCustomer.name, company: selectedCustomer.company } : selectedCustomer); setSelectedCustomer(null); }} />}
  </>;
}

function CustomerProfile({ customer, data, onClose, onEdit }) {
  const invoices = data.invoices.filter(invoice => invoice.customerId === customer.id || invoice.customer.toLowerCase() === customer.name.toLowerCase());
  const invoiceIds = new Set(invoices.map(invoice => invoice.id));
  const activity = data.payments.filter(payment => invoiceIds.has(payment.invoiceId)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="customer-profile-modal modal-card" role="dialog" aria-modal="true" aria-labelledby="customer-profile-title"><header><div className="profile-identity"><span className="profile-avatar">{initials(customer.name)}</span><div><span className="panel-kicker">CUSTOMER PROFILE</span><h2 id="customer-profile-title">{customer.name}</h2><p>{customer.company || "Individual customer"}{customer.email ? ` · ${customer.email}` : ""}</p></div></div><div className="profile-actions"><button className="button button-secondary" onClick={onEdit}><MoreHorizontal size={15} /> Edit customer</button><button className="icon-button quiet" aria-label="Close customer profile" onClick={onClose}><X size={18} /></button></div></header><div className="profile-summary"><div><span>TOTAL INVOICED</span><strong>{money(customer.totalInvoiced)}</strong></div><div><span>OUTSTANDING</span><strong>{money(customer.balance)}</strong></div><div><span>INVOICES</span><strong>{customer.invoiceCount}</strong></div></div><div className="profile-content"><section><div className="profile-section-title"><h3>Invoice history</h3><span>{invoices.length}</span></div>{invoices.length ? <div className="profile-invoices">{invoices.map(invoice => <div key={invoice.id}><span className="profile-invoice-icon"><FileText size={15} /></span><span><strong>{invoice.invoiceNumber || "Invoice"}</strong><small>{shortDate(invoice.date)} · due {shortDate(invoice.dueDate)}</small></span><b>{money(invoice.total, invoice.currency)}</b><StatusBadge status={invoiceStatus(invoice)} /></div>)}</div> : <p className="profile-empty">Invoices for this customer will appear here.</p>}</section><section><div className="profile-section-title"><h3>Recent activity</h3><span>{activity.length}</span></div>{activity.length ? <div className="profile-timeline">{activity.slice(0, 6).map(payment => <div key={payment.id}><i /><span><strong>Payment received</strong><small>{shortDate(payment.date)} · {payment.method || "Payment"}</small></span><b>+{money(payment.amount, payment.currency)}</b></div>)}</div> : <p className="profile-empty">Payments and customer activity will show up here.</p>}</section></div></section></div>;
}

function RecordsPage({ type, title, subtitle, records, columns, onAddRecord, onDelete, onNewInvoice }) {
  const config = {
    estimates: { action: "Create estimate", icon: FilePlus2, recordLabel: "Estimate", emptyTitle: "Turn a conversation into a clear quote", emptyMessage: "Save estimates here, then convert accepted work into an invoice." },
    products: { action: "Add product", icon: Package, recordLabel: "Product", emptyTitle: "Build your service catalog", emptyMessage: "Add the work you do most often to create invoices faster and consistently." },
    expenses: { action: "Add expense", icon: Wallet, recordLabel: "Expense", emptyTitle: "Keep business spending in view", emptyMessage: "Record an expense to make your reports more useful." }
  }[type];
  const rowCells = record => {
    if (type === "estimates") return <><td><strong className="invoice-number">{record.number || `EST-${String(record.id).slice(0, 6).toUpperCase()}`}</strong></td><td>{record.customer}</td><td>{shortDate(record.date)}</td><td className="amount-cell">{money(record.total, record.currency)}</td><td><StatusBadge status={record.status || "draft"} /></td></>;
    if (type === "products") return <><td><div className="table-customer"><span className="table-avatar product-avatar"><Package size={15} /></span><span><strong>{record.name}</strong><small>{record.description || "Product or service"}</small></span></div></td><td>{record.category || "Service"}</td><td className="amount-cell">{money(record.price, record.currency)}</td><td>{Number(record.taxRate || 0)}%</td><td></td></>;
    return <><td><strong>{record.description}</strong><small className="table-secondary">{record.vendor || "No vendor"}</small></td><td>{record.category || "General"}</td><td>{shortDate(record.date)}</td><td className="amount-cell">{money(record.amount, record.currency)}</td><td></td></>;
  };
  return <>
    <PageHeading eyebrow={type === "estimates" ? "PRE-SALES" : type === "products" ? "CATALOG" : "OUTGOING"} title={title} subtitle={subtitle} action={<PrimaryButton icon={config.icon} onClick={() => onAddRecord(type)}>{config.action}</PrimaryButton>} />
    {type === "estimates" && <div className="mini-stat-row"><div><span>OPEN ESTIMATES</span><strong>{records.filter(record => !["accepted", "declined"].includes(record.status)).length}</strong></div><div><span>AWAITING CUSTOMER</span><strong>{records.filter(record => record.status === "sent").length}</strong></div><div><span>ESTIMATED VALUE</span><strong>{money(records.reduce((sum, record) => sum + Number(record.total || 0), 0))}</strong></div></div>}
    <section className="panel table-panel"><div className="table-toolbar"><div><h2 className="toolbar-title">{type === "estimates" ? "Your estimates" : type === "products" ? "Catalog" : "Expense records"}</h2><p>Changes are saved to your workspace.</p></div><span className="small-count">{records.length} records</span></div>
      {records.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(column => <th key={column}>{column.toUpperCase()}</th>)}<th></th></tr></thead><tbody>{records.map(record => <tr key={record.id}>{rowCells(record)}<td><div className="row-actions">{type === "estimates" && record.status === "accepted" && <button title="Create invoice from estimate" aria-label="Create invoice from estimate" onClick={() => onNewInvoice({ customer: record.customer, type: record.description || "", invoiceNumber: "", date: todayString(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), currency: record.currency || "USD", items: [{ name: record.description || "Approved work", qty: 1, price: record.total, taxRate: 8.5, discount: 0 }] })}><FilePlus2 size={15} /></button>}<button aria-label={`Edit ${config.recordLabel.toLowerCase()}`} onClick={() => onAddRecord(type, record)}><MoreHorizontal size={17} /></button><button className="danger-action" aria-label={`Delete ${config.recordLabel.toLowerCase()}`} onClick={() => onDelete(type, record.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={config.icon} title={config.emptyTitle} message={config.emptyMessage} action={<PrimaryButton icon={config.icon} onClick={() => onAddRecord(type)}>{config.action}</PrimaryButton>} />}
    </section>
  </>;
}

function PaymentsPage({ payments, invoices, onAddRecord, onDelete }) {
  const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return <>
    <PageHeading eyebrow="CASH IN" title="Payments" subtitle="A reliable record of money received and where it came from." action={<PrimaryButton icon={CreditCard} onClick={() => onAddRecord("payments")}>Record payment</PrimaryButton>} />
    <div className="mini-stat-row"><div><span>PAYMENTS RECORDED</span><strong>{payments.length}</strong></div><div><span>TOTAL RECEIVED</span><strong>{money(paidTotal)}</strong></div><div><span>PAYMENT METHODS</span><strong>{new Set(payments.map(payment => payment.method).filter(Boolean)).size}</strong></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2 className="toolbar-title">Payment history</h2><p>Match each payment to an invoice and transaction reference.</p></div></div>
      {payments.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>PAYMENT</th><th>INVOICE</th><th>PAYMENT DATE</th><th>METHOD</th><th>REFERENCE</th><th>AMOUNT</th><th>STATUS</th><th></th></tr></thead><tbody>{[...payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(payment => { const invoice = invoices.find(item => item.id === payment.invoiceId); return <tr key={payment.id}><td><span className="payment-id">PAY-{String(payment.id).slice(0, 6).toUpperCase()}</span></td><td>{invoice?.invoiceNumber || payment.invoiceNumber || "Invoice removed"}</td><td>{shortDate(payment.date)}</td><td><span className="method-chip"><CreditCard size={13} />{payment.method || "Other"}</span></td><td className="muted-mono">{payment.reference || "—"}</td><td className="amount-cell">{money(payment.amount, payment.currency)}</td><td><StatusBadge status={payment.status || "paid"} /></td><td><div className="row-actions"><button aria-label="Edit payment" onClick={() => onAddRecord("payments", payment)}><MoreHorizontal size={17} /></button><button className="danger-action" aria-label="Delete payment" onClick={() => onDelete("payments", payment.id)}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div> : <EmptyState icon={CreditCard} title="Record the money that comes in" message="Add a payment to build a trustworthy transaction history and keep invoice balances current." action={<PrimaryButton icon={CreditCard} onClick={() => onAddRecord("payments")}>Record a payment</PrimaryButton>} />}
    </section>
  </>;
}

function ReportsPage({ data }) {
  const paymentsByMonth = new Map();
  data.payments.forEach(payment => {
    const date = new Date(`${payment.date || ""}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      paymentsByMonth.set(key, (paymentsByMonth.get(key) || 0) + Number(payment.amount || 0));
    }
  });
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(new Date().getFullYear(), index, 1);
    return { month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date), revenue: paymentsByMonth.get(`${date.getFullYear()}-${date.getMonth()}`) || 0 };
  });
  const customerTotals = data.invoices.reduce((totals, invoice) => {
    totals[invoice.customer] = (totals[invoice.customer] || 0) + Number(invoice.total);
    return totals;
  }, {});
  const topCustomers = Object.entries(customerTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalPaid = data.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const open = data.invoices.filter(invoice => invoiceStatus(invoice) !== "paid").reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amountPaid || 0)), 0);
  const expenses = data.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return <>
    <PageHeading eyebrow="YOUR BUSINESS, IN CONTEXT" title="Reports" subtitle="A grounded view of the revenue, customers, and costs you’ve recorded." />
    <section className="metrics-grid report-metrics"><MetricCard label="REVENUE RECEIVED" value={money(totalPaid)} note={`${data.payments.length} recorded payments`} icon={Banknote} tone="indigo" /><MetricCard label="OUTSTANDING" value={money(open)} note="Open invoice balances" icon={ArrowDownLeft} tone="blue" /><MetricCard label="RECORDED EXPENSES" value={money(expenses)} note={`${data.expenses.length} business expenses`} icon={Wallet} tone="amber" /><MetricCard label="NET RECORDED" value={money(totalPaid - expenses)} note="Payments less recorded expenses" icon={BadgeDollarSign} tone="green" /></section>
    <section className="reports-grid"><article className="panel"><div className="panel-heading"><div><span className="panel-kicker">REVENUE TREND</span><h2>Monthly payments</h2><p>Recorded revenue by payment date</p></div></div><Suspense fallback={<div className="skeleton skeleton-panel" />}><MonthlyRevenueChart data={months} /></Suspense></article>
      <article className="panel top-customer-panel"><div className="panel-heading"><div><span className="panel-kicker">RELATIONSHIPS</span><h2>Top customers</h2><p>Ranked by invoice value</p></div></div>{topCustomers.length ? <div className="top-customer-list">{topCustomers.map(([name, amount], index) => <div className="top-customer-row" key={name}><span className="rank-number">0{index + 1}</span><span className="table-avatar">{initials(name)}</span><strong>{name}</strong><b>{money(amount)}</b></div>)}</div> : <EmptyState icon={Users} title="Customer insight grows here" message="Invoice activity will show who you work with most." />}</article></section>
  </>;
}

function SettingsPage({ data, onAddRecord, onSaveSettings }) {
  const [form, setForm] = useState({ businessName: "", ownerName: "", ownerEmail: "", phone: "", address: "", website: "", paymentInstructions: "", ...data.settings });
  useEffect(() => setForm(current => ({ ...current, ...data.settings })), [data.settings]);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const save = async event => {
    event.preventDefault();
    try { await onSaveSettings(form); }
    catch { /* The parent reports the API error. */ }
  };
  return <>
    <PageHeading eyebrow="WORKSPACE PREFERENCES" title="Settings" subtitle="Set the business details that appear on your invoices." />
    <div className="settings-layout"><form className="panel settings-form" onSubmit={save}><div className="panel-heading"><div><span className="panel-kicker">BUSINESS PROFILE</span><h2>Your business details</h2><p>These details are shown on new invoice previews.</p></div></div><div className="settings-fields"><Field label="Business or studio name" name="businessName" value={form.businessName} onChange={update} placeholder="e.g. Northline Workshop" /><Field label="Your name" name="ownerName" value={form.ownerName} onChange={update} placeholder="e.g. Jordan Davis" /><Field label="Business email" name="ownerEmail" type="email" value={form.ownerEmail} onChange={update} placeholder="you@business.com" /><Field label="Phone" name="phone" value={form.phone} onChange={update} placeholder="+1 (555) 000-0000" /><Field label="Website" name="website" value={form.website} onChange={update} placeholder="yourbusiness.com" /><Field label="Business address" name="address" value={form.address} onChange={update} placeholder="Street, city, region, postal code" wide /><label className="field wide"><span>Payment instructions</span><textarea name="paymentInstructions" value={form.paymentInstructions} onChange={update} rows="3" placeholder="How should customers pay you?" /></label></div><div className="form-footer"><span className="safe-note"><ShieldCheck size={15} /> Saved to your private workspace</span><button className="button button-primary" type="submit"><Check size={16} /> Save changes</button></div></form><aside className="settings-aside"><div className="settings-callout"><span className="callout-icon"><ShieldCheck size={17} /></span><h3>Private by design</h3><p>This workspace is protected by your server’s access key. Business details and financial records remain in its SQLite database.</p></div><div className="settings-callout"><span className="callout-icon blue"><CreditCard size={17} /></span><h3>Record payments</h3><p>Payments are recorded manually. Invoice reminders and totals are based on the payment details in this workspace.</p><button className="text-action" onClick={() => onAddRecord("payments")}>Add a payment <ArrowRight size={14} /></button></div></aside></div>
  </>;
}

function Field({ label, name, value, onChange, placeholder, type = "text", wide }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span><input name={name} type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} /></label>;
}

function InvoiceEditor({ invoice, data, onClose, onSave, onDownload, onPreview }) {
  const editing = Boolean(invoice.id);
  const [form, setForm] = useState(() => ({
    ...invoice,
    customer: invoice.customer || "",
    type: invoice.type || data.settings.businessName || "",
    invoiceNumber: invoice.invoiceNumber || `INV-${new Date().getFullYear()}-${String(data.invoices.length + 1).padStart(4, "0")}`,
    date: invoice.date || todayString(),
    dueDate: invoice.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: invoice.currency || "USD",
    terms: invoice.terms || "Net 30",
    notes: invoice.notes || "",
    items: invoice.items?.length ? invoice.items : [{ name: "", qty: 1, price: 0, taxRate: 8.5, discount: 0 }],
    status: invoice.status || "draft"
  }));
  const [saving, setSaving] = useState(false);
  const previewRef = useRef(null);
  const subtotal = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const tax = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0) * Number(item.taxRate ?? 8.5) / 100, 0);
  const itemDiscount = form.items.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  const discount = Number(form.discount || 0) + itemDiscount;
  const total = Math.max(0, subtotal + tax - discount);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const updateItem = (index, key, value) => setForm(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const save = async status => {
    if (!form.customer.trim() || !form.type.trim() || form.items.some(item => !item.name.trim() || Number(item.qty) <= 0 || Number(item.price) < 0)) return;
    setSaving(true);
    try {
      await onSave({ ...form, status, subtotal: Number(subtotal.toFixed(2)), tax: Number(tax.toFixed(2)), discount: Number(discount.toFixed(2)), total: Number(total.toFixed(2)) });
    } catch { /* The global toast reports the API error; keep the editor open for correction. */ }
    finally { setSaving(false); }
  };
  const download = () => onDownload({ ...form, total, subtotal, tax, discount, id: invoice.id || "draft" });
  return <div className="modal-backdrop editor-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="invoice-editor modal-card" role="dialog" aria-modal="true" aria-labelledby="invoice-editor-title">
      <header className="editor-header"><div className="editor-title"><button className="icon-button quiet" aria-label="Close editor" onClick={onClose}><ArrowLeft size={17} /></button><div><span className="panel-kicker">{editing ? "EDIT INVOICE" : "NEW DOCUMENT"}</span><h2 id="invoice-editor-title">{editing ? `Edit ${form.invoiceNumber}` : "Create an invoice"}</h2></div></div><div className="editor-header-actions"><StatusBadge status={invoiceStatus({ ...form, total, amountPaid: invoice.amountPaid || 0 })} /><button className="icon-button quiet" aria-label="Close editor" onClick={onClose}><X size={18} /></button></div></header>
      <div className="editor-body"><div className="editor-form-column">
        <section className="editor-section"><div className="editor-section-title"><span className="step-marker">01</span><div><h3>Invoice details</h3><p>Set the timing and customer for this invoice.</p></div></div>
          <div className="editor-fields"><label className="field"><span>Customer <b>*</b></span><input list="customer-list" value={form.customer} onChange={event => { const match = data.customers.find(customer => customer.name === event.target.value); setForm(current => ({ ...current, customer: event.target.value, customerId: match?.id || "" })); }} placeholder="Choose or enter a customer" /><datalist id="customer-list">{data.customers.map(customer => <option key={customer.id} value={customer.name}>{customer.company}</option>)}</datalist></label><Field label="Business / service" value={form.type} onChange={event => update("type", event.target.value)} placeholder="e.g. Studio North" /><Field label="Invoice number" value={form.invoiceNumber} onChange={event => update("invoiceNumber", event.target.value)} /><label className="field"><span>Currency</span><select value={form.currency} onChange={event => update("currency", event.target.value)}>{currencyOptions.map(currency => <option key={currency}>{currency}</option>)}</select></label><Field label="Issue date" type="date" value={form.date} onChange={event => update("date", event.target.value)} /><Field label="Due date" type="date" value={form.dueDate} onChange={event => update("dueDate", event.target.value)} /><label className="field"><span>Payment terms</span><select value={form.terms} onChange={event => update("terms", event.target.value)}>{["Due on receipt", "Net 7", "Net 14", "Net 30", "Net 60", "Custom"].map(term => <option key={term}>{term}</option>)}</select></label><Field label="PO / reference (optional)" value={form.reference || ""} onChange={event => update("reference", event.target.value)} placeholder="Customer reference" /></div>
        </section>
        <section className="editor-section items-editor-section"><div className="editor-section-title"><span className="step-marker">02</span><div><h3>Line items</h3><p>Clear descriptions make payment easier.</p></div></div>
          <div className="items-editor"><div className="item-editor-head"><span>DESCRIPTION</span><span>QTY</span><span>RATE</span><span>TAX</span><span></span></div>{form.items.map((item, index) => <div className="item-editor-row" key={index}><input aria-label="Item description" value={item.name} onChange={event => updateItem(index, "name", event.target.value)} placeholder="e.g. Brand identity design" /><input aria-label="Quantity" type="number" min="0.01" step="any" value={item.qty} onChange={event => updateItem(index, "qty", event.target.value)} /><div className="price-input"><span>{form.currency === "USD" ? "$" : form.currency}</span><input aria-label="Unit price" type="number" min="0" step="0.01" value={item.price} onChange={event => updateItem(index, "price", event.target.value)} /></div><div className="tax-input"><input aria-label="Tax rate percentage" type="number" min="0" max="100" step="0.1" value={item.taxRate ?? 8.5} onChange={event => updateItem(index, "taxRate", event.target.value)} /><span>%</span></div><button className="icon-button delete-line" aria-label="Remove line item" disabled={form.items.length === 1} onClick={() => update("items", form.items.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>)}</div>
          <button className="add-line-button" onClick={() => update("items", [...form.items, { name: "", qty: 1, price: 0, taxRate: 8.5, discount: 0 }])}><Plus size={15} /> Add a line item</button>
          <div className="editor-discount"><Field label="Invoice discount" type="number" value={form.discount || 0} onChange={event => update("discount", event.target.value)} /><span>Applied after item tax</span></div>
        </section>
        <section className="editor-section"><label className="field"><span>Notes for your customer</span><textarea value={form.notes} onChange={event => update("notes", event.target.value)} rows="3" placeholder="A short thank-you, project note, or payment detail." /></label></section>
      </div>
      <aside className="editor-preview-column"><div className="preview-heading"><div><span className="panel-kicker">LIVE PREVIEW</span><h3>Invoice document</h3></div><button className="icon-button quiet" aria-label="Expand preview" onClick={() => onPreview({ ...form, total, subtotal, tax, discount, id: invoice.id || "draft" })}><ArrowUpRight size={16} /></button></div>
        <InvoicePaper ref={previewRef} invoice={{ ...form, total, subtotal, tax, discount, id: invoice.id || "draft" }} settings={data.settings} />
        <div className="totals-inline"><div><span>Subtotal</span><b>{money(subtotal, form.currency)}</b></div><div><span>Tax</span><b>{money(tax, form.currency)}</b></div>{discount > 0 && <div><span>Discount</span><b>−{money(discount, form.currency)}</b></div>}<div className="total-due"><span>Total due</span><b>{money(total, form.currency)}</b></div></div>
        <p className="preview-security"><ShieldCheck size={14} /> Your invoice saves to your private workspace.</p>
      </aside></div>
      <footer className="editor-footer"><div className="editor-footer-left"><button className="button button-secondary" onClick={download}><Download size={15} /> Download PDF</button><button className="button button-quiet" onClick={() => onPreview({ ...form, total, subtotal, tax, discount, id: invoice.id || "draft" })}>Preview</button></div><div className="editor-footer-right"><button className="button button-secondary" disabled={saving} onClick={() => save("draft")}>Save as draft</button><button className="button button-primary" disabled={saving} onClick={() => save("sent")}><ArrowRight size={15} />{saving ? "Saving…" : "Save & mark sent"}</button></div></footer>
    </section>
  </div>;
}

const InvoicePaper = React.forwardRef(function InvoicePaper({ invoice, settings }, ref) {
  return <article ref={ref} id={`invoice-paper-${invoice.id || "draft"}`} className="invoice-paper"><div className="paper-top"><span className="paper-brand"><span className="brand-mark small">L</span>{settings.businessName || invoice.type || "Your business"}</span><span className="paper-label">INVOICE</span></div><div className="paper-invoice-meta"><div><h2>{invoice.invoiceNumber || "INV-0001"}</h2><span>Issue date · {shortDate(invoice.date)}</span></div><div className="paper-due"><span>AMOUNT DUE</span><strong>{money(invoice.total, invoice.currency)}</strong><small>Due {shortDate(invoice.dueDate)}</small></div></div><div className="paper-parties"><div><span>FROM</span><strong>{settings.businessName || invoice.type || "Your business"}</strong><p>{settings.address || "Business address"}</p><p>{settings.ownerEmail || settings.phone || "Contact details"}</p></div><div><span>BILL TO</span><strong>{invoice.customer || "Customer name"}</strong><p>{invoice.customerId ? settings.customerAddress || "" : "Customer address"}</p><p>{invoice.terms || "Net 30"} payment terms</p></div></div><div className="paper-line-items"><div className="paper-items-head"><span>DESCRIPTION</span><span>QTY</span><span>RATE</span><span>AMOUNT</span></div>{invoice.items.map((item, index) => <div className="paper-item" key={index}><span>{item.name || "New line item"}</span><span>{item.qty || 0}</span><span>{money(item.price, invoice.currency)}</span><strong>{money(Number(item.qty || 0) * Number(item.price || 0), invoice.currency)}</strong></div>)}</div><div className="paper-summary"><div><span>Subtotal</span><b>{money(invoice.subtotal, invoice.currency)}</b></div><div><span>Tax</span><b>{money(invoice.tax, invoice.currency)}</b></div>{invoice.discount > 0 && <div><span>Discount</span><b>−{money(invoice.discount, invoice.currency)}</b></div>}<div className="paper-grand-total"><span>Total due</span><strong>{money(invoice.total, invoice.currency)}</strong></div></div><div className="paper-thanks"><strong>Thank you for your business.</strong><p>{invoice.notes || settings.paymentInstructions || "Please reach out if you have any questions about this invoice."}</p></div></article>;
});

function PreviewModal({ invoice, settings, onClose, onDownload }) {
  return <div className="modal-backdrop preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="preview-modal modal-card" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header className="preview-modal-head"><div><span className="panel-kicker">DOCUMENT PREVIEW</span><h2 id="preview-title">A clear invoice, ready to share.</h2></div><div><button className="button button-secondary" onClick={() => onDownload(invoice)}><Download size={15} /> Download PDF</button><button className="icon-button quiet" aria-label="Close preview" onClick={onClose}><X size={18} /></button></div></header><div className="preview-modal-paper"><InvoicePaper invoice={invoice} settings={settings} /></div></section></div>;
}

function RecordEditor({ type, record, data, onClose, onSave }) {
  const editing = Boolean(record.id);
  const [form, setForm] = useState(() => ({ date: todayString(), currency: "USD", status: "draft", ...record }));
  const [saving, setSaving] = useState(false);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const labels = { customers: ["Customer", "Add useful details once; keep them ready for the next invoice."], estimates: ["Estimate", "A clear scope and amount makes a better conversation."], products: ["Product or service", "Save common line items with consistent pricing."], expenses: ["Expense", "Record a business cost with the date and category."], payments: ["Payment", "Match money received to an invoice and transaction reference."] }[type];
  const fields = {
    customers: <><Field label="Customer name *" name="name" value={form.name} onChange={update} placeholder="e.g. Jordan Lee" /><Field label="Company" name="company" value={form.company} onChange={update} placeholder="Company name" /><Field label="Email" name="email" type="email" value={form.email} onChange={update} placeholder="jordan@company.com" /><Field label="Phone" name="phone" value={form.phone} onChange={update} placeholder="+1 (555) 000-0000" /><Field label="Billing address" name="address" value={form.address} onChange={update} placeholder="Street, city, region, postal code" wide /></>,
    estimates: <><Field label="Estimate number" name="number" value={form.number} onChange={update} placeholder="EST-2025-0001" /><Field label="Customer *" name="customer" value={form.customer} onChange={update} placeholder="Customer name" /><Field label="Estimate date" name="date" type="date" value={form.date} onChange={update} /><Field label="Valid until" name="validUntil" type="date" value={form.validUntil} onChange={update} /><Field label="Amount *" name="total" type="number" value={form.total} onChange={update} placeholder="0.00" /><label className="field"><span>Status</span><select name="status" value={form.status} onChange={update}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></label><Field label="Description" name="description" value={form.description} onChange={update} placeholder="Scope or work summary" wide /></>,
    products: <><Field label="Product / service name *" name="name" value={form.name} onChange={update} placeholder="e.g. Brake inspection" /><Field label="Category" name="category" value={form.category} onChange={update} placeholder="Service" /><Field label="Unit price *" name="price" type="number" value={form.price} onChange={update} placeholder="0.00" /><Field label="Tax rate (%)" name="taxRate" type="number" value={form.taxRate ?? 8.5} onChange={update} /><Field label="Description" name="description" value={form.description} onChange={update} placeholder="A brief line item description" wide /></>,
    expenses: <><Field label="Description *" name="description" value={form.description} onChange={update} placeholder="e.g. Replacement parts" /><Field label="Vendor" name="vendor" value={form.vendor} onChange={update} placeholder="Supplier or merchant" /><Field label="Amount *" name="amount" type="number" value={form.amount} onChange={update} placeholder="0.00" /><Field label="Date" name="date" type="date" value={form.date} onChange={update} /><Field label="Category" name="category" value={form.category} onChange={update} placeholder="Materials, travel…" wide /></>,
    payments: <><label className="field wide"><span>Invoice *</span><select name="invoiceId" value={form.invoiceId || ""} onChange={event => { const invoice = data.invoices.find(item => item.id === event.target.value); setForm(current => ({ ...current, invoiceId: event.target.value, customer: invoice?.customer || "", currency: invoice?.currency || "USD", amount: invoice ? Math.max(0, invoice.total - (invoice.amountPaid || 0)) : current.amount })); }}><option value="">Choose an invoice</option>{data.invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber || "Invoice"} · {invoice.customer} · {money(invoice.total, invoice.currency)}</option>)}</select></label><Field label="Amount received *" name="amount" type="number" value={form.amount} onChange={update} placeholder="0.00" /><Field label="Payment date" name="date" type="date" value={form.date} onChange={update} /><label className="field"><span>Payment method</span><select name="method" value={form.method || "Bank transfer"} onChange={update}>{["Bank transfer", "Credit card", "Cash", "Check", "Other"].map(method => <option key={method}>{method}</option>)}</select></label><Field label="Transaction reference" name="reference" value={form.reference} onChange={update} placeholder="Receipt or transaction ID" wide /></>
  }[type];
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    try { await onSave(form); }
    catch { /* The parent reports the API error. */ }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><form className="record-modal modal-card" onSubmit={submit} role="dialog" aria-modal="true"><header className="record-modal-header"><div><span className="panel-kicker">{editing ? "EDIT RECORD" : "ADD TO WORKSPACE"}</span><h2>{editing ? `Edit ${labels[0].toLowerCase()}` : `Add ${labels[0].toLowerCase()}`}</h2><p>{labels[1]}</p></div><button type="button" className="icon-button quiet" aria-label="Close" onClick={onClose}><X size={18} /></button></header><div className="record-form-grid">{fields}</div><footer className="record-modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || (type === "payments" && data.invoices.length === 0)}><Check size={15} />{saving ? "Saving…" : editing ? "Save changes" : `Save ${labels[0].toLowerCase()}`}</button></footer></form></div>;
}
