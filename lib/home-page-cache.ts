import { revalidateTag, unstable_cache } from "next/cache";
import { queryBaseData } from "./base-data-query";
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

// `date` is serialized into the unstable_cache key, producing a distinct entry
// equivalent to ["home-page-data", "YYYY-MM-DD"]. This prevents yesterday's
// entry from being served after Taipei midnight even before the TTL expires.
const cachedHomePageData = unstable_cache(
  queryHomePageData,
  ["home-page-data"],
  { tags: [HOME_PAGE_CACHE_TAG], revalidate: HOME_PAGE_CACHE_TTL_SECONDS },
);

export async function getHomePageData(date: string) {
  try {
    return await cachedHomePageData(date);
  } catch (error) {
    console.error("[home-page-cache] cache read failed; querying D1 directly", error);
    return queryHomePageData(date);
  }
}

export function invalidateHomePageCache() {
  revalidateTag(HOME_PAGE_CACHE_TAG, { expire: 0 });
  revalidateTag(CALENDAR_CACHE_TAG, { expire: 0 });
}
