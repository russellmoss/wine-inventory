"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { isSafeInternalPath } from "@/lib/assistant/assistant-events";

// Lightweight, dependency-free markdown renderer for assistant replies. Handles
// the subset the model actually produces in chat: headings, bold, inline code,
// links, bullet and numbered lists, and paragraphs. Builds React nodes (no raw HTML).

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string };

const H = /^(#{1,6})\s+(.*)$/;
const UL = /^\s*[-*]\s+(.*)$/;
const OL = /^\s*\d+\.\s+(.*)$/;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    const h = H.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: "h", level: h[1].length, text: h[2] });
      continue;
    }
    if (UL.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i])) {
        items.push(UL.exec(lines[i])![1]);
        i++;
      }
      i--;
      blocks.push({ type: "ul", items });
      continue;
    }
    if (OL.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && OL.test(lines[i])) {
        items.push(OL.exec(lines[i])![1]);
        i++;
      }
      i--;
      blocks.push({ type: "ol", items });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

// Inline tokens: bold, inline code, and markdown links [text](href).
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

// Same-origin in-app link that does SPA navigation (router.push) on a plain
// left-click, but honors Cmd/Ctrl/Shift/middle-click so "open in new tab" still
// works. Unsafe/off-site hrefs never reach here — the caller renders plain text.
function SafeLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        router.push(href);
      }}
      style={{ color: "var(--accent)", textDecoration: "underline" }}
    >
      {label}
    </a>
  );
}

// Knowledge-base citation links (/kb/source/<id>) resolve to an EXTERNAL source (they 302 out to AWRI /
// Wine Australia). Open them in a NEW tab so the winemaker never loses their place in Cellarhand.
function CitationLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--accent)", textDecoration: "underline" }}
    >
      {label}
    </a>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    const link = LINK.exec(part);
    if (link) {
      const label = link[1];
      const href = link[2];
      // Only same-origin "/" paths become links; anything else renders as plain
      // text (blocks javascript:, http(s)://, //off-site, backslash tricks).
      if (isSafeInternalPath(href)) {
        // Citations (/kb/source/<id>) redirect out to the source — open in a new tab, don't leave the app.
        if (href.startsWith("/kb/source/")) return <CitationLink key={i} href={href} label={label} />;
        return <SafeLink key={i} href={href} label={label} />;
      }
      return <React.Fragment key={i}>{label}</React.Fragment>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: "0.92em",
            background: "var(--surface-muted)",
            padding: "1px 5px",
            borderRadius: "var(--radius-sm, 6px)",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {blocks.map((b, i) => {
        if (b.type === "h") {
          return (
            <div
              key={i}
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 500,
                fontSize: b.level <= 2 ? "var(--text-h3)" : "var(--text-body)",
                color: "var(--text-primary)",
              }}
            >
              {renderInline(b.text)}
            </div>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: "1.25em", display: "flex", flexDirection: "column", gap: 4 }}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} style={{ margin: 0, paddingLeft: "1.4em", display: "flex", flexDirection: "column", gap: 4 }}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} style={{ margin: 0 }}>
            {renderInline(b.text)}
          </p>
        );
      })}
    </div>
  );
}
