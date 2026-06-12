import { type NextRequest, NextResponse } from "next/server";

const defaultApiBaseUrl = "http://localhost:4000";
const allowedMethods = new Set(["DELETE", "GET", "POST", "PUT"]);

type SettingsRouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: SettingsRouteContext) {
  return proxySettingsRequest(request, context);
}

export async function PUT(request: NextRequest, context: SettingsRouteContext) {
  return proxySettingsRequest(request, context);
}

export async function DELETE(request: NextRequest, context: SettingsRouteContext) {
  return proxySettingsRequest(request, context);
}

export async function POST(request: NextRequest, context: SettingsRouteContext) {
  return proxySettingsRequest(request, context);
}

async function proxySettingsRequest(request: NextRequest, context: SettingsRouteContext) {
  if (!allowedMethods.has(request.method)) {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const { path } = await context.params;
  const settingsPath = path.map(encodeURIComponent).join("/");
  const apiBaseUrl = (
    process.env.PROMPTGEN_API_URL ??
    process.env.NEXT_PUBLIC_PROMPTGEN_API_URL ??
    defaultApiBaseUrl
  ).replace(/\/$/, "");
  const upstreamUrl = new URL(`${apiBaseUrl}/settings/${settingsPath}`);
  upstreamUrl.search = new URL(request.url).search;

  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const authorization = request.headers.get("authorization");
    const sessionId = request.headers.get("x-session-id");

    if (contentType) {
      headers.set("content-type", contentType);
    }

    if (authorization) {
      headers.set("authorization", authorization);
    }

    if (sessionId) {
      headers.set("x-session-id", sessionId);
    }

    const upstreamInit: RequestInit = {
      cache: "no-store",
      headers,
      method: request.method,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      upstreamInit.body = await request.text();
    }

    const apiResponse = await fetch(upstreamUrl, upstreamInit);
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
        error: "settings_gateway_error",
        message: error instanceof Error ? error.message : "Failed to connect to upstream API.",
      },
      { status: 502 },
    );
  }
}
