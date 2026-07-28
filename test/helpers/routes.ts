import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { code } from "./code";

const APP = fileURLToPath(new URL("../../src/app", import.meta.url));

/**
 * Every route the app serves, derived from the file system.
 *
 * Shared by `route-stability` (which asks "did a URL disappear?") and
 * `route-reachability` (which asks "can anyone get there?"). One implementation,
 * because two hard-coded route lists that nothing reconciles is exactly the drift
 * that let 39 surfaces go missing without a single test going red.
 */
export function currentRoutes(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") {
        const rel = p.slice(APP.length + 1).split(sep).join("/").replace(/\/page\.tsx$/, "");
        // Route groups like `(app)` are organisational and not part of the URL.
        const url = "/" + rel.replace(/\((?:[^)]+)\)\/?/g, "");
        out.push(url === "/" ? "/" : url.replace(/\/$/, ""));
      }
    }
  })(APP);
  return [...new Set(out)].sort();
}

/** Static routes only — a `[id]` page is reached from the list that owns the id. */
export function staticRoutes(): string[] {
  return currentRoutes().filter((r) => !r.includes("["));
}

/** The `page.tsx` backing a URL, as source text. Throws if the route does not exist. */
export function pageSource(route: string): string {
  const candidates = [
    join(APP, "(app)", ...route.split("/").filter(Boolean), "page.tsx"),
    join(APP, ...route.split("/").filter(Boolean), "page.tsx"),
  ];
  for (const c of candidates) {
    try {
      return readFileSync(c, "utf8");
    } catch {
      /* try the next layout */
    }
  }
  throw new Error(`no page.tsx found for ${route}`);
}

/** Source text of a repo-relative path under `src/`. Returns null when it does not exist. */
export function srcFile(relPath: string): string | null {
  try {
    return readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), "utf8");
  } catch {
    return null;
  }
}

/**
 * Does this source text actually LINK to the route?
 *
 * Deliberately narrow. It matches a JSX `href` or a router `push`, and NOT an
 * object-literal `href: "/x"` — because the legacy sidebar arrays in `AppShell.tsx`
 * are object literals, and counting them would let a route look reachable under the
 * v2 flag when the only thing naming it is the nav model the flag turns OFF.
 * It also does not match `revalidatePath("/x")`, which is a cache call, not a link.
 */
export function linksTo(source: string, route: string): boolean {
  // Comments are stripped first: a commented-out link is a DELETED link, and
  // `{/* <Link href="/reports"/> — removed */}` used to satisfy this check.
  const src = code(source);
  const patterns = [
    `href="${route}"`,
    `href={"${route}"}`,
    "href={`" + route + "`}",
    // A template link carrying a QUERY string still lands on this route.
    "href={`" + route + "?",
    `push("${route}")`,
    "push(`" + route + "`)",
    "push(`" + route + "?",
    `replace("${route}")`,
  ];
  // Deliberately NOT `href={\`${route}/…\`}`: a link to a CHILD is not a link to the
  // parent. Accepting it meant `href={\`/work-orders/new/${id}\`}` proved
  // `/work-orders/new`, which is how a parent route quietly goes missing.
  return patterns.some((p) => src.includes(p));
}
