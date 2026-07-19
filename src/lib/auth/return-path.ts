// Plan 080 U6 — the post-login return path ("?from=…"), sanitized.
//
// Two reasons this exists:
//  1. The proxy now preserves the QUERY STRING in `from`, not just the pathname. Plan 080 makes
//     `/inventory?section=consumables` a real, addressable surface, so dropping the query sent a
//     logged-out user (or an assistant deep link, or an old-route redirect) to the wrong tab.
//  2. `from` was previously fed straight into `router.push()` / Better Auth's `callbackURL`. That is an
//     OPEN REDIRECT: `/login?from=https://evil.com` would bounce a freshly-authenticated user off-site,
//     which is a credible phishing hand-off. Widening what `from` may carry without validating it would
//     have made that worse, so it is validated here at the point of USE.
//
// Rule: accept ONLY a same-origin, absolute-path reference. Anything else degrades to "/" rather than
// throwing — a bad `from` should never block a legitimate login.
export const DEFAULT_RETURN_PATH = "/";

/** True if the string holds a C0 control character or DEL. Char-code check (no control literals in source). */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_RETURN_PATH;
  const v = raw.trim();
  // Must be an absolute PATH. Rejects "https://evil.com", "javascript:…", "mailto:…", and bare paths.
  if (!v.startsWith("/")) return DEFAULT_RETURN_PATH;
  // "//host" and "/\host" are protocol-relative — a browser reads them as another ORIGIN, not a path.
  if (v.startsWith("//") || v.startsWith("/\\")) return DEFAULT_RETURN_PATH;
  // Any backslash: some browsers normalize "\" to "/", which reopens the protocol-relative hole.
  if (v.includes("\\")) return DEFAULT_RETURN_PATH;
  // Control chars (embedded newline/tab/NUL) get stripped by URL parsers and can smuggle a scheme past
  // the checks above.
  if (hasControlChar(v)) return DEFAULT_RETURN_PATH;
  // Never bounce back to the auth screens — that traps the user in a login loop.
  if (v === "/login" || v.startsWith("/login?") || v.startsWith("/login/")) return DEFAULT_RETURN_PATH;
  return v;
}
