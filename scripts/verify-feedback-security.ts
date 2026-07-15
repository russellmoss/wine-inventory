import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createSupportTenantToken, verifySupportTenantToken } from "../src/lib/developer/support-context";
import { sanitizePlainText, safeFilename } from "../src/lib/feedback/sanitize";
import { validateAndStripImage } from "../src/lib/feedback/attachments";

process.env.SUPPORT_TENANT_SECRET ||= "verify-feedback-security-secret";

let failures = 0;
function check(name: string, pass: boolean) {
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}`);
  if (!pass) failures++;
}

const token = createSupportTenantToken({ developerUserId: "dev_1", tenantId: "org_demo_winery", tenantName: "Demo Winery" });
check("valid support token verifies", verifySupportTenantToken(token, "dev_1")?.tenantId === "org_demo_winery");
check("support token is bound to developer user", verifySupportTenantToken(token, "dev_2") === null);
// Feedback text is UNTRUSTED. Its XSS safety comes from the render layer: the ONLY consumer
// of sanitizePlainText is the /developer console, which renders it as a React TEXT NODE (React
// escapes those). So the invariant is "no raw-HTML sink for feedback text" — NOT "the sanitizer
// entity-encodes" (that only double-encoded quotes into &quot;/&#39; for the reader). Guard the
// real thing: (a) the console never uses dangerouslySetInnerHTML, and (b) the sanitizer does not
// mangle safe punctuation (regression guard for the double-encode bug).
const developerConsoleDir = "src/app/(app)/developer";
const developerConsole = readdirSync(developerConsoleDir)
  .filter((filename) => filename.endsWith(".tsx"))
  .map((filename) => readFileSync(join(developerConsoleDir, filename), "utf8"))
  .join("\n");
check("feedback console renders text nodes only (no dangerouslySetInnerHTML)", !developerConsole.includes("dangerouslySetInnerHTML"));
check(
  "sanitizePlainText does not HTML-encode safe punctuation (no double-encode)",
  sanitizePlainText(`he said "hi" & it's <ok>`) === `he said "hi" & it's <ok>`,
);
check("filenames are normalized", safeFilename("../evil<script>.png") === "evil_script_.png");
let rejected = false;
try {
  validateAndStripImage(Buffer.from("not actually an image"));
} catch {
  rejected = true;
}
check("spoofed non-image bytes are rejected", rejected);

process.exit(failures === 0 ? 0 : 1);
