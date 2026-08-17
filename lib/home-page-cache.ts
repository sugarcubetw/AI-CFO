import { queryBaseData } from "./base-data-query";
import { invalidateCalendarCache } from "./calendar-cache";
import { queryOrders } from "./order-query";
import { queryPrepDemand } from "./prep-query";

export const HOME_PAGE_CACHE_TAG = "home-page";
export const CALENDAR_CACHE_TAG = "orders-calendar";
export const HOME_PAGE_CACHE_TTL_SECONDS = 900;

export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function sevenDayRangeFrom(date: string) {
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: date, to: end.toISOString().slice(0, 10) };
}

async function queryHomePageData(date: string) {
  const range = sevenDayRangeFrom(date);
  const [base, todayRows, orders, prep] = await Promise.all([
    queryBaseData(),
    queryOrders(date, date),
    queryOrders(range.from, range.to),
    queryPrepDemand(date, date),
  ]);
  return {
    date,
    range,
    base,
    todayOrders: todayRows.filter((order) => order.arrivalDate === date && order.status !== "cancelled"),
    orders,
    prep: { from: date, to: date, ...prep, latestReport: null, quantitiesDeferred: true },
  };
}

type HomePageCacheEntry = {
  expiresAt: number;
  value: Awaited<ReturnType<typeof queryHomePageData>>;
};

// Use a Worker-compatible per-isolate cache instead of importing Next.js
// `unstable_cache`, which is not implemented consistently by Vinext on
// Cloudflare Workers.  The date is part of the key so a Taipei midnight never
// serves yesterday's home data, and writes clear the map through the existing
// invalidation function.
const homePageCache = new Map<string, HomePageCacheEntry>();

export async function getHomePageData(date: string) {
  const key = `home-page-data:${date}`;
  const cached = homePageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = await queryHomePageData(date);
    homePageCache.set(key, {
      value,
      expiresAt: Date.now() + HOME_PAGE_CACHE_TTL_SECONDS * 1000,
    });
    return value;
  } catch (error) {
    console.error("[home-page-cache] cache read failed; querying D1 directly", error);
    if (cached) return cached.value;
    return queryHomePageData(date);
  }
}

export function invalidateHomePageCache() {
  homePageCache.clear();
  invalidateCalendarCache();
}
