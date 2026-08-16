import { queryBaseData } from "../../../lib/base-data-query";

export async function GET() {
  return Response.json(await queryBaseData());
}
