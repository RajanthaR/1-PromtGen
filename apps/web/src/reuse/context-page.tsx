"use client";

import { useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";

import { ReusePageShell, reuseStyles } from "./reuse-page-shell";
import {
  contextKindOptions,
  createContextSnippet,
  deleteContextSnippet,
  formatDateTime,
  getExplicitlySelectedContextSnippets,
  seedContextSnippets,
  splitTags,
  toggleContextSelection,
  updateContextSnippet,
  type ContextSnippet,
  type ContextSnippetDraft,
  type ContextSnippetKind,
} from "./reuse-models";

const blankDraft: ContextSnippetDraft = {
  body: "",
  kind: "brand_voice",
  tags: [],
  title: "",
};

export function ContextPage() {
  const [snippets, setSnippets] = useState<ContextSnippet[]>(seedContextSnippets);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingSnippetId, setEditingSnippetId] = useState(seedContextSnippets[0]?.id ?? "");
  const [draft, setDraft] = useState<ContextSnippetDraft>(() =>
    seedContextSnippets[0] ? draftFromSnippet(seedContextSnippets[0]) : blankDraft,
  );
  const [tagInput, setTagInput] = useState(seedContextSnippets[0]?.tags.join(", ") ?? "");
  const [status, setStatus] = useState("Context ready.");
  const selectedSnippets = useMemo(
    () => getExplicitlySelectedContextSnippets(snippets, selectedIds),
    [selectedIds, snippets],
  );

  function editSnippet(snippet: ContextSnippet) {
    setEditingSnippetId(snippet.id);
    setDraft(draftFromSnippet(snippet));
    setTagInput(snippet.tags.join(", "));
    setStatus(`Editing ${snippet.title}.`);
  }

  function saveSnippet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDraft = {
      ...draft,
      tags: splitTags(tagInput),
    };

    if (editingSnippetId) {
      setSnippets((currentSnippets) =>
        updateContextSnippet(currentSnippets, editingSnippetId, nextDraft),
      );
      setStatus("Snippet updated.");
    } else {
      setSnippets((currentSnippets) => createContextSnippet(currentSnippets, nextDraft));
      newSnippet();
      setStatus("Snippet created.");
    }
  }

  function newSnippet() {
    setEditingSnippetId("");
    setDraft(blankDraft);
    setTagInput("");
    setStatus("New snippet form ready.");
  }

  function removeSnippet(snippet: ContextSnippet) {
    setSnippets((currentSnippets) => deleteContextSnippet(currentSnippets, snippet.id));
    setSelectedIds((currentIds) => currentIds.filter((selectedId) => selectedId !== snippet.id));
    if (editingSnippetId === snippet.id) {
      newSnippet();
    }
    setStatus("Snippet deleted.");
  }

  function updateDraft<K extends keyof ContextSnippetDraft>(key: K, value: ContextSnippetDraft[K]) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  }

  function updateSelection(snippetId: string, event: ChangeEvent<HTMLInputElement>) {
    setSelectedIds((currentIds) =>
      toggleContextSelection(currentIds, snippetId, event.currentTarget.checked),
    );
    setStatus(event.currentTarget.checked ? "Snippet selected." : "Snippet unselected.");
  }

  return (
    <ReusePageShell eyebrow="Context" status={status} title="Reusable snippets">
      <div style={reuseStyles.split}>
        <section aria-labelledby="context-list-title" style={reuseStyles.panel}>
          <div style={rowBetweenStyle}>
            <h2 id="context-list-title" style={sectionTitleStyle}>
              Snippets
            </h2>
            <button onClick={newSnippet} style={reuseStyles.button} type="button">
              New snippet
            </button>
          </div>
          <ul style={{ ...reuseStyles.list, marginTop: "1rem" }}>
            {snippets.map((snippet) => (
              <li key={snippet.id} style={listItemStyle}>
                <label style={checkboxRowStyle}>
                  <input
                    checked={selectedIds.includes(snippet.id)}
                    onChange={(event) => updateSelection(snippet.id, event)}
                    type="checkbox"
                    value={snippet.id}
                  />
                  <span>
                    <strong>{snippet.title}</strong>
                    <span style={snippetBodyStyle}>{snippet.body}</span>
                  </span>
                </label>
                <div aria-label={`${snippet.title} tags`} style={tagRowStyle}>
                  <span style={kindBadgeStyle}>{kindLabel(snippet.kind)}</span>
                  {snippet.tags.map((tag) => (
                    <span key={tag} style={reuseStyles.chip}>
                      {tag}
                    </span>
                  ))}
                </div>
                <p style={reuseStyles.muted}>Updated {formatDateTime(snippet.updatedAt)}</p>
                <div style={reuseStyles.actionRow}>
                  <button
                    onClick={() => editSnippet(snippet)}
                    style={reuseStyles.button}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeSnippet(snippet)}
                    style={reuseStyles.dangerButton}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="context-editor-title" style={reuseStyles.panel}>
          <h2 id="context-editor-title" style={sectionTitleStyle}>
            Snippet editor
          </h2>
          <form onSubmit={saveSnippet} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
            <label style={reuseStyles.label}>
              Title
              <input
                onChange={(event) => updateDraft("title", event.currentTarget.value)}
                required
                style={reuseStyles.input}
                value={draft.title}
              />
            </label>
            <label style={reuseStyles.label}>
              Kind
              <select
                onChange={(event) =>
                  updateDraft("kind", event.currentTarget.value as ContextSnippetKind)
                }
                style={reuseStyles.input}
                value={draft.kind}
              >
                {contextKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={reuseStyles.label}>
              Body
              <textarea
                onChange={(event) => updateDraft("body", event.currentTarget.value)}
                required
                rows={8}
                style={reuseStyles.textarea}
                value={draft.body}
              />
            </label>
            <label style={reuseStyles.label}>
              Tags
              <input
                onChange={(event) => setTagInput(event.currentTarget.value)}
                placeholder="voice, product"
                style={reuseStyles.input}
                value={tagInput}
              />
            </label>
            <button style={reuseStyles.primaryButton} type="submit">
              {editingSnippetId ? "Save snippet" : "Create snippet"}
            </button>
          </form>

          <section aria-labelledby="selected-context-title" style={{ marginTop: "1.5rem" }}>
            <h3 id="selected-context-title" style={sectionTitleStyle}>
              Selected snippets
            </h3>
            <div aria-label="Explicitly selected context snippets" style={selectedChipAreaStyle}>
              {selectedSnippets.length > 0 ? (
                selectedSnippets.map((snippet) => (
                  <span key={snippet.id} style={reuseStyles.chip}>
                    {snippet.title}
                  </span>
                ))
              ) : (
                <span style={reuseStyles.muted}>No snippets selected.</span>
              )}
            </div>
          </section>
        </section>
      </div>
    </ReusePageShell>
  );
}

function draftFromSnippet(snippet: ContextSnippet): ContextSnippetDraft {
  return {
    body: snippet.body,
    kind: snippet.kind,
    tags: snippet.tags,
    title: snippet.title,
  };
}

function kindLabel(kind: ContextSnippetKind): string {
  return contextKindOptions.find((option) => option.value === kind)?.label ?? "Other";
}

const checkboxRowStyle = {
  alignItems: "flex-start",
  display: "flex",
  gap: "0.75rem",
} satisfies CSSProperties;

const kindBadgeStyle = {
  border: "1px solid #9ca3af",
  borderRadius: "999px",
  color: "#1f2933",
  display: "inline-flex",
  fontSize: "0.8125rem",
  fontWeight: 700,
  padding: "0.25rem 0.625rem",
} satisfies CSSProperties;

const listItemStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  display: "grid",
  gap: "0.75rem",
  padding: "1rem",
} satisfies CSSProperties;

const rowBetweenStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  justifyContent: "space-between",
} satisfies CSSProperties;

const sectionTitleStyle = {
  fontSize: "1.125rem",
  lineHeight: 1.3,
  margin: 0,
} satisfies CSSProperties;

const selectedChipAreaStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginTop: "0.75rem",
  minHeight: "2rem",
} satisfies CSSProperties;

const snippetBodyStyle = {
  ...reuseStyles.muted,
  display: "block",
  marginTop: "0.25rem",
} satisfies CSSProperties;

const tagRowStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
} satisfies CSSProperties;
