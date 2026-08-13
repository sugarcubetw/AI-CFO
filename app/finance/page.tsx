"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Expense = { id: string; transactionDate: string; category: string; item: string; amount: number; paymentMethod: string; vendor: string; note: string; receiptFileName?: string; syncClientId: string; synced: boolean };
const key = "fangtang-finance-expenses-v1";
const categories = ["人事", "房務", "食材", "公共營運", "行銷平台", "訂閱服務", "貸款", "其他"];
const methods = ["現金", "銀行轉帳", "信用卡", "LINE Pay", "其他"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function loadLocal(): Expense[] { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as Expense[]; } catch { return []; } }
function saveLocal(rows: Expense[]) { localStorage.setItem(key, JSON.stringify(rows)); }

export default function FinancePage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [form, setForm] = useState({ transactionDate: today, category: "食材", item: "", amount: "", paymentMethod: "現金", vendor: "", note: "" });
  const sync = useCallback(async (current: Expense[]) => {
    if (!navigator.onLine) return;
    const pending = current.filter((row) => !row.synced);
    if (!pending.length) return;
    let next = [...current];
    for (const row of pending) {
      try {
        const response = await fetch("/api/finance/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...row, source: "finance-pwa" }) });
        if (!response.ok) continue;
        next = next.map((item) => item.syncClientId === row.syncClientId ? { ...item, synced: true } : item);
      } catch { break; }
    }
    setRows(next); saveLocal(next);
    setMessage(next.some((row) => !row.synced) ? "部分資料待同步" : "已同步至雲端");
  }, []);
  useEffect(() => { const current = loadLocal(); setRows(current); setOnline(navigator.onLine); void sync(current); const onOnline = () => { setOnline(true); void sync(loadLocal()); }; const onOffline = () => setOnline(false); window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline); return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); }; }, [sync]);
  function submit(event: FormEvent) { event.preventDefault(); const amount = Number(form.amount); if (!form.item || !Number.isFinite(amount) || amount <= 0) { setMessage("請填寫費用細項與正確金額"); return; } const row: Expense = { id: `local-${crypto.randomUUID()}`, ...form, amount, receiptFileName: receipt?.name, syncClientId: crypto.randomUUID(), synced: false }; const next = [row, ...rows]; setRows(next); saveLocal(next); setForm({ ...form, item: "", amount: "", vendor: "", note: "" }); setReceipt(null); setMessage(navigator.onLine ? "已加入同步佇列" : "已離線儲存，恢復網路後自動同步"); void sync(next); }
  const pending = rows.filter((row) => !row.synced).length;
  return <main className="finance-app"><header className="finance-header"><div><p>方糖民宿</p><h1>財務費用</h1></div><span className={online ? "online" : "offline"}>{online ? "已連線" : "離線"}</span></header><section className="finance-status"><strong>{pending}</strong><span>筆待同步</span><small>{message || "資料會先保存在手機"}</small></section><form className="finance-form" onSubmit={submit}><h2>快速記一筆費用</h2><label>日期<input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} /></label><label>費用大類<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>費用細項<input placeholder="例如：雞蛋、洗衣、電費" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></label><label>金額<input inputMode="decimal" type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label>付款方式<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label><label>供應商（選填）<input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label><label>備註（選填）<textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label><label className="receipt-input">收據照片（選填）<input type="file" accept="image/*" capture="environment" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} /></label><p className="finance-note">照片目前只保留檔名；AI 辨識會在下一階段加入，辨識結果必須人工確認後才入帳。</p><button className="primary" type="submit">儲存費用</button></form><section className="finance-list"><h2>最近輸入</h2>{rows.slice(0, 20).map((row) => <article className="expense-row" key={row.syncClientId}><div><strong>{row.item}</strong><small>{row.transactionDate} · {row.category} · {row.paymentMethod}</small></div><b>NT$ {row.amount.toLocaleString("zh-TW")}</b><em className={row.synced ? "synced" : "pending"}>{row.synced ? "已同步" : "待同步"}</em></article>)}{!rows.length && <p className="finance-note">尚未輸入費用。</p>}</section></main>;
}
