import { type NextRequest, NextResponse } from "next/server";

const defaultApiBaseUrl = "http://localhost:4000";
const validModes = new Set(["improve", "enhance", "refine", "shorten"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mode: string }> },
) {
  const { mode } = await params;

  if (!validModes.has(mode)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const apiBaseUrl = (
    process.env.PROMPTGEN_API_URL ??
    process.env.NEXT_PUBLIC_PROMPTGEN_API_URL ??
    defaultApiBaseUrl
  ).replace(/\/$/, "");
  const apiResponse = await fetch(`${apiBaseUrl}/enhance/${mode}`, {
    body: await request.text(),
    cache: "no-store",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    method: "POST",
  });
  const body = await apiResponse.text();

  return new NextResponse(body, {
    headers: {
      "content-type": apiResponse.headers.get("content-type") ?? "application/json",
    },
    status: apiResponse.status,
  });
}
