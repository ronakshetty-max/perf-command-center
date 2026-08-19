import { NextRequest, NextResponse } from "next/server";
import { getInsights } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const business = request.nextUrl.searchParams.get("business") || "eb";

  try {
    const data = await getInsights(business);
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
