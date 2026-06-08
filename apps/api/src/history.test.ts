import { createServer, type Server } from "node:http";

import {
  createInMemoryHistoryUsageStore,
  type HistoryUsagePort,
  type RecordPromptOperationInput,
} from "@promptgen/history-usage";
import { describe, expect, it } from "vitest";

import type { JsonLogger } from "./logger";
import { createApiRequestHandler } from "./server";

const testEnv = {
  apiPort: 0,
  appUrl: "http://localhost:3000",
  authSessionTtlSeconds: 2_592_000,
  nodeEnv: "test",
  promptQualityJudgeEnabled: false,
} as const;

describe("history endpoints", () => {
  it("lists only the authenticated user's prompt history entries", async () => {
    const history = createInMemoryHistoryUsageStore({
      createId: createSequentialId(),
      now: createSequentialClock(),
    });
    const server = await listen(history);

    try {
      await history.recordPromptOperation("user-1", createOperationInput("First original"));
      await history.recordPromptOperation("user-2", createOperationInput("Other original"));
      await history.recordPromptOperation("user-1", {
        ...createOperationInput("Second original"),
        thumbsFeedback: "up",
      });

      const response = await requestJson(server, "/history", {
        method: "GET",
        userId: "user-1",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        history: [
          {
            id: "history-3",
            original: "Second original",
            enhanced: "Enhanced Second original",
            mode: "enhance",
            target_model: "auto",
            prompt_type: "text",
            structure_score_before: 20,
            structure_score_after: 85,
            tokens: 120,
            provider: "test-provider",
            model: "test-model",
            latency_ms: 35,
            saved: false,
            thumbs_feedback: "up",
            created_at: "2026-06-07T00:00:03.000Z",
          },
          {
            id: "history-1",
            original: "First original",
            enhanced: "Enhanced First original",
            mode: "enhance",
            target_model: "auto",
            prompt_type: "text",
            structure_score_before: 20,
            structure_score_after: 85,
            tokens: 120,
            provider: "test-provider",
            model: "test-model",
            latency_ms: 35,
            saved: false,
            thumbs_feedback: null,
            created_at: "2026-06-07T00:00:01.000Z",
          },
        ],
      });
    } finally {
      await close(server);
    }
  });

  it("deletes prompt history entries through a user-scoped route", async () => {
    const history = createInMemoryHistoryUsageStore({
      createId: createSequentialId(),
      now: createSequentialClock(),
    });
    const server = await listen(history);

    try {
      const entry = await history.recordPromptOperation(
        "user-1",
        createOperationInput("Delete me"),
      );

      const response = await requestJson(server, `/history/${entry.id}`, {
        method: "DELETE",
        userId: "user-1",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: true, id: entry.id });
      await expect(history.listPromptHistory("user-1")).resolves.toEqual([]);
    } finally {
      await close(server);
    }
  });

  it("returns a faithful send-to-editor round trip payload", async () => {
    const history = createInMemoryHistoryUsageStore({
      createId: createSequentialId(),
      now: createSequentialClock(),
    });
    const server = await listen(history);

    try {
      const entry = await history.recordPromptOperation("user-1", {
        ...createOperationInput("Draft a launch email."),
        enhanced: "You are a lifecycle marketer. Draft a launch email.",
        mode: "shorten",
        targetModel: "gpt-5.4",
      });

      const response = await requestJson(server, `/history/${entry.id}/send-to-editor`, {
        method: "POST",
        userId: "user-1",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: entry.id,
        original: "Draft a launch email.",
        enhanced: "You are a lifecycle marketer. Draft a launch email.",
        editor_payload: {
          raw_prompt: "Draft a launch email.",
          enhanced_prompt: "You are a lifecycle marketer. Draft a launch email.",
          mode: "shorten",
          target_model: "gpt-5.4",
          prompt_type: "text",
        },
      });
    } finally {
      await close(server);
    }
  });

  it("does not expose another user's entry through send-to-editor", async () => {
    const history = createInMemoryHistoryUsageStore({
      createId: createSequentialId(),
      now: createSequentialClock(),
    });
    const server = await listen(history);

    try {
      const entry = await history.recordPromptOperation("user-1", createOperationInput("Secret"));

      const response = await requestJson(server, `/history/${entry.id}/send-to-editor`, {
        method: "POST",
        userId: "user-2",
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "history_entry_not_found",
        message: "History entry was not found for this user.",
      });
    } finally {
      await close(server);
    }
  });
});

async function listen(history: HistoryUsagePort): Promise<Server> {
  const logger = {
    info() {
      return undefined;
    },
    warn() {
      return undefined;
    },
    error() {
      return undefined;
    },
  } satisfies JsonLogger;
  const server = createServer(
    createApiRequestHandler({
      env: testEnv,
      history,
      logger,
    }),
  );

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  return server;
}

async function requestJson(
  server: Server,
  path: string,
  input: { method: "DELETE" | "GET" | "POST"; userId: string },
): Promise<{ body: unknown; status: number }> {
  const address = server.address();

  if (typeof address === "string" || address === null) {
    throw new Error("Expected TCP listener address.");
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: input.method,
    headers: {
      "x-user-id": input.userId,
    },
  });

  return {
    status: response.status,
    body: (await response.json()) as unknown,
  };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createOperationInput(original: string): RecordPromptOperationInput {
  return {
    original,
    enhanced: `Enhanced ${original}`,
    mode: "enhance",
    targetModel: "auto",
    promptType: "text",
    structureScoreBefore: 20,
    structureScoreAfter: 85,
    tokens: 120,
    provider: "test-provider",
    model: "test-model",
    latencyMs: 35,
    saved: false,
  };
}

function createSequentialId(): () => string {
  let index = 0;

  return () => {
    index += 1;
    return `history-${index}`;
  };
}

function createSequentialClock(): () => Date {
  let offset = 0;

  return () => {
    offset += 1;
    return new Date(Date.UTC(2026, 5, 7, 0, 0, offset));
  };
}
