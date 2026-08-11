import { asc } from "drizzle-orm";
import { getDb } from "../db";
import { meals, roomTypes, settingOptions } from "../db/schema";
import { breakfastTimes, sourceChannels } from "./base-data";

export async function queryBaseData() {
  const db = getDb();
  const options = await db.select().from(settingOptions).orderBy(asc(settingOptions.category), asc(settingOptions.sortOrder), asc(settingOptions.label));
  const active = (category: string) => options.filter((item) => item.category === category && item.isActive).map((item) => item.label);
  return {
    roomTypes: await db.select().from(roomTypes).orderBy(asc(roomTypes.defaultRoomNumber)),
    meals: await db.select().from(meals).orderBy(asc(meals.name)),
    breakfastTimes: active("breakfast_time").length ? active("breakfast_time") : breakfastTimes,
    sourceChannels: active("source_channel").length ? active("source_channel") : sourceChannels,
    paymentMethods: options.filter((item) => item.category === "payment_method"),
  };
}
