import { createServer, type Server } from "node:http";

import type {
  HistoryUsagePort,
  PromptOperationRecord,
  RecordPromptOperationInput,
  UsageEventInput,
} from "@promptgen/history-usage";
import { describe, expect, it } from "vitest";

import type {
  EnhancementGateway,
  EnhancementGatewayRequest,
  EnhancementOutput,
} from "./enhancement";
import { enhancementModes, validateEnhancementOutput } from "./enhancement";
import type { JsonLogger } from "./logger";
import { createApiRequestHandler } from "./server";

const testEnv = {
  apiPort: 0,
  appUrl: "http://localhost:3000",
  authSessionTtlSeconds: 2_592_000,
  nodeEnv: "test",
} as const;

interface TestEnhancementResponseBody {
  result: EnhancementOutput;
  meta: {
    provider: string | null;
    model: string | null;
    tokens: number;
    latency_ms: number;
    fellback: boolean;
  };
  error?: string;
  message?: string;
  raw_prompt?: string;
}

describe("enhancement endpoints", () => {
  it("serves the four launch mode endpoints through the gateway and records history", async () => {
    const gateway = new FakeGateway();
    const history = new FakeHistory();
    const server = await listen({ gateway, history });

    try {
      for (const mode of enhancementModes) {
        const response = await postJson(server, `/enhance/${mode}`, {
          raw_prompt: `Write a launch email for ${mode}.`,
          target_model: "auto",
          user_id: "user-123",
        });

        expect(response.status).toBe(200);
        expect(response.body.result.enhanced_prompt).toBe(`Enhanced ${mode} prompt.`);
        expect(response.body.meta).toEqual({
          provider: "test-provider",
          model: "test-model",
          tokens: 123,
          latency_ms: 45,
          fellback: false,
        });
      }

      expect(gateway.requests.map((request) => request.mode)).toEqual([
        "improve",
        "enhance",
        "refine",
        "shorten",
      ]);
      expect(gateway.requests.every((request) => request.prompt_type === "text")).toBe(true);
      expect(history.operations).toHaveLength(4);
      expect(history.operations[0]).toMatchObject({
        userId: "user-123",
        input: {
          original: "Write a launch email for improve.",
          enhanced: "Enhanced improve prompt.",
          mode: "improve",
          targetModel: "auto",
          promptType: "text",
          tokens: 123,
          provider: "test-provider",
          model: "test-model",
          latencyMs: 45,
          saved: false,
        },
      });
    } finally {
      await close(server);
    }
  });

  it("returns 1-3 refine questions for thin input without asking the gateway to rewrite", async () => {
    const gateway = new FakeGateway();
    const history = new FakeHistory();
    const server = await listen({ gateway, history });

    try {
      const response = await postJson(server, "/enhance/refine", {
        raw_prompt: "make this better",
        user_id: "user-123",
      });

      expect(response.status).toBe(200);
      expect(response.body.result.needs_clarification).toBe(true);
      expect(response.body.result.enhanced_prompt).toBe("");
      expect(response.body.result.questions).toHaveLength(2);
      expect(response.body.result.questions.length).toBeLessThanOrEqual(3);
      expect(gateway.requests).toEqual([]);
      expect(history.operations).toHaveLength(1);
      expect(history.operations[0]?.input).toMatchObject({
        original: "make this better",
        enhanced: "",
        mode: "refine",
        targetModel: "auto",
        promptType: "text",
        saved: false,
      });
    } finally {
      await close(server);
    }
  });

  it("uses bracketed placeholders when refine clarification is skipped", async () => {
    const gateway = new FakeGateway({
      result: {
        ...createValidOutput("refine"),
        enhanced_prompt: "Improve the request while preserving the user's intent.",
        context: "",
        constraints: [],
      },
    });
    const history = new FakeHistory();
    const server = await listen({ gateway, history });

    try {
      const response = await postJson(server, "/enhance/refine", {
        raw_prompt: "make this better",
        options: {
          skip_clarification: true,
        },
        user_id: "user-123",
      });

      expect(response.status).toBe(200);
      expect(gateway.requests).toHaveLength(1);
      expect(gateway.requests[0]?.options).toMatchObject({
        clarification_skipped: true,
        placeholders: ["[AUDIENCE OR GOAL]", "[CONSTRAINTS, TONE, OR FORMAT]"],
      });
      expect(response.body.result.enhanced_prompt).toContain("[AUDIENCE OR GOAL]");
      expect(response.body.result.constraints).toContain(
        "Use explicit placeholders for skipped clarification details: [AUDIENCE OR GOAL], [CONSTRAINTS, TONE, OR FORMAT].",
      );
      expect(history.operations[0]?.input.enhanced).toContain("[CONSTRAINTS, TONE, OR FORMAT]");
    } finally {
      await close(server);
    }
  });

  it("rejects schema-invalid gateway output and preserves the input in the error payload", async () => {
    const gateway = new FakeGateway({
      result: {
        enhanced_prompt: "Missing required fields.",
      },
    });
    const history = new FakeHistory();
    const server = await listen({ gateway, history });

    try {
      const response = await postJson(server, "/enhance/enhance", {
        raw_prompt: "Write a launch email for teachers.",
        user_id: "user-123",
      });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({
        error: "invalid_gateway_output",
        raw_prompt: "Write a launch email for teachers.",
      });
      expect(history.operations).toEqual([]);
    } finally {
      await close(server);
    }
  });

  it("keeps launch prompt type scoped to text", async () => {
    const gateway = new FakeGateway();
    const server = await listen({ gateway });

    try {
      const response = await postJson(server, "/enhance/enhance", {
        raw_prompt: "Write a launch email.",
        prompt_type: "image",
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: "unsupported_prompt_type",
        raw_prompt: "Write a launch email.",
      });
      expect(gateway.requests).toEqual([]);
    } finally {
      await close(server);
    }
  });

  it("rejects request bodies over 1MB without calling the gateway", async () => {
    const gateway = new FakeGateway();
    const server = await listen({ gateway });

    try {
      const response = await postJson(server, "/enhance/enhance", {
        raw_prompt: "x".repeat(1024 * 1024),
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: "invalid_request",
        message: "Request body exceeds maximum size limit of 1MB.",
      });
      expect(gateway.requests).toEqual([]);
    } finally {
      await close(server);
    }
  });

  it("validates canonical enhancement output server-side", () => {
    expect(validateEnhancementOutput(createValidOutput("enhance"))).toMatchObject({
      valid: true,
    });
    expect(
      validateEnhancementOutput({
        ...createValidOutput("refine"),
        needs_clarification: true,
        questions: [],
      }),
    ).toEqual({
      valid: false,
      message: "Clarification output must include 1-3 questions.",
    });
  });
});

class FakeGateway implements EnhancementGateway {
  readonly requests: EnhancementGatewayRequest[] = [];

  constructor(private readonly response: { result?: unknown } = {}) {}

  async enhance(request: EnhancementGatewayRequest) {
    this.requests.push(request);

    return {
      result: this.response.result ?? createValidOutput(request.mode),
      meta: {
        provider: "test-provider",
        model: "test-model",
        tokens: 123,
        latency_ms: 45,
        fellback: false,
      },
    };
  }
}

class FakeHistory implements HistoryUsagePort {
  readonly operations: Array<{ userId: string; input: RecordPromptOperationInput }> = [];
  readonly usageEvents: Array<{ userId: string; input: UsageEventInput }> = [];

  async recordPromptOperation(
    userId: string,
    input: RecordPromptOperationInput,
  ): Promise<PromptOperationRecord> {
    this.operations.push({ userId, input });

    return {
      id: `operation-${this.operations.length}`,
      userId,
      original: input.original,
      enhanced: input.enhanced,
      mode: input.mode,
      targetModel: input.targetModel,
      promptType: input.promptType,
      saved: input.saved,
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      ...(input.structureScoreBefore !== undefined
        ? { structureScoreBefore: input.structureScoreBefore }
        : {}),
      ...(input.structureScoreAfter !== undefined
        ? { structureScoreAfter: input.structureScoreAfter }
        : {}),
      ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
      ...(input.thumbsFeedback !== undefined ? { thumbsFeedback: input.thumbsFeedback } : {}),
    };
  }

  async listPromptHistory(_userId: string): Promise<PromptOperationRecord[]> {
    return [];
  }

  async deleteHistoryEntry(_userId: string, _historyEntryId: string): Promise<void> {
    return undefined;
  }

  async recordUsageEvent(userId: string, input: UsageEventInput): Promise<void> {
    this.usageEvents.push({ userId, input });
  }
}

async function listen(input: {
  gateway: EnhancementGateway;
  history?: HistoryUsagePort;
}): Promise<Server> {
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
      gateway: input.gateway,
      logger,
      ...(input.history ? { history: input.history } : {}),
    }),
  );

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  return server;
}

async function postJson(
  server: Server,
  path: string,
  body: unknown,
): Promise<{ status: number; body: TestEnhancementResponseBody }> {
  const address = server.address();

  if (typeof address === "string" || address === null) {
    throw new Error("Expected TCP listener address.");
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as TestEnhancementResponseBody,
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

function createValidOutput(mode: string): EnhancementOutput {
  return {
    title: `${mode} prompt`,
    needs_clarification: false,
    questions: [],
    enhanced_prompt: `Enhanced ${mode} prompt.`,
    role: "You are a helpful prompt writer.",
    task: "Rewrite the prompt.",
    context: "Use the user's provided context only.",
    constraints: ["Preserve intent."],
    format: "Markdown",
    tone: "Clear",
    success_criteria: ["The prompt is ready to copy."],
    explanation: ["Clarified structure."],
    added: ["Role and format."],
    removed: [],
    changed: ["Reworded the task."],
  };
}
