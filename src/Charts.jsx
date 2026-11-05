import React from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { Activity, ArrowUpRight, ArrowRight } from "lucide-react";
import { money } from "./format.js";

const palette = { paid: "#16a34a", pending: "#3b82f6", partial: "#f59e0b", overdue: "#ef4444", draft: "#94a3b8" };

function axisLabel(value) {
  return value >= 1000 ? `$${value / 1000}k` : `$${value}`;
}

function ChartEmpty({ onNewInvoice }) {
  return <div className="chart-empty"><span><Activity size={18} /></span><strong>Your cash flow, at a glance</strong><p>Invoice and payment activity will shape this chart as your business grows.</p><button className="text-action" onClick={onNewInvoice}>Create your first invoice <ArrowRight size={14} /></button></div>;
}

export function DashboardCharts({ revenueChart, statusCounts, totalInvoices, onNewInvoice }) {
  return <>
    <article className="panel revenue-panel">
      <div className="panel-heading"><div><span className="panel-kicker">CASH FLOW</span><h2>Revenue overview</h2><p>Payments received over the last six months</p></div><span className="chart-legend"><i /> Collected</span></div>
      {revenueChart.some(item => item.revenue > 0) ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenueChart} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}><defs><linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#635bff" stopOpacity={0.22} /><stop offset="100%" stopColor="#635bff" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef0f5" strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#98a0b3" }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#a2a9b8" }} tickFormatter={axisLabel} /><Tooltip formatter={value => money(value)} contentStyle={{ border: "1px solid #e8eaf1", borderRadius: 10, boxShadow: "0 8px 26px #1a20400c" }} /><Area type="monotone" dataKey="revenue" stroke="#635bff" strokeWidth={2.5} fill="url(#revenueGradient)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 3 }} /></AreaChart></ResponsiveContainer></div> : <ChartEmpty onNewInvoice={onNewInvoice} />}
    </article>
    <article className="panel status-panel">
      <div className="panel-heading"><div><span className="panel-kicker">INVOICE HEALTH</span><h2>Payment status</h2><p>Invoices by current status</p></div><button className="icon-button quiet" aria-label="View all invoices" onClick={() => window.dispatchEvent(new CustomEvent("ledgerly:navigate", { detail: "invoices" }))}><ArrowUpRight size={16} /></button></div>
      {statusCounts.length ? <div className="donut-wrap"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius={56} outerRadius={76} paddingAngle={4} stroke="none">{statusCounts.map(entry => <Cell key={entry.name} fill={palette[entry.status]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{totalInvoices}</strong><span>invoices</span></div></div><div className="donut-legend">{statusCounts.map(item => <div key={item.name}><i style={{ backgroundColor: palette[item.status] }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}</div></div> : <ChartEmpty onNewInvoice={onNewInvoice} />}
    </article>
  </>;
}

export function MonthlyRevenueChart({ data }) {
  return <div className="chart-area report-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}><defs><linearGradient id="reportGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef0f5" strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#98a0b3" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#a2a9b8" }} tickFormatter={axisLabel} /><Tooltip formatter={value => money(value)} /><Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#reportGradient)" /></AreaChart></ResponsiveContainer></div>;
}
