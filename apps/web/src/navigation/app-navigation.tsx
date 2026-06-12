"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

const navItems = [
  { href: "/", label: "Editor" },
  { href: "/library", label: "Library" },
  { href: "/history", label: "History" },
  { href: "/context", label: "Context" },
  { href: "/templates", label: "Templates" },
  { href: "/settings", label: "Settings" },
];

export function AppNavigation() {
  const pathname = usePathname() ?? "/";

  return (
    <header style={styles.header}>
      <a className="skip-link" href="#main-content" style={styles.skipLink}>
        Skip to main content
      </a>
      <nav aria-label="Primary" style={styles.nav}>
        <a href="/" style={styles.brand}>
          PromptForge Studio
        </a>
        <div style={styles.links}>
          {navItems.map((item) => {
            const isCurrent =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <a
                aria-current={isCurrent ? "page" : undefined}
                href={item.href}
                key={item.href}
                style={isCurrent ? { ...styles.link, ...styles.activeLink } : styles.link}
              >
                {item.label}
                {isCurrent ? <span style={styles.currentText}> current</span> : null}
              </a>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

const styles = {
  brand: {
    color: "#17241f",
    fontWeight: 800,
    textDecoration: "none",
  },
  header: {
    background: "#f7f7f4",
    borderBottom: "1px solid #d6d3ca",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  link: {
    borderRadius: "0.375rem",
    color: "#1f2933",
    minHeight: "2rem",
    padding: "0.35rem 0.55rem",
    textDecoration: "none",
  },
  activeLink: {
    background: "#e7f0eb",
    boxShadow: "inset 0 -3px 0 #173f35",
    color: "#173f35",
    fontWeight: 800,
  },
  currentText: {
    fontSize: "0.75rem",
    fontWeight: 800,
  },
  links: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.25rem",
  },
  nav: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    margin: "0 auto",
    maxWidth: "76rem",
    padding: "0.75rem 2rem",
  },
  skipLink: {
    background: "#173f35",
    color: "#ffffff",
    left: "0.75rem",
    padding: "0.5rem 0.75rem",
    position: "absolute",
    top: "-4rem",
    zIndex: 20,
  },
} satisfies Record<string, CSSProperties>;
