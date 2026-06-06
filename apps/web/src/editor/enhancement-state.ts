import {
  enhancementProgressText,
  getFallbackModelLabel,
  type EnhancementClient,
  type EnhancementClientError,
  type EnhancementStreamEvent,
} from "./enhancement-client";
import type {
  EnhancementMode,
  EnhancementRequestOptions,
  EnhancementRequestPayload,
  EnhancementResponse,
  PromptTone,
  SelectedContextSnippet,
} from "./types";

export const emptyHelperText = "Add a prompt to enhance.";

export interface EnhancementEditorInput {
  mode: EnhancementMode;
  rawPrompt: string;
  selectedContextSnippets: SelectedContextSnippet[];
  targetModel: string;
  tone?: PromptTone | string;
  userId?: string;
}

export type EnhancementConfirmationKind = "copied" | "saved" | "tagged" | "edited" | "undone";

export interface EnhancementConfirmation {
  kind: EnhancementConfirmationKind;
  message: string;
  canUndo: boolean;
}

export type EnhancementFlowState =
  | {
      status: "empty";
      input: EnhancementEditorInput;
      helperText: typeof emptyHelperText;
    }
  | {
      status: "idle";
      input: EnhancementEditorInput;
    }
  | {
      status: "loading";
      input: EnhancementEditorInput;
      progressText: typeof enhancementProgressText;
      retryPayload: EnhancementRequestPayload;
      contextUsed: SelectedContextSnippet[];
    }
  | {
      status: "success";
      input: EnhancementEditorInput;
      response: EnhancementResponse;
      editableOutput: string;
      fallbackModelLabel: string | null;
      contextUsed: SelectedContextSnippet[];
      retryPayload: EnhancementRequestPayload;
      confirmation?: EnhancementConfirmation;
      undo?: {
        editableOutput: string;
      };
    }
  | {
      status: "error";
      input: EnhancementEditorInput;
      message: string;
      errorCode: string;
      retryPayload: EnhancementRequestPayload;
      contextUsed: SelectedContextSnippet[];
      fallbackModelLabel: string | null;
    }
  | {
      status: "refine";
      input: EnhancementEditorInput;
      response: EnhancementResponse;
      questions: string[];
      answers: Record<string, string>;
      contextUsed: SelectedContextSnippet[];
      retryPayload: EnhancementRequestPayload;
    };

export type EnhancementFlowAction =
  | {
      type: "input.changed";
      input: EnhancementEditorInput;
    }
  | {
      type: "request.started";
      payload: EnhancementRequestPayload;
    }
  | {
      type: "request.progress";
      statusText: typeof enhancementProgressText;
    }
  | {
      type: "request.succeeded";
      response: EnhancementResponse;
      payload: EnhancementRequestPayload;
    }
  | {
      type: "request.failed";
      error: Pick<EnhancementClientError, "code" | "message">;
      payload: EnhancementRequestPayload;
      fallbackModelLabel?: string | null;
    }
  | {
      type: "output.changed";
      value: string;
    }
  | {
      type: "confirmation.shown";
      confirmation: EnhancementConfirmation;
    }
  | {
      type: "undo.requested";
    }
  | {
      type: "refine.answer.changed";
      question: string;
      value: string;
    };

export function createInitialEnhancementState(
  input: Partial<EnhancementEditorInput> = {},
): EnhancementFlowState {
  const resolvedInput = resolveEditorInput(input);
  return stateForInput(resolvedInput);
}

export function reduceEnhancementFlow(
  state: EnhancementFlowState,
  action: EnhancementFlowAction,
): EnhancementFlowState {
  switch (action.type) {
    case "input.changed":
      return stateForInput(action.input);

    case "request.started":
      return {
        status: "loading",
        input: inputFromPayload(action.payload),
        progressText: enhancementProgressText,
        retryPayload: action.payload,
        contextUsed: action.payload.selectedContextSnippets ?? [],
      };

    case "request.progress":
      if (state.status !== "loading") {
        return state;
      }

      return {
        ...state,
        progressText: action.statusText,
      };

    case "request.succeeded":
      return successStateFromResponse(action.response, action.payload);

    case "request.failed":
      return {
        status: "error",
        input: inputFromPayload(action.payload),
        message: action.error.message,
        errorCode: action.error.code,
        retryPayload: action.payload,
        contextUsed: action.payload.selectedContextSnippets ?? [],
        fallbackModelLabel: action.fallbackModelLabel ?? null,
      };

    case "output.changed":
      if (state.status !== "success") {
        return state;
      }

      return {
        ...state,
        editableOutput: action.value,
        confirmation: {
          kind: "edited",
          message: "Output updated.",
          canUndo: true,
        },
        undo: {
          editableOutput: state.editableOutput,
        },
      };

    case "confirmation.shown":
      if (state.status !== "success") {
        return state;
      }

      return {
        ...state,
        confirmation: action.confirmation,
      };

    case "undo.requested": {
      if (state.status !== "success" || state.undo === undefined) {
        return state;
      }

      const { undo: _undo, ...stateWithoutUndo } = state;

      return {
        ...stateWithoutUndo,
        editableOutput: _undo.editableOutput,
        confirmation: {
          kind: "undone",
          message: "Change undone.",
          canUndo: false,
        },
      };
    }

    case "refine.answer.changed":
      if (state.status !== "refine") {
        return state;
      }

      return {
        ...state,
        answers: {
          ...state.answers,
          [action.question]: action.value,
        },
      };
  }
}

export async function submitEnhancementRequest(input: {
  client: EnhancementClient;
  initialState: EnhancementFlowState;
  payload: EnhancementRequestPayload;
}): Promise<EnhancementFlowState> {
  let state = reduceEnhancementFlow(input.initialState, {
    type: "request.started",
    payload: input.payload,
  });

  for await (const event of input.client.stream(input.payload)) {
    state = reduceEnhancementFlow(state, flowActionFromStreamEvent(event, input.payload));
  }

  return state;
}

export function createEnhancementPayload(
  input: EnhancementEditorInput,
  options: EnhancementRequestOptions = {},
): EnhancementRequestPayload {
  return {
    mode: input.mode,
    rawPrompt: input.rawPrompt,
    targetModel: input.targetModel,
    selectedContextSnippets: input.selectedContextSnippets,
    options,
    ...(input.tone ? { tone: input.tone } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
  };
}

export function createRetryPayload(state: EnhancementFlowState): EnhancementRequestPayload | null {
  if (
    state.status === "loading" ||
    state.status === "success" ||
    state.status === "error" ||
    state.status === "refine"
  ) {
    return state.retryPayload;
  }

  return null;
}

export function createSkippedRefinePayload(state: EnhancementFlowState): EnhancementRequestPayload {
  if (state.status !== "refine") {
    throw new Error("Refine can only be skipped from the refine state.");
  }

  return createRefinePayload(state, true);
}

export function createAnsweredRefinePayload(
  state: EnhancementFlowState,
): EnhancementRequestPayload {
  if (state.status !== "refine") {
    throw new Error("Refine answers can only be submitted from the refine state.");
  }

  return createRefinePayload(state, false);
}

function createRefinePayload(
  state: Extract<EnhancementFlowState, { status: "refine" }>,
  skipped: boolean,
): EnhancementRequestPayload {
  const clarificationAnswers = buildClarificationAnswers(state);
  const placeholders = state.questions
    .filter((question) => !clarificationAnswers[question]?.trim())
    .map((_, index) => `[SKIPPED CLARIFICATION ${index + 1}]`);

  return {
    ...state.retryPayload,
    mode: "refine",
    options: {
      ...(state.retryPayload.options ?? {}),
      clarification_answers: clarificationAnswers,
      skip_clarification: true,
      ...(skipped ? { clarification_skipped: true, skipped_clarification: true } : {}),
      ...(placeholders.length > 0 ? { placeholders } : {}),
    },
  };
}

function flowActionFromStreamEvent(
  event: EnhancementStreamEvent,
  payload: EnhancementRequestPayload,
): EnhancementFlowAction {
  switch (event.type) {
    case "progress":
      return {
        type: "request.progress",
        statusText: event.statusText,
      };

    case "success":
      return {
        type: "request.succeeded",
        response: event.response,
        payload,
      };

    case "error":
      return {
        type: "request.failed",
        error: event.error,
        payload,
      };
  }
}

function successStateFromResponse(
  response: EnhancementResponse,
  payload: EnhancementRequestPayload,
): EnhancementFlowState {
  if (response.result.needs_clarification) {
    return {
      status: "refine",
      input: inputFromPayload(payload),
      response,
      questions: response.result.questions,
      answers: {},
      contextUsed: payload.selectedContextSnippets ?? [],
      retryPayload: payload,
    };
  }

  return {
    status: "success",
    input: inputFromPayload(payload),
    response,
    editableOutput: response.result.enhanced_prompt,
    fallbackModelLabel: getFallbackModelLabel(response),
    contextUsed: payload.selectedContextSnippets ?? [],
    retryPayload: payload,
  };
}

function buildClarificationAnswers(
  state: Extract<EnhancementFlowState, { status: "refine" }>,
): Record<string, string> {
  return Object.fromEntries(
    state.questions.map((question) => [question, state.answers[question]?.trim() ?? ""]),
  );
}

function stateForInput(input: EnhancementEditorInput): EnhancementFlowState {
  if (!input.rawPrompt.trim()) {
    return {
      status: "empty",
      input,
      helperText: emptyHelperText,
    };
  }

  return {
    status: "idle",
    input,
  };
}

function resolveEditorInput(input: Partial<EnhancementEditorInput>): EnhancementEditorInput {
  return {
    mode: input.mode ?? "enhance",
    rawPrompt: input.rawPrompt ?? "",
    selectedContextSnippets: input.selectedContextSnippets ?? [],
    targetModel: input.targetModel ?? "auto",
    ...(input.tone ? { tone: input.tone } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
  };
}

function inputFromPayload(payload: EnhancementRequestPayload): EnhancementEditorInput {
  return resolveEditorInput({
    mode: payload.mode,
    rawPrompt: payload.rawPrompt,
    selectedContextSnippets: payload.selectedContextSnippets ?? [],
    targetModel: payload.targetModel,
    ...(payload.tone ? { tone: payload.tone } : {}),
    ...(payload.userId ? { userId: payload.userId } : {}),
  });
}
