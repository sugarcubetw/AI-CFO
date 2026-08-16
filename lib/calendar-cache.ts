import { unstable_cache } from "next/cache";
import { queryOrders } from "./order-query";

export const CALENDAR_CACHE_TAG = "orders-calendar";
export const CALENDAR_CACHE_TTL_SECONDS = 900;

// `from` and `to` are serialized as part of the cache key, so each visible
// week/month has its own entry while repeated calendar visits reuse D1 results.
const cachedCalendarOrders = unstable_cache(
  queryOrders,
  ["orders-calendar-data"],
  { tags: [CALENDAR_CACHE_TAG], revalidate: CALENDAR_CACHE_TTL_SECONDS },
);

export async function getCalendarOrders(from: string, to: string) {
  try {
    return await cachedCalendarOrders(from, to);
  } catch (error) {
    console.error("[calendar-cache] cache read failed; querying D1 directly", error);
    return queryOrders(from, to);
  }
}
