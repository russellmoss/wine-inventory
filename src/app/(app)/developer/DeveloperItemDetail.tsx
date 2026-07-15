"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import type { DeveloperFeedbackItem } from "@/lib/developer/feedback";
import {
  approveFeedbackAutomation,
  closeFeedbackItem,
  enterSupportTenant,
  exitSupportTenant,
  linkFeedbackToLinear,
  updateFeedbackItem,
} from "@/lib/developer/actions";
import { parseLinearIssueUrl, promotionEligibility } from "@/lib/developer/linear-links";
import { parseTriageNotes } from "@/lib/developer/triage-notes";
import styles from "./developer.module.css";

const DISPOSITIONS = [
  ["DEFECT", "Defect"],
  ["MODEL_BEHAVIOR", "Model behavior"],
  ["PRODUCT_GAP", "Product gap"],
  ["NOT_A_BUG", "Not a bug"],
  ["UNCLEAR", "Unclear"],
] as const;
const OPEN_STATUSES = ["NEW", "TRIAGED", "IN_PROGRESS"] as const;

type Message = { text: string; error: boolean };
type LinkAttempt = { replace: boolean; expectedVersion?: number; confirmFanIn: boolean };
type LinkConfirmation =
  | {
      type: "replace";
      oldKey: string;
      oldVersion: number;
      newKey: string;
    }
  | {
      type: "fanIn";
      key: string;
      count: number;
      attempt: LinkAttempt;
    };

function safeExternalUrl(value: string | null, host: "github.com" | "linear.app"): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className={styles.plainLink} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.detailSection} aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

export function DeveloperItemDetail({
  item,
  handoffPacket,
}: {
  item: DeveloperFeedbackItem;
  handoffPacket: string;
}) {
  const router = useRouter();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const linearInputId = React.useId();
  const fallbackId = React.useId();
  const outcomeId = React.useId();
  const [severity, setSeverity] = React.useState(item.severity ?? "");
  const [triageClass, setTriageClass] = React.useState(item.triageClass ?? "");
  const [status, setStatus] = React.useState(item.status);
  const [outcome, setOutcome] = React.useState("");
  const [linearUrl, setLinearUrl] = React.useState(item.linearLink?.linearIssueUrl ?? "");
  const [linearError, setLinearError] = React.useState<string | null>(null);
  const [showCopyFallback, setShowCopyFallback] = React.useState(false);
  const [linkConfirmation, setLinkConfirmation] = React.useState<LinkConfirmation | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<Message | null>(null);
  const eligibility = promotionEligibility(item);
  const timeline = React.useMemo(() => parseTriageNotes(item.developerNotes), [item.developerNotes]);
  const isClosed = item.queue === "CLOSED";
  const githubIssueUrl = safeExternalUrl(item.githubIssueUrl, "github.com");
  const githubRunUrl = safeExternalUrl(item.githubRunUrl, "github.com");
  const prUrl = safeExternalUrl(item.prUrl, "github.com");
  const storedLinearUrl = safeExternalUrl(item.linearLink?.linearIssueUrl ?? null, "linear.app");

  React.useEffect(() => {
    if (window.matchMedia("(max-width: 1099px)").matches) headingRef.current?.focus();
  }, [item.id]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Action failed.", error: true });
    } finally {
      setBusy(null);
    }
  }

  function focusControl(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function copyHandoff() {
    setBusy("copy");
    setMessage(null);
    try {
      await navigator.clipboard.writeText(handoffPacket);
      setShowCopyFallback(false);
      setMessage({ text: "Handoff copied.", error: false });
    } catch {
      setShowCopyFallback(true);
      setMessage({
        text: "Clipboard access was denied. Use the selectable packet below.",
        error: true,
      });
      focusControl(fallbackId);
    } finally {
      setBusy(null);
    }
  }

  async function saveLinearLink(attempt: LinkAttempt) {
    setLinearError(null);
    setLinkConfirmation(null);
    const parsed = parseLinearIssueUrl(linearUrl);
    if (!parsed.ok) {
      setLinearError(parsed.error.message);
      focusControl(linearInputId);
      return;
    }
    await run("linear", async () => {
      const result = await linkFeedbackToLinear({
        tenantId: item.tenantId,
        sourceType: item.sourceType,
        id: item.id,
        linearUrl,
        ...attempt,
      });
      if (result.ok) {
        setMessage({
          text: `${result.idempotent ? "Already tracked" : "Tracked"} as ${result.link.linearIssueKey}.`,
          error: false,
        });
        router.refresh();
        return;
      }
      if (result.reason === "FAN_IN_CONFIRMATION_REQUIRED") {
        setLinkConfirmation({
          type: "fanIn",
          key: result.linearIssueKey,
          count: result.tenantLinearKeySourceCount,
          attempt,
        });
        return;
      }
      if (result.reason === "DIFFERENT_LINK") {
        setLinkConfirmation({
          type: "replace",
          oldKey: result.currentLink.linearIssueKey,
          oldVersion: result.currentLink.version,
          newKey: parsed.linearIssueKey,
        });
        return;
      }
      setLinearError(
        `This link changed to ${result.currentLink.linearIssueKey} while you were editing. Reload before replacing it.`,
      );
      focusControl(linearInputId);
    });
  }

  async function close(statusToSet: "RESOLVED" | "DISMISSED") {
    if (outcome.trim().length < 20) {
      setMessage({ text: "Describe the outcome in at least 20 characters.", error: true });
      focusControl(outcomeId);
      return;
    }
    await run("close", async () => {
      await closeFeedbackItem({
        tenantId: item.tenantId,
        sourceType: item.sourceType,
        id: item.id,
        status: statusToSet,
        outcome,
        expectedNotesVersion: item.developerNotesVersion,
      });
      setMessage({ text: "Closed with outcome.", error: false });
      router.refresh();
    });
  }

  return (
    <article className={styles.itemDetail}>
      <header className={styles.detailHeader}>
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            {item.title}
          </h2>
          <p className={styles.subtle}>
            {item.tenantName} · {item.kind} · {item.id}
          </p>
        </div>
        <Badge tone={item.severity === "P0" ? "red" : "neutral"} variant="outline">
          {item.severity ?? "Unset"}
        </Badge>
      </header>

      <div
        className={message?.error ? styles.attention : styles.notice}
        role={message?.error ? "alert" : "status"}
        aria-live="polite"
        hidden={!message}
      >
        {message?.text}
      </div>

      <DetailSection id="detail-evidence" title="Evidence">
        <p className={styles.problemStatement}>{item.body || "No problem statement supplied."}</p>
        {item.planTitle ? <p><strong>Generated plan:</strong> {item.planTitle}</p> : null}
        {item.planMarkdown ? (
          <details>
            <summary>View private generated plan</summary>
            <pre className={styles.planPreview}>{item.planMarkdown}</pre>
          </details>
        ) : null}
        <div className={styles.inlineActions}>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              run("support", async () => {
                await enterSupportTenant(item.tenantId);
                setMessage({ text: `Entered support context for ${item.tenantName}.`, error: false });
                router.refresh();
              })
            }
          >
            {busy === "support" ? "Entering…" : "Enter tenant support view"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => run("exit-support", () => exitSupportTenant())}
          >
            Exit support view
          </Button>
        </div>
        {item.attachmentIds.length ? (
          <div className={styles.inlineActions} aria-label="Private attachments">
            {item.attachmentIds.map((attachmentId, index) => (
              <a
                className={styles.plainLink}
                key={attachmentId}
                href={`/api/feedback/attachments/${encodeURIComponent(attachmentId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open private attachment {index + 1}
              </a>
            ))}
          </div>
        ) : <p className={styles.subtle}>No attachments.</p>}
      </DetailSection>

      <DetailSection id="detail-triage" title="Triage">
        {item.queueDiagnostic ? <div className={styles.attention}>{item.queueDiagnostic}</div> : null}
        <div className={styles.detailFields}>
          <label className={styles.field}>
            Severity
            <select className={styles.control} value={severity} disabled={isClosed} onChange={(event) => setSeverity(event.target.value)}>
              <option value="">Unset</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </label>
          <label className={styles.field}>
            Disposition
            <select className={styles.control} value={triageClass} disabled={isClosed} onChange={(event) => setTriageClass(event.target.value)}>
              <option value="">Untriaged</option>
              {DISPOSITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            Status
            <select className={styles.control} value={status} disabled={isClosed} onChange={(event) => setStatus(event.target.value)}>
              {!OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number]) ? <option value={status}>{status}</option> : null}
              {OPEN_STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </div>
        {!isClosed ? (
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => run("triage", async () => {
              await updateFeedbackItem({
                tenantId: item.tenantId,
                sourceType: item.sourceType,
                id: item.id,
                severity: severity as "P0" | "P1" | "P2" | "",
                triageClass,
                status,
              });
              setMessage({ text: "Triage saved.", error: false });
              router.refresh();
            })}
          >
            {busy === "triage" ? "Saving…" : "Save triage"}
          </Button>
        ) : null}
      </DetailSection>

      <DetailSection id="detail-delivery" title="Delivery">
        <div className={styles.deliveryLinks}>
          {storedLinearUrl && item.linearLink ? <ExternalLink href={storedLinearUrl}>Open {item.linearLink.linearIssueKey} in Linear</ExternalLink> : null}
          {githubIssueUrl ? <ExternalLink href={githubIssueUrl}>Open GitHub issue</ExternalLink> : null}
          {githubRunUrl ? <ExternalLink href={githubRunUrl}>Open GitHub workflow run</ExternalLink> : null}
          {prUrl ? <ExternalLink href={prUrl}>Open pull request</ExternalLink> : null}
          {!storedLinearUrl && !githubIssueUrl && !githubRunUrl && !prUrl ? <span className={styles.subtle}>No delivery artifact yet.</span> : null}
        </div>
        <div className={styles.privacyWarning}>
          Review the bounded packet before pasting it into Linear. User-entered plain text can still contain secrets or personal data. Private evidence stays here.
        </div>
        <Button size="sm" variant="secondary" disabled={!eligibility.allowed || busy !== null} onClick={copyHandoff}>
          {busy === "copy" ? "Copying…" : "Copy Linear handoff"}
        </Button>
        {!eligibility.allowed ? <p className={styles.subtle}>{eligibility.reason}</p> : null}
        {showCopyFallback ? (
          <Textarea
            id={fallbackId}
            label="Selectable handoff packet"
            value={handoffPacket}
            readOnly
            minRows={8}
            hint="Focus the packet, select all, then copy."
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : null}
        <div className={styles.linkForm}>
          <Input
            id={linearInputId}
            label="Linear issue URL"
            value={linearUrl}
            onChange={(event) => {
              setLinearUrl(event.target.value);
              setLinearError(null);
              setLinkConfirmation(null);
            }}
            error={linearError ?? undefined}
            disabled={!eligibility.allowed || busy !== null}
            placeholder="https://linear.app/.../issue/WIN-42/..."
            hint="Server accepts only exact HTTPS linear.app issue URLs. The key is a display snapshot."
          />
          <Button
            size="sm"
            disabled={!eligibility.allowed || busy !== null || !linearUrl.trim()}
            onClick={() => saveLinearLink({ replace: false, confirmFanIn: false })}
          >
            {busy === "linear" ? "Saving…" : item.linearLink ? "Check tracking link" : "Mark as tracked"}
          </Button>
        </div>
        {linkConfirmation?.type === "replace" ? (
          <div className={styles.confirmation} role="alert">
            <p>Replace {linkConfirmation.oldKey} with {linkConfirmation.newKey}? This is audited and cannot silently overwrite a newer edit.</p>
            <div className={styles.inlineActions}>
              <Button size="sm" disabled={busy !== null} onClick={() => saveLinearLink({ replace: true, expectedVersion: linkConfirmation.oldVersion, confirmFanIn: false })}>Replace link</Button>
              <Button size="sm" variant="ghost" onClick={() => setLinkConfirmation(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
        {linkConfirmation?.type === "fanIn" ? (
          <div className={styles.confirmation} role="alert">
            <p>{linkConfirmation.count} other report(s) in this tenant already point to {linkConfirmation.key}. Confirm that these reports share one delivery item.</p>
            <div className={styles.inlineActions}>
              <Button size="sm" disabled={busy !== null} onClick={() => saveLinearLink({ ...linkConfirmation.attempt, confirmFanIn: true })}>Confirm shared issue</Button>
              <Button size="sm" variant="ghost" onClick={() => setLinkConfirmation(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </DetailSection>

      <DetailSection id="detail-automation" title="Automation">
        {item.automationConflict ? <div className={styles.attention}>{item.automationConflict.message}</div> : null}
        <p><strong>State:</strong> {item.automationStatus.replaceAll("_", " ")}</p>
        {item.activeRun ? <p className={styles.subtle}>Active {item.activeRun.kind} run {item.activeRun.id} is {item.activeRun.status}.</p> : null}
        {item.awaitingRunId ? (
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => run("automation", async () => {
              await approveFeedbackAutomation({ tenantId: item.tenantId, runId: item.awaitingRunId! });
              setMessage({ text: `${item.awaitingRunKind === "PLAN" ? "Plan" : "Fix"} started.`, error: false });
              router.refresh();
            })}
          >
            {busy === "automation" ? `Starting ${item.awaitingRunKind === "PLAN" ? "plan" : "fix"}…` : `Start ${item.awaitingRunKind === "PLAN" ? "plan" : "fix"}`}
          </Button>
        ) : null}
      </DetailSection>

      <DetailSection id="detail-outcome" title="Outcome">
        <div className={styles.timeline}>
          {timeline.length ? timeline.map((entry, index) => (
            <div className={styles.timelineEntry} key={`${entry.stamp ?? "human"}-${index}`}>
              <div className={styles.inlineActions}>
                <Badge tone="neutral" variant="outline">{entry.source === "bug-triage" ? "Bug triage" : entry.source === "developer" ? "Developer" : "Human note"}</Badge>
                {entry.type ? <span className={styles.subtle}>{entry.type.replaceAll("-", " ")}</span> : null}
                {entry.stamp ? <time className={styles.subtle} dateTime={entry.stamp}>{new Date(entry.stamp).toLocaleString()}</time> : null}
              </div>
              <p>{entry.text}</p>
            </div>
          )) : <p className={styles.subtle}>No outcome history yet.</p>}
        </div>
        {!isClosed ? (
          <>
            <Textarea
              id={outcomeId}
              label="Reporter-useful outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              minRows={3}
              maxLength={1_200}
              hint={`${outcome.trim().length}/20 minimum characters`}
              disabled={busy !== null}
            />
            <div className={styles.inlineActions}>
              <Button disabled={busy !== null || outcome.trim().length < 20} onClick={() => close("RESOLVED")}>{busy === "close" ? "Closing…" : "Resolve"}</Button>
              <Button variant="secondary" disabled={busy !== null || outcome.trim().length < 20} onClick={() => close("DISMISSED")}>Dismiss</Button>
            </div>
          </>
        ) : <p className={styles.subtle}>Closed {item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : "with recorded outcome"}.</p>}
      </DetailSection>
    </article>
  );
}
