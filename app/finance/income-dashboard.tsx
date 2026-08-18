"use client";

import { useEffect, useMemo, useState } from "react";

type DailyIncome = { date: string; realized: number; unrealized: number; total: number; rooms: number };
type RoomIncome = { roomNumber: string; roomType: string; nights: number; realized: number; unrealized: number; total: number };
type IncomeOrder = { id: string; sourceChannel: string; guestName: string; arrivalDate: string; departureDate: string; roomNumber: string | null; roomType: string; allocation: number; realized: number; unrealized: number; nights: number; createdAt: string };
type IncomeData = {
  revenue: { expected: number; realized: number; unrealized: number; orderCount: number };
  expenses: number;
  daily: DailyIncome[];
  rooms: RoomIncome[];
  orders: IncomeOrder[];
};
type RangeMode = "7d" | "14d" | "month" | "quarter" | "custom";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (value: number) => `NT$ ${Math.round(value).toLocaleString("zh-TW")}`;

function utc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(value: Date) { return value.toISOString().slice(0, 10); }

function plusDays(value: string, amount: number) {
  const date = utc(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return iso(date);
}

function rangeFor(mode: RangeMode) {
  if (mode === "7d") return { from: today, to: plusDays(today, 6) };
  if (mode === "14d") return { from: today, to: plusDays(today, 13) };
  if (mode === "month") return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
  if (mode === "quarter") {
    const month = Number(today.slice(5, 7));
    const endMonth = Math.ceil(month / 3) * 3;
    const end = new Date(Date.UTC(Number(today.slice(0, 4)), endMonth, 0));
    return { from: `${today.slice(0, 7)}-01`, to: iso(end) };
  }
  return { from: today, to: plusDays(today, 6) };
}

export default function IncomeDashboard() {
  const [mode, setMode] = useState<RangeMode>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(plusDays(today, 6));
  const [view, setView] = useState<"overview" | "calendar" | "rooms" | "weeks">("overview");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [data, setData] = useState<IncomeData | null>(null);
  const [loading, setLoading] = useState(true);

  const range = mode === "custom" ? { from: customFrom, to: customTo } : rangeFor(mode);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/finance/overview?from=${range.from}&to=${range.to}`)
      .then((response) => response.ok ? response.json() as Promise<IncomeData> : Promise.reject(new Error("收入資料讀取失敗")))
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range.from, range.to]);

  const selectedDay = data?.daily.find((item) => item.date === selectedDate);
  const selectedRoomData = data?.rooms.find((item) => item.roomNumber === selectedRoom);
  const weekly = useMemo(() => {
    const buckets = new Map<string, { label: string; realized: number; unrealized: number; total: number }>();
    for (const item of data?.daily ?? []) {
      const date = utc(item.date);
      const monday = new Date(date);
      const weekday = monday.getUTCDay() || 7;
      monday.setUTCDate(monday.getUTCDate() - weekday + 1);
      const key = iso(monday);
      const current = buckets.get(key) ?? { label: key, realized: 0, unrealized: 0, total: 0 };
      current.realized += item.realized; current.unrealized += item.unrealized; current.total += item.total;
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  return <section className="income-dashboard" aria-label="收入 Dashboard">
    <div className="income-dashboard-head"><div><p className="income-eyebrow">收入模組 · 住房日 SSOT</p><h2>收入 Dashboard</h2><p className="income-muted">只讀取營運訂單，不複製訂單資料；取消訂單自動排除。</p></div><label className="income-range">查詢範圍<select value={mode} onChange={(event) => setMode(event.target.value as RangeMode)}><option value="7d">未來 7 天</option><option value="14d">未來 14 天</option><option value="month">本月</option><option value="quarter">本季</option><option value="custom">自訂日期</option></select></label></div>
    {mode === "custom" && <div className="income-custom-range"><label>起日<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>迄日<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></div>}
    <div className="income-kpis"><div><small>已實現收入</small><strong>{money(data?.revenue.realized ?? 0)}</strong><span>住房日 ≤ 今天</span></div><div><small>未實現收入</small><strong>{money(data?.revenue.unrealized ?? 0)}</strong><span>未來住房日</span></div><div><small>區間收入合計</small><strong>{money(data?.revenue.expected ?? 0)}</strong><span>{data?.revenue.orderCount ?? 0} 筆有效訂單</span></div><div><small>預估淨利</small><strong>{money((data?.revenue.expected ?? 0) - (data?.expenses ?? 0))}</strong><span>收入 − 支出</span></div></div>
    <nav className="income-detail-tabs" aria-label="收入詳細檢視">{([["overview", "A｜總覽"], ["calendar", "B｜住房日曆"], ["rooms", "C｜房間收益"], ["weeks", "D｜週收入"]] as const).map(([key, label]) => <button type="button" key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
    {loading && <p className="income-empty">正在讀取營運收入…</p>}
    {!loading && !data && <p className="income-empty">目前無法讀取收入資料，請稍後重試。</p>}
    {!loading && data && view === "overview" && <div className="income-panel"><div className="income-panel-grid"><div><h3>每日住房收入</h3>{data.daily.length === 0 && <p className="income-empty">此區間沒有住房訂單。</p>}{data.daily.map((item) => <button className="income-daily-row" type="button" key={item.date} onClick={() => { setSelectedDate(item.date); setView("calendar"); }}><span>{item.date.slice(5).replace("-", "/")}</span><i><b style={{ width: `${Math.max(3, Math.round((item.total / Math.max(...data.daily.map((day) => day.total), 1)) * 100))}%` }} /></i><strong>{money(item.total)}</strong></button>)}</div><div><h3>收入判讀</h3><div className="income-callout"><b>{money(data.revenue.realized)}</b><span>已實現，依住房日計算</span></div><div className="income-callout future"><b>{money(data.revenue.unrealized)}</b><span>未實現，請查看未來住房日</span></div><p className="income-muted">若 OwlNest 沒有每日房價，系統會以訂單總額平均估算；多房訂單平均拆分並保留估算標記。</p></div></div></div>}
    {!loading && data && view === "calendar" && <div className="income-panel"><h3>B｜住房日曆</h3><p className="income-muted">住房日為入住日起至退房日前一天，退房日不計入。</p><div className="income-date-grid">{data.daily.map((item) => <button type="button" key={item.date} className={selectedDate === item.date ? "selected" : ""} onClick={() => setSelectedDate(item.date)}><b>{item.date.slice(5).replace("-", "/")}</b><span>{item.rooms} 房</span><strong>{money(item.total)}</strong><em>{item.unrealized > 0 ? "未實現" : "已實現"}</em></button>)}</div>{selectedDay && <div className="income-selected"><b>{selectedDay.date}</b><span>{selectedDay.rooms} 房 · 已實現 {money(selectedDay.realized)} · 未實現 {money(selectedDay.unrealized)}</span></div>}</div>}
    {!loading && data && view === "rooms" && <div className="income-panel"><h3>C｜房間收益</h3><p className="income-muted">依住房日分配；點選房間查看收益摘要。</p><div className="income-room-list">{data.rooms.map((room) => <button type="button" key={room.roomNumber} className={selectedRoom === room.roomNumber ? "selected" : ""} onClick={() => setSelectedRoom(room.roomNumber)}><span><b>{room.roomNumber}</b>{room.roomType}</span><small>{room.nights} 晚</small><strong>{money(room.total)}</strong></button>)}</div>{selectedRoomData && <div className="income-selected"><b>{selectedRoomData.roomNumber} {selectedRoomData.roomType}</b><span>已實現 {money(selectedRoomData.realized)} · 未實現 {money(selectedRoomData.unrealized)}</span></div>}</div>}
    {!loading && data && view === "weeks" && <div className="income-panel"><h3>D｜週收入</h3><p className="income-muted">以住房日所在週彙總，區分已實現與未實現。</p>{weekly.map((week) => <div className="income-week-row" key={week.label}><span>週 {week.label.slice(5).replace("-", "/")}</span><i><b style={{ width: `${Math.max(3, Math.round((week.total / Math.max(...weekly.map((item) => item.total), 1)) * 100))}%` }} /></i><strong>{money(week.total)}</strong><small>{week.unrealized > 0 ? `未實現 ${money(week.unrealized)}` : "已實現"}</small></div>)}</div>}
    <p className="income-footnote">資料來源：營運模組 reservations；收入為訂單總額，不扣平台佣金。平台佣金請在支出頁另行記錄。</p>
  </section>;
}
