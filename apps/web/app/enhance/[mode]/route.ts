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

  try {
    const requestBody = await request.text();
    const headers = new Headers({
      "content-type": request.headers.get("content-type") ?? "application/json",
    });
    const authorization = request.headers.get("authorization");
    const sessionId = request.headers.get("x-session-id");

    if (authorization) {
      headers.set("authorization", authorization);
    }

    if (sessionId) {
      headers.set("x-session-id", sessionId);
    }

    const apiResponse = await fetch(`${apiBaseUrl}/enhance/${mode}`, {
      body: requestBody,
      cache: "no-store",
      headers,
      method: "POST",
    });
    const body = await apiResponse.text();

    return new NextResponse(body, {
      headers: {
        "content-type": apiResponse.headers.get("content-type") ?? "application/json",
      },
      status: apiResponse.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "gateway_error",
        message: error instanceof Error ? error.message : "Failed to connect to upstream API.",
      },
      { status: 502 },
    );
  }
}
