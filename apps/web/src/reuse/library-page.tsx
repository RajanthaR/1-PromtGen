"use client";

import { useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";

import { ReusePageShell, reuseStyles } from "./reuse-page-shell";
import {
  createLibraryEditorUrl,
  duplicateLibraryPrompt,
  editLibraryPrompt,
  filterLibraryPrompts,
  formatDateTime,
  formatPromptAsJson,
  formatPromptAsMarkdown,
  getLatestLibraryVersion,
  getLibraryTags,
  libraryFolders,
  restoreDeletedLibraryPrompt,
  restoreLibraryPromptVersion,
  seedLibraryPrompts,
  softDeleteLibraryPrompt,
  tagLibraryPrompt,
  toggleLibraryPromptPin,
  type LibraryFilters,
  type LibraryPrompt,
} from "./reuse-models";

const initialFilters: LibraryFilters = {
  folder: "all",
  includeDeleted: false,
  query: "",
  tag: "all",
};

export function LibraryPage() {
  const [prompts, setPrompts] = useState<LibraryPrompt[]>(seedLibraryPrompts);
  const [filters, setFilters] = useState<LibraryFilters>(initialFilters);
  const [selectedPromptId, setSelectedPromptId] = useState(seedLibraryPrompts[0]?.id ?? "");
  const [editBody, setEditBody] = useState(() =>
    seedLibraryPrompts[0] ? getLatestLibraryVersion(seedLibraryPrompts[0]).body : "",
  );
  const [editTitle, setEditTitle] = useState(seedLibraryPrompts[0]?.title ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState("Library ready.");

  const filteredPrompts = useMemo(() => filterLibraryPrompts(prompts, filters), [filters, prompts]);
  const tags = useMemo(() => getLibraryTags(prompts), [prompts]);
  const selectedPrompt =
    prompts.find((prompt) => prompt.id === selectedPromptId) ?? filteredPrompts[0];
  const latestVersion = selectedPrompt ? getLatestLibraryVersion(selectedPrompt) : null;

  function selectPrompt(prompt: LibraryPrompt) {
    const latest = getLatestLibraryVersion(prompt);
    setSelectedPromptId(prompt.id);
    setEditBody(latest.body);
    setEditTitle(prompt.title);
    setChangeNote("");
    setStatus(`Opened ${prompt.title}.`);
  }

  function updateFilter<K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPrompt) {
      return;
    }

    setPrompts((currentPrompts) =>
      editLibraryPrompt(currentPrompts, selectedPrompt.id, {
        body: editBody,
        changeNote,
        title: editTitle,
      }),
    );
    setChangeNote("");
    setStatus("Updated just now. A new version was created.");
  }

  function duplicatePrompt(prompt: LibraryPrompt) {
    setPrompts((currentPrompts) => duplicateLibraryPrompt(currentPrompts, prompt.id));
    setStatus(`Duplicated ${prompt.title}.`);
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPrompt) {
      return;
    }

    setPrompts((currentPrompts) => tagLibraryPrompt(currentPrompts, selectedPrompt.id, tagInput));
    setTagInput("");
    setStatus("Tag added.");
  }

  function pinPrompt(prompt: LibraryPrompt) {
    setPrompts((currentPrompts) => toggleLibraryPromptPin(currentPrompts, prompt.id));
    setStatus(prompt.pinned ? "Prompt unpinned." : "Prompt pinned.");
  }

  function deletePrompt(prompt: LibraryPrompt) {
    setPrompts((currentPrompts) => softDeleteLibraryPrompt(currentPrompts, prompt.id));
    setStatus("Prompt moved to deleted prompts.");
  }

  function restorePrompt(prompt: LibraryPrompt) {
    setPrompts((currentPrompts) => restoreDeletedLibraryPrompt(currentPrompts, prompt.id));
    setStatus("Prompt restored.");
  }

  function restoreVersion(versionId: string) {
    if (!selectedPrompt) {
      return;
    }

    setPrompts((currentPrompts) =>
      restoreLibraryPromptVersion(currentPrompts, selectedPrompt.id, versionId),
    );
    setStatus("Version restored as a new version.");
  }

  async function copyPrompt(format: "markdown" | "json") {
    if (!selectedPrompt) {
      return;
    }

    const text =
      format === "markdown"
        ? formatPromptAsMarkdown(selectedPrompt)
        : formatPromptAsJson(selectedPrompt);

    if (!navigator.clipboard) {
      setStatus("Clipboard access not supported in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus(format === "markdown" ? "Copied Markdown." : "Copied JSON.");
    } catch {
      setStatus("Copy failed.");
    }
  }

  return (
    <ReusePageShell eyebrow="Library" status={status} title="Saved prompts">
      <section aria-label="Library filters" style={{ ...reuseStyles.panel, marginBottom: "1rem" }}>
        <div style={reuseStyles.formGrid}>
          <label style={reuseStyles.label}>
            Search
            <input
              onChange={(event) => updateFilter("query", event.currentTarget.value)}
              placeholder="Search titles, tags, or prompt text"
              style={reuseStyles.input}
              type="search"
              value={filters.query}
            />
          </label>
          <label style={reuseStyles.label}>
            Folder
            <select
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateFilter("folder", event.currentTarget.value)
              }
              style={reuseStyles.input}
              value={filters.folder}
            >
              <option value="all">All folders</option>
              {libraryFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </label>
          <label style={reuseStyles.label}>
            Tag
            <select
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateFilter("tag", event.currentTarget.value)
              }
              style={reuseStyles.input}
              value={filters.tag}
            >
              <option value="all">All tags</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...reuseStyles.label, alignSelf: "end", minHeight: "2.75rem" }}>
            <span>
              <input
                checked={filters.includeDeleted}
                onChange={(event) => updateFilter("includeDeleted", event.currentTarget.checked)}
                type="checkbox"
              />{" "}
              Include deleted
            </span>
          </label>
        </div>
      </section>

      <div style={reuseStyles.split}>
        <section aria-labelledby="library-results-title" style={reuseStyles.panel}>
          <h2 id="library-results-title" style={sectionTitleStyle}>
            Prompt list
          </h2>
          <ul style={reuseStyles.list}>
            {filteredPrompts.map((prompt) => {
              const latest = getLatestLibraryVersion(prompt);
              const isSelected = prompt.id === selectedPrompt?.id;
              return (
                <li
                  aria-current={isSelected ? "true" : undefined}
                  key={prompt.id}
                  style={{
                    ...listItemStyle,
                    borderColor: isSelected ? "#173f35" : "#e5e7eb",
                  }}
                >
                  <div style={rowBetweenStyle}>
                    <div>
                      <h3 style={itemTitleStyle}>
                        {prompt.pinned ? "[Pinned] " : ""}
                        {prompt.title}
                      </h3>
                      <p style={reuseStyles.muted}>
                        {prompt.folder} | v{latest.versionNumber} |{" "}
                        {formatDateTime(prompt.updatedAt)}
                      </p>
                    </div>
                    {prompt.deletedAt ? <span style={deletedBadgeStyle}>Deleted</span> : null}
                  </div>
                  <div aria-label={`${prompt.title} tags`} style={tagRowStyle}>
                    {prompt.tags.map((tag) => (
                      <span key={tag} style={reuseStyles.chip}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={reuseStyles.actionRow}>
                    <button
                      onClick={() => selectPrompt(prompt)}
                      style={reuseStyles.button}
                      type="button"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => duplicatePrompt(prompt)}
                      style={reuseStyles.button}
                      type="button"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => pinPrompt(prompt)}
                      style={reuseStyles.button}
                      type="button"
                    >
                      {prompt.pinned ? "Unpin" : "Pin"}
                    </button>
                    {prompt.deletedAt ? (
                      <button
                        onClick={() => restorePrompt(prompt)}
                        style={reuseStyles.button}
                        type="button"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => deletePrompt(prompt)}
                        style={reuseStyles.dangerButton}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="library-editor-title" style={reuseStyles.panel}>
          <div style={rowBetweenStyle}>
            <div>
              <h2 id="library-editor-title" style={sectionTitleStyle}>
                Prompt details
              </h2>
              {latestVersion ? (
                <p style={reuseStyles.muted}>Current version {latestVersion.versionNumber}</p>
              ) : null}
            </div>
            {selectedPrompt ? (
              <a href={createLibraryEditorUrl(selectedPrompt)} style={linkButtonStyle}>
                Send to editor
              </a>
            ) : null}
          </div>

          {selectedPrompt ? (
            <>
              <form onSubmit={saveEdit} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
                <label style={reuseStyles.label}>
                  Title
                  <input
                    onChange={(event) => setEditTitle(event.currentTarget.value)}
                    style={reuseStyles.input}
                    value={editTitle}
                  />
                </label>
                <label style={reuseStyles.label}>
                  Editable prompt
                  <textarea
                    onChange={(event) => setEditBody(event.currentTarget.value)}
                    rows={12}
                    style={reuseStyles.textarea}
                    value={editBody}
                  />
                </label>
                <label style={reuseStyles.label}>
                  Change note
                  <input
                    onChange={(event) => setChangeNote(event.currentTarget.value)}
                    placeholder="What changed in this version"
                    style={reuseStyles.input}
                    value={changeNote}
                  />
                </label>
                <div style={reuseStyles.actionRow}>
                  <button style={reuseStyles.primaryButton} type="submit">
                    Save edit
                  </button>
                  <button
                    onClick={() => void copyPrompt("markdown")}
                    style={reuseStyles.button}
                    type="button"
                  >
                    Copy Markdown
                  </button>
                  <button
                    onClick={() => void copyPrompt("json")}
                    style={reuseStyles.button}
                    type="button"
                  >
                    Copy JSON
                  </button>
                </div>
              </form>

              <form onSubmit={addTag} style={{ ...reuseStyles.actionRow, marginTop: "1rem" }}>
                <label style={{ ...reuseStyles.label, flex: "1 1 12rem" }}>
                  Add tag
                  <input
                    onChange={(event) => setTagInput(event.currentTarget.value)}
                    placeholder="e.g. onboarding"
                    style={reuseStyles.input}
                    value={tagInput}
                  />
                </label>
                <button style={{ ...reuseStyles.button, alignSelf: "end" }} type="submit">
                  Tag
                </button>
              </form>

              <section aria-labelledby="versions-title" style={{ marginTop: "1.25rem" }}>
                <h3 id="versions-title" style={sectionTitleStyle}>
                  Versions
                </h3>
                <ul style={reuseStyles.list}>
                  {[...selectedPrompt.versions]
                    .sort((a, b) => b.versionNumber - a.versionNumber)
                    .map((version) => (
                      <li key={version.id} style={listItemStyle}>
                        <div style={rowBetweenStyle}>
                          <strong>Version {version.versionNumber}</strong>
                          <button
                            onClick={() => restoreVersion(version.id)}
                            style={reuseStyles.button}
                            type="button"
                          >
                            Restore as new version
                          </button>
                        </div>
                        <p style={reuseStyles.muted}>{formatDateTime(version.createdAt)}</p>
                        <p style={reuseStyles.muted}>{version.changeNote}</p>
                      </li>
                    ))}
                </ul>
              </section>
            </>
          ) : (
            <p style={reuseStyles.muted}>No prompt selected.</p>
          )}
        </section>
      </div>
    </ReusePageShell>
  );
}

const deletedBadgeStyle = {
  border: "1px solid #b91c1c",
  borderRadius: "999px",
  color: "#7f1d1d",
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "0.2rem 0.5rem",
} satisfies CSSProperties;

const itemTitleStyle = {
  fontSize: "1rem",
  lineHeight: 1.35,
  margin: 0,
} satisfies CSSProperties;

const linkButtonStyle = {
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

const rowBetweenStyle = {
  alignItems: "flex-start",
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

const tagRowStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
} satisfies CSSProperties;
