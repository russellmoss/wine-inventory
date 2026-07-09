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
check("stored HTML is escaped", sanitizePlainText("<img src=x onerror=alert(1)>").includes("&lt;img"));
check("filenames are normalized", safeFilename("../evil<script>.png") === "evil_script_.png");
let rejected = false;
try {
  validateAndStripImage(Buffer.from("not actually an image"));
} catch {
  rejected = true;
}
check("spoofed non-image bytes are rejected", rejected);

process.exit(failures === 0 ? 0 : 1);
