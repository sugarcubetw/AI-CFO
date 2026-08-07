"use client";
/* eslint-disable jsx-a11y/label-has-associated-control -- compact settings rows pair labels and controls by layout */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type RoomType = { id: string; displayName: string; defaultRoomNumber: string; isBookable: boolean; isActive: boolean };
type Option = { id: string; category: string; label: string; scope: string; sortOrder: number; isActive: boolean };
type Meal = { id: string; name: string; description: string | null; isDefault: boolean; isActive: boolean };
type Log = { id: number; actorId: string; action: string; objectType: string; objectId: string; detailRedacted: string | null; occurredAt: string };

const categoryTitle: Record<string, string> = { breakfast_time: "早餐時間", payment_method: "付款方式", source_channel: "訂單來源" };
const actionTitle: Record<string, string> = {
  "setting.created": "新增設定", "setting.updated": "修改設定", "setting.deactivated": "停用設定",
  "room_type.updated": "修改房型", "meal.created": "新增餐點", "meal.updated": "修改餐點", "meal.deactivated": "停用餐點",
  "reservation.created": "新增訂單", "reservation.checked_in": "完成／修改入住", "reservation.guest_count_corrected": "更正入住人數",
  "payment.duplicate_voided": "作廢重複付款", "owlnest.reconciled": "OwlNest 核對完成", "owlnest.reconcile_with_errors": "OwlNest 核對有錯誤",
  "prep_report.draft": "建立備料草稿", "prep_report.formal": "建立正式備料表",
};

export default function SettingsPage() {
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tab, setTab] = useState<"base" | "logs">("base");
  const [message, setMessage] = useState("正在讀取基礎資料…");

  const load = useCallback(async () => {
    await fetch("/api/bootstrap", { method: "POST" });
    const [settingsResponse, mealsResponse, logsResponse] = await Promise.all([fetch("/api/settings"), fetch("/api/meals"), fetch("/api/logs?limit=100")]);
    if (!settingsResponse.ok || !mealsResponse.ok || !logsResponse.ok) throw new Error("讀取設定或執行記錄失敗");
    const settings = await settingsResponse.json() as { roomTypes: RoomType[]; options: Option[] };
    setRooms(settings.roomTypes); setOptions(settings.options); setMeals(await mealsResponse.json() as Meal[]); setLogs(await logsResponse.json() as Log[]); setMessage("");
  }, []);

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : "讀取失敗")); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  const grouped = useMemo(() => Object.fromEntries(Object.keys(categoryTitle).map((category) => [category, options.filter((item) => item.category === category)])), [options]);

  async function saveRoom(event: FormEvent<HTMLFormElement>, room: RoomType) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, entity: "roomType", id: room.id, isBookable: form.get("isBookable") === "on", isActive: form.get("isActive") === "on" }) });
    const result = await response.json() as { error?: string }; setMessage(response.ok ? "已儲存房型設定並記錄 Log" : result.error ?? "儲存失敗"); if (response.ok) await load();
  }

  async function addOption(event: FormEvent<HTMLFormElement>, category: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, category }) });
    const result = await response.json() as { error?: string }; setMessage(response.ok ? `已新增${categoryTitle[category]}` : result.error ?? "新增失敗"); if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function toggleOption(option: Option) {
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: option.id, isActive: !option.isActive }) });
    setMessage(response.ok ? `已${option.isActive ? "停用" : "啟用"}${option.label}` : "更新失敗"); if (response.ok) await load();
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") ?? "").trim(); if (!name) return;
    const response = await fetch("/api/meals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json() as { error?: string }; setMessage(response.ok ? "已新增餐點並建立版本記錄" : result.error ?? "新增失敗"); if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function toggleMeal(meal: Meal) {
    const response = await fetch("/api/meals", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: meal.id, name: meal.name, isActive: !meal.isActive }) });
    setMessage(response.ok ? `已${meal.isActive ? "停用" : "啟用"}${meal.name}` : "更新失敗"); if (response.ok) await load();
  }

  return <main className="app-shell settings-shell">
    <header className="app-header"><div><h1>基礎資料設定</h1><p>管理者・所有修改保留 Log</p></div><Link className="header-link" href="/">返回工作台</Link></header>
    <nav className="settings-tabs" aria-label="設定功能"><button className={tab === "base" ? "active" : ""} onClick={() => setTab("base")}>基礎資料</button><button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>執行記錄</button></nav>
    {message && <p className="notice">{message}</p>}
    {tab === "base" && <section className="screen settings-content">
      <div className="section-heading"><h2>房型與房號</h2><span>{rooms.length} 筆</span></div>
      {rooms.map((room) => <form className="setting-card" key={room.id} onSubmit={(event) => saveRoom(event, room)}><div className="two-columns"><div><label>房號</label><input name="defaultRoomNumber" defaultValue={room.defaultRoomNumber} /></div><div><label>房型名稱</label><input name="displayName" defaultValue={room.displayName} /></div></div><div className="toggle-row"><label className="check"><input name="isBookable" type="checkbox" defaultChecked={room.isBookable}/> 可訂房</label><label className="check"><input name="isActive" type="checkbox" defaultChecked={room.isActive}/> 啟用</label><button className="inline-button" type="submit">儲存</button></div></form>)}
      {Object.entries(categoryTitle).map(([category, title]) => <section className="setting-group" key={category}><div className="section-heading"><h2>{title}</h2><span>{grouped[category]?.filter((item) => item.isActive).length ?? 0} 個啟用</span></div><form className="setting-add" onSubmit={(event) => addOption(event, category)}><input name="label" aria-label={`新增${title}`} placeholder={`新增${title}`} required/>{category === "payment_method" && <select name="scope" aria-label="適用訂單來源"><option value="*">全部來源</option>{grouped.source_channel?.filter((item) => item.isActive).map((item) => <option key={item.id}>{item.label}</option>)}</select>}<button className="primary" type="submit">新增</button></form>{grouped[category]?.map((option) => <div className={`setting-row ${option.isActive ? "" : "inactive"}`} key={option.id}><div><strong>{option.label}</strong>{category === "payment_method" && <small>{option.scope === "*" ? "全部來源" : option.scope}</small>}</div><button className="inline-button" type="button" onClick={() => toggleOption(option)}>{option.isActive ? "停用" : "啟用"}</button></div>)}</section>)}
      <section className="setting-group"><div className="section-heading"><h2>餐點</h2><span>{meals.filter((meal) => meal.isActive).length} 個啟用</span></div><form className="setting-add" onSubmit={addMeal}><input name="name" aria-label="新餐點名稱" placeholder="新增餐點名稱" required/><button className="primary" type="submit">新增</button></form>{meals.map((meal) => <div className={`setting-row ${meal.isActive ? "" : "inactive"}`} key={meal.id}><div><strong>{meal.name}{meal.isDefault ? "（預設）" : ""}</strong><small>變更會保留餐點版本</small></div><button className="inline-button" type="button" onClick={() => toggleMeal(meal)}>{meal.isActive ? "停用" : "啟用"}</button></div>)}</section>
    </section>}
    {tab === "logs" && <section className="screen"><div className="section-heading"><h2>執行記錄</h2><button className="inline-button" type="button" onClick={() => load()}>重新整理</button></div><p className="field-note log-help">顯示最近 100 筆人工操作與系統執行結果；不顯示證件、Token 或住客敏感內容。</p>{logs.length === 0 && <div className="empty">尚無執行記錄</div>}{logs.map((log) => <article className="log-card" key={log.id}><div className="spread"><strong>{actionTitle[log.action] ?? log.action}</strong><em>{log.action.includes("error") ? "異常" : "完成"}</em></div><p>{log.objectType}・{log.objectId}</p><small>{new Date(log.occurredAt.replace(" ", "T") + (log.occurredAt.includes("Z") ? "" : "Z")).toLocaleString("zh-TW")}</small><small className="log-actor">執行者：{log.actorId === "local-development" ? "本機開發" : log.actorId.slice(0, 12)}</small></article>)}</section>}
  </main>;
}
