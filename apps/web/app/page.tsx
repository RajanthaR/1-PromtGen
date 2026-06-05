import { getWebPlaceholderStatus } from "../src/placeholder";

export default function Home() {
  const status = getWebPlaceholderStatus();

  return (
    <main
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <section aria-label="Application placeholder">
        <p style={{ fontSize: "0.875rem", margin: 0, textTransform: "uppercase" }}>
          {status.state}
        </p>
        <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 0" }}>{status.title}</h1>
      </section>
    </main>
  );
}
