import assert from "node:assert/strict";
import test from "node:test";
import { parseOwltingBatch, parseOwltingEmail } from "../lib/owlting-email-parser.ts";
import { parseOwlNestOrderList } from "../lib/owlting-order-list-parser.ts";

const bookingBody = `來自 Booking.com 的新訂單！
OTA訂單編號為: 5193796340
訂單編號： OBE92210718626080601
入住日期
退房日期
2026-08-08
2026-08-09
房型名稱
湖水綠意雙人房
Booking.com
人數
大人 2 人,小孩 0 人,嬰兒 0 人
剩餘尾款
TWD 7700
訂單款項
TWD 7700
付款狀態
待結清
旅客姓名
測試旅客
旅客信箱
te********@guest.booking.com
特殊需求
無
若對訂單有任何相關問題`;

const websiteBody = `您有新訂單！
訂單編號： OBE99420718626080602
入住日期
退房日期
2026-09-14
2026-09-15
房型名稱
晨光綠語雙人房
官網優惠價
人數
大人 2 人,小孩 0 人,嬰兒 0 人
訂單款項
TWD 5800
已收金額
TWD 2900
剩餘尾款
TWD 2900
支付方式
信用卡
付款狀態
待結清
旅客姓名
測試旅客
特殊需求
一位蛋奶素
取消規定`;

test("parses Booking order amounts, room and guests", () => {
  const result = parseOwltingEmail({ id: "m1", from: "OwlNest_Booking <owlnest@owlting.com>", subject: "Booking.com 訂單成立通知 (訂單編號 OBE92210718626080601)", body: bookingBody, emailTs: "2026-08-06T14:19:43Z" });
  assert.equal(result.state, "parsed");
  assert.equal(result.order.sourceChannel, "Booking");
  assert.equal(result.order.roomTypeName, "湖水綠意雙人房");
  assert.equal(result.order.adults, 2);
  assert.equal(result.order.guestCountProvided, true);
  assert.equal(result.order.totalAmount, 7700);
  assert.equal(result.order.balanceAmount, 7700);
});

test("marks guest counts missing from an order event so prior values are preserved", () => {
  const result = parseOwltingEmail({ id: "m-no-count", from: "owlnest@owlting.com", subject: "Booking.com 訂單修改通知 (訂單編號 OBE92210718626080601)", body: bookingBody.replace("人數\n大人 2 人,小孩 0 人,嬰兒 0 人\n", ""), emailTs: "2026-08-07T00:00:00Z" });
  assert.equal(result.state, "parsed");
  assert.equal(result.order.guestCountProvided, false);
});

test("parses website deposit and payment method", () => {
  const result = parseOwltingEmail({ id: "m2", from: "owlnest@owlting.com", subject: "新預定通知信！ ( 訂單編號: OBE99420718626080602 )", body: websiteBody, emailTs: "2026-08-06T16:20:59Z" });
  assert.equal(result.state, "parsed");
  assert.equal(result.order.sourceChannel, "官網");
  assert.equal(result.order.receivedAmount, 2900);
  assert.equal(result.order.paymentMethod, "信用卡");
  assert.match(result.order.specialRequests, /蛋奶素/);
});

test("cancellation status wins and suspicious amounts are warned", () => {
  const result = parseOwltingEmail({ id: "m3", from: "owlnest@owlting.com", subject: "Booking.com 訂單取消通知 (訂單編號 OBE92210718626080601)", body: bookingBody.replace("TWD 7700\n訂單款項\nTWD 7700", "TWD 7700\n訂單款項\nTWD 0"), emailTs: "2026-08-07T00:00:00Z" });
  assert.equal(result.state, "parsed");
  assert.equal(result.order.eventType, "cancelled");
  assert.equal(result.order.paymentStatus, "cancelled");
  assert.ok(result.order.parseWarnings.includes("cancelled_amounts_not_financial_truth"));
});

test("ignores non-order OwlTing messages and wrong senders", () => {
  const batch = parseOwltingBatch([
    { id: "m4", from: "owlnest@owlting.com", subject: "住客傳送新訊息", body: bookingBody, emailTs: "2026-08-07T00:00:00Z" },
    { id: "m5", from: "other@example.com", subject: "訂單成立通知 OBE1", body: bookingBody, emailTs: "2026-08-07T00:00:00Z" },
  ]);
  assert.equal(batch.orders.length, 0);
  assert.equal(batch.ignored.length, 2);
});

test("sorts Gmail newest-first results into chronological event order", () => {
  const cancelled = {
    id: "cancelled-newer",
    from: "owlnest@owlting.com",
    subject: "Booking.com 訂單取消通知 (訂單編號 OBE92210718626080601)",
    body: bookingBody,
    emailTs: "2026-08-07T00:00:00Z",
  };
  const created = {
    id: "created-older",
    from: "owlnest@owlting.com",
    subject: "Booking.com 訂單成立通知 (訂單編號 OBE92210718626080601)",
    body: bookingBody,
    emailTs: "2026-08-06T00:00:00Z",
  };
  const batch = parseOwltingBatch([cancelled, created]);
  assert.deepEqual(batch.orders.map((order) => order.eventType), ["created", "cancelled"]);
});

test("parses OwlNest CSV order list and derives channel, room and balance", () => {
  const csv = `訂單編號,訂購時間,入住日期,退房日期,姓名,客房類別,總金額,已收,未收,訂單來源,OTA訂單編號,官網金流,付款狀態\nOBE56170718626052201,2026-05-22 23:49,2026-08-07,2026-08-08,張 珮婕,湖畔拾影雙人房 * 1,"5,380",0,"5,380",Booking.com 5583941820,5583941820,,待結清`;
  const result = parseOwlNestOrderList(csv);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceChannel, "Booking");
  assert.equal(result.rows[0].roomNumber, "201");
  assert.equal(result.rows[0].totalAmount, 5380);
  assert.equal(result.rows[0].balanceAmount, 5380);
  assert.equal(result.rows[0].otaExternalId, "5583941820");
});

test("parses OwlNest export with split surname and given-name columns", () => {
  const csv = `訂單編號,訂購時間,入住日期,退房日期,姓,名,客房類別,總金額,已收,未收,訂單來源,OTA 訂單編號,官網金流,付款狀態\nOBE75630718626080603,2026-08-07 01:19:39,2026-09-06,2026-09-07,何,維,湖畔拾影雙人房 * 1,4000,0,4000,Booking.com,6471840594,---,待結清`;
  const result = parseOwlNestOrderList(csv);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.some((warning) => warning.includes("姓名")), false);
  assert.equal(result.rows[0].guestName, "何維");
  assert.equal(result.rows[0].roomNumber, "201");
  assert.equal(result.rows[0].balanceAmount, 4000);
});

test("preserves every room in a multi-room OwlNest order and flags guest count review", () => {
  const csv = `訂單編號,訂購時間,入住日期,退房日期,姓,名,客房類別,總金額,已收,未收,訂單來源,付款狀態\nOBE00250718626051401,2026-05-14 11:42:01,2026-08-08,2026-08-09,潘,宛妤,"湖畔拾影雙人房 * 1, 光嶼雅築四人房 * 1",11000,5500,5500,官網訂單,待結清`;
  const result = parseOwlNestOrderList(csv);
  assert.deepEqual(result.rows[0].roomNumbers, ["201", "204"]);
  assert.deepEqual(result.rows[0].roomTypeNames, ["湖畔拾影雙人房", "光嶼雅築四人房"]);
  assert.equal(result.warnings.some((warning) => warning.includes("多間房") && warning.includes("人工核對")), true);
});
