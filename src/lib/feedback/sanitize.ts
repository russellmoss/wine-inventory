export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizePlainText(input: string | null | undefined, max = 5000): string {
  return escapeHtml((input ?? "").slice(0, max));
}

export function safeFilename(input: string): string {
  const base = input.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "attachment";
}
