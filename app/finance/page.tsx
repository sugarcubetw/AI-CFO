"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Expense = { id: string; transactionDate: string; category: string; item: string; amount: number; paymentMethod: string; vendor: string; note: string; receiptFileName?: string; syncClientId: string; synced: boolean };
const key = "fangtang-finance-expenses-v1";
const defaultCategories = ["人事", "房務", "食材", "公共營運", "行銷平台", "訂閱服務", "貸款", "其他"];
const methods = ["現金", "銀行轉帳", "信用卡", "LINE Pay", "其他"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function loadLocal(): Expense[] { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as Expense[]; } catch { return []; } }
function saveLocal(rows: Expense[]) { localStorage.setItem(key, JSON.stringify(rows)); }

export default function FinancePage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [categories, setCategories] = useState(defaultCategories);
  const [newCategory, setNewCategory] = useState("");
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [queryFrom, setQueryFrom] = useState(today.slice(0, 8) + "01");
  const [queryTo, setQueryTo] = useState(today);
  const [queryCategory, setQueryCategory] = useState("全部");
  const [summaryMonth, setSummaryMonth] = useState(today.slice(0, 7));
  const [form, setForm] = useState({ transactionDate: today, category: "食材", item: "", amount: "", paymentMethod: "現金", vendor: "", note: "" });

  const sync = useCallback(async (current: Expense[]) => {
    if (!navigator.onLine) return;
    let next = [...current];
    for (const row of current.filter((item) => !item.synced)) {
      try {
        const response = await fetch("/api/finance/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...row, source: "finance-pwa" }) });
        if (response.ok) next = next.map((item) => item.syncClientId === row.syncClientId ? { ...item, synced: true } : item);
      } catch { break; }
    }
    setRows(next); saveLocal(next);
    if (current.some((item) => !item.synced)) setMessage(next.some((item) => !item.synced) ? "部分資料待同步" : "已同步至雲端");
  }, []);

  useEffect(() => {
    const current = loadLocal();
    setRows(current); setOnline(navigator.onLine); void sync(current);
    const onOnline = () => { setOnline(true); void sync(loadLocal()); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [sync]);

  function addCategory() {
    const value = newCategory.trim();
    if (!value || categories.includes(value)) return;
    setCategories((current) => [...current, value]);
    setForm((current) => ({ ...current, category: value }));
    setNewCategory("");
    setMessage(`已新增類別：${value}`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.item || !Number.isFinite(amount) || amount <= 0) { setMessage("請填寫費用細項與正確金額"); return; }
    const row: Expense = { id: `local-${crypto.randomUUID()}`, ...form, amount, receiptFileName: receipt?.name, syncClientId: crypto.randomUUID(), synced: false };
    const next = [row, ...rows]; setRows(next); saveLocal(next);
    setForm({ ...form, item: "", amount: "", vendor: "", note: "" }); setReceipt(null);
    setMessage(navigator.onLine ? "已加入同步佇列" : "已離線儲存，恢復網路後自動同步");
    void sync(next);
  }

  const filteredRows = useMemo(() => rows.filter((row) => row.transactionDate >= queryFrom && row.transactionDate <= queryTo && (queryCategory === "全部" || row.category === queryCategory)), [rows, queryFrom, queryTo, queryCategory]);
  const total = filteredRows.reduce((sum, row) => sum + row.amount, 0);
  const byCategory = useMemo(() => categories.map((category) => ({ category, amount: filteredRows.filter((row) => row.category === category).reduce((sum, row) => sum + row.amount, 0) })).filter((item) => item.amount > 0), [categories, filteredRows]);
  const byItem = useMemo(() => Object.entries(filteredRows.reduce<Record<string, number>>((result, row) => { result[row.item] = (result[row.item] ?? 0) + row.amount; return result; }, {})).map(([item, amount]) => ({ item, amount })).sort((a, b) => b.amount - a.amount), [filteredRows]);
  const largestItem = byItem[0];
  const pending = rows.filter((row) => !row.synced).length;
  const monthlyRows = useMemo(() => rows.filter((row) => row.transactionDate.startsWith(summaryMonth)), [rows, summaryMonth]);
  const monthlyTotal = monthlyRows.reduce((sum, row) => sum + row.amount, 0);
  const monthlyByCategory = useMemo(() => Object.entries(monthlyRows.reduce<Record<string, number>>((result, row) => { result[row.category] = (result[row.category] ?? 0) + row.amount; return result; }, {})).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount), [monthlyRows]);
  const monthlyByItem = useMemo(() => Object.entries(monthlyRows.reduce<Record<string, number>>((result, row) => { result[row.item] = (result[row.item] ?? 0) + row.amount; return result; }, {})).map(([item, amount]) => ({ item, amount })).sort((a, b) => b.amount - a.amount), [monthlyRows]);
  const monthlyTopCategory = monthlyByCategory[0];
  const monthlyTopItem = monthlyByItem[0];

  return <main className="finance-app">
    <header className="finance-header"><div><p>方糖民宿</p><h1>支出記帳</h1></div><span className={online ? "online" : "offline"}>{online ? "已連線" : "離線"}</span></header>
    <section className="finance-status"><strong>{pending}</strong><span>筆待同步</span><small>{message || "資料會先保存在手機"}</small></section><section className="finance-query monthly-summary"><h2>月結總結與 AI 分析</h2><label>結算月份<input type="month" value={summaryMonth} onChange={(e) => setSummaryMonth(e.target.value)} /></label><div className="finance-stats"><div><small>當月總支出</small><strong>NT$ {monthlyTotal.toLocaleString("zh-TW")}</strong></div><div><small>交易筆數</small><strong>{monthlyRows.length} 筆</strong></div></div>{monthlyTopCategory && <p className="finance-ai-note">本月主要支出類別為「{monthlyTopCategory.category}」，共 NT$ {monthlyTopCategory.amount.toLocaleString("zh-TW")}；最高細項為「{monthlyTopItem?.item ?? "—"}」。正式 AI 月報將再分析前月差異、異常增加與成本建議。</p>}</section>
    <section className="finance-query"><h2>費用查詢及統計</h2><div className="two-columns"><label>起日<input type="date" value={queryFrom} onChange={(e) => setQueryFrom(e.target.value)} /></label><label>迄日<input type="date" value={queryTo} onChange={(e) => setQueryTo(e.target.value)} /></label></div><label>費用類別<select value={queryCategory} onChange={(e) => setQueryCategory(e.target.value)}><option>全部</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><div className="finance-stats"><div><small>期間支出</small><strong>NT$ {total.toLocaleString("zh-TW")}</strong></div><div><small>筆數</small><strong>{filteredRows.length} 筆</strong></div></div><h3 className="finance-breakdown-title">大類明細</h3>{byCategory.map((item) => <div className="finance-category-stat" key={item.category}><span>{item.category}</span><strong>NT$ {item.amount.toLocaleString("zh-TW")}</strong></div>)}<h3 className="finance-breakdown-title">細項成本排行</h3>{byItem.slice(0, 10).map((item) => <div className="finance-category-stat" key={item.item}><span>{item.item}</span><strong>NT$ {item.amount.toLocaleString("zh-TW")}</strong></div>)}{largestItem && <p className="finance-ai-note">目前範圍內支出最高的細項是「{largestItem.item}」，共 NT$ {largestItem.amount.toLocaleString("zh-TW")}。AI 分析將以這些明細進一步判斷成本異常與變化原因。</p>}</section>
    <form className="finance-form" onSubmit={submit}><h2>快速記一筆支出</h2><label>日期<input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} /></label><label>費用大類<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><div className="category-create"><input aria-label="新增支出類別" placeholder="輸入新類別" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /><button type="button" onClick={addCategory}>新增類別</button></div><label>費用細項<input placeholder="例如：雞蛋、洗衣、電費" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></label><label>金額<input inputMode="decimal" type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label>付款方式<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label><label>供應商（選填）<input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label><label>備註（選填）<textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label><label className="receipt-input">收據照片（選填）<input type="file" accept="image/*" capture="environment" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} /></label><p className="finance-note">照片目前只保留檔名；AI 辨識會建立待確認草稿，不會直接入帳。</p><button className="primary" type="submit">儲存支出</button></form>
    <section className="finance-list"><h2>查詢結果</h2>{filteredRows.slice(0, 50).map((row) => <article className="expense-row" key={row.syncClientId}><div><strong>{row.item}</strong><small>{row.transactionDate} · {row.category} · {row.paymentMethod}</small></div><b>NT$ {row.amount.toLocaleString("zh-TW")}</b><em className={row.synced ? "synced" : "pending"}>{row.synced ? "已同步" : "待同步"}</em></article>)}{!filteredRows.length && <p className="finance-note">此期間尚無支出。</p>}</section>
  </main>;
}
