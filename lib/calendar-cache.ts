import { queryOrders } from "./order-query";

export const CALENDAR_CACHE_TAG = "orders-calendar";
export const CALENDAR_CACHE_TTL_SECONDS = 900;

type CalendarCacheEntry = {
  expiresAt: number;
  value: Awaited<ReturnType<typeof queryOrders>>;
};

// Keep this cache deliberately runtime-agnostic.  `unstable_cache` is not
// available in every Cloudflare Worker/Vinext runtime and can fail while the
// route module is being imported.  A small per-isolate cache still provides
// the desired read-heavy behaviour and safely falls back to D1.
const calendarCache = new Map<string, CalendarCacheEntry>();

export async function getCalendarOrders(from: string, to: string) {
  const key = `orders-calendar:${from}:${to}`;
  const cached = calendarCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = await queryOrders(from, to);
    calendarCache.set(key, {
      value,
      expiresAt: Date.now() + CALENDAR_CACHE_TTL_SECONDS * 1000,
    });
    return value;
  } catch (error) {
    console.error("[calendar-cache] cache read failed; querying D1 directly", error);
    if (cached) return cached.value;
    return queryOrders(from, to);
  }
}

export function invalidateCalendarCache() {
  calendarCache.clear();
}
