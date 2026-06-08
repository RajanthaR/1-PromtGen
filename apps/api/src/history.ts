import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createPromptHistorySendToEditorResult,
  type HistoryUsagePort,
  type PromptOperationRecord,
} from "@promptgen/history-usage";

import type { JsonLogger } from "./logger";

type HistoryRoute =
  | { action: "list" }
  | { action: "delete"; historyEntryId: string }
  | { action: "sendToEditor"; historyEntryId: string };

export async function handleHistoryRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: { history?: HistoryUsagePort; logger: JsonLogger },
): Promise<boolean> {
  const route = parseHistoryRoute(request.method ?? "GET", url.pathname);

  if (!route) {
    return false;
  }

  if ("error" in route) {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: route.error,
    });
    dependencies.logger.warn("api.history_request", {
      statusCode: 405,
      error: "method_not_allowed",
    });
    return true;
  }

  if (!dependencies.history) {
    writeJson(response, 503, {
      error: "history_not_configured",
      message: "Prompt history storage is not configured.",
    });
    dependencies.logger.warn("api.history_request", {
      statusCode: 503,
      error: "history_not_configured",
    });
    return true;
  }

  const userId = resolveUserId(request, url);

  if (!userId) {
    writeJson(response, 400, {
      error: "user_id_required",
      message: "x-user-id header or user_id query parameter is required.",
    });
    dependencies.logger.warn("api.history_request", {
      statusCode: 400,
      error: "user_id_required",
    });
    return true;
  }

  if (route.action === "list") {
    const history = await dependencies.history.listPromptHistory(userId);

    writeJson(response, 200, {
      history: history.map(toHistoryResponseEntry),
    });
    dependencies.logger.info("api.history_request", {
      action: route.action,
      count: history.length,
      statusCode: 200,
    });
    return true;
  }

  if (route.action === "delete") {
    await dependencies.history.deleteHistoryEntry(userId, route.historyEntryId);

    writeJson(response, 200, {
      deleted: true,
      id: route.historyEntryId,
    });
    dependencies.logger.info("api.history_request", {
      action: route.action,
      statusCode: 200,
    });
    return true;
  }

  const entry = await dependencies.history.getPromptHistoryEntry(userId, route.historyEntryId);

  if (!entry) {
    writeJson(response, 404, {
      error: "history_entry_not_found",
      message: "History entry was not found for this user.",
    });
    dependencies.logger.warn("api.history_request", {
      action: route.action,
      statusCode: 404,
      error: "history_entry_not_found",
    });
    return true;
  }

  const sendToEditor = createPromptHistorySendToEditorResult(entry);

  writeJson(response, 200, {
    id: sendToEditor.id,
    original: sendToEditor.original,
    enhanced: sendToEditor.enhanced,
    editor_payload: sendToEditor.editorPayload,
  });
  dependencies.logger.info("api.history_request", {
    action: route.action,
    statusCode: 200,
  });
  return true;
}

function parseHistoryRoute(
  method: string,
  pathname: string,
): HistoryRoute | { error: string } | null {
  if (pathname === "/history") {
    return method === "GET"
      ? { action: "list" }
      : { error: "GET is required for listing prompt history." };
  }

  const sendToEditorMatch = /^\/history\/([^/]+)\/send-to-editor$/.exec(pathname);

  if (sendToEditorMatch) {
    return method === "POST"
      ? { action: "sendToEditor", historyEntryId: decodeURIComponent(sendToEditorMatch[1] ?? "") }
      : { error: "POST is required for sending prompt history to the editor." };
  }

  const entryMatch = /^\/history\/([^/]+)$/.exec(pathname);

  if (entryMatch) {
    return method === "DELETE"
      ? { action: "delete", historyEntryId: decodeURIComponent(entryMatch[1] ?? "") }
      : { error: "DELETE is required for deleting prompt history entries." };
  }

  return null;
}

function resolveUserId(request: IncomingMessage, url: URL): string | null {
  const headerValue = request.headers["x-user-id"];

  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }

  if (Array.isArray(headerValue)) {
    const firstValue = headerValue.find((value) => value.trim());

    if (firstValue) {
      return firstValue.trim();
    }
  }

  const queryUserId = url.searchParams.get("user_id")?.trim();

  return queryUserId || null;
}

function toHistoryResponseEntry(record: PromptOperationRecord): Record<string, unknown> {
  return {
    id: record.id,
    original: record.original,
    enhanced: record.enhanced,
    mode: record.mode,
    target_model: record.targetModel,
    prompt_type: record.promptType,
    structure_score_before: record.structureScoreBefore ?? null,
    structure_score_after: record.structureScoreAfter ?? null,
    tokens: record.tokens ?? null,
    provider: record.provider ?? null,
    model: record.model ?? null,
    latency_ms: record.latencyMs ?? null,
    saved: record.saved,
    thumbs_feedback: record.thumbsFeedback ?? null,
    created_at: record.createdAt.toISOString(),
  };
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
