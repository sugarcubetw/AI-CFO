import { getHomePageData, taipeiToday } from "../../../lib/home-page-cache";
import { isIsoDate, jsonError } from "../../../lib/server";

export async function GET(request: Request) {
  const requestedDate = new URL(request.url).searchParams.get("date") ?? taipeiToday();
  if (!isIsoDate(requestedDate)) return jsonError("首頁日期無效");
  const data = await getHomePageData(requestedDate);
  return Response.json(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Home-Cache-Key": `home-page-data:${requestedDate}`,
    },
  });
}
