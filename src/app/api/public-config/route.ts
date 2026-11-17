import { NextResponse } from "next/server";
import {
  getJpInsightPublicUrl,
  getJpInsightWidgetUrl,
  getOjsPublicUrl,
} from "@/lib/public-urls";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ojsPublicUrl: getOjsPublicUrl(),
      jpInsightPublicUrl: getJpInsightPublicUrl(),
      jpInsightWidgetUrl: getJpInsightWidgetUrl(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
