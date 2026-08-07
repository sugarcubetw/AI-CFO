"use client";

import { useState } from "react";

type View = "today" | "orders" | "visitor" | "checkin";

const roomTypeMap: Record<string, string> = {
  "湖水綠意雙人房": "202",
  "湖光晴空露台雙人房": "301",
  "晨光綠語雙人房": "303",
  "光嶼雅築四人房": "204",
  "湖畔拾影雙人房": "201",
  "未開放1": "203",
  "未開放2": "302",
};

const sampleOrders = [
  { id: "OBE…080601", guest: "廖先生", source: "Booking", roomType: "湖水綠意雙人房", arrival: "2026-08-08", departure: "2026-08-09", guests: 2, status: "待入住" },
  { id: "OBE…080501", guest: "王小姐", source: "Booking", roomType: "光嶼雅築四人房", arrival: "2026-08-14", departure: "2026-08-15", guests: 4, status: "待入住" },
  { id: "OBE…080402", guest: "陳小姐", source: "Booking", roomType: "光嶼雅築四人房", arrival: "2026-08-29", departure: "2026-08-30", guests: 3, status: "待入住" },
  { id: "OBE…080603", guest: "何先生", source: "Booking", roomType: "湖畔拾影雙人房", arrival: "2026-09-06", departure: "2026-09-07", guests: 2, status: "待入住" },
  { id: "OBE…080602", guest: "林小姐", source: "官網", roomType: "晨光綠語雙人房", arrival: "2026-09-14", departure: "2026-09-15", guests: 2, status: "待結清" },
  { id: "OBE…080502", guest: "李小姐", source: "Booking", roomType: "湖水綠意雙人房", arrival: "2026-09-19", departure: "2026-09-20", guests: 3, status: "已取消" },
];

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [breakfastTime, setBreakfastTime] = useState("08:30");
  const [breakfastCount, setBreakfastCount] = useState(2);
  const [done, setDone] = useState(false);
  const [fromDate, setFromDate] = useState("2026-08-03");
  const [toDate, setToDate] = useState("2026-08-09");

  const filteredOrders = sampleOrders.filter((order) => order.arrival <= toDate && order.departure >= fromDate);

  function switchView(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>接待工作台</h1>
          <p>8 月 6 日・接待人員 小陳</p>
        </div>
        <button type="button" className="arrival-button" onClick={() => switchView("visitor")}>來訪 1</button>
      </header>

      <nav className="tabs" aria-label="接待功能">
        {[["today", "今日"], ["orders", "訂單"], ["visitor", "來訪"], ["checkin", "入住"]].map(([key, label]) => (
          <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => switchView(key as View)}>{label}</button>
        ))}
      </nav>

      {view === "today" && <section className="screen">
        <div className="section-heading"><h2>今日入住</h2><span>2 筆・1 筆已抵達</span></div>
        <article className="order selected">
          <div className="spread"><div><strong>王小姐・301</strong><p>官網・2 位・住宿 2 晚</p></div><em>已抵達</em></div>
          <div className="facts"><div><small>尾款</small>NT$ 6,800・待確認</div><div><small>早餐</small>08:30・2 位</div></div>
          <button type="button" className="primary" onClick={() => switchView("checkin")}>開始接待</button>
        </article>
        <article className="order">
          <div className="spread"><div><strong>林先生・203</strong><p>Booking・2 位・住宿 1 晚</p></div><em>預計 17:30</em></div>
          <div className="facts"><div><small>現場付款</small>NT$ 4,200</div><div><small>早餐</small>尚未確認</div></div>
        </article>
        <p className="privacy">攝影機事件只協助接待，不自動辨識房客身分</p>
      </section>}

      {view === "orders" && <section className="screen">
        <div className="section-heading"><h2>所有訂單</h2><span>{filteredOrders.length} 筆</span></div>
        <div className="date-filter">
          <div className="two-columns"><div><label htmlFor="from-date">入住區間起日</label><input id="from-date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></div><div><label htmlFor="to-date">入住區間迄日</label><input id="to-date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div></div>
          <button type="button" className="week-button" onClick={() => { setFromDate("2026-08-03"); setToDate("2026-08-09"); }}>回到本週</button>
        </div>
        <p className="range-label">查詢期間：{fromDate} 至 {toDate}</p>
        {filteredOrders.length === 0 && <div className="empty">此期間沒有訂單，可調整查詢日期。</div>}
        {filteredOrders.map((order) => <article className={`order order-result ${order.status === "已取消" ? "cancelled" : ""}`} key={order.id}>
          <div className="spread"><div><strong>{order.arrival.slice(5).replace("-", "/")}・{order.guest}</strong><p>{order.source}・{order.guests} 位・{order.id}</p></div><em>{order.status}</em></div>
          <div className="room-line"><span>房型</span>{order.roomType}</div>
          <div className="room-line"><span>對應房號</span><b>{roomTypeMap[order.roomType]}</b></div>
          <div className="room-line"><span>住宿日期</span>{order.arrival} → {order.departure}</div>
        </article>)}
        <p className="privacy">預設顯示本週；可自行指定任意起訖日期</p>
      </section>}

      {view === "visitor" && <section className="screen">
        <div className="section-heading"><h2>待確認來訪</h2><span>剛剛</span></div>
        <article className="camera-event">
          <div className="camera" role="img" aria-label="停車場來車代表畫面示意">
            <span className="camera-name">停車場 1.6</span><div className="car"><i /><i /></div><span className="camera-time">16:42:18</span>
          </div>
          <div className="event-copy"><div className="spread"><div><strong>偵測到車輛與人物</strong><p>10 個代表畫面・完整進場動線</p></div><em>待配對</em></div></div>
        </article>
        <label htmlFor="order">對應訂單</label>
        <select id="order"><option>王小姐・301・官網</option><option>林先生・203・Booking</option><option>非住客／供應商</option><option>暫時無法確認</option></select>
        <label htmlFor="plate">車牌或車輛備註</label><input id="plate" defaultValue="BCE-3281" />
        <button type="button" className="primary" onClick={() => switchView("checkin")}>綁定訂單並開始接待</button>
        <button type="button" className="secondary">查看進場短片</button>
      </section>}

      {view === "checkin" && <section className="screen">
        <div className="booking-summary"><strong>王小姐・301</strong><br />官網訂房・2 位・8/6–8/8・訂單總額 NT$ 10,000<br />車牌 BCE-3281<small>訂單及訂金資料來自 OwlTing 訂單郵件</small></div>
        <label htmlFor="identity">身分證號／證件號碼</label><input id="identity" type="password" placeholder="輸入後預設遮蔽" autoComplete="off" />
        <label className="check"><input type="checkbox" /> 已核對證件正本</label>
        <div className="two-columns"><div><label htmlFor="guests">實際入住</label><input id="guests" type="number" defaultValue="2" min="1" /></div><div><label htmlFor="payment">尾款方式</label><select id="payment"><option>現金</option><option>轉帳</option></select></div></div>
        <div className="two-columns"><div><label htmlFor="deposit">已付訂金</label><input id="deposit" value="3,200" readOnly /><small className="field-note">訂單郵件帶入</small></div><div><label htmlFor="balance">本次應收尾款</label><input id="balance" defaultValue="6,800" inputMode="numeric" /></div></div>
        <div className="two-columns"><div><label htmlFor="breakfast">早餐時間</label><select id="breakfast" value={breakfastTime} onChange={(event) => { setBreakfastTime(event.target.value); if (event.target.value === "不用餐") setBreakfastCount(0); }}><option>08:00</option><option>08:30</option><option>09:00</option><option>09:30</option><option>10:00</option><option>不用餐</option></select></div><div><label htmlFor="breakfast-count">用餐人數</label><input id="breakfast-count" type="number" value={breakfastCount} min="0" onChange={(event) => setBreakfastCount(Number(event.target.value))} /></div></div>
        <label htmlFor="meal">餐點</label><select id="meal"><option>鮭魚（預設）</option><option>和牛燒飯</option><option>班尼迪克蛋</option><option>雜菜煲</option></select>
        <label htmlFor="notes">人數差異／飲食禁忌／接待備註</label><textarea id="notes" rows={3} placeholder="如用餐人數不同，填寫原因即可" />
        <button type="button" className="primary" onClick={() => setDone(true)}>確認並完成入住</button>
        <p className={done ? "result done" : "result"}>{done ? "✓ 已完成入住，尾款與早餐資料已記錄" : "完成後將更新訂單、收款與備料資料"}</p>
      </section>}
    </main>
  );
}
