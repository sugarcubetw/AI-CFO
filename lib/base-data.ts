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

export function paymentMethodsFor(channel: string) {
  return channel === "官網" ? ["現金", "轉帳", "線上刷卡"] : ["現金", "轉帳"];
}
