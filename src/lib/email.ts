import "server-only";

// Transactional email via Brevo's HTTPS API (no SMTP — works on serverless).
// Free tier: 300 emails/day. The sender email MUST be a verified sender in Brevo.
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "BWC Operating System";

  if (!apiKey || !senderEmail) {
    throw new Error("Email is not configured: set BREVO_API_KEY and BREVO_SENDER_EMAIL.");
  }

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${detail}`);
  }
}

// App base URL for links in emails (e.g. https://wine-inventory-seven.vercel.app).
export function appBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

// Shared brand wrapper so every app email looks the same.
function brandShell(heading: string, bodyHtml: string): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#2b2b2b">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7a2e2e;margin:0 0 4px">Bhutan Wine Company</p>
    <h1 style="font-size:24px;font-weight:400;margin:0 0 16px">${heading}</h1>
    ${bodyHtml}
  </div>`;
}

function pill(label: string, value: string): string {
  return `
    <p style="margin:0 0 4px;font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;color:#888">${label}</p>
    <p style="margin:0 0 16px"><code style="font-family:'Courier New',monospace;font-size:15px;background:#f4efe9;padding:8px 12px;border-radius:6px;display:inline-block">${value}</code></p>`;
}

function ctaButton(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${url}" style="background:#7a2e2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px;display:inline-block">${label}</a></p>`;
}

// New-account invite: username (email), temporary password, link to the app.
export function welcomeEmailHtml(args: { name: string | null | undefined; email: string; tempPassword: string }): string {
  const { name, email, tempPassword } = args;
  const loginUrl = `${appBaseUrl()}/login`;
  const greeting = name ? `Hi ${name},` : "Hi,";
  return brandShell("Welcome to BWC Operating System", `
    <p style="font-size:15px;line-height:1.5">${greeting}</p>
    <p style="font-size:15px;line-height:1.5">An account has been created for you. Use the credentials below to sign in. You&rsquo;ll be asked to set your own password the first time you log in.</p>
    ${pill("Username (your email)", email)}
    ${pill("Temporary password", tempPassword)}
    ${ctaButton(loginUrl, "Sign in")}
    <p style="font-size:13px;line-height:1.5;color:#666">If the button doesn&rsquo;t work, paste this into your browser:<br><a href="${loginUrl}" style="color:#7a2e2e;word-break:break-all">${loginUrl}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#666">For your security, change this temporary password as soon as you sign in.</p>`);
}

// Admin reset: a fresh temporary password the user must change on next sign-in.
export function passwordResetByAdminEmailHtml(args: { name: string | null | undefined; email: string; tempPassword: string }): string {
  const { name, email, tempPassword } = args;
  const loginUrl = `${appBaseUrl()}/login`;
  const greeting = name ? `Hi ${name},` : "Hi,";
  return brandShell("Your password was reset", `
    <p style="font-size:15px;line-height:1.5">${greeting}</p>
    <p style="font-size:15px;line-height:1.5">An administrator reset your BWC Operating System password. Sign in with the temporary password below, then choose a new one.</p>
    ${pill("Username (your email)", email)}
    ${pill("Temporary password", tempPassword)}
    ${ctaButton(loginUrl, "Sign in")}
    <p style="font-size:13px;line-height:1.5;color:#666">If you didn&rsquo;t expect this, contact your administrator.</p>`);
}

// Branded password-reset email. `url` is the full link Better Auth generated.
export function resetPasswordEmailHtml(name: string | null | undefined, url: string): string {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#2b2b2b">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7a2e2e;margin:0 0 4px">Bhutan Wine Company</p>
    <h1 style="font-size:24px;font-weight:400;margin:0 0 16px">Reset your password</h1>
    <p style="font-size:15px;line-height:1.5">${greeting}</p>
    <p style="font-size:15px;line-height:1.5">We received a request to reset the password for your BWC Operating System account. Click the button below to choose a new one. This link expires in 1 hour.</p>
    <p style="margin:24px 0">
      <a href="${url}" style="background:#7a2e2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px;display:inline-block">Reset password</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#666">If the button doesn't work, paste this link into your browser:<br><a href="${url}" style="color:#7a2e2e;word-break:break-all">${url}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#666">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  </div>`;
}
