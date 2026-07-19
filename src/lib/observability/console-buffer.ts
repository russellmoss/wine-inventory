// Client-side console + uncaught-error ring buffer.
//
// Why: when a user files a bug they are usually still on the screen where it
// happened, so the browser console still holds the real error. We keep a small,
// bounded, always-on ring of recent console output + uncaught errors and drain it
// into the bug report's `debugContext` at submit time (Plan 079, Unit 1/2). The
// captured text is developer-only (never shown back to the customer) and lightly
// redacted so an obvious secret/email that got logged doesn't get persisted.
//
// Split into a pure core (`createConsoleBuffer` + the pure string helpers) so it is
// unit-testable without a DOM, and a browser-only singleton installer that patches
// the real `console` + `window` once. The install runs from
// `src/instrumentation-client.ts` (before React mounts) for the widest coverage.

export type ConsoleLevel = "log" | "warn" | "error" | "window.error" | "unhandledrejection";

export type ConsoleEntry = {
  level: ConsoleLevel;
  ts: number;
  message: string;
};

export type DrainedConsole = {
  /** console.log / console.warn — non-error diagnostics. */
  consoleLog: ConsoleEntry[];
  /** console.error + uncaught window errors + unhandled rejections. */
  clientErrors: ConsoleEntry[];
};

// Bounds. Deliberately small — this is a diagnostic hint, not a full log stream.
export const MAX_ENTRIES = 50;
export const MAX_ENTRY_CHARS = 2000;
/** Total budget applied at drain time (belt for the server-side clamp in Unit 2). */
export const MAX_TOTAL_CHARS = 20_000;

const ERROR_LEVELS: ReadonlySet<ConsoleLevel> = new Set<ConsoleLevel>([
  "error",
  "window.error",
  "unhandledrejection",
]);

// --- pure helpers -----------------------------------------------------------

/**
 * Strip obvious secrets/PII from a captured string. Intentionally conservative +
 * targeted (low false-positive) rather than a blanket "redact anything long":
 * emails, JWTs, `Bearer <token>`, common secret-ish `key=value` pairs, and
 * `sk-`/`pk-` style API keys.
 */
export function redactString(input: string): string {
  return input
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[redacted-email]")
    .replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[redacted-jwt]")
    .replace(/\b(?:bearer)\s+[A-Za-z0-9._~+/-]{12,}=*/gi, "Bearer [redacted-token]")
    .replace(/\b(?:sk|pk|rk)_[A-Za-z0-9_]{12,}/g, "[redacted-key]")
    .replace(
      /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization|auth|cookie|session|sessionid|sid|csrf|xsrf|access[_-]?token|refresh[_-]?token)\b(\s*[:=]\s*)("?)[^\s"',;]+\3/gi,
      "$1$2[redacted]",
    );
}

/** Truncate a single entry's message to the per-entry cap, marking the cut. */
export function clampMessage(message: string, cap: number = MAX_ENTRY_CHARS): string {
  if (message.length <= cap) return message;
  return message.slice(0, cap) + `…[+${message.length - cap} chars]`;
}

/** Best-effort, exception-safe stringification of a single console argument. */
export function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    const firstStackLine = arg.stack?.split("\n").slice(0, 3).join("\n");
    return firstStackLine ?? `${arg.name}: ${arg.message}`;
  }
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

/** Turn a console.*(...) argument list into one redacted, capped message string. */
export function formatArgs(args: unknown[]): string {
  const joined = args.map(formatArg).join(" ");
  return clampMessage(redactString(joined));
}

// --- pure ring core ---------------------------------------------------------

export type ConsoleBuffer = {
  record: (level: ConsoleLevel, args: unknown[]) => void;
  drain: () => DrainedConsole;
  clear: () => void;
  size: () => number;
};

/**
 * Create a bounded FIFO ring. Pure (no globals) so tests exercise it directly.
 * `now` is injectable for deterministic tests.
 */
export function createConsoleBuffer(opts?: {
  maxEntries?: number;
  now?: () => number;
}): ConsoleBuffer {
  const maxEntries = opts?.maxEntries ?? MAX_ENTRIES;
  const now = opts?.now ?? (() => Date.now());
  let entries: ConsoleEntry[] = [];

  return {
    record(level, args) {
      const message = formatArgs(args);
      if (!message) return;
      entries.push({ level, ts: now(), message });
      if (entries.length > maxEntries) {
        entries = entries.slice(entries.length - maxEntries);
      }
    },
    drain() {
      // Non-destructive snapshot, split errors from logs, trimmed to the total budget.
      const consoleLog: ConsoleEntry[] = [];
      const clientErrors: ConsoleEntry[] = [];
      let total = 0;
      // Walk newest-first so the total-char budget keeps the most recent context.
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        total += e.message.length;
        if (total > MAX_TOTAL_CHARS) break;
        (ERROR_LEVELS.has(e.level) ? clientErrors : consoleLog).unshift({ ...e });
      }
      return { consoleLog, clientErrors };
    },
    clear() {
      entries = [];
    },
    size() {
      return entries.length;
    },
  };
}

// --- browser-only singleton installer ---------------------------------------

let singleton: ConsoleBuffer | null = null;
let installed = false;

/**
 * Patch the real `console` + `window` error events once, feeding a module-level
 * ring. Idempotent (double-install is a no-op) and a no-op outside the browser.
 * Originals are preserved and always called, so Sentry's own console breadcrumb
 * integration keeps working (no double-capture of OUR buffer).
 */
export function installConsoleCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  singleton = createConsoleBuffer();

  const levels: Array<Extract<ConsoleLevel, "log" | "warn" | "error">> = ["log", "warn", "error"];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        singleton?.record(level, args);
      } catch {
        // never let capture break the app's own logging
      }
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    try {
      singleton?.record("window.error", [event.message, event.error]);
    } catch {
      /* swallow */
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    try {
      singleton?.record("unhandledrejection", [event.reason]);
    } catch {
      /* swallow */
    }
  });
}

/** Non-destructive snapshot for the bug-report submit payload. */
export function drainConsoleBuffer(): DrainedConsole {
  return singleton?.drain() ?? { consoleLog: [], clientErrors: [] };
}

/** Entry cap while a Break Mode hunt is running — a deliberate hunt wants more history. */
export const ESCALATED_MAX_ENTRIES = 200;

let escalated = false;

/**
 * Grow (or restore) the ring for a Break Mode hunt (Plan 080 Unit 9). Rebuilding the singleton
 * would drop history, so we swap in a larger ring and replay the existing entries into it.
 */
export function setConsoleBufferEscalated(next: boolean): void {
  if (typeof window === "undefined" || !singleton || escalated === next) return;
  escalated = next;
  const carried = singleton.drain();
  const replacement = createConsoleBuffer({
    maxEntries: next ? ESCALATED_MAX_ENTRIES : MAX_ENTRIES,
  });
  // Re-record newest-last so the ring keeps the most recent entries if it overflows.
  for (const entry of [...carried.consoleLog, ...carried.clientErrors].sort((a, b) => a.ts - b.ts)) {
    replacement.record(entry.level, [entry.message]);
  }
  singleton = replacement;
}

export function isConsoleBufferEscalated(): boolean {
  return escalated;
}

/**
 * Clear the ring. Call after a successful bug submit (so a later report on a
 * different page doesn't carry stale logs) and on logout / session switch (so a
 * shared-kiosk doesn't leak one user's console into another's report — council C-4).
 */
export function clearConsoleBuffer(): void {
  singleton?.clear();
}
