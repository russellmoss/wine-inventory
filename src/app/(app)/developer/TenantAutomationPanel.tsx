"use client";

import React from "react";
import { Button, Collapsible } from "@/components/ui";
import type { DeveloperTenantSummary } from "@/lib/developer/feedback";
import { enterSupportTenant, saveTenantFeedbackModes } from "@/lib/developer/actions";
import styles from "./developer.module.css";

const MODES = [
  ["REPORT_ONLY", "Report only"],
  ["PLAN_MODE", "Plan mode"],
  ["AGENTIC_FIX", "Agentic fix"],
] as const;

function ModeSelect({
  value,
  onChange,
  label,
  allowAgentic = true,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  allowAgentic?: boolean;
}) {
  return (
    <select
      className={styles.control}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {MODES.filter(([mode]) => allowAgentic || mode !== "AGENTIC_FIX").map(([mode, text]) => (
        <option key={mode} value={mode}>
          {text}
        </option>
      ))}
    </select>
  );
}

function TenantModeControls({
  tenant,
  layout,
  announce,
}: {
  tenant: DeveloperTenantSummary;
  layout: "desktop" | "mobile";
  announce: (message: string, error?: boolean) => void;
}) {
  const [assistantFeedbackMode, setAssistantFeedbackMode] = React.useState(
    tenant.modes.assistantFeedbackMode,
  );
  const [bugReportMode, setBugReportMode] = React.useState(tenant.modes.bugReportMode);
  const [featureRequestMode, setFeatureRequestMode] = React.useState(
    tenant.modes.featureRequestMode,
  );
  const [busy, setBusy] = React.useState<"save" | "support" | null>(null);

  async function run(kind: "save" | "support") {
    setBusy(kind);
    try {
      if (kind === "save") {
        await saveTenantFeedbackModes({
          tenantId: tenant.id,
          assistantFeedbackMode,
          bugReportMode,
          featureRequestMode,
        });
        announce(`${tenant.name} automation settings saved.`);
      } else {
        await enterSupportTenant(tenant.id);
        announce(`Entered support context for ${tenant.name}.`);
      }
    } catch (error) {
      announce(error instanceof Error ? error.message : "Action failed.", true);
    } finally {
      setBusy(null);
    }
  }

  const controls = (
    <>
      {layout === "desktop" ? (
        <div>
          <strong>{tenant.name}</strong>
          <span className={styles.itemId}>{tenant.id}</span>
        </div>
      ) : null}
      <ModeSelect
        label={`${tenant.name} assistant thumbs-down mode`}
        value={assistantFeedbackMode}
        onChange={(value) =>
          setAssistantFeedbackMode(value as typeof assistantFeedbackMode)
        }
      />
      <ModeSelect
        label={`${tenant.name} bug report mode`}
        value={bugReportMode}
        onChange={(value) => setBugReportMode(value as typeof bugReportMode)}
      />
      <ModeSelect
        label={`${tenant.name} feature request mode`}
        value={featureRequestMode}
        onChange={(value) => setFeatureRequestMode(value as typeof featureRequestMode)}
        allowAgentic={false}
      />
      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("save")}>
        {busy === "save" ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("support")}>
        {busy === "support" ? "Entering…" : "Enter"}
      </Button>
    </>
  );

  if (layout === "desktop") return <div className={styles.automationRow}>{controls}</div>;
  return (
    <Collapsible
      title={tenant.name}
      right={<span className={styles.itemId}>{tenant.id}</span>}
      level="section"
    >
      <div className={styles.mobileAutomationFields}>{controls}</div>
    </Collapsible>
  );
}

export function TenantAutomationPanel({ tenants }: { tenants: DeveloperTenantSummary[] }) {
  const [query, setQuery] = React.useState("");
  const [message, setMessage] = React.useState<{ text: string; error: boolean } | null>(null);
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? tenants.filter((tenant) =>
          [tenant.name, tenant.slug, tenant.id].some((value) => value.toLowerCase().includes(needle)),
        )
      : tenants;
  }, [query, tenants]);
  const announce = (text: string, error = false) => setMessage({ text, error });

  return (
    <section aria-labelledby="automation-heading">
      <h2 id="automation-heading" className={styles.sectionHeading}>
        Tenant automation
      </h2>
      <p className={styles.subtle}>
        Search within the {tenants.length} tenants loaded for this bounded developer view.
      </p>
      <label className={styles.field} style={{ maxWidth: 420, marginBlock: "var(--space-3)" }}>
        Search tenants
        <input
          className={styles.control}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, slug, or tenant ID"
        />
      </label>
      <div aria-live="polite" role={message?.error ? "alert" : "status"} className={message?.error ? styles.attention : styles.notice} hidden={!message}>
        {message?.text}
      </div>
      <div className={styles.automationDesktop}>
        <div className={styles.automationHeader} aria-hidden="true">
          <span>Tenant</span>
          <span>Assistant thumbs-down</span>
          <span>Bug reports</span>
          <span>Feature requests</span>
          <span>Save</span>
          <span>Support</span>
        </div>
        {filtered.map((tenant) => (
          <TenantModeControls key={tenant.id} tenant={tenant} layout="desktop" announce={announce} />
        ))}
      </div>
      <div className={styles.automationMobile}>
        {filtered.map((tenant) => (
          <TenantModeControls key={tenant.id} tenant={tenant} layout="mobile" announce={announce} />
        ))}
      </div>
      {!filtered.length ? <div className={styles.emptyQueue}>No loaded tenant matches that search.</div> : null}
    </section>
  );
}
