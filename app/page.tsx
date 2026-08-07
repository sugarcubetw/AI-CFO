"use client";
/* eslint-disable jsx-a11y/label-has-associated-control -- compact mobile forms pair labels and controls by layout */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type View = "today" | "orders" | "visitor" | "checkin" | "prep";
type Order = {
  id: string; guestName: string; sourceChannel: string; status: string; importState: string;
  arrivalDate: string; departureDate: string; roomTypeId: string | null; roomTypeName: string | null;
  roomNumber: string | null; adults: number; children: number; totalAmount: number; receivedAmount: number;
  balanceAmount: number; paymentStatus: string; specialRequests: string | null;
};
type BaseData = {
  roomTypes: { id: string; displayName: string; defaultRoomNumber: string; isBookable: boolean }[];
  meals: { id: string; name: string; isDefault: boolean; isActive: boolean }[];
  breakfastTimes: string[]; sourceChannels: string[];
};
type PrepData = {
  demands: { reservationId: string; mealDate: string; mealTime: string; guestCount: number; mealName: string | null; roomNumber: string | null; demandState: "confirmed" | "estimated" | "unselected" }[];
  summary: { mealDate: string; demandState: "confirmed" | "estimated" | "unselected"; mealName: string | null; guestCount: number }[];
  totals: { confirmed: number; estimated: number; unselected: number };
  latestReport: { id: string; reportType: string; revision: number } | null;
  quantitiesDeferred: boolean;
};

const today = new Date().toISOString().slice(0, 10);
function weekRange() {
  const date = new Date(`${today}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const from = date.toISOString().slice(0, 10);
  date.setDate(date.getDate() + 6);
  return [from, date.toISOString().slice(0, 10)] as const;
}
const initialWeek = weekRange();
const money = (value: number) => `NT$ ${new Intl.NumberFormat("zh-TW").format(value)}`;
const statusLabel: Record<string, string> = { pending: "待入住", checked_in: "已入住", cancelled: "已取消" };

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [base, setBase] = useState<BaseData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fromDate, setFromDate] = useState(initialWeek[0]);
  const [toDate, setToDate] = useState(initialWeek[1]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("正在初始化基礎資料…");
  const [prep, setPrep] = useState<PrepData | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [newMeal, setNewMeal] = useState("");

  const loadOrders = useCallback(async (from = fromDate, to = toDate) => {
    const response = await fetch(`/api/orders?from=${from}&to=${to}`);
    if (!response.ok) throw new Error("讀取訂單失敗");
    const data = await response.json() as Order[];
    setOrders(data);
    if (!selectedId && data[0]) setSelectedId(data[0].id);
  }, [fromDate, toDate, selectedId]);

  useEffect(() => {
    (async () => {
      try {
        await fetch("/api/bootstrap", { method: "POST" });
        const response = await fetch("/api/base-data");
        setBase(await response.json() as BaseData);
        await loadOrders();
        setMessage("");
      } catch (error) { setMessage(error instanceof Error ? error.message : "系統初始化失敗"); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => orders.find((order) => order.id === selectedId) ?? orders[0], [orders, selectedId]);
  const todayOrders = orders.filter((order) => order.arrivalDate === today && order.status !== "cancelled");

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roomType = base?.roomTypes.find((item) => item.id === form.get("roomTypeId"));
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, roomNumber: roomType?.defaultRoomNumber, adults: Number(body.adults), totalAmount: Number(body.totalAmount), receivedAmount: Number(body.receivedAmount) }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error ?? "新增失敗");
    setManualOpen(false); setMessage("已新增手動訂單"); await loadOrders();
  }

  async function submitCheckin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, reservationId: selected.id, actualGuests: Number(body.actualGuests), breakfastCount: Number(body.breakfastCount), balancePaid: Number(body.balancePaid), identityVerified: form.get("identityVerified") === "on" }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? "✓ 已完成入住，收款與早餐需求已記錄" : result.error ?? "入住失敗");
    if (response.ok) await loadOrders();
  }

  async function loadPrep() {
    const response = await fetch(`/api/prep?from=${fromDate}&to=${toDate}`);
    setPrep(await response.json() as PrepData); setView("prep");
  }

  async function savePrepReport(reportType: "draft" | "formal") {
    const response = await fetch("/api/prep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: fromDate, to: toDate, reportType }) });
    const result = await response.json() as { error?: string; report?: { reportType: string; revision: number; isRevision: boolean }; differences?: unknown[] };
    if (!response.ok) return setMessage(result.error ?? "備料版本建立失敗");
    setMessage(`已建立${result.report?.isRevision ? "修訂" : reportType === "formal" ? "正式" : "草稿"}版本 r${result.report?.revision}，差異 ${result.differences?.length ?? 0} 項`);
    await loadPrep();
  }

  async function createMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newMeal.trim()) return;
    const response = await fetch("/api/meals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newMeal }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error ?? "新增餐點失敗");
    setNewMeal("");
    const baseResponse = await fetch("/api/base-data");
    setBase(await baseResponse.json() as BaseData);
    setMessage("已新增餐點並建立第 1 版");
  }

  async function toggleMeal(id: string, isActive: boolean, name: string) {
    await fetch("/api/meals", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name, isActive: !isActive }) });
    const response = await fetch("/api/base-data");
    setBase(await response.json() as BaseData);
  }

  function switchView(next: View) { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return <main className="app-shell">
    <header className="app-header"><div><h1>方糖營運工作台</h1><p>{today}・接待人員</p></div><button type="button" className="arrival-button" onClick={() => switchView("visitor")}>來訪</button></header>
    <nav className="tabs five" aria-label="接待功能">{[["today","今日"],["orders","訂單"],["visitor","來訪"],["checkin","入住"],["prep","備料"]].map(([key,label]) => <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => key === "prep" ? loadPrep() : switchView(key as View)}>{label}</button>)}</nav>
    {message && <p className="notice">{message}</p>}

    {view === "today" && <section className="screen"><div className="section-heading"><h2>今日入住</h2><span>{todayOrders.length} 筆</span></div>{todayOrders.length === 0 && <div className="empty">今日沒有待入住訂單</div>}{todayOrders.map((order) => <OrderCard key={order.id} order={order} onSelect={() => { setSelectedId(order.id); switchView("checkin"); }} />)}<p className="privacy">攝影機事件只協助接待，不自動辨識房客身分</p></section>}

    {view === "orders" && <section className="screen"><div className="section-heading"><h2>所有訂單</h2><span>{orders.length} 筆</span></div><div className="date-filter"><div className="two-columns"><div><label htmlFor="from-date">入住區間起日</label><input id="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div><label htmlFor="to-date">入住區間迄日</label><input id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></div><div className="action-row"><button type="button" className="week-button" onClick={() => { setFromDate(initialWeek[0]); setToDate(initialWeek[1]); }}>本週</button><button type="button" className="week-button" onClick={() => loadOrders()}>查詢</button></div></div><button type="button" className="secondary compact" onClick={() => setManualOpen(!manualOpen)}>＋ 手動新增訂單</button>{manualOpen && base && <ManualOrderForm base={base} onSubmit={submitManual} />}{orders.length === 0 && <div className="empty">此期間沒有訂單</div>}{orders.map((order) => <OrderCard key={order.id} order={order} onSelect={() => { setSelectedId(order.id); switchView("checkin"); }} />)}<p className="privacy">Gmail 匯入訂單會標示「待確認」，不會覆寫人工資料</p></section>}

    {view === "visitor" && <section className="screen"><div className="section-heading"><h2>待確認來訪</h2><span>攝影機整合預留</span></div><article className="camera-event"><div className="camera" role="img" aria-label="停車場來車示意"><span className="camera-name">停車場</span><div className="car"><i/><i/></div></div></article><label htmlFor="visitor-order">對應訂單</label><select id="visitor-order" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>{orders.filter((order) => order.status !== "cancelled").map((order) => <option key={order.id} value={order.id}>{order.guestName}・{order.roomNumber ?? "未分房"}・{order.sourceChannel}</option>)}</select><label htmlFor="plate">車牌或車輛備註</label><input id="plate" placeholder="人工確認後輸入"/><button type="button" className="primary" onClick={() => switchView("checkin")}>綁定訂單並開始接待</button></section>}

    {view === "checkin" && <section className="screen">{!selected || !base ? <div className="empty">請先從訂單選擇一筆待入住訂單</div> : <form onSubmit={submitCheckin}><div className="booking-summary"><strong>{selected.guestName}・{selected.roomNumber ?? "未分房"}</strong><br/>{selected.sourceChannel}・{selected.adults + selected.children} 位・{selected.arrivalDate}–{selected.departureDate}<br/>總額 {money(selected.totalAmount)}・已付 {money(selected.receivedAmount)}<small>{selected.importState === "pending_review" ? "Gmail 匯入，請接待人員核對" : "已確認訂單"}</small></div><label htmlFor="identity">身分證號／證件號碼</label><input id="identity" name="identity" type="password" placeholder="只保存雜湊與末四碼" autoComplete="off"/><label className="check"><input name="identityVerified" type="checkbox"/> 已核對證件正本</label><div className="two-columns"><div><label>實際入住</label><input name="actualGuests" type="number" defaultValue={selected.adults + selected.children} min="1"/></div><div><label>尾款方式</label><select name="paymentMethod"><option>現金</option><option>轉帳</option>{selected.sourceChannel === "官網" && <option>線上刷卡</option>}</select></div></div><div className="two-columns"><div><label>已付訂金</label><input value={selected.receivedAmount} readOnly/></div><div><label>本次實收尾款</label><input name="balancePaid" defaultValue={selected.balanceAmount} inputMode="numeric"/></div></div><div className="two-columns"><div><label>早餐時間</label><select name="breakfastTime">{base.breakfastTimes.map((time) => <option key={time}>{time}</option>)}</select></div><div><label>用餐人數</label><input name="breakfastCount" type="number" defaultValue={selected.adults + selected.children} min="0"/></div></div><label>餐點</label><select name="mealId">{base.meals.map((meal) => <option key={meal.id} value={meal.id}>{meal.name}{meal.isDefault ? "（預設）" : ""}</option>)}</select><label>人數差異／飲食禁忌／接待備註</label><textarea name="notes" rows={3} defaultValue={selected.specialRequests ?? ""}/><button type="submit" className="primary">確認並完成入住</button></form>}</section>}

    {view === "prep" && <section className="screen"><div className="section-heading"><h2>備料人數</h2><span>{fromDate} 至 {toDate}</span></div><div className="date-filter"><div className="two-columns"><div><label>起日</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}/></div><div><label>迄日</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}/></div></div><button type="button" className="week-button" onClick={loadPrep}>重新彙總</button></div>{prep && <div className="prep-totals"><div><span>已確認</span><strong>{prep.totals.confirmed} 人</strong></div><div><span>預估</span><strong>{prep.totals.estimated} 人</strong></div><div><span>待選餐</span><strong>{prep.totals.unselected} 人</strong></div></div>}<div className="action-row"><button type="button" className="secondary compact" onClick={() => savePrepReport("draft")}>建立草稿</button><button type="button" className="primary compact" onClick={() => savePrepReport("formal")}>建立正式版</button></div>{prep?.latestReport && <p className="range-label">最新版本：{prep.latestReport.reportType} r{prep.latestReport.revision}</p>}{prep?.demands.length === 0 && <div className="empty">此期間尚無早餐需求</div>}{prep?.demands.map((item) => <article className="order" key={`${item.reservationId}-${item.mealDate}`}><div className="spread"><strong>{item.mealDate}・{item.mealTime}</strong><em>{item.guestCount} 人</em></div><p>{item.roomNumber ?? "未分房"}・{item.mealName ?? "餐點待確認"}</p><span className={`demand-state ${item.demandState}`}>{item.demandState === "confirmed" ? "已確認" : item.demandState === "estimated" ? "依訂單預估" : "待選餐"}</span></article>)}<h3>每日餐點人數</h3>{prep?.summary.map((item) => <div className="summary-line" key={`${item.mealDate}-${item.demandState}-${item.mealName}`}><span>{item.mealDate}・{item.mealName ?? (item.demandState === "estimated" ? "餐點待確認（預估）" : "待選餐")}</span><strong>{item.guestCount} 人</strong></div>)}<div className="warning">目前只統計人數；食材用量與列印匯出（S3-09、S3-10）暫緩，不會顯示不準確的採購量。</div><h3 className="meal-admin-title">餐點設定</h3><form className="meal-create" onSubmit={createMeal}><input aria-label="新餐點名稱" value={newMeal} onChange={(event) => setNewMeal(event.target.value)} placeholder="新增餐點名稱"/><button className="primary" type="submit">新增</button></form>{base?.meals.map((meal) => <div className="summary-line" key={meal.id}><span>{meal.name}{meal.isDefault ? "（預設）" : ""}</span><button type="button" className="inline-button" onClick={() => toggleMeal(meal.id, meal.isActive, meal.name)}>{meal.isActive ? "停用" : "啟用"}</button></div>)}</section>}
  </main>;
}

function OrderCard({ order, onSelect }: { order: Order; onSelect: () => void }) {
  return <article className={`order order-result ${order.status === "cancelled" ? "cancelled" : ""}`}><div className="spread"><div><strong>{order.arrivalDate.slice(5).replace("-", "/")}・{order.guestName}</strong><p>{order.sourceChannel}・{order.adults + order.children} 位・{order.id}</p></div><em>{statusLabel[order.status] ?? order.status}</em></div><div className="room-line"><span>房型／房號</span>{order.roomTypeName ?? "待對應"}・<b>{order.roomNumber ?? "—"}</b></div><div className="room-line"><span>住宿日期</span>{order.arrivalDate} → {order.departureDate}</div><div className="room-line"><span>款項</span>已付 {money(order.receivedAmount)}・尾款 {money(order.balanceAmount)}</div>{order.importState === "pending_review" && <p className="review-badge">Gmail 匯入・待人工確認</p>}{order.status !== "cancelled" && <button type="button" className="secondary compact" onClick={onSelect}>開啟接待</button>}</article>;
}

function ManualOrderForm({ base, onSubmit }: { base: BaseData; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="manual-form" onSubmit={onSubmit}><h3>手動訂單</h3><label>旅客姓名</label><input name="guestName" required/><div className="two-columns"><div><label>來源</label><select name="sourceChannel">{base.sourceChannels.map((item) => <option key={item}>{item}</option>)}</select></div><div><label>房型</label><select name="roomTypeId">{base.roomTypes.filter((item) => item.isBookable).map((item) => <option key={item.id} value={item.id}>{item.displayName}・{item.defaultRoomNumber}</option>)}</select></div></div><div className="two-columns"><div><label>入住</label><input name="arrivalDate" type="date" required/></div><div><label>退房</label><input name="departureDate" type="date" required/></div></div><div className="two-columns"><div><label>人數</label><input name="adults" type="number" min="1" defaultValue="2"/></div><div><label>總額</label><input name="totalAmount" type="number" min="0"/></div></div><label>已付訂金</label><input name="receivedAmount" type="number" min="0" defaultValue="0"/><label>備註</label><textarea name="specialRequests" rows={2}/><button className="primary" type="submit">儲存訂單</button></form>;
}
