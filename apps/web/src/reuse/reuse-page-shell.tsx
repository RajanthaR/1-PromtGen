import type { CSSProperties, ReactNode } from "react";

export function ReusePageShell({
  children,
  eyebrow,
  status,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  status: string;
  title: string;
}) {
  return (
    <main id="main-content" style={styles.page}>
      <div style={styles.inner}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>{eyebrow}</p>
            <h1 style={styles.title}>{title}</h1>
          </div>
          <p aria-live="polite" role="status" style={styles.status}>
            {status}
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

export const reuseStyles = {
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  button: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#1f2933",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: "2.5rem",
    padding: "0.55rem 0.8rem",
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
  dangerButton: {
    background: "#ffffff",
    border: "1px solid #b91c1c",
    borderRadius: "0.5rem",
    color: "#7f1d1d",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: "2.5rem",
    padding: "0.55rem 0.8rem",
  },
  fieldset: {
    border: "1px solid #cfd6cf",
    borderRadius: "0.5rem",
    margin: 0,
    padding: "1rem",
  },
  formGrid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  },
  input: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#111827",
    font: "inherit",
    minHeight: "2.75rem",
    padding: "0.5rem 0.75rem",
    width: "100%",
  },
  label: {
    color: "#1f2933",
    display: "grid",
    fontSize: "0.875rem",
    fontWeight: 700,
    gap: "0.5rem",
  },
  list: {
    display: "grid",
    gap: "0.75rem",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  muted: {
    color: "#4b5563",
    fontSize: "0.875rem",
    lineHeight: 1.5,
    margin: 0,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #d6d3ca",
    borderRadius: "0.5rem",
    padding: "1rem",
  },
  primaryButton: {
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
  split: {
    alignItems: "start",
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "minmax(16rem, 0.9fr) minmax(18rem, 1.1fr)",
  },
  textarea: {
    background: "#ffffff",
    border: "1px solid #9ca3af",
    borderRadius: "0.5rem",
    color: "#111827",
    font: "inherit",
    lineHeight: 1.5,
    minHeight: "12rem",
    padding: "0.75rem",
    resize: "vertical",
    width: "100%",
  },
} satisfies Record<string, CSSProperties>;

const styles = {
  eyebrow: {
    color: "#4b5563",
    fontSize: "0.75rem",
    fontWeight: 800,
    letterSpacing: 0,
    margin: 0,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  inner: {
    margin: "0 auto",
    maxWidth: "76rem",
    padding: "2rem",
  },
  page: {
    background: "#f7f7f4",
    color: "#1f2933",
    minHeight: "100vh",
  },
  status: {
    color: "#4b5563",
    fontSize: "0.875rem",
    margin: 0,
  },
  title: {
    color: "#17241f",
    fontSize: "2rem",
    lineHeight: 1.15,
    margin: "0.25rem 0 0",
  },
} satisfies Record<string, CSSProperties>;
