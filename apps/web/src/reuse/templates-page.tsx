"use client";

import { useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";

import { ReusePageShell, reuseStyles } from "./reuse-page-shell";
import {
  createTemplateEditorUrl,
  filterTemplates,
  generateTemplatePrompt,
  getTemplateTags,
  getTemplateTools,
  seedTemplates,
  type PromptTemplate,
  type TemplateDifficulty,
  type TemplateFilters,
} from "./reuse-models";

const initialFilters: TemplateFilters = {
  difficulty: "all",
  query: "",
  recentOnly: false,
  tag: "all",
  tool: "all",
};

export function TemplatesPage() {
  const [filters, setFilters] = useState<TemplateFilters>(initialFilters);
  const [selectedTemplateId, setSelectedTemplateId] = useState(seedTemplates[0]?.id ?? "");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [status, setStatus] = useState("Templates ready.");

  const filteredTemplates = useMemo(
    () => filterTemplates(seedTemplates, filters, recentTemplateIds),
    [filters, recentTemplateIds],
  );
  const tags = useMemo(() => getTemplateTags(seedTemplates), []);
  const tools = useMemo(() => getTemplateTools(seedTemplates), []);
  const selectedTemplate =
    seedTemplates.find((template) => template.id === selectedTemplateId) ?? filteredTemplates[0];

  function updateFilter<K extends keyof TemplateFilters>(key: K, value: TemplateFilters[K]) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function selectTemplate(template: PromptTemplate) {
    setSelectedTemplateId(template.id);
    setVariableValues(defaultVariableValues(template));
    setValidationErrors({});
    setGeneratedPrompt("");
    setStatus(`Opened ${template.title}.`);
  }

  function updateVariable(name: string, value: string) {
    setVariableValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setValidationErrors((currentErrors) => {
      const { [name]: _ignored, ...nextErrors } = currentErrors;
      return nextErrors;
    });
  }

  function generatePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTemplate) {
      return;
    }

    const result = generateTemplatePrompt(selectedTemplate, variableValues);
    setValidationErrors(result.errors);

    if (result.status === "invalid") {
      setGeneratedPrompt("");
      setStatus("Fill required fields before generating.");
      return;
    }

    setGeneratedPrompt(result.prompt);
    setRecentTemplateIds((currentIds) => [
      selectedTemplate.id,
      ...currentIds.filter((id) => id !== selectedTemplate.id),
    ]);
    setStatus("Filled prompt generated.");
  }

  return (
    <ReusePageShell eyebrow="Templates" status={status} title="Prompt templates">
      <section aria-label="Template filters" style={{ ...reuseStyles.panel, marginBottom: "1rem" }}>
        <div style={reuseStyles.formGrid}>
          <label style={reuseStyles.label}>
            Search
            <input
              onChange={(event) => updateFilter("query", event.currentTarget.value)}
              placeholder="Search templates"
              style={reuseStyles.input}
              type="search"
              value={filters.query}
            />
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
          <label style={reuseStyles.label}>
            Tool
            <select
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateFilter("tool", event.currentTarget.value)
              }
              style={reuseStyles.input}
              value={filters.tool}
            >
              <option value="all">All tools</option>
              {tools.map((tool) => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </select>
          </label>
          <label style={reuseStyles.label}>
            Difficulty
            <select
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateFilter("difficulty", event.currentTarget.value as "all" | TemplateDifficulty)
              }
              style={reuseStyles.input}
              value={filters.difficulty}
            >
              <option value="all">All difficulty levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label style={{ ...reuseStyles.label, alignSelf: "end", minHeight: "2.75rem" }}>
            <span>
              <input
                checked={filters.recentOnly}
                onChange={(event) => updateFilter("recentOnly", event.currentTarget.checked)}
                type="checkbox"
              />{" "}
              Recently used
            </span>
          </label>
        </div>
      </section>

      <div style={reuseStyles.split}>
        <section aria-labelledby="template-list-title" style={reuseStyles.panel}>
          <h2 id="template-list-title" style={sectionTitleStyle}>
            Template list
          </h2>
          <ul style={{ ...reuseStyles.list, marginTop: "1rem" }}>
            {filteredTemplates.map((template) => {
              const isSelected = template.id === selectedTemplate?.id;
              return (
                <li
                  aria-current={isSelected ? "true" : undefined}
                  key={template.id}
                  style={{
                    ...listItemStyle,
                    borderColor: isSelected ? "#173f35" : "#e5e7eb",
                  }}
                >
                  <div style={rowBetweenStyle}>
                    <div>
                      <h3 style={itemTitleStyle}>{template.title}</h3>
                      <p style={reuseStyles.muted}>
                        {template.category} | {template.difficulty}
                      </p>
                    </div>
                    {recentTemplateIds.includes(template.id) ? (
                      <span style={recentBadgeStyle}>Recent</span>
                    ) : null}
                  </div>
                  <p style={reuseStyles.muted}>{template.description}</p>
                  <div aria-label={`${template.title} tags`} style={tagRowStyle}>
                    {template.tags.map((tag) => (
                      <span key={tag} style={reuseStyles.chip}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => selectTemplate(template)}
                    style={reuseStyles.button}
                    type="button"
                  >
                    Open
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="template-fill-title" style={reuseStyles.panel}>
          <h2 id="template-fill-title" style={sectionTitleStyle}>
            Fill variables
          </h2>
          {selectedTemplate ? (
            <>
              <p style={{ ...reuseStyles.muted, marginTop: "0.5rem" }}>
                {selectedTemplate.description}
              </p>
              <form
                onSubmit={generatePrompt}
                style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}
              >
                {selectedTemplate.variables.map((variable) => {
                  const error = validationErrors[variable.name];
                  const fieldId = `template-variable-${variable.name}`;
                  return (
                    <label htmlFor={fieldId} key={variable.name} style={reuseStyles.label}>
                      {variable.label}
                      <input
                        aria-describedby={error ? `${fieldId}-error` : undefined}
                        aria-invalid={error ? "true" : "false"}
                        id={fieldId}
                        onChange={(event) =>
                          updateVariable(variable.name, event.currentTarget.value)
                        }
                        required={variable.required}
                        style={reuseStyles.input}
                        value={variableValues[variable.name] ?? variable.defaultValue}
                      />
                      {error ? (
                        <span id={`${fieldId}-error`} role="alert" style={errorStyle}>
                          {error}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
                <button style={reuseStyles.primaryButton} type="submit">
                  Generate filled prompt
                </button>
              </form>

              {generatedPrompt ? (
                <section aria-labelledby="filled-prompt-title" style={{ marginTop: "1.5rem" }}>
                  <div style={rowBetweenStyle}>
                    <h3 id="filled-prompt-title" style={sectionTitleStyle}>
                      Filled prompt
                    </h3>
                    <a href={createTemplateEditorUrl(generatedPrompt)} style={linkPrimaryStyle}>
                      Send to editor
                    </a>
                  </div>
                  <textarea
                    aria-label="Generated filled prompt"
                    onChange={(event) => setGeneratedPrompt(event.currentTarget.value)}
                    rows={12}
                    style={{ ...reuseStyles.textarea, marginTop: "0.75rem" }}
                    value={generatedPrompt}
                  />
                </section>
              ) : null}
            </>
          ) : (
            <p style={{ ...reuseStyles.muted, marginTop: "1rem" }}>No template selected.</p>
          )}
        </section>
      </div>
    </ReusePageShell>
  );
}

function defaultVariableValues(template: PromptTemplate): Record<string, string> {
  return Object.fromEntries(
    template.variables.map((variable) => [variable.name, variable.defaultValue]),
  );
}

const errorStyle = {
  color: "#b91c1c",
  fontSize: "0.8125rem",
  fontWeight: 700,
} satisfies CSSProperties;

const itemTitleStyle = {
  fontSize: "1rem",
  lineHeight: 1.35,
  margin: 0,
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

const recentBadgeStyle = {
  border: "1px solid #166534",
  borderRadius: "999px",
  color: "#14532d",
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "0.2rem 0.5rem",
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
