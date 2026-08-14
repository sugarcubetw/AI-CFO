"use client";
/* eslint-disable jsx-a11y/label-has-associated-control -- compact mobile forms pair labels and controls by layout */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type View = "today" | "orders" | "calendar" | "checkin" | "prep" | "new-orders" | "reconcile";
type CalendarMode = "week" | "month";
type Order = {
  id: string; guestName: string; sourceChannel: string; status: string; importState: string;
  arrivalDate: string; departureDate: string; roomTypeId: string | null; roomTypeName: string | null;
  roomNumber: string | null; adults: number; children: number; totalAmount: number; receivedAmount: number;
  balanceAmount: number; paymentMethod: string | null; paymentStatus: string; specialRequests: string | null;
  actualGuests: number | null; identityVerified: boolean | null; breakfastTime: string | null;
  breakfastCount: number | null; mealId: string | null; mealName: string | null;
  checkinNotes: string | null; checkedInAt: string | null; guestCountKnown: boolean; displayGuestCount: number;
};
type BaseData = {
  roomTypes: { id: string; displayName: string; defaultRoomNumber: string; isBookable: boolean }[];
  meals: { id: string; name: string; isDefault: boolean; isActive: boolean }[];
  breakfastTimes: string[]; sourceChannels: string[];
  paymentMethods: { id: string; label: string; scope: string; isActive: boolean }[];
};
type PrepData = {
  demands: { reservationId: string; mealDate: string; mealTime: string; guestCount: number; mealId: string | null; mealName: string | null; roomNumber: string | null; guestName: string; arrivalDate: string; departureDate: string; demandState: "confirmed" | "estimated" | "unselected" }[];
  summary: { mealDate: string; demandState: "confirmed" | "estimated" | "unselected"; mealName: string | null; guestCount: number }[];
  totals: { confirmed: number; estimated: number; unselected: number };
  latestReport: { id: string; reportType: string; revision: number } | null;
  quantitiesDeferred: boolean;
};
type ReconcileResult = { runId: string; received: number; matched: number; inserted: number; changed: number; duplicateInExport?: number; missingFromExport: number; errors: { row: number; reason: string }[]; warnings: string[] };
type ReconcileRun = { id: string; periodFrom: string; periodTo: string; status: string; receivedCount: number; matchedCount: number; insertedCount: number; changedCount: number; missingCount: number; errorCount: number; startedAt: string } | null;
type ReconcileItem = { id: number; orderId: string; action: string; differenceJson: string | null };
type HomeData = { date: string; range: { from: string; to: string }; base: BaseData; todayOrders: Order[]; orders: Order[]; prep: PrepData };
type NewOrdersData = { orders: (Order & { createdAt: string; readAt: string | null })[]; unreadCount: number };

const clientCachePrefix = "fangtang-reception-cache:v1:";
function readClientCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${clientCachePrefix}${key}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}
function writeClientCache<T>(key: string, value: T) {
  try { window.localStorage.setItem(`${clientCachePrefix}${key}`, JSON.stringify(value)); } catch { /* cache is optional */ }
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function forwardWeekRange() {
  const date = new Date(`${today}T00:00:00Z`);
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return [from, date.toISOString().slice(0, 10)] as const;
}
const initialWeek = forwardWeekRange();
const money = (value: number) => `NT$ ${new Intl.NumberFormat("zh-TW").format(value)}`;
const statusLabel: Record<string, string> = { pending: "待入住", checked_in: "已入住", cancelled: "已取消" };

function dateAt(value: string) { return new Date(`${value}T00:00:00Z`); }
function dateText(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(value: string, amount: number) { const date = dateAt(value); date.setUTCDate(date.getUTCDate() + amount); return dateText(date); }
function mondayBasedDayIndex(value: Date) { return (value.getUTCDay() + 6) % 7; }
function calendarRange(anchor: string, mode: CalendarMode) {
  const date = dateAt(anchor);
  if (mode === "week") {
    const from = addDays(anchor, -mondayBasedDayIndex(date));
    return { from, to: addDays(from, 6) };
  }
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const from = addDays(dateText(first), -mondayBasedDayIndex(first));
  return { from, to: addDays(from, 41) };
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [base, setBase] = useState<BaseData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [calendarOrders, setCalendarOrders] = useState<Order[]>([]);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [calendarAnchor, setCalendarAnchor] = useState(today);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(today);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [fromDate, setFromDate] = useState(initialWeek[0]);
  const [toDate, setToDate] = useState(initialWeek[1]);
  const [selectedId, setSelectedId] = useState("");
  const [checkinEditing, setCheckinEditing] = useState(false);
  const [message, setMessage] = useState("正在初始化基礎資料…");
  const [prep, setPrep] = useState<PrepData | null>(null);
  const [prepFrom, setPrepFrom] = useState(today);
  const [prepTo, setPrepTo] = useState(today);
  const [manualOpen, setManualOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [editOrderId, setEditOrderId] = useState("");
  const [newMeal, setNewMeal] = useState("");
  const [reconcileContent, setReconcileContent] = useState("");
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [latestReconcile, setLatestReconcile] = useState<ReconcileRun>(null);
  const [reconcileItems, setReconcileItems] = useState<ReconcileItem[]>([]);
  const [reconcileFrom, setReconcileFrom] = useState(today);
  const [reconcileTo, setReconcileTo] = useState(() => { const date = new Date(`${today}T00:00:00`); date.setUTCDate(date.getUTCDate() + 90); return date.toISOString().slice(0, 10); });
  const [newOrders, setNewOrders] = useState<NewOrdersData>({ orders: [], unreadCount: 0 });
  const [mealSelections, setMealSelections] = useState<Record<string, string>>({});

  function hydrateMealSelections(data: PrepData) {
    setMealSelections(Object.fromEntries(data.demands.map((item) => [`${item.reservationId}|${item.mealDate}`, item.mealId ?? ""])));
  }

  const loadOrders = useCallback(async (from = fromDate, to = toDate) => {
    const cacheKey = `orders:${from}:${to}`;
    const cached = readClientCache<Order[]>(cacheKey);
    if (cached) {
      setOrders(cached);
      setSelectedId((current) => current || cached[0]?.id || "");
    }
    const response = await fetch(`/api/orders?from=${from}&to=${to}`);
    if (!response.ok) throw new Error("讀取訂單失敗");
    const data = await response.json() as Order[];
    writeClientCache(cacheKey, data);
    setOrders(data);
    setSelectedId((current) => current || data[0]?.id || "");
    return data;
  }, [fromDate, toDate]);

  const loadTodayOrders = useCallback(async () => {
    const cacheKey = `orders:${today}:${today}`;
    const cached = readClientCache<Order[]>(cacheKey);
    if (cached) {
      const activeCached = cached.filter((order) => order.arrivalDate === today && order.status !== "cancelled");
      setTodayOrders(activeCached);
      setSelectedId((current) => current || activeCached[0]?.id || "");
    }
    const response = await fetch(`/api/orders?from=${today}&to=${today}`);
    if (!response.ok) throw new Error("讀取今日訂單失敗");
    const data = await response.json() as Order[];
    writeClientCache(cacheKey, data);
    const active = data.filter((order) => order.arrivalDate === today && order.status !== "cancelled");
    setTodayOrders(active);
    setSelectedId((current) => current || active[0]?.id || "");
    return active;
  }, []);

  useEffect(() => {
    const cachedHome = readClientCache<HomeData>(`home:${today}`);
    const cachedNewOrders = readClientCache<NewOrdersData>("new-orders");
    if (cachedHome) {
      // Hydrate the client-only cache once after mount; this is the intentional UI hydration path.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBase(cachedHome.base);
      setTodayOrders(cachedHome.todayOrders);
      setOrders(cachedHome.orders);
      setPrep(cachedHome.prep);
      hydrateMealSelections(cachedHome.prep);
      setSelectedId((current) => current || cachedHome.todayOrders[0]?.id || cachedHome.orders[0]?.id || "");
      setMessage("已載入快取資料，背景同步中…");
    }
    if (cachedNewOrders) setNewOrders(cachedNewOrders);
    (async () => {
      try {
        // Seed data is needed only for the first server load; it should not block cached UI.
        await fetch("/api/bootstrap", { method: "POST" });
        const response = await fetch(`/api/home?date=${today}`);
        if (!response.ok) throw new Error("讀取首頁資料失敗");
        const data = await response.json() as HomeData;
        const newOrdersResponse = await fetch("/api/new-orders");
        if (newOrdersResponse.ok) {
          const latestNewOrders = await newOrdersResponse.json() as NewOrdersData;
          setNewOrders(latestNewOrders);
          writeClientCache("new-orders", latestNewOrders);
        }
        writeClientCache(`home:${today}`, data);
        setBase(data.base);
        setTodayOrders(data.todayOrders);
        setOrders(data.orders);
        setPrep(data.prep);
        hydrateMealSelections(data.prep);
        setSelectedId((current) => current || data.todayOrders[0]?.id || data.orders[0]?.id || "");
        setMessage("");
      } catch (error) { setMessage(error instanceof Error ? error.message : "系統初始化失敗"); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => todayOrders.find((order) => order.id === selectedId) ?? orders.find((order) => order.id === selectedId) ?? todayOrders[0] ?? orders[0], [orders, selectedId, todayOrders]);
  const editingOrder = useMemo(() => orders.find((order) => order.id === editOrderId) ?? null, [editOrderId, orders]);
  const selectedPaymentMethods = useMemo(() => {
    if (!selected || !base) return ["現金", "轉帳"];
    const configured = base.paymentMethods.filter((item) => item.isActive && (item.scope === "*" || item.scope === selected.sourceChannel)).map((item) => item.label);
    return configured.length ? configured : selected.sourceChannel === "官網" ? ["現金", "轉帳", "線上刷卡"] : ["現金", "轉帳"];
  }, [base, selected]);
  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roomType = base?.roomTypes.find((item) => item.id === form.get("roomTypeId"));
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, roomNumber: roomType?.defaultRoomNumber, adults: Number(body.adults), totalAmount: Number(body.totalAmount), receivedAmount: Number(body.receivedAmount) }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error ?? "新增失敗");
    setManualOpen(false); setMessage("已新增手動訂單"); await Promise.all([loadTodayOrders(), loadOrders()]);
  }

  async function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelOrderId || !cancelReason.trim()) return setMessage("請填寫取消原因");
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: cancelOrderId, action: "cancel", reason: cancelReason }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error ?? "取消訂單失敗");
    setCancelOrderId(""); setCancelReason(""); setMessage(`✓ 訂單 ${cancelOrderId} 已取消並保留執行記錄`);
    await Promise.all([loadTodayOrders(), loadOrders()]);
  }

  async function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editOrderId, action: "update", adults: Number(form.get("adults")), children: Number(form.get("children")), specialRequests: form.get("specialRequests") }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error ?? "修改訂單失敗");
    setEditOrderId(""); setMessage("✓ 訂單人數與房客留言已更新");
    await Promise.all([loadTodayOrders(), loadOrders()]);
  }

  async function submitCheckin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const balancePaid = Number(body.balancePaid);
    if (balancePaid > selected.balanceAmount) {
      setMessage(`本次實收尾款不可超過未收金額 ${money(selected.balanceAmount)}；若只是修改入住資料，請將尾款填 0`);
      return;
    }
    const response = await fetch("/api/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, reservationId: selected.id, actualGuests: Number(body.actualGuests), breakfastCount: Number(body.breakfastCount), balancePaid: Number(body.balancePaid), identityVerified: form.get("identityVerified") === "on" }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? "✓ 已完成入住，收款與早餐需求已記錄" : result.error ?? "入住失敗");
    if (response.ok) { await Promise.all([loadTodayOrders(), loadOrders()]); setCheckinEditing(false); }
  }

  async function loadPrep(from = prepFrom, to = prepTo) {
    setView("prep");
    const response = await fetch(`/api/prep?from=${from}&to=${to}`);
    const data = await response.json() as PrepData;
    setPrep(data); hydrateMealSelections(data); setView("prep");
  }

  async function openTodayPrep() {
    setPrepFrom(today); setPrepTo(today);
    setView("prep");
    if (!prep) { // await loadPrep(today, today)
      void loadPrep(today, today).catch(() => setMessage("讀取備料資料失敗"));
    }
  }

  async function loadReconcile() {
    const response = await fetch("/api/reconcile/owlting?limit=5");
    if (response.ok) { const data = await response.json() as { latest: ReconcileRun; items: ReconcileItem[] }; setLatestReconcile(data.latest); setReconcileItems(data.items ?? []); }
    setView("reconcile");
  }
  function loadNewOrders() {
    setView("new-orders");
    void fetch("/api/new-orders").then(async (response) => {
      if (!response.ok) throw new Error("讀取新訂失敗");
      const latest = await response.json() as NewOrdersData;
      setNewOrders(latest);
      writeClientCache("new-orders", latest);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "讀取新訂失敗"));
  }
  async function markNewOrderRead(id?: string) { const response = await fetch("/api/new-orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(id ? { id } : { action: "mark_all_read" }) }); if (!response.ok) return; setNewOrders((current) => ({ ...current, unreadCount: id ? Math.max(0, current.unreadCount - 1) : 0, orders: current.orders.map((order) => id && order.id === id ? { ...order, readAt: new Date().toISOString() } : id ? order : { ...order, readAt: order.readAt ?? new Date().toISOString() }) })); }

  async function importOwlNestList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reconcileContent.trim()) return setMessage("請先選擇 OwlNest 匯出的 CSV，或貼上 CSV 內容");
    const response = await fetch("/api/reconcile/owlting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: reconcileContent, periodFrom: reconcileFrom, periodTo: reconcileTo, sourceExportedAt: new Date().toISOString() }) });
    const result = await response.json() as ReconcileResult & { error?: string };
    if (!response.ok) return setMessage(result.error ?? "訂單核對失敗");
    setReconcileResult(result); setMessage(`已完成 OwlNest 核對：${result.received} 筆，差異 ${result.changed + result.missingFromExport} 筆`); setReconcileContent("");
    const latest = await fetch("/api/reconcile/owlting?limit=5");
    if (latest.ok) { const data = await latest.json() as { latest: ReconcileRun; items: ReconcileItem[] }; setLatestReconcile(data.latest); setReconcileItems(data.items ?? []); }
  }

  async function savePrepReport(reportType: "draft" | "formal") {
    const response = await fetch("/api/prep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: prepFrom, to: prepTo, reportType }) });
    const result = await response.json() as { error?: string; report?: { reportType: string; revision: number; isRevision: boolean }; differences?: unknown[] };
    if (!response.ok) return setMessage(result.error ?? "備料版本建立失敗");
    setMessage(`已建立${result.report?.isRevision ? "修訂" : reportType === "formal" ? "正式" : "草稿"}版本 r${result.report?.revision}，差異 ${result.differences?.length ?? 0} 項`);
    await loadPrep();
  }

  async function saveMealPlan() {
    if (!prep) return;
    const response = await fetch("/api/prep", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: prepFrom, to: prepTo, items: prep.demands.map((item) => ({
        reservationId: item.reservationId,
        mealDate: item.mealDate,
        mealTime: item.mealTime,
        mealId: mealSelections[`${item.reservationId}|${item.mealDate}`] || null,
      })) }),
    });
    const result = await response.json() as PrepData & { error?: string };
    if (!response.ok) return setMessage(result.error ?? "儲存餐點安排失敗");
    setPrep(result); hydrateMealSelections(result); setMessage("✓ 已儲存每日餐點安排");
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
  function openReception(order: Order) { setSelectedId(order.id); setCheckinEditing(order.status !== "checked_in"); switchView("checkin"); }
  function openTodayView() { switchView("today"); void loadTodayOrders().catch((error) => setMessage(error instanceof Error ? error.message : "讀取今日訂單失敗")); }
  async function openTodayCheckin() { switchView("checkin"); setCheckinEditing(false); try { const current = await loadTodayOrders(); setSelectedId(current[0]?.id ?? ""); } catch (error) { setMessage(error instanceof Error ? error.message : "讀取今日訂單失敗"); } }
  function openCalendar(mode = calendarMode, anchor = calendarAnchor) {
    const range = calendarRange(anchor, mode);
    const cacheKey = `orders:${range.from}:${range.to}`;
    const cached = readClientCache<Order[]>(cacheKey);
    if (cached) setCalendarOrders(cached);
    setCalendarMode(mode); setCalendarAnchor(anchor); setCalendarSelectedDate(anchor); switchView("calendar");
    void fetch(`/api/orders?from=${range.from}&to=${range.to}`).then(async (response) => {
      if (!response.ok) throw new Error("讀取訂單月曆失敗");
      const latest = await response.json() as Order[];
      writeClientCache(cacheKey, latest);
      setCalendarOrders(latest);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "讀取訂單月曆失敗"));
  }

  return <main className={`app-shell${view === "calendar" ? " calendar-active" : ""}`}>
    <header className="app-header"><div><h1>方糖營運工作台</h1><p>{today}・接待人員</p></div><div className="header-actions"><form className="header-nav-form" action="/settings" method="get"><button className="header-link" type="submit">設定</button></form></div></header>
    <nav className="tabs six" aria-label="接待功能">{[["today","今日"],["orders","訂單"],["calendar","月曆"],["checkin","入住"],["prep","備料"],["new-orders","新訂"]].map(([key,label]) => <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => key === "today" ? openTodayView() : key === "calendar" ? openCalendar() : key === "prep" ? openTodayPrep() : key === "checkin" ? openTodayCheckin() : key === "new-orders" ? loadNewOrders() : switchView(key as View)}>{label}{key === "new-orders" && newOrders.unreadCount > 0 && <span className="unread-badge">{newOrders.unreadCount}</span>}</button>)}</nav>
    {message && <p className="notice">{message}</p>}
    {view === "new-orders" && editingOrder && <OrderEditForm order={editingOrder} onSubmit={updateOrder} onCancel={() => setEditOrderId("")} />}
    {view === "new-orders" && !editingOrder && newOrders.orders.length > 0 && <section className="screen new-order-edit-tools"><h3>新訂單資料確認</h3><p className="privacy">可先補充成人、兒童人數與飲食注意事項，修改會寫回同一筆訂單。</p><div className="action-row">{newOrders.orders.map((order) => <button type="button" className="secondary compact" key={order.id} onClick={() => { setOrders((current) => current.some((item) => item.id === order.id) ? current : [...current, order]); setEditOrderId(order.id); markNewOrderRead(order.id); }}>{order.roomNumber ?? "未分房"}・{order.guestName} 編輯</button>)}</div></section>}

    {view === "today" && <section className="screen"><div className="section-heading"><h2>今日入住</h2><span>{todayOrders.length} 筆</span></div>{todayOrders.length === 0 && <div className="empty">今日沒有入住訂單</div>}{todayOrders.map((order) => <OrderCard key={order.id} order={order} onSelect={() => openReception(order)} />)}<p className="privacy">攝影機事件只協助接待，不自動辨識房客身分</p></section>}
    {view === "new-orders" && <section className="screen"><div className="section-heading"><h2>新訂（近 7 天）</h2><button className="secondary" type="button" onClick={() => markNewOrderRead()}>全部標示為已讀</button></div>{newOrders.orders.length === 0 ? <div className="empty">近 7 天沒有新訂單</div> : newOrders.orders.map((order) => <article className={`order new-order-card ${order.readAt ? "is-read" : "is-unread"}`} key={order.id} onClick={() => !order.readAt && markNewOrderRead(order.id)}><div className="spread"><strong>{order.id}</strong>{!order.readAt && <em className="new-order-label">新訂單</em>}</div><p>{order.sourceChannel}・{order.guestName}・{order.roomNumber ?? "房型待確認"}</p><p>{order.arrivalDate} → {order.departureDate}・{order.displayGuestCount} 位</p><p>總額 {money(order.totalAmount)}・尾款 {money(order.balanceAmount)}</p></article>)}</section>}

    {view === "orders" && <section className="screen"><div className="section-heading"><h2>所有訂單</h2><span>{orders.length} 筆</span></div><div className="status-legend"><span className="pending">待入住</span><span className="checked-in">目前入住</span><span className="cancelled">已取消</span></div><div className="date-filter"><div className="two-columns"><div><label htmlFor="from-date">入住區間起日</label><input id="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div><label htmlFor="to-date">入住區間迄日</label><input id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></div><div className="action-row"><button type="button" className="week-button" onClick={() => { setFromDate(initialWeek[0]); setToDate(initialWeek[1]); }}>今天起 7 天</button><button type="button" className="week-button" onClick={() => loadOrders()}>查詢</button></div></div><button type="button" className="secondary compact" onClick={() => setManualOpen(!manualOpen)}>＋ 手動新增訂單</button>{manualOpen && base && <ManualOrderForm base={base} onSubmit={submitManual} />}{editingOrder && <OrderEditForm order={editingOrder} onSubmit={updateOrder} onCancel={() => setEditOrderId("")} />}{cancelOrderId && <form className="manual-form cancel-form" onSubmit={cancelOrder}><h3>手動取消訂單</h3><div className="warning">取消後會從今日入住與備料排除，但訂單及操作記錄仍會保留。</div><label>訂單編號</label><input value={cancelOrderId} readOnly/><label>取消原因</label><textarea rows={2} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="例如：OwlNest 已取消但系統未自動偵測" required/><div className="action-row"><button className="danger compact" type="submit">確認取消訂單</button><button className="secondary compact" type="button" onClick={() => { setCancelOrderId(""); setCancelReason(""); }}>返回</button></div></form>}{orders.length === 0 && <div className="empty">此期間沒有訂單</div>}{orders.map((order) => <OrderCard key={order.id} order={order} onSelect={() => openReception(order)} onEdit={() => { setEditOrderId(order.id); setCancelOrderId(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onCancel={() => { setCancelOrderId(order.id); setEditOrderId(""); setCancelReason("OwlNest 已取消但系統未自動偵測"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}<p className="privacy">OwlNest 列表沒有入住人數時，依房型預估；Gmail 或人工確認後會改用實際人數。</p></section>}

    {view === "calendar" && <CalendarView orders={calendarOrders} mode={calendarMode} anchor={calendarAnchor} selectedDate={calendarSelectedDate} onSelectDate={setCalendarSelectedDate} onModeChange={(mode) => openCalendar(mode, calendarAnchor)} onMove={(direction) => { const next = calendarMode === "week" ? addDays(calendarAnchor, direction * 7) : (() => { const date = dateAt(calendarAnchor); date.setUTCMonth(date.getUTCMonth() + direction); return dateText(date); })(); openCalendar(calendarMode, next); }} onToday={() => openCalendar(calendarMode, today)} onOpenOrder={openReception}/>} 

    {view === "checkin" && <section className="screen"><div className="section-heading"><h2>今日入住</h2><span>{todayOrders.length} 筆</span></div>{todayOrders.length > 0 && <label className="today-checkin-picker">選擇今日客人<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setCheckinEditing(false); }}>{todayOrders.map((order) => <option key={order.id} value={order.id}>{order.guestName}・{order.roomNumber ?? "未分房"}・{statusLabel[order.status] ?? order.status}</option>)}</select></label>}{!selected || selected.arrivalDate !== today || !base ? <div className="empty">今天沒有待辦入住的客人</div> : !checkinEditing ? <StaySummary order={selected} onEdit={() => setCheckinEditing(true)}/> : <form key={`${selected.id}-${selected.status}-${selected.receivedAmount}-${selected.balanceAmount}`} onSubmit={submitCheckin}><div className="booking-summary"><strong>{selected.guestName}・{selected.roomNumber ?? "未分房"}</strong><br/>{selected.sourceChannel}・{selected.guestCountKnown ? "" : "預估 "}{selected.displayGuestCount} 位・{selected.arrivalDate}–{selected.departureDate}<br/>總額 {money(selected.totalAmount)}・已付 {money(selected.receivedAmount)}<small>{selected.guestCountKnown ? "訂單人數已取得" : "OwlNest 未提供人數，請接待人員核對"}</small></div>{selected.status === "checked_in" && <div className="warning">目前正在修改已入住資料；如無新的收款，尾款請保持 0。</div>}<label htmlFor="identity">身分證號／證件號碼</label><input id="identity" name="identity" type="password" placeholder={selected.identityVerified ? "證件已核對；不修改可留空" : "只保存雜湊與末四碼"} autoComplete="off"/><label className="check"><input name="identityVerified" type="checkbox" defaultChecked={Boolean(selected.identityVerified)}/> 已核對證件正本</label><div className="two-columns"><div><label>實際入住</label><input name="actualGuests" type="number" defaultValue={selected.actualGuests ?? selected.displayGuestCount} min="1"/></div><div><label>尾款方式</label><select name="paymentMethod" defaultValue={selected.paymentMethod ?? selectedPaymentMethods[0]}>{selectedPaymentMethods.map((method) => <option key={method}>{method}</option>)}</select></div></div><div className="two-columns"><div><label>已付金額</label><input value={selected.receivedAmount} readOnly/></div><div><label>本次實收尾款（無新收款填 0）</label><input name="balancePaid" defaultValue={selected.status === "checked_in" ? 0 : selected.balanceAmount} inputMode="numeric"/></div></div><div className="two-columns"><div><label>早餐時間</label><select name="breakfastTime" defaultValue={selected.breakfastTime ?? base.breakfastTimes[0]}>{base.breakfastTimes.map((time) => <option key={time}>{time}</option>)}</select></div><div><label>用餐人數</label><input name="breakfastCount" type="number" defaultValue={selected.breakfastCount ?? selected.displayGuestCount} min="0"/></div></div><label>餐點</label><select name="mealId" defaultValue={selected.mealId ?? base.meals.find((meal) => meal.isDefault)?.id}>{base.meals.map((meal) => <option key={meal.id} value={meal.id}>{meal.name}{meal.isDefault ? "（預設）" : ""}</option>)}</select><label>人數差異／飲食禁忌／接待備註</label><textarea name="notes" rows={3} defaultValue={selected.checkinNotes ?? selected.specialRequests ?? ""}/><button type="submit" className="primary">{selected.status === "checked_in" ? "儲存入住資料修改" : "確認並完成入住"}</button><button type="button" className="secondary" onClick={() => setCheckinEditing(false)}>取消編輯</button></form>}</section>}

    {view === "prep" && <section className="screen"><div className="section-heading"><h2>{prepFrom === today && prepTo === today ? "今日備料人數" : "備料人數"}</h2><span>{prepFrom === prepTo ? prepFrom : `${prepFrom} 至 ${prepTo}`}</span></div><div className="date-filter"><div className="two-columns"><div><label>起日</label><input type="date" value={prepFrom} onChange={(e) => setPrepFrom(e.target.value)}/></div><div><label>迄日</label><input type="date" value={prepTo} onChange={(e) => setPrepTo(e.target.value)}/></div></div><button type="button" className="week-button" onClick={() => loadPrep()}>查詢備料</button></div>{prep && <div className="prep-totals"><div><span>已確認</span><strong>{prep.totals.confirmed} 人</strong></div><div><span>預估</span><strong>{prep.totals.estimated} 人</strong></div><div><span>待選餐</span><strong>{prep.totals.unselected} 人</strong></div></div>}<div className="action-row"><button type="button" className="primary compact" onClick={saveMealPlan} disabled={!prep}>儲存每日餐點</button><button type="button" className="secondary compact" onClick={() => savePrepReport("draft")}>建立草稿</button><button type="button" className="primary compact" onClick={() => savePrepReport("formal")}>建立正式版</button></div>{prep?.latestReport && <p className="range-label">最新版本：{prep.latestReport.reportType} r{prep.latestReport.revision}</p>}{prep?.demands.length === 0 && <div className="empty">此期間尚無早餐需求</div>}{prep && <div className="meal-planning-list">{Array.from(new Set(prep.demands.map((item) => item.mealDate))).map((mealDate) => <div className="meal-day" key={mealDate}><div className="section-heading"><h3>{mealDate}</h3><span>{prep.demands.filter((item) => item.mealDate === mealDate).reduce((sum, item) => sum + item.guestCount, 0)} 人</span></div>{prep.demands.filter((item) => item.mealDate === mealDate).map((item) => { const key = `${item.reservationId}|${item.mealDate}`; return <article className="order meal-plan-row" key={key}><div><strong>{item.guestName}・{item.roomNumber ?? "未分房"}</strong><p>住宿 {item.arrivalDate} → {item.departureDate}・{item.guestCount} 人</p></div><select aria-label={`${item.mealDate} ${item.guestName} 餐點`} value={mealSelections[key] ?? item.mealId ?? ""} onChange={(event) => setMealSelections((current) => ({ ...current, [key]: event.target.value }))}><option value="">尚未安排</option>{base?.meals.filter((meal) => meal.isActive).map((meal) => <option key={meal.id} value={meal.id}>{meal.name}</option>)}</select></article>; })}</div>)}</div>}<h3>每日餐點人數</h3>{prep?.summary.map((item) => <div className="summary-line" key={`${item.mealDate}-${item.demandState}-${item.mealName}`}><span>{item.mealDate}・{item.mealName ?? (item.demandState === "estimated" ? "餐點待確認（預估）" : "待選餐")}</span><strong>{item.guestCount} 人</strong></div>)}<div className="warning">預先安排後，這裡會依「日期＋餐點」統計人數；入住時仍可調整實際餐點。</div><h3 className="meal-admin-title">餐點設定</h3><form className="meal-create" onSubmit={createMeal}><input aria-label="新餐點名稱" value={newMeal} onChange={(event) => setNewMeal(event.target.value)} placeholder="新增餐點名稱"/><button className="primary" type="submit">新增</button></form>{base?.meals.map((meal) => <div className="summary-line" key={meal.id}><span>{meal.name}{meal.isDefault ? "（預設）" : ""}</span><button type="button" className="inline-button" onClick={() => toggleMeal(meal.id, meal.isActive, meal.name)}>{meal.isActive ? "停用" : "啟用"}</button></div>)}</section>}

    {view === "reconcile" && <section className="screen"><div className="section-heading"><h2>OwlNest 訂單核對</h2><span>每日一次</span></div><div className="warning">OwlNest 目前沒有提供 API。請在 OwlNest「銷售概況 → 訂單列表」依入住區間下載 CSV，再在這裡匯入。系統以入住日期比對，不會把「匯出未出現」直接判定為取消。</div><a className="secondary open-owlnest" href="https://www.owlting.com/booking/admin/?p=statistics&l=zh_TW" target="_blank" rel="noreferrer">開啟 OwlNest 銷售概況</a><form className="manual-form" onSubmit={importOwlNestList}><div className="two-columns"><div><label>入住起日</label><input type="date" value={reconcileFrom} onChange={(event) => setReconcileFrom(event.target.value)} /></div><div><label>入住迄日</label><input type="date" value={reconcileTo} onChange={(event) => setReconcileTo(event.target.value)} /></div></div><label htmlFor="owlnest-file">選擇 OwlNest CSV</label><input id="owlnest-file" type="file" accept=".csv,.txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setReconcileContent(await file.text()); }} /><label htmlFor="owlnest-content">或貼上 CSV 內容</label><textarea id="owlnest-content" rows={5} value={reconcileContent} onChange={(event) => setReconcileContent(event.target.value)} placeholder="訂單編號,訂購時間,入住日期,退房日期,..." /><button type="submit" className="primary">匯入並完成今日核對</button></form>{reconcileResult && <div className="prep-totals"><div><span>匯入</span><strong>{reconcileResult.received}</strong></div><div><span>新增</span><strong>{reconcileResult.inserted}</strong></div><div><span>差異</span><strong>{reconcileResult.changed + reconcileResult.missingFromExport}</strong></div></div>}{latestReconcile && <article className="order"><div className="spread"><strong>上次核對</strong><em>{latestReconcile.status === "completed" ? "已完成" : latestReconcile.status}</em></div><p>{latestReconcile.periodFrom} ～ {latestReconcile.periodTo}・{latestReconcile.receivedCount} 筆</p><p>相符 {latestReconcile.matchedCount}・新增 {latestReconcile.insertedCount}・欄位差異 {latestReconcile.changedCount}・未出現 {latestReconcile.missingCount}</p>{reconcileItems.filter((item) => item.action !== "matched").slice(0, 10).map((item) => <div className="summary-line" key={item.id}><span>{item.orderId}</span><strong>{item.action === "missing_from_export" ? "匯出未出現" : item.action === "changed" ? "欄位差異" : item.action === "inserted" ? "新增" : item.action}</strong></div>)}</article>}<p className="privacy">建議每日入住前更新一次；差異需由管理者確認後才調整訂單。</p></section>}
  </main>;
}

function CalendarView({ orders, mode, anchor, selectedDate, onSelectDate, onModeChange, onMove, onToday, onOpenOrder }: {
  orders: Order[]; mode: CalendarMode; anchor: string; selectedDate: string;
  onSelectDate: (value: string) => void; onModeChange: (value: CalendarMode) => void;
  onMove: (direction: number) => void; onToday: () => void; onOpenOrder: (order: Order) => void;
}) {
  const range = calendarRange(anchor, mode);
  const date = dateAt(anchor);
  const activeMonth = date.getUTCMonth();
  const days = Array.from({ length: mode === "month" ? 42 : 7 }, (_, index) => addDays(range.from, index));
  const selectedOrders = orders.filter((order) => order.status !== "cancelled" && order.arrivalDate <= selectedDate && order.departureDate > selectedDate);
  const calendarAssignments = buildCalendarAssignments(orders);
  const periodTitle = mode === "month"
    ? `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`
    : `${range.from.slice(5).replace("-", "/")}－${range.to.slice(5).replace("-", "/")}`;

  return <section className={`screen calendar-screen calendar-${mode}`}>
    <div className="calendar-toolbar">
      <div className="calendar-mode" aria-label="月曆顯示方式">
        <button type="button" className={mode === "week" ? "active" : ""} onClick={() => onModeChange("week")}>週</button>
        <button type="button" className={mode === "month" ? "active" : ""} onClick={() => onModeChange("month")}>月</button>
      </div>
      <div className="calendar-period">
        <button type="button" aria-label="上一個期間" onClick={() => onMove(-1)}>‹</button>
        <strong>{periodTitle}</strong>
        <button type="button" aria-label="下一個期間" onClick={() => onMove(1)}>›</button>
      </div>
      <button type="button" className="calendar-today" onClick={onToday}>今天</button>
    </div>
    <div className="calendar-landscape-layout">
      <div className="calendar-pane">
        <div className="status-legend calendar-legend"><span className="pending">入住日</span><span className="checked-in">續住</span><span className="cancelled">同一房客同色</span></div>
        <div className="calendar-grid" role="grid" aria-label={periodTitle}>
      {['一','二','三','四','五','六','日'].map((label) => <span className="calendar-weekday" key={label}>{label}</span>)}
      {days.map((day) => {
        const dayOrders = orders
          .filter((order) => order.status !== "cancelled" && order.arrivalDate <= day && order.departureDate > day)
          .sort((left, right) => (calendarAssignments.get(left.id)?.lane ?? 0) - (calendarAssignments.get(right.id)?.lane ?? 0));
        const dayDate = dateAt(day);
        const isWeekStart = dayDate.getUTCDay() === 1;
        const isWeekEnd = dayDate.getUTCDay() === 0;
        const laneCount = Math.max(1, ...dayOrders.map((order) => (calendarAssignments.get(order.id)?.lane ?? 0) + 1));
        return <button type="button" role="gridcell" key={day} className={`calendar-day${day === today ? " today" : ""}${day === selectedDate ? " selected" : ""}${mode === "month" && dayDate.getUTCMonth() !== activeMonth ? " outside" : ""}`} onClick={() => onSelectDate(day)} aria-label={`${day}，${dayOrders.length} 筆訂單`}>
          <span className="calendar-number">{dayDate.getUTCDate()}</span>
          <span className="calendar-events" style={{ gridTemplateRows: `repeat(${laneCount}, minmax(52px, auto))` }}>{dayOrders.map((order) => {
            const startsToday = order.arrivalDate === day;
            const endsTomorrow = order.departureDate === addDays(day, 1);
            const segmentStart = startsToday || isWeekStart;
            const segmentEnd = endsTomorrow || isWeekEnd;
            const segmentShape = segmentStart && segmentEnd ? "segment-single" : segmentStart ? "segment-start" : segmentEnd ? "segment-end" : "segment-middle";
            const assignment = calendarAssignments.get(order.id) ?? { color: calendarColor(order.id), lane: 0 };
            const roomLabel = startsToday ? (order.roomNumber ?? "未分房") : `續住 ${order.roomNumber ?? "未分房"}`;
            return <i className={`calendar-event stay-color-${assignment.color} ${segmentShape}`} style={{ gridRow: assignment.lane + 1 }} key={order.id} title={`${order.guestName}・${order.roomNumber ?? "未分房"}・${startsToday ? "入住" : "續住"}`}><span className="calendar-event-room">{roomLabel}</span><span className="calendar-event-guest">{order.guestName}</span></i>;
          })}</span>
        </button>;
      })}
        </div>
      </div>
      <SelectedDateOrders selectedDate={selectedDate} orders={selectedOrders} onOpenOrder={onOpenOrder}/>
    </div>
  </section>;
}

function SelectedDateOrders({ selectedDate, orders, onOpenOrder }: { selectedDate: string; orders: Order[]; onOpenOrder: (order: Order) => void }) {
  return <div className="calendar-selected-orders" aria-label={`${selectedDate} 訂單詳細資料`}>
    <div className="section-heading calendar-agenda-heading"><h2>{selectedDate.slice(5).replace("-", "/")} 住宿</h2><span>{orders.length} 筆</span></div>
    {orders.length === 0 && <div className="empty">這一天沒有住宿訂單</div>}
    {orders.map((order) => <div className="calendar-agenda-order" key={order.id}><span className={`calendar-stay-state ${order.arrivalDate === selectedDate ? "arrival" : "continuing"}`}>{order.arrivalDate === selectedDate ? "當日入住" : "續住中"}</span><OrderCard order={order} onSelect={() => onOpenOrder(order)} /></div>)}
  </div>;
}

function calendarColor(orderId: string) {
  const colors = calendarColors;
  let hash = 0;
  for (const character of orderId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

const calendarColors = ["sage", "sky", "amber", "rose", "violet", "teal", "coral"] as const;

function buildCalendarAssignments(orders: Order[]) {
  const activeOrders = orders
    .filter((order) => order.status !== "cancelled")
    .sort((left, right) => left.arrivalDate.localeCompare(right.arrivalDate) || left.departureDate.localeCompare(right.departureDate) || left.id.localeCompare(right.id));
  const assigned: { order: Order; color: string; lane: number }[] = [];
  const laneEnds: string[] = [];
  const result = new Map<string, { color: string; lane: number }>();

  for (const order of activeOrders) {
    const overlapping = assigned.filter((item) => item.order.arrivalDate < order.departureDate && order.arrivalDate < item.order.departureDate);
    const usedColors = new Set(overlapping.map((item) => item.color));
    const color = calendarColors.find((candidate) => !usedColors.has(candidate)) ?? calendarColor(order.id);
    let lane = laneEnds.findIndex((departureDate) => departureDate <= order.arrivalDate);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = order.departureDate;
    assigned.push({ order, color, lane });
    result.set(order.id, { color, lane });
  }
  return result;
}

function OrderCard({ order, onSelect, onEdit, onCancel }: { order: Order; onSelect: () => void; onEdit?: () => void; onCancel?: () => void }) {
  const guestText = `${order.guestCountKnown ? "" : "預估 "}${order.displayGuestCount} 位`;
  return <article className={`order order-result status-${order.status}`}><div className="spread"><div><strong>{order.arrivalDate.slice(5).replace("-", "/")}・{order.guestName}</strong><p>{order.sourceChannel}・{guestText}・{order.id}</p></div><em>{statusLabel[order.status] ?? order.status}</em></div><div className="room-line"><span>房型／房號</span>{order.roomTypeName ?? "待對應"}・<b>{order.roomNumber ?? "—"}</b></div><div className="room-line"><span>住宿日期</span>{order.arrivalDate} → {order.departureDate}</div><div className="room-line"><span>款項</span>已付 {money(order.receivedAmount)}・尾款 {money(order.balanceAmount)}</div>{order.specialRequests && <div className="stay-note">房客留言：{order.specialRequests}</div>}{!order.guestCountKnown && <p className="review-badge">OwlNest 未提供人數，目前依房型預估</p>}{order.importState === "pending_review" && order.guestCountKnown && <p className="review-badge">訂單匯入・待人工確認</p>}{order.status !== "cancelled" && (order.arrivalDate === today || order.status === "checked_in" || !onEdit) && <button type="button" className="secondary compact" onClick={onSelect}>{order.status === "checked_in" ? "查看入住資訊" : "開始接待"}</button>}{order.status === "pending" && order.arrivalDate !== today && onEdit && <button type="button" className="secondary compact" onClick={onEdit}>手動修改訂單</button>}{order.status === "pending" && onCancel && <button type="button" className="danger compact" onClick={onCancel}>手動取消訂單</button>}</article>;
}

function StaySummary({ order, onEdit }: { order: Order; onEdit: () => void }) {
  const isStaying = order.status === "checked_in" && order.arrivalDate <= today && order.departureDate > today;
  const stayLabel = isStaying ? "目前入住中" : order.status === "checked_in" ? "已辦理入住" : "待入住";
  return <article className={`stay-summary ${order.status === "checked_in" ? "checked-in" : "pending"}`}><div className="stay-status"><span>{stayLabel}</span>{isStaying && <i>住宿中</i>}</div><h2>{order.guestName}・{order.roomNumber ?? "未分房"}</h2><p>{order.roomTypeName ?? "房型待確認"}・{order.sourceChannel}</p><div className="stay-facts"><div><small>住宿期間</small><strong>{order.arrivalDate.slice(5)} → {order.departureDate.slice(5)}</strong></div><div><small>入住人數</small><strong>{order.guestCountKnown ? "" : "預估 "}{order.displayGuestCount} 人</strong></div>{order.status === "checked_in" && <><div><small>早餐</small><strong>{order.breakfastTime ?? "待確認"}・{order.breakfastCount ?? 0} 人</strong></div><div><small>餐點</small><strong>{order.mealName ?? "待確認"}</strong></div></>}<div><small>款項</small><strong>{order.balanceAmount === 0 ? "已結清" : `尾款 ${money(order.balanceAmount)}`}</strong></div><div><small>證件</small><strong>{order.identityVerified ? "已核對" : "待核對"}</strong></div></div>{order.checkinNotes && <div className="stay-note">備註：{order.checkinNotes}</div>}<button type="button" className="primary" onClick={onEdit}>{order.status === "checked_in" ? "修改入住資料" : "開始接待"}</button></article>;
}

function OrderEditForm({ order, onSubmit, onCancel }: { order: Order; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="manual-form" onSubmit={onSubmit}><h3>手動修改訂單</h3><div className="booking-summary"><strong>{order.guestName}・{order.roomNumber ?? "未分房"}</strong><br/>{order.arrivalDate} → {order.departureDate}</div><div className="two-columns"><div><label>成人</label><input name="adults" type="number" min="1" defaultValue={order.guestCountKnown ? order.adults : order.displayGuestCount}/></div><div><label>兒童</label><input name="children" type="number" min="0" defaultValue={order.guestCountKnown ? order.children : 0}/></div></div><label>房客留言／飲食禁忌／訂單備註</label><textarea name="specialRequests" rows={4} defaultValue={order.specialRequests ?? ""}/><div className="action-row"><button className="primary compact" type="submit">儲存修改</button><button className="secondary compact" type="button" onClick={onCancel}>返回</button></div></form>;
}

function ManualOrderForm({ base, onSubmit }: { base: BaseData; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="manual-form" onSubmit={onSubmit}><h3>手動訂單</h3><label>旅客姓名</label><input name="guestName" required/><div className="two-columns"><div><label>來源</label><select name="sourceChannel">{base.sourceChannels.map((item) => <option key={item}>{item}</option>)}</select></div><div><label>房型</label><select name="roomTypeId">{base.roomTypes.filter((item) => item.isBookable).map((item) => <option key={item.id} value={item.id}>{item.displayName}・{item.defaultRoomNumber}</option>)}</select></div></div><div className="two-columns"><div><label>入住</label><input name="arrivalDate" type="date" required/></div><div><label>退房</label><input name="departureDate" type="date" required/></div></div><div className="two-columns"><div><label>人數</label><input name="adults" type="number" min="1" defaultValue="2"/></div><div><label>總額</label><input name="totalAmount" type="number" min="0"/></div></div><label>已付訂金</label><input name="receivedAmount" type="number" min="0" defaultValue="0"/><label>備註</label><textarea name="specialRequests" rows={2}/><button className="primary" type="submit">儲存訂單</button></form>;
}
