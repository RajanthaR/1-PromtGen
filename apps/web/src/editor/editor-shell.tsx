"use client";

import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  contextSnippetOptions,
  editorModeOptions,
  targetModelOptions,
  toneOptions,
  type ContextSnippetOption,
  type EditorMode,
  type TargetModelOption,
  type ToneOption,
} from "./editor-options";
import { emptyStateHowItWorks, samplePrompt } from "./sample-prompt";

export interface EditorShellState {
  mode: EditorMode;
  rawPrompt: string;
  selectedContextIds: string[];
  targetModel: TargetModelOption;
  tone: ToneOption;
}

export interface EditorEnhanceRequest {
  options: {
    context_ids: string[];
    context_snippets: Pick<ContextSnippetOption, "body" | "id" | "title">[];
    tone: ToneOption;
  };
  prompt_type: "text";
  raw_prompt: string;
  target_model: TargetModelOption;
}

export interface EditorSubmitPayload {
  mode: EditorMode;
  request: EditorEnhanceRequest;
}

export interface EditorShellProps {
  contextSnippets?: ContextSnippetOption[];
  initialState?: Partial<EditorShellState>;
  onSubmit?: (payload: EditorSubmitPayload) => void;
}

export function createInitialEditorShellState(
  overrides: Partial<EditorShellState> = {},
): EditorShellState {
  return {
    mode: "enhance",
    rawPrompt: "",
    selectedContextIds: [],
    targetModel: "auto",
    tone: "neutral",
    ...overrides,
  };
}

export function isPromptSubmittable(rawPrompt: string): boolean {
  return rawPrompt.trim().length > 0;
}

export function getSelectedContextSnippets(
  selectedContextIds: string[],
  snippets: ContextSnippetOption[] = contextSnippetOptions,
): ContextSnippetOption[] {
  const selectedIds = new Set(selectedContextIds);

  return snippets.filter((snippet) => selectedIds.has(snippet.id));
}

export function setEditorShellOption<K extends keyof EditorShellState>(
  state: EditorShellState,
  key: K,
  value: EditorShellState[K],
): EditorShellState {
  return {
    ...state,
    [key]: value,
  };
}

export function toggleContextSelection(
  state: EditorShellState,
  contextId: string,
  selected = !state.selectedContextIds.includes(contextId),
): EditorShellState {
  const selectedContextIds = selected
    ? [...state.selectedContextIds, contextId]
    : state.selectedContextIds.filter((selectedId) => selectedId !== contextId);

  return {
    ...state,
    selectedContextIds: [...new Set(selectedContextIds)],
  };
}

export function createEditorSubmitPayload(
  state: EditorShellState,
  snippets: ContextSnippetOption[] = contextSnippetOptions,
): EditorSubmitPayload {
  const contextSnippets = getSelectedContextSnippets(state.selectedContextIds, snippets);

  return {
    mode: state.mode,
    request: {
      options: {
        context_ids: contextSnippets.map((snippet) => snippet.id),
        context_snippets: contextSnippets.map(({ body, id, title }) => ({ body, id, title })),
        tone: state.tone,
      },
      prompt_type: "text",
      raw_prompt: state.rawPrompt,
      target_model: state.targetModel,
    },
  };
}

export function EditorShell({
  contextSnippets = contextSnippetOptions,
  initialState,
  onSubmit,
}: EditorShellProps) {
  const formId = useId();
  const [state, setState] = useState(() => createInitialEditorShellState(initialState));
  const selectedSnippets = useMemo(
    () => getSelectedContextSnippets(state.selectedContextIds, contextSnippets),
    [contextSnippets, state.selectedContextIds],
  );
  const canSubmit = isPromptSubmittable(state.rawPrompt);
  const activeModeLabel =
    editorModeOptions.find((option) => option.value === state.mode)?.label ?? "Enhance";

  function updateSelect<K extends "mode" | "targetModel" | "tone">(
    key: K,
    event: ChangeEvent<HTMLSelectElement>,
  ) {
    setState((currentState) =>
      setEditorShellOption(currentState, key, event.target.value as EditorShellState[K]),
    );
  }

  function updatePrompt(event: ChangeEvent<HTMLTextAreaElement>) {
    setState((currentState) => setEditorShellOption(currentState, "rawPrompt", event.target.value));
  }

  function updateContext(contextId: string, event: ChangeEvent<HTMLInputElement>) {
    setState((currentState) =>
      toggleContextSelection(currentState, contextId, event.target.checked),
    );
  }

  function loadSamplePrompt() {
    setState((currentState) => setEditorShellOption(currentState, "rawPrompt", samplePrompt));
  }

  function clearEditor() {
    setState((currentState) => ({
      ...currentState,
      rawPrompt: "",
      selectedContextIds: [],
    }));
  }

  function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit?.(createEditorSubmitPayload(state, contextSnippets));
  }

  return (
    <section aria-labelledby={`${formId}-title`} style={styles.shell}>
      <div style={styles.header}>
        <div>
          <p style={styles.kicker}>Editor</p>
          <h1 id={`${formId}-title`} style={styles.title}>
            PromptForge Studio
          </h1>
        </div>
        <p style={styles.status}>Target model defaults to Auto</p>
      </div>

      <form aria-describedby={`${formId}-empty ${formId}-submit-help`} onSubmit={submitEditor}>
        <div style={styles.controlGrid}>
          <label style={styles.label}>
            Target model
            <select
              name="targetModel"
              onChange={(event) => updateSelect("targetModel", event)}
              style={styles.control}
              value={state.targetModel}
            >
              {targetModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Mode
            <select
              name="mode"
              onChange={(event) => updateSelect("mode", event)}
              style={styles.control}
              value={state.mode}
            >
              {editorModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Tone
            <select
              name="tone"
              onChange={(event) => updateSelect("tone", event)}
              style={styles.control}
              value={state.tone}
            >
              {toneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label htmlFor={`${formId}-prompt`} style={styles.label}>
          Original prompt
        </label>
        <textarea
          id={`${formId}-prompt`}
          name="rawPrompt"
          onChange={updatePrompt}
          placeholder="Paste the rough prompt you want to improve."
          rows={10}
          style={styles.textarea}
          value={state.rawPrompt}
        />

        {!canSubmit ? (
          <div id={`${formId}-empty`} style={styles.emptyState}>
            <p style={styles.samplePrompt}>{samplePrompt}</p>
            <p style={styles.howItWorks}>{emptyStateHowItWorks}</p>
            <button onClick={loadSamplePrompt} style={styles.secondaryButton} type="button">
              Use sample prompt
            </button>
          </div>
        ) : null}

        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Context snippets</legend>
          <div style={styles.contextList}>
            {contextSnippets.map((snippet) => (
              <label key={snippet.id} style={styles.checkboxRow}>
                <input
                  checked={state.selectedContextIds.includes(snippet.id)}
                  name="contextSnippets"
                  onChange={(event) => updateContext(snippet.id, event)}
                  type="checkbox"
                  value={snippet.id}
                />
                <span>
                  <strong>{snippet.title}</strong>
                  <span style={styles.contextBody}>{snippet.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div aria-label="Selected context" style={styles.selectedContext}>
          {selectedSnippets.length > 0 ? (
            selectedSnippets.map((snippet) => (
              <span key={snippet.id} style={styles.chip}>
                {snippet.title}
              </span>
            ))
          ) : (
            <span style={styles.noContext}>No context selected</span>
          )}
        </div>

        <div style={styles.actions}>
          <button disabled={!canSubmit} style={styles.primaryButton} type="submit">
            {activeModeLabel} prompt
          </button>
          <button
            disabled={!state.rawPrompt && state.selectedContextIds.length === 0}
            onClick={clearEditor}
            style={styles.secondaryButton}
            type="button"
          >
            Clear
          </button>
          <span id={`${formId}-submit-help`} role="status" style={styles.submitHelp}>
            {canSubmit ? "Ready to run." : "Enter a prompt to enable actions."}
          </span>
        </div>
      </form>
    </section>
  );
}

const styles = {
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    marginTop: "1rem",
  },
  checkboxRow: {
    alignItems: "flex-start",
    border: "1px solid #d9ded7",
    borderRadius: "0.5rem",
    display: "flex",
    gap: "0.75rem",
    padding: "0.75rem",
  },
  chip: {
    background: "#e7f0eb",
    border: "1px solid #a8c3b4",
    borderRadius: "999px",
    color: "#184433",
    display: "inline-flex",
    fontSize: "0.8125rem",
    fontWeight: 700,
    padding: "0.25rem 0.625rem",
  },
  contextBody: {
    color: "#4b5563",
    display: "block",
    fontSize: "0.875rem",
    lineHeight: 1.5,
    marginTop: "0.25rem",
  },
  contextList: {
    display: "grid",
    gap: "0.75rem",
    marginTop: "0.75rem",
  },
  control: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#111827",
    font: "inherit",
    minHeight: "2.75rem",
    padding: "0.5rem 0.75rem",
    width: "100%",
  },
  controlGrid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
    marginBottom: "1.25rem",
  },
  emptyState: {
    background: "#ffffff",
    border: "1px solid #d9ded7",
    borderRadius: "0.5rem",
    marginTop: "0.75rem",
    padding: "1rem",
  },
  fieldset: {
    border: "1px solid #cfd6cf",
    borderRadius: "0.5rem",
    margin: "1.25rem 0 0",
    padding: "1rem",
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  howItWorks: {
    color: "#4b5563",
    fontSize: "0.875rem",
    lineHeight: 1.5,
    margin: "0.5rem 0 1rem",
  },
  kicker: {
    color: "#4b5563",
    fontSize: "0.75rem",
    fontWeight: 800,
    letterSpacing: 0,
    margin: 0,
    textTransform: "uppercase",
  },
  label: {
    color: "#1f2933",
    display: "grid",
    fontSize: "0.875rem",
    fontWeight: 700,
    gap: "0.5rem",
  },
  legend: {
    color: "#1f2933",
    fontSize: "0.875rem",
    fontWeight: 800,
    padding: "0 0.25rem",
  },
  noContext: {
    color: "#4b5563",
    fontSize: "0.875rem",
  },
  primaryButton: {
    background: "#173f35",
    border: "1px solid #173f35",
    borderRadius: "0.5rem",
    color: "#ffffff",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 800,
    minHeight: "2.75rem",
    padding: "0.625rem 1rem",
  },
  samplePrompt: {
    color: "#1f2933",
    fontSize: "1rem",
    lineHeight: 1.5,
    margin: 0,
  },
  secondaryButton: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#1f2933",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: "2.75rem",
    padding: "0.625rem 1rem",
  },
  selectedContext: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "0.75rem",
    minHeight: "2rem",
  },
  shell: {
    margin: "0 auto",
    maxWidth: "72rem",
    padding: "2rem",
  },
  status: {
    color: "#4b5563",
    fontSize: "0.875rem",
    margin: 0,
  },
  submitHelp: {
    color: "#4b5563",
    fontSize: "0.875rem",
  },
  textarea: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#111827",
    font: "inherit",
    lineHeight: 1.5,
    marginTop: "0.5rem",
    minHeight: "14rem",
    padding: "0.875rem",
    resize: "vertical",
    width: "100%",
  },
  title: {
    color: "#17241f",
    fontSize: "2rem",
    lineHeight: 1.15,
    margin: "0.25rem 0 0",
  },
} satisfies Record<string, CSSProperties>;
