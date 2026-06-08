"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { ReusePageShell, reuseStyles } from "./reuse-page-shell";
import {
  createHistoryEditorUrl,
  deleteHistoryEntry,
  filterHistoryEntries,
  formatDateTime,
  seedHistoryEntries,
  type PromptHistoryEntry,
} from "./reuse-models";

export function HistoryPage() {
  const [entries, setEntries] = useState<PromptHistoryEntry[]>(seedHistoryEntries);
  const [selectedEntryId, setSelectedEntryId] = useState(seedHistoryEntries[0]?.id ?? "");
  const [status, setStatus] = useState("History ready.");
  const orderedEntries = useMemo(() => filterHistoryEntries(entries), [entries]);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? orderedEntries[0];

  function deleteEntry(entry: PromptHistoryEntry) {
    setEntries((currentEntries) => deleteHistoryEntry(currentEntries, entry.id));
    setStatus("History entry deleted.");

    if (selectedEntryId === entry.id) {
      setSelectedEntryId("");
    }
  }

  function selectEntry(entry: PromptHistoryEntry) {
    setSelectedEntryId(entry.id);
    setStatus(`Opened ${entry.mode} operation.`);
  }

  return (
    <ReusePageShell eyebrow="History" status={status} title="Prompt operations">
      <div style={reuseStyles.split}>
        <section aria-labelledby="history-list-title" style={reuseStyles.panel}>
          <h2 id="history-list-title" style={sectionTitleStyle}>
            Chronological history
          </h2>
          <ol style={{ ...reuseStyles.list, marginTop: "1rem" }}>
            {orderedEntries.map((entry) => {
              const isSelected = entry.id === selectedEntry?.id;
              return (
                <li
                  aria-current={isSelected ? "true" : undefined}
                  key={entry.id}
                  style={{
                    ...listItemStyle,
                    borderColor: isSelected ? "#173f35" : "#e5e7eb",
                  }}
                >
                  <div style={rowBetweenStyle}>
                    <div>
                      <h3 style={itemTitleStyle}>{formatDateTime(entry.createdAt)}</h3>
                      <p style={reuseStyles.muted}>
                        {entry.mode} | {entry.targetModel} | {entry.provider}/{entry.model}
                      </p>
                    </div>
                    <span style={entry.saved ? savedBadgeStyle : unsavedBadgeStyle}>
                      {entry.saved ? "Saved" : "Not saved"}
                    </span>
                  </div>
                  <p style={snippetStyle}>{entry.original}</p>
                  <div style={reuseStyles.actionRow}>
                    <button
                      onClick={() => selectEntry(entry)}
                      style={reuseStyles.button}
                      type="button"
                    >
                      Open
                    </button>
                    <a href={createHistoryEditorUrl(entry)} style={linkButtonStyle}>
                      Send to editor
                    </a>
                    <button
                      onClick={() => deleteEntry(entry)}
                      style={reuseStyles.dangerButton}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="history-detail-title" style={reuseStyles.panel}>
          <div style={rowBetweenStyle}>
            <h2 id="history-detail-title" style={sectionTitleStyle}>
              Operation details
            </h2>
            {selectedEntry ? (
              <a href={createHistoryEditorUrl(selectedEntry)} style={linkPrimaryStyle}>
                Send to editor
              </a>
            ) : null}
          </div>
          {selectedEntry ? (
            <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
              <div style={metricsGridStyle}>
                <Metric label="Before" value={String(selectedEntry.structureScoreBefore)} />
                <Metric label="After" value={String(selectedEntry.structureScoreAfter)} />
                <Metric label="Tokens" value={String(selectedEntry.tokens)} />
                <Metric label="Latency" value={`${selectedEntry.latencyMs} ms`} />
              </div>
              <label style={reuseStyles.label}>
                Original
                <textarea
                  readOnly
                  rows={8}
                  style={reuseStyles.textarea}
                  value={selectedEntry.original}
                />
              </label>
              <label style={reuseStyles.label}>
                Enhanced
                <textarea
                  readOnly
                  rows={12}
                  style={reuseStyles.textarea}
                  value={selectedEntry.enhanced}
                />
              </label>
              <p style={reuseStyles.muted}>
                Prompt type {selectedEntry.promptType}; feedback{" "}
                {selectedEntry.thumbsFeedback ?? "not recorded"}.
              </p>
            </div>
          ) : (
            <p style={{ ...reuseStyles.muted, marginTop: "1rem" }}>No history entry selected.</p>
          )}
        </section>
      </div>
    </ReusePageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span style={reuseStyles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const itemTitleStyle = {
  fontSize: "1rem",
  lineHeight: 1.35,
  margin: 0,
} satisfies CSSProperties;

const linkButtonStyle = {
  ...reuseStyles.button,
  alignItems: "center",
  display: "inline-flex",
  textDecoration: "none",
} satisfies CSSProperties;

const linkPrimaryStyle = {
  ...reuseStyles.primaryButton,
  alignItems: "center",
  display: "inline-flex",
  textDecoration: "none",
} satisfies CSSProperties;

const listItemStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  display: "grid",
  gap: "0.75rem",
  padding: "1rem",
} satisfies CSSProperties;

const metricStyle = {
  border: "1px solid #d6d3ca",
  borderRadius: "0.5rem",
  display: "grid",
  gap: "0.25rem",
  padding: "0.75rem",
} satisfies CSSProperties;

const metricsGridStyle = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))",
} satisfies CSSProperties;

const rowBetweenStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  justifyContent: "space-between",
} satisfies CSSProperties;

const savedBadgeStyle = {
  border: "1px solid #166534",
  borderRadius: "999px",
  color: "#14532d",
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "0.2rem 0.5rem",
} satisfies CSSProperties;

const sectionTitleStyle = {
  fontSize: "1.125rem",
  lineHeight: 1.3,
  margin: 0,
} satisfies CSSProperties;

const snippetStyle = {
  ...reuseStyles.muted,
  overflowWrap: "anywhere",
} satisfies CSSProperties;

const unsavedBadgeStyle = {
  border: "1px solid #92400e",
  borderRadius: "999px",
  color: "#78350f",
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "0.2rem 0.5rem",
} satisfies CSSProperties;
