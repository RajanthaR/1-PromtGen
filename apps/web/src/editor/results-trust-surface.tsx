import {
  createElement,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type SyntheticEvent,
} from "react";

import type {
  ContextUsedSnippetViewModel,
  EnhancementMetaViewModel,
  EnhancementQualityChecklistViewModel,
  EnhancementResultViewModel,
  PromptChecklistItemViewModel,
  ResultsCopySavePayload,
} from "./results-view-model";
import { buildResultsCopySavePayload } from "./results-view-model";
import { getChecklistStatusPresentation } from "./checklist-status";

export interface ResultsTrustSurfaceProps {
  originalPrompt: string;
  enhancedPromptValue: string;
  result: EnhancementResultViewModel;
  qualityChecklist: EnhancementQualityChecklistViewModel;
  contextUsedSnippets: ContextUsedSnippetViewModel[];
  meta?: EnhancementMetaViewModel;
  copyStatusMessage?: string;
  saveStatusMessage?: string;
  onEnhancedPromptChange: (nextPrompt: string) => void;
  onApplyChecklistSuggestion?: (item: PromptChecklistItemViewModel, nextPrompt: string) => void;
  onCopy?: (payload: ResultsCopySavePayload) => void;
  onSave?: (payload: ResultsCopySavePayload) => void;
}

const sectionStyle = {
  background: "#ffffff",
  border: "1px solid #d6d3ca",
  borderRadius: "8px",
} satisfies CSSProperties;

const quietTextStyle = {
  color: "#4b5563",
  fontSize: "0.875rem",
  lineHeight: 1.5,
} satisfies CSSProperties;

const buttonStyle = {
  background: "#ffffff",
  border: "1px solid #9ca3af",
  borderRadius: "6px",
  color: "#1f2933",
  cursor: "pointer",
  font: "inherit",
  minHeight: "2.25rem",
  padding: "0.45rem 0.75rem",
} satisfies CSSProperties;

export function ResultsTrustSurface({
  originalPrompt,
  enhancedPromptValue,
  result,
  qualityChecklist,
  contextUsedSnippets,
  meta,
  copyStatusMessage,
  saveStatusMessage,
  onEnhancedPromptChange,
  onApplyChecklistSuggestion,
  onCopy,
  onSave,
}: ResultsTrustSurfaceProps) {
  const [changesPanelOpen, setChangesPanelOpen] = useState(true);
  const payload = buildResultsCopySavePayload({
    contextUsedSnippets,
    enhancedPrompt: enhancedPromptValue,
    originalPrompt,
    qualityChecklist,
    result,
  });
  const scoreDelta =
    qualityChecklist.after.structure_score - qualityChecklist.before.structure_score;

  return createElement(
    "section",
    {
      "aria-labelledby": "results-trust-surface-title",
      style: {
        color: "#1f2933",
        display: "grid",
        gap: "1rem",
      } satisfies CSSProperties,
    },
    createElement(
      "header",
      {
        style: {
          alignItems: "start",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "space-between",
        } satisfies CSSProperties,
      },
      createElement(
        "div",
        null,
        createElement(
          "p",
          { style: { ...quietTextStyle, margin: "0 0 0.25rem" } },
          "Editable starting point",
        ),
        createElement(
          "h2",
          { id: "results-trust-surface-title", style: { fontSize: "1.25rem", margin: 0 } },
          result.title,
        ),
      ),
      createElement(
        "div",
        {
          "aria-label": "Structure score comparison",
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
          } satisfies CSSProperties,
        },
        createElement(ScorePill, {
          label: "Before",
          score: qualityChecklist.before.structure_score,
        }),
        createElement(ScorePill, {
          label: "After",
          score: qualityChecklist.after.structure_score,
        }),
        createElement(
          "span",
          {
            "aria-label": `Structure score change ${scoreDelta >= 0 ? "plus" : "minus"} ${Math.abs(
              scoreDelta,
            )}`,
            style: {
              ...quietTextStyle,
              alignItems: "center",
              border: "1px solid #d6d3ca",
              borderRadius: "999px",
              display: "inline-flex",
              minHeight: "2rem",
              padding: "0 0.75rem",
            } satisfies CSSProperties,
          },
          `Delta ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}`,
        ),
      ),
    ),
    renderFallbackNotice(meta),
    createElement(
      "div",
      {
        style: {
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
        } satisfies CSSProperties,
      },
      createElement(PromptPanel, {
        label: "Original prompt",
        readOnly: true,
        textareaId: "results-original-prompt",
        value: originalPrompt,
      }),
      createElement(PromptPanel, {
        label: "Enhanced prompt",
        onChange: onEnhancedPromptChange,
        textareaId: "results-enhanced-prompt",
        value: enhancedPromptValue,
      }),
    ),
    createElement(
      "div",
      {
        style: {
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
        } satisfies CSSProperties,
      },
      createElement(
        "button",
        { onClick: () => onCopy?.(payload), style: buttonStyle, type: "button" },
        "Copy current prompt",
      ),
      createElement(
        "button",
        { onClick: () => onSave?.(payload), style: buttonStyle, type: "button" },
        "Save current prompt",
      ),
      createElement(
        "div",
        { "aria-live": "polite", role: "status", style: quietTextStyle },
        [copyStatusMessage, saveStatusMessage].filter(Boolean).join(" "),
      ),
    ),
    createElement(
      "details",
      {
        onToggle: (event: SyntheticEvent<HTMLDetailsElement>) =>
          setChangesPanelOpen(event.currentTarget.open),
        open: changesPanelOpen,
        style: { ...sectionStyle, padding: "1rem" },
      },
      createElement(
        "summary",
        {
          style: {
            cursor: "pointer",
            fontWeight: 700,
          } satisfies CSSProperties,
        },
        "What changed & why",
      ),
      createElement(
        "div",
        {
          style: {
            display: "grid",
            gap: "0.75rem",
            marginTop: "0.75rem",
          } satisfies CSSProperties,
        },
        createElement(ListBlock, {
          emptyText: "No explanation was returned.",
          items: result.explanation,
        }),
        createElement(DiffBlock, { items: result.added, label: "Added", prefix: "+" }),
        createElement(DiffBlock, { items: result.removed, label: "Removed", prefix: "-" }),
        createElement(DiffBlock, { items: result.changed, label: "Changed", prefix: "~" }),
      ),
    ),
    createElement(
      "section",
      {
        "aria-labelledby": "context-used-title",
        style: { ...sectionStyle, padding: "1rem" },
      },
      createElement(
        "h3",
        { id: "context-used-title", style: { fontSize: "1rem", margin: "0 0 0.75rem" } },
        "Context used",
      ),
      renderContextUsedSnippets(contextUsedSnippets),
    ),
    createElement(
      "section",
      {
        "aria-labelledby": "quality-checklist-title",
        style: { ...sectionStyle, padding: "1rem" },
      },
      createElement(
        "h3",
        {
          id: "quality-checklist-title",
          style: { fontSize: "1rem", margin: "0 0 0.75rem" },
        },
        "Structure checklist",
      ),
      createElement(
        "ul",
        {
          style: {
            display: "grid",
            gap: "0.75rem",
            listStyle: "none",
            margin: 0,
            padding: 0,
          } satisfies CSSProperties,
        },
        qualityChecklist.after.items.map((item) =>
          renderChecklistItem({
            enhancedPromptValue,
            item,
            onApplyChecklistSuggestion,
            onEnhancedPromptChange,
          }),
        ),
      ),
    ),
  );
}

function renderFallbackNotice(meta: EnhancementMetaViewModel | undefined) {
  if (!meta?.fellback) {
    return null;
  }

  return createElement(
    "p",
    {
      role: "status",
      style: {
        ...quietTextStyle,
        border: "1px solid #b45309",
        borderRadius: "6px",
        margin: 0,
        padding: "0.75rem",
      } satisfies CSSProperties,
    },
    `Fallback model result from ${meta.provider ?? "provider"} / ${meta.model ?? "model"}.`,
  );
}

function renderContextUsedSnippets(contextUsedSnippets: ContextUsedSnippetViewModel[]) {
  if (contextUsedSnippets.length === 0) {
    return createElement(
      "p",
      { style: { ...quietTextStyle, margin: 0 } },
      "No context snippets were used.",
    );
  }

  return createElement(
    "ul",
    {
      "aria-label": "Context snippets injected into this result",
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        listStyle: "none",
        margin: 0,
        padding: 0,
      } satisfies CSSProperties,
    },
    contextUsedSnippets.map((snippet) =>
      createElement(
        "li",
        { key: snippet.id },
        createElement(
          "span",
          {
            style: {
              border: "1px solid #a3a3a3",
              borderRadius: "999px",
              display: "inline-flex",
              maxWidth: "28rem",
              overflowWrap: "anywhere",
              padding: "0.35rem 0.6rem",
            } satisfies CSSProperties,
          },
          snippet.text,
        ),
      ),
    ),
  );
}

function renderChecklistItem({
  enhancedPromptValue,
  item,
  onApplyChecklistSuggestion,
  onEnhancedPromptChange,
}: {
  enhancedPromptValue: string;
  item: PromptChecklistItemViewModel;
  onApplyChecklistSuggestion:
    | ((item: PromptChecklistItemViewModel, nextPrompt: string) => void)
    | undefined;
  onEnhancedPromptChange: (nextPrompt: string) => void;
}) {
  const status = getChecklistStatusPresentation(item.status);
  const canApply = item.fix_suggestion.trim().length > 0 && item.status !== "pass";

  return createElement(
    "li",
    {
      key: item.dimension,
      style: {
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        display: "grid",
        gap: "0.5rem",
        padding: "0.75rem",
      } satisfies CSSProperties,
    },
    createElement(
      "div",
      {
        style: {
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          justifyContent: "space-between",
        } satisfies CSSProperties,
      },
      createElement("strong", null, item.dimension),
      createElement(
        "span",
        {
          "aria-label": status.ariaLabel,
          style: {
            border: "1px solid #9ca3af",
            borderRadius: "999px",
            display: "inline-flex",
            gap: "0.35rem",
            padding: "0.2rem 0.5rem",
          } satisfies CSSProperties,
        },
        createElement("span", { "aria-hidden": "true" }, status.symbol),
        createElement("span", null, status.label),
      ),
    ),
    createElement("p", { style: { ...quietTextStyle, margin: 0 } }, item.reason),
    item.fix_suggestion
      ? createElement(
          "p",
          { style: { ...quietTextStyle, margin: 0 } },
          createElement("strong", null, "Suggestion:"),
          ` ${item.fix_suggestion}`,
        )
      : null,
    canApply
      ? createElement(
          "button",
          {
            onClick: () => {
              const nextPrompt = applySuggestionToPrompt(enhancedPromptValue, item.fix_suggestion);
              onEnhancedPromptChange(nextPrompt);
              onApplyChecklistSuggestion?.(item, nextPrompt);
            },
            style: { ...buttonStyle, justifySelf: "start" },
            type: "button",
          },
          `Apply suggestion for ${item.dimension}`,
        )
      : null,
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  return createElement(
    "span",
    {
      style: {
        alignItems: "center",
        border: "1px solid #d6d3ca",
        borderRadius: "999px",
        display: "inline-flex",
        gap: "0.35rem",
        minHeight: "2rem",
        padding: "0 0.75rem",
      } satisfies CSSProperties,
    },
    createElement("span", { style: quietTextStyle }, label),
    createElement("strong", null, score),
  );
}

function PromptPanel({
  label,
  readOnly = false,
  textareaId,
  value,
  onChange,
}: {
  label: string;
  readOnly?: boolean;
  textareaId: string;
  value: string;
  onChange?: (nextPrompt: string) => void;
}) {
  return createElement(
    "section",
    { "aria-labelledby": `${textareaId}-label`, style: { ...sectionStyle, padding: "1rem" } },
    createElement(
      "label",
      {
        htmlFor: textareaId,
        id: `${textareaId}-label`,
        style: { display: "block", fontWeight: 700, marginBottom: "0.5rem" },
      },
      label,
    ),
    createElement("textarea", {
      "aria-describedby": readOnly ? `${textareaId}-hint` : undefined,
      id: textareaId,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.currentTarget.value),
      readOnly,
      rows: 14,
      style: {
        border: "1px solid #9ca3af",
        borderRadius: "6px",
        color: "#111827",
        font: "inherit",
        lineHeight: 1.5,
        minHeight: "20rem",
        padding: "0.75rem",
        resize: "vertical",
        width: "100%",
      } satisfies CSSProperties,
      value,
    }),
    readOnly
      ? createElement(
          "p",
          {
            id: `${textareaId}-hint`,
            style: { ...quietTextStyle, margin: "0.5rem 0 0" },
          },
          "Preserved for comparison.",
        )
      : null,
  );
}

function ListBlock({ emptyText, items }: { emptyText: string; items: string[] }) {
  if (items.length === 0) {
    return createElement("p", { style: { ...quietTextStyle, margin: 0 } }, emptyText);
  }

  return createElement(
    "ul",
    { style: { margin: 0, paddingLeft: "1.25rem" } },
    items.map((item) => createElement("li", { key: item }, item)),
  );
}

function DiffBlock({ label, prefix, items }: { label: string; prefix: string; items: string[] }) {
  return createElement(
    "section",
    { "aria-label": `${label} changes` },
    createElement("h4", { style: { fontSize: "0.95rem", margin: "0 0 0.35rem" } }, label),
    items.length > 0
      ? createElement(
          "ul",
          {
            style: {
              display: "grid",
              gap: "0.35rem",
              listStyle: "none",
              margin: 0,
              padding: 0,
            } satisfies CSSProperties,
          },
          items.map((item) =>
            createElement(
              "li",
              { key: item, style: { display: "flex", gap: "0.5rem" } },
              createElement("span", { "aria-hidden": "true" }, prefix),
              createElement("span", null, item),
            ),
          ),
        )
      : createElement("p", { style: { ...quietTextStyle, margin: 0 } }, "None."),
  );
}

export function applySuggestionToPrompt(prompt: string, suggestion: string): string {
  const trimmedPrompt = prompt.trimEnd();
  const trimmedSuggestion = suggestion.trim();

  if (!trimmedSuggestion) {
    return prompt;
  }

  return `${trimmedPrompt}\n\nAdditional requirement:\n${trimmedSuggestion}`;
}
