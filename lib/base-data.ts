export const roomTypeSeed = [
  ["lake-green-double", "湖水綠意雙人房", "202", true],
  ["lake-sky-terrace-double", "湖光晴空露台雙人房", "301", true],
  ["morning-green-double", "晨光綠語雙人房", "303", true],
  ["light-island-quad", "光嶼雅築四人房", "204", true],
  ["lakeside-shadow-double", "湖畔拾影雙人房", "201", true],
  ["closed-203", "未開放1", "203", false],
  ["closed-302", "未開放2", "302", false],
] as const;

export const mealSeed = [
  ["salmon", "鮭魚", true],
  ["wagyu-rice", "和牛燒飯", false],
  ["eggs-benedict", "班尼迪克蛋", false],
  ["vegetable-pot", "雜菜煲", false],
] as const;

export const breakfastTimes = ["08:00", "08:30", "09:00", "09:30", "10:00", "不用餐"] as const;
export const sourceChannels = ["Booking", "官網", "電話訂房", "公務住宿", "現場付款", "活動收入"] as const;

export const settingOptionSeed = [
  ...breakfastTimes.map((label, sortOrder) => [`breakfast-${sortOrder}`, "breakfast_time", label, "*", sortOrder] as const),
  ...sourceChannels.map((label, sortOrder) => [`source-${sortOrder}`, "source_channel", label, "*", sortOrder] as const),
  ["payment-cash", "payment_method", "現金", "*", 0] as const,
  ["payment-transfer", "payment_method", "轉帳", "*", 1] as const,
  ["payment-online-card", "payment_method", "線上刷卡", "官網", 2] as const,
] as const;

export const automationJobSeed = [
  ["gmail-order-import", "Gmail 訂單檢查", "讀取 OwlTing／Booking 訂單通知信並匯入待確認訂單", "interval", 15, null, true],
  ["gmail-guest-message", "Gmail 訂單留言檢查", "檢查住客留言、飲食禁忌與特殊需求通知", "interval", 15, null, true],
  ["owlnest-reconcile", "OwlNest 訂單核對", "下載訂單列表並比對 Gmail 與人工訂單", "daily", null, "06:00", true],
  ["prep-report", "每日備料表", "依已確認入住與早餐需求產出當日備料人數", "daily", null, "18:00", true],
  ["line-notification", "LINE 工作群組通知", "有新訂單、異常或接待事件時即時通知", "event", null, null, true],
] as const;

export function paymentMethodsFor(channel: string) {
  return channel === "官網" ? ["現金", "轉帳", "線上刷卡"] : ["現金", "轉帳"];
}
