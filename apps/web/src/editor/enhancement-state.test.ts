import { describe, expect, it } from "vitest";

import { EnhancementClientError, enhancementProgressText } from "./enhancement-client";
import {
  createAnsweredRefinePayload,
  createEnhancementPayload,
  createInitialEnhancementState,
  createRetryPayload,
  createSkippedRefinePayload,
  emptyHelperText,
  reduceEnhancementFlow,
  submitEnhancementRequest,
  type EnhancementEditorInput,
} from "./enhancement-state";
import type { EnhancementClient, EnhancementStreamEvent } from "./enhancement-client";
import type { EnhancementRequestPayload, EnhancementResponse } from "./types";

describe("enhancement state", () => {
  it("represents empty and idle editor states", () => {
    expect(createInitialEnhancementState()).toEqual({
      status: "empty",
      input: {
        mode: "enhance",
        rawPrompt: "",
        selectedContextSnippets: [],
        targetModel: "auto",
      },
      helperText: emptyHelperText,
    });

    expect(
      createInitialEnhancementState({
        rawPrompt: "Write a launch email.",
      }).status,
    ).toBe("idle");
  });

  it("enters loading with the honest perceived-progress text", () => {
    const payload = createEnhancementPayload(editorInput());
    const state = reduceEnhancementFlow(createInitialEnhancementState(), {
      type: "request.started",
      payload,
    });

    expect(state).toMatchObject({
      status: "loading",
      progressText: enhancementProgressText,
      retryPayload: payload,
      contextUsed: [],
    });
  });

  it("stores successful editable output and fallback labels", () => {
    const payload = createEnhancementPayload(editorInput());
    const response = createEnhancementResponse({
      meta: {
        provider: "openai",
        model: "gpt-fallback",
        tokens: 12,
        latency_ms: 900,
        fellback: true,
      },
    });
    const state = reduceEnhancementFlow(createInitialEnhancementState(), {
      type: "request.succeeded",
      response,
      payload,
    });

    expect(state).toMatchObject({
      status: "success",
      editableOutput: response.result.enhanced_prompt,
      fallbackModelLabel: "gpt-fallback",
      retryPayload: payload,
    });
  });

  it("preserves input and retry payload on errors", () => {
    const payload = createEnhancementPayload(editorInput({ rawPrompt: "make this better" }));
    const state = reduceEnhancementFlow(createInitialEnhancementState(), {
      type: "request.failed",
      error: new EnhancementClientError({
        code: "gateway_error",
        message: "Provider failed.",
        rawPrompt: "make this better",
      }),
      payload,
    });

    expect(state).toMatchObject({
      status: "error",
      input: {
        rawPrompt: "make this better",
      },
      message: "Provider failed.",
      errorCode: "gateway_error",
      retryPayload: payload,
    });
    expect(createRetryPayload(state)).toBe(payload);
  });

  it("supports confirmation and undo for edited output", () => {
    const payload = createEnhancementPayload(editorInput());
    const successState = reduceEnhancementFlow(createInitialEnhancementState(), {
      type: "request.succeeded",
      response: createEnhancementResponse(),
      payload,
    });

    const editedState = reduceEnhancementFlow(successState, {
      type: "output.changed",
      value: "Edited output.",
    });
    const undoneState = reduceEnhancementFlow(editedState, {
      type: "undo.requested",
    });

    expect(editedState).toMatchObject({
      status: "success",
      editableOutput: "Edited output.",
      confirmation: {
        kind: "edited",
        canUndo: true,
      },
    });
    expect(undoneState).toMatchObject({
      status: "success",
      editableOutput: createEnhancementResponse().result.enhanced_prompt,
      confirmation: {
        kind: "undone",
        canUndo: false,
      },
    });
  });

  it("routes clarification responses into skippable refine state", () => {
    const payload = createEnhancementPayload(editorInput({ mode: "refine" }));
    const response = createEnhancementResponse({
      result: {
        ...createEnhancementResponse().result,
        needs_clarification: true,
        questions: ["Who is this for?", "What format should the answer use?"],
        enhanced_prompt: "",
      },
      meta: {
        provider: null,
        model: null,
        tokens: 0,
        latency_ms: 0,
        fellback: false,
      },
    });
    const refineState = reduceEnhancementFlow(createInitialEnhancementState(), {
      type: "request.succeeded",
      response,
      payload,
    });

    expect(refineState).toMatchObject({
      status: "refine",
      questions: ["Who is this for?", "What format should the answer use?"],
      answers: {},
    });

    const skippedPayload = createSkippedRefinePayload(refineState);
    expect(skippedPayload.options).toMatchObject({
      skip_clarification: true,
      skipped_clarification: true,
      clarification_skipped: true,
      clarification_answers: {
        "Who is this for?": "",
        "What format should the answer use?": "",
      },
      placeholders: ["[SKIPPED CLARIFICATION 1]", "[SKIPPED CLARIFICATION 2]"],
    });
  });

  it("keeps refine answers explicit when continuing", () => {
    const payload = createEnhancementPayload(editorInput({ mode: "refine" }));
    const refineState = reduceEnhancementFlow(createInitialEnhancementState(), {
      type: "request.succeeded",
      response: createEnhancementResponse({
        result: {
          ...createEnhancementResponse().result,
          needs_clarification: true,
          questions: ["Who is this for?"],
          enhanced_prompt: "",
        },
      }),
      payload,
    });
    const answeredState = reduceEnhancementFlow(refineState, {
      type: "refine.answer.changed",
      question: "Who is this for?",
      value: "Trial users",
    });

    expect(createAnsweredRefinePayload(answeredState).options).toMatchObject({
      skip_clarification: true,
      clarification_answers: {
        "Who is this for?": "Trial users",
      },
    });
  });

  it("handles stream events through the async flow glue", async () => {
    const payload = createEnhancementPayload(editorInput());
    const finalState = await submitEnhancementRequest({
      client: fakeClient([
        {
          type: "progress",
          statusText: enhancementProgressText,
        },
        {
          type: "success",
          response: createEnhancementResponse(),
        },
      ]),
      initialState: createInitialEnhancementState(),
      payload,
    });

    expect(finalState).toMatchObject({
      status: "success",
      editableOutput: createEnhancementResponse().result.enhanced_prompt,
    });
  });
});

function editorInput(overrides: Partial<EnhancementEditorInput> = {}): EnhancementEditorInput {
  return {
    mode: "enhance",
    rawPrompt: "Write a launch email.",
    selectedContextSnippets: [],
    targetModel: "auto",
    ...overrides,
  };
}

function fakeClient(events: EnhancementStreamEvent[]): EnhancementClient {
  return {
    async enhance() {
      throw new Error("enhance should not be called directly");
    },
    async *stream(
      _payload: EnhancementRequestPayload,
    ): AsyncGenerator<EnhancementStreamEvent, EnhancementResponse | undefined, void> {
      for (const event of events) {
        yield event;
      }

      const success = events.find((event) => event.type === "success");
      return success?.type === "success" ? success.response : undefined;
    },
  };
}

function createEnhancementResponse(
  overrides: Partial<EnhancementResponse> = {},
): EnhancementResponse {
  return {
    result: {
      title: "Launch email",
      needs_clarification: false,
      questions: [],
      enhanced_prompt: "Write a launch email with a subject line and three benefit bullets.",
      role: "Lifecycle marketer",
      task: "Write a launch email.",
      context: "For trial users.",
      constraints: ["Keep it concise."],
      format: "Subject line and body.",
      tone: "professional",
      success_criteria: ["Clear CTA."],
      explanation: ["Added audience and output format."],
      added: ["Audience"],
      removed: [],
      changed: ["Expanded the task."],
    },
    quality_checklist: {
      before: {
        structure_score: 40,
        items: [],
      },
      after: {
        structure_score: 85,
        items: [],
      },
    },
    meta: {
      provider: "gemini",
      model: "gemini-3.5-flash",
      tokens: 30,
      latency_ms: 800,
      fellback: false,
    },
    ...overrides,
  };
}
