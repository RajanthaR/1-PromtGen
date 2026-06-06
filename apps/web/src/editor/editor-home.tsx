"use client";

import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  EditorShell,
  type EditorSubmitPayload,
  createInitialEditorShellState,
} from "./editor-shell";
import { createEnhancementClient, enhancementProgressText } from "./enhancement-client";
import {
  createAnsweredRefinePayload,
  createEnhancementPayload,
  createInitialEnhancementState,
  createRetryPayload,
  createSkippedRefinePayload,
  reduceEnhancementFlow,
  submitEnhancementRequest,
  type EnhancementEditorInput,
  type EnhancementFlowState,
} from "./enhancement-state";
import { ResultsTrustSurface } from "./results-trust-surface";
import type { ResultsCopySavePayload } from "./results-view-model";
import type { EnhancementRequestPayload, SelectedContextSnippet } from "./types";

const client = createEnhancementClient();

export function EditorHome() {
  const [flowState, setFlowState] = useState<EnhancementFlowState>(() =>
    createInitialEnhancementState(),
  );
  const [copyStatusMessage, setCopyStatusMessage] = useState("");
  const [saveStatusMessage, setSaveStatusMessage] = useState("");
  const activeRequestId = useRef(0);

  async function runEnhancement(payload: EnhancementRequestPayload) {
    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;
    setCopyStatusMessage("");
    setSaveStatusMessage("");
    setFlowState((currentState) =>
      reduceEnhancementFlow(currentState, { type: "request.started", payload }),
    );

    const finalState = await submitEnhancementRequest({
      client,
      initialState: createInitialEnhancementState({
        mode: payload.mode,
        rawPrompt: payload.rawPrompt,
        selectedContextSnippets: payload.selectedContextSnippets ?? [],
        targetModel: payload.targetModel,
        ...(payload.tone ? { tone: payload.tone } : {}),
        ...(payload.userId ? { userId: payload.userId } : {}),
      }),
      payload,
    });

    setFlowState((currentState) =>
      requestId === activeRequestId.current ? finalState : currentState,
    );
  }

  function submitEditor(payload: EditorSubmitPayload) {
    const selectedContextSnippets = payload.request.options.context_snippets.map((snippet) => ({
      body: snippet.body,
      id: snippet.id,
      title: snippet.title,
    }));
    const editorInput: EnhancementEditorInput = {
      mode: payload.mode,
      rawPrompt: payload.request.raw_prompt,
      selectedContextSnippets,
      targetModel: payload.request.target_model,
      tone: payload.request.options.tone,
    };

    void runEnhancement(
      createEnhancementPayload(editorInput, {
        context_ids: payload.request.options.context_ids,
        context_snippets: selectedContextSnippets.map((snippet) => snippet.body),
        tone: payload.request.options.tone,
      }),
    );
  }

  function retryLastRequest() {
    const retryPayload = createRetryPayload(flowState);

    if (retryPayload) {
      void runEnhancement(retryPayload);
    }
  }

  function updateEnhancedPrompt(nextPrompt: string) {
    setFlowState((currentState) =>
      reduceEnhancementFlow(currentState, { type: "output.changed", value: nextPrompt }),
    );
  }

  async function copyCurrentPrompt(payload: ResultsCopySavePayload) {
    await navigator.clipboard?.writeText(payload.enhancedPrompt);
    setCopyStatusMessage("Copied.");
    setFlowState((currentState) =>
      reduceEnhancementFlow(currentState, {
        type: "confirmation.shown",
        confirmation: {
          kind: "copied",
          message: "Copied.",
          canUndo: false,
        },
      }),
    );
  }

  function saveCurrentPrompt(_payload: ResultsCopySavePayload) {
    setSaveStatusMessage("Saved to library.");
    setFlowState((currentState) =>
      reduceEnhancementFlow(currentState, {
        type: "confirmation.shown",
        confirmation: {
          kind: "saved",
          message: "Saved to library.",
          canUndo: true,
        },
      }),
    );
  }

  const editorInitialState = useMemo(
    () =>
      createInitialEditorShellState({
        mode: flowState.input.mode,
        rawPrompt: flowState.input.rawPrompt,
        selectedContextIds: flowState.input.selectedContextSnippets.map((snippet) => snippet.id),
        targetModel: flowState.input.targetModel as ReturnType<
          typeof createInitialEditorShellState
        >["targetModel"],
        tone: (flowState.input.tone ?? "neutral") as ReturnType<
          typeof createInitialEditorShellState
        >["tone"],
      }),
    [flowState.input],
  );

  return (
    <main style={styles.page}>
      <div style={styles.layout}>
        <EditorShell initialState={editorInitialState} onSubmit={submitEditor} />
        <EditorStatePanel
          copyStatusMessage={copyStatusMessage}
          flowState={flowState}
          onCopy={copyCurrentPrompt}
          onEnhancedPromptChange={updateEnhancedPrompt}
          onRetry={retryLastRequest}
          onSave={saveCurrentPrompt}
          onSetFlowState={setFlowState}
          onSubmitPayload={runEnhancement}
          saveStatusMessage={saveStatusMessage}
        />
      </div>
    </main>
  );
}

function EditorStatePanel({
  copyStatusMessage,
  flowState,
  onCopy,
  onEnhancedPromptChange,
  onRetry,
  onSave,
  onSetFlowState,
  onSubmitPayload,
  saveStatusMessage,
}: {
  copyStatusMessage: string;
  flowState: EnhancementFlowState;
  onCopy: (payload: ResultsCopySavePayload) => Promise<void>;
  onEnhancedPromptChange: (nextPrompt: string) => void;
  onRetry: () => void;
  onSave: (payload: ResultsCopySavePayload) => void;
  onSetFlowState: (updater: (currentState: EnhancementFlowState) => EnhancementFlowState) => void;
  onSubmitPayload: (payload: EnhancementRequestPayload) => Promise<void>;
  saveStatusMessage: string;
}) {
  if (flowState.status === "loading") {
    return (
      <section aria-live="polite" role="status" style={styles.statePanel}>
        <h2 style={styles.stateTitle}>{flowState.progressText}</h2>
        <p style={styles.muted}>Your original prompt is preserved while the request runs.</p>
      </section>
    );
  }

  if (flowState.status === "error") {
    return (
      <section aria-labelledby="editor-error-title" style={styles.statePanel}>
        <h2 id="editor-error-title" style={styles.stateTitle}>
          Enhancement did not finish
        </h2>
        <p style={styles.muted}>{flowState.message}</p>
        <p style={styles.muted}>Your input is still in the editor.</p>
        {flowState.fallbackModelLabel ? (
          <p role="status" style={styles.notice}>
            Fallback model result labeled: {flowState.fallbackModelLabel}
          </p>
        ) : null}
        <button onClick={onRetry} style={styles.button} type="button">
          Retry
        </button>
      </section>
    );
  }

  if (flowState.status === "refine") {
    return (
      <RefineQuestionForm
        flowState={flowState}
        onSetFlowState={onSetFlowState}
        onSubmitPayload={onSubmitPayload}
      />
    );
  }

  if (flowState.status === "success") {
    const contextUsedSnippets = flowState.contextUsed.map(contextChipFromSnippet);

    return (
      <section style={styles.resultsWrap}>
        {flowState.confirmation ? (
          <div aria-live="polite" role="status" style={styles.notice}>
            {flowState.confirmation.message}
            {flowState.confirmation.canUndo ? (
              <button
                onClick={() =>
                  onSetFlowState((currentState) =>
                    reduceEnhancementFlow(currentState, { type: "undo.requested" }),
                  )
                }
                style={styles.inlineButton}
                type="button"
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
        <ResultsTrustSurface
          contextUsedSnippets={contextUsedSnippets}
          copyStatusMessage={copyStatusMessage}
          enhancedPromptValue={flowState.editableOutput}
          meta={flowState.response.meta}
          onCopy={(payload) => void onCopy(payload)}
          onEnhancedPromptChange={onEnhancedPromptChange}
          onSave={onSave}
          originalPrompt={flowState.input.rawPrompt}
          qualityChecklist={flowState.response.quality_checklist}
          result={flowState.response.result}
          saveStatusMessage={saveStatusMessage}
        />
      </section>
    );
  }

  return (
    <section aria-live="polite" role="status" style={styles.statePanel}>
      <h2 style={styles.stateTitle}>Ready when your prompt is</h2>
      <p style={styles.muted}>
        Select only the context snippets you want included, then run Enhance or Refine.
      </p>
      {flowState.status === "empty" ? <p style={styles.muted}>{flowState.helperText}</p> : null}
    </section>
  );
}

function RefineQuestionForm({
  flowState,
  onSetFlowState,
  onSubmitPayload,
}: {
  flowState: Extract<EnhancementFlowState, { status: "refine" }>;
  onSetFlowState: (updater: (currentState: EnhancementFlowState) => EnhancementFlowState) => void;
  onSubmitPayload: (payload: EnhancementRequestPayload) => Promise<void>;
}) {
  function updateAnswer(question: string, value: string) {
    onSetFlowState((currentState) =>
      reduceEnhancementFlow(currentState, {
        type: "refine.answer.changed",
        question,
        value,
      }),
    );
  }

  function submitAnswers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmitPayload(createAnsweredRefinePayload(flowState));
  }

  return (
    <section aria-labelledby="refine-title" style={styles.statePanel}>
      <h2 id="refine-title" style={styles.stateTitle}>
        A few details would help
      </h2>
      <form onSubmit={submitAnswers} style={styles.refineForm}>
        {flowState.questions.map((question) => (
          <label key={question} style={styles.refineLabel}>
            {question}
            <textarea
              onChange={(event) => updateAnswer(question, event.currentTarget.value)}
              rows={3}
              style={styles.refineTextarea}
              value={flowState.answers[question] ?? ""}
            />
          </label>
        ))}
        <div style={styles.actions}>
          <button style={styles.button} type="submit">
            Enhance with answers
          </button>
          <button
            onClick={() => void onSubmitPayload(createSkippedRefinePayload(flowState))}
            style={styles.secondaryButton}
            type="button"
          >
            Skip questions
          </button>
        </div>
      </form>
    </section>
  );
}

function contextChipFromSnippet(snippet: SelectedContextSnippet) {
  return {
    id: snippet.id,
    text: snippet.title,
  };
}

export const editorHomeTestIds = {
  loadingText: enhancementProgressText,
};

const styles = {
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
  },
  button: {
    background: "#173f35",
    border: "1px solid #173f35",
    borderRadius: "0.5rem",
    color: "#ffffff",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 800,
    minHeight: "2.5rem",
    padding: "0.55rem 0.9rem",
  },
  inlineButton: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.375rem",
    color: "#1f2933",
    cursor: "pointer",
    font: "inherit",
    marginLeft: "0.75rem",
    minHeight: "2rem",
    padding: "0.25rem 0.65rem",
  },
  layout: {
    display: "grid",
    gap: "1.5rem",
  },
  muted: {
    color: "#4b5563",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    margin: "0.5rem 0 0",
  },
  notice: {
    background: "#ffffff",
    border: "1px solid #b7b1a3",
    borderRadius: "0.5rem",
    color: "#1f2933",
    margin: "0 0 1rem",
    padding: "0.75rem",
  },
  page: {
    background: "#f7f7f4",
    color: "#1f2933",
    minHeight: "100vh",
  },
  refineForm: {
    display: "grid",
    gap: "1rem",
    marginTop: "1rem",
  },
  refineLabel: {
    display: "grid",
    fontWeight: 700,
    gap: "0.5rem",
  },
  refineTextarea: {
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    font: "inherit",
    lineHeight: 1.5,
    padding: "0.75rem",
  },
  resultsWrap: {
    margin: "0 auto",
    maxWidth: "72rem",
    padding: "0 2rem 2rem",
  },
  secondaryButton: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#1f2933",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: "2.5rem",
    padding: "0.55rem 0.9rem",
  },
  statePanel: {
    background: "#ffffff",
    border: "1px solid #d6d3ca",
    borderRadius: "0.5rem",
    margin: "0 auto 2rem",
    maxWidth: "72rem",
    padding: "1.25rem 2rem",
  },
  stateTitle: {
    fontSize: "1.25rem",
    lineHeight: 1.25,
    margin: 0,
  },
} satisfies Record<string, CSSProperties>;
