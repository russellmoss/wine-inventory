"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { TemplateListRow } from "@/lib/work-orders/data";
import { cloneTemplateAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";
import { TemplatesTabs } from "./TemplatesTabs";

// Plan 034 Unit 6: template list. Cards show name → system/custom badge → block count (NOT the internal
// code). Admins get New / Clone / edit affordances; everyone can view. Empty custom state gets a CTA.

export function TemplatesClient({ templates, view, isAdmin }: { templates: TemplateListRow[]; view: "active" | "archived"; isAdmin: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function clone(templateId: string) {
    setError(null);
    setBusyId(templateId);
    (async () => {
      try {
        const res = unwrap(await cloneTemplateAction({ templateId }));
        router.push(`/work-orders/templates/${res.templateId}/edit`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't clone that template.");
        setBusyId(null);
      }
    })();
  }

  const custom = templates.filter((t) => !t.isSystem);
  const showEmptyCustomCta = view === "active" && custom.length === 0;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/work-orders" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Work orders</Link>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "4px 0 0" }}>Work-order templates</h1>
        </div>
        {isAdmin ? <Button onClick={() => router.push("/work-orders/templates/new")}>New template</Button> : null}
      </div>

      <div style={{ marginTop: 14 }}>
        <TemplatesTabs active={view} />
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 12 }}>{error}</div> : null}

      {templates.length === 0 ? (
        <Card style={{ marginTop: 18, padding: 32, textAlign: "center" }}>
          {view === "archived" ? (
            <div style={{ color: "var(--text-muted)" }}>No archived templates.</div>
          ) : (
            <div>
              <div style={{ fontSize: 16, marginBottom: 6 }}>No templates yet.</div>
              <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 14 }}>Seed the shipped system templates with <code>npm run seed:work-order-templates</code>, then clone one or build your own.</div>
              {isAdmin ? <Button onClick={() => router.push("/work-orders/templates/new")}>Build a template from scratch</Button> : null}
            </div>
          )}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {templates.map((t) => (
            <Card key={t.id} padding="12px 14px">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/work-orders/templates/${t.id}`} style={{ textDecoration: "none", color: "inherit", flex: "1 1 260px" }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge tone={t.isSystem ? "blue" : "green"}>{t.isSystem ? "system" : "custom"}</Badge>
                    <span>{t.blockCount} block{t.blockCount === 1 ? "" : "s"}</span>
                    {t.category ? <span>· {t.category}</span> : null}
                  </div>
                </Link>
                {isAdmin ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    {t.isSystem ? (
                      <Button size="sm" variant="secondary" disabled={busyId === t.id} onClick={() => clone(t.id)}>{busyId === t.id ? "Cloning…" : "Clone to customize"}</Button>
                    ) : view === "active" ? (
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/work-orders/templates/${t.id}/edit`)}>Edit</Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showEmptyCustomCta && templates.length > 0 && isAdmin ? (
        <Card style={{ marginTop: 12, padding: 16, textAlign: "center", background: "var(--paper-100)" }}>
          <Eyebrow>Make it yours</Eyebrow>
          <div style={{ fontSize: 14, margin: "6px 0 12px", color: "var(--text-secondary)" }}>You&apos;re using the shipped system templates. Clone one above or build your own from scratch.</div>
          <Button variant="secondary" onClick={() => router.push("/work-orders/templates/new")}>Build from scratch</Button>
        </Card>
      ) : null}
    </div>
  );
}
