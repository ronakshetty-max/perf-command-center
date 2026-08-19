import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PIPELINE_DIR = join(process.cwd(), "..", "pipeline");
const CACHE_FILE = join(PIPELINE_DIR, ".signals_cache.json");

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    if (refresh || !existsSync(CACHE_FILE)) {
      execSync(`cd ${PIPELINE_DIR} && python3 fetch_live_signals.py --refresh`, {
        timeout: 30000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));

      // Filter to Rize campaigns only
      const rizeSignals: Record<string, any[]> = {};
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          rizeSignals[key] = val.filter((r: any) =>
            (r.campaign || "").includes("RPSME") || (r.campaign || "").includes("rpsme")
          );
        }
      }

      return NextResponse.json({
        signals: rizeSignals,
        cached: !refresh,
        counts: Object.fromEntries(
          Object.entries(rizeSignals).map(([k, v]) => [k, v.length])
        ),
      });
    }

    return NextResponse.json({ error: "No signals available" }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
