"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { Badge, Eyebrow, Tabs } from "@/components/ui";
import type {
  DeveloperFeedbackData,
  DeveloperFeedbackItem,
  DeveloperTenantFeedbackPage,
} from "@/lib/developer/feedback";
import {
  buildDeveloperWorkspaceHref,
  type DeveloperWorkspaceQuery,
  type DeveloperWorkspaceView,
} from "@/lib/developer/workspace-query";
import { DeveloperFilters } from "./DeveloperFilters";
import { DeveloperQueueList } from "./DeveloperQueueList";
import { TenantAutomationPanel } from "./TenantAutomationPanel";
import styles from "./developer.module.css";

const WORK_VIEWS = [
  ["inbox", "Inbox"],
  ["ready", "Ready"],
  ["tracked", "Tracked"],
  ["closed", "Closed"],
] as const;

function queueLabel(queue: DeveloperFeedbackItem["queue"]): string {
  return queue === "INBOX"
    ? "Inbox"
    : queue === "READY"
      ? "Ready"
      : queue === "TRACKED"
        ? "Tracked"
        : "Closed";
}

function SelectedSummary({ item }: { item: DeveloperFeedbackItem }) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (window.matchMedia("(max-width: 1099px)").matches) headingRef.current?.focus();
  }, [item.id]);
  return (
    <article>
      <h2 ref={headingRef} tabIndex={-1} className={styles.sectionHeading}>
        {item.title}
      </h2>
      <p className={styles.subtle}>
        {item.tenantName} · {item.kind} · {item.id}
      </p>
      <div className={styles.inlineActions} style={{ marginBlock: "var(--space-3)" }}>
        <Badge tone={item.severity === "P0" ? "red" : "neutral"} variant="outline">
          {item.severity ?? "Unset"}
        </Badge>
        <Badge tone="neutral" variant="outline">
          {item.triageClass ?? "Untriaged"}
        </Badge>
        <Badge tone="neutral" variant="outline">
          {item.status}
        </Badge>
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{item.body || "No problem statement supplied."}</p>
      <p className={styles.subtle}>
        Full evidence, triage, delivery, automation, and outcome controls follow in Unit 6.
      </p>
    </article>
  );
}

export function DeveloperWorkspace({
  data,
  exactPage,
  query,
  selectedItem,
  selectedIsInCurrentList,
  notices,
}: {
  data: DeveloperFeedbackData;
  exactPage: DeveloperTenantFeedbackPage | null;
  query: DeveloperWorkspaceQuery;
  selectedItem: DeveloperFeedbackItem | null;
  selectedIsInCurrentList: boolean;
  notices: string[];
}) {
  const router = useRouter();
  const [navigating, startTransition] = React.useTransition();
  const tenant = query.tenantId
    ? data.tenants.find((candidate) => candidate.id === query.tenantId)
    : null;
  const scope = query.tenantId
    ? `All history · ${tenant?.name ?? selectedItem?.tenantName ?? "selected tenant"}`
    : `Recent activity across ${data.shownTenants} loaded tenants`;

  function changeView(id: string) {
    const view = id as DeveloperWorkspaceView;
    startTransition(() => {
      router.push(
        buildDeveloperWorkspaceHref(query, {
          view,
          source: null,
          item: null,
          assistantCursor: null,
          ticketCursor: null,
        }),
      );
    });
  }

  const tabLabel = (view: DeveloperWorkspaceView, label: string) => {
    if (view === "automation") return label;
    if (query.tenantId && exactPage) {
      const queue = view.toUpperCase() as keyof typeof exactPage.queueCounts;
      return `${label} (${exactPage.queueCounts[queue]})`;
    }
    if (query.view === view) return `${label} (${data.loadedCount} loaded)`;
    return label;
  };
  const backHref = buildDeveloperWorkspaceHref(query, { source: null, item: null });
  const workPanel = (
    <>
      <DeveloperFilters query={query} tenants={data.tenants} />
      <div className={styles.snapshotCopy}>
        <span>
          {query.tenantId
            ? "Exact-tenant history uses independent assistant and ticket cursors."
            : `Loaded ${data.loadedCount} ${query.view} items from a bounded ${data.shownTenants}-tenant snapshot.`}
        </span>
        {navigating ? <span role="status">Updating view…</span> : null}
      </div>
      <div className={`${styles.masterDetail} ${selectedItem || query.item ? styles.hasSelection : ""}`}>
        <section className={styles.queueRegion} aria-label={`${query.view} queue`}>
          <DeveloperQueueList items={data.items} query={query} exactPage={exactPage} />
        </section>
        <aside className={styles.detailRegion} aria-label="Selected feedback item">
          {query.item ? (
            <div className={styles.inlineActions} style={{ marginBottom: "var(--space-3)" }}>
              <Link className={styles.plainLink} href={backHref}>
                Back to queue
              </Link>
            </div>
          ) : null}
          {selectedItem ? (
            <>
              {!selectedIsInCurrentList ? (
                <div className={styles.locationCallout} role="status">
                  {selectedItem.queue === query.queue
                    ? "This item is outside the current filters."
                    : `This item is now in ${queueLabel(selectedItem.queue)}.`}
                </div>
              ) : null}
              <SelectedSummary item={selectedItem} />
            </>
          ) : query.item ? (
            <div className={styles.emptyDetail} role="status">
              Item unavailable. It may have been removed, the link may be malformed, or it may not
              be visible in this tenant.
            </div>
          ) : (
            <div className={styles.emptyDetail}>Select an item to inspect evidence and route the work.</div>
          )}
        </aside>
      </div>
    </>
  );
  const tabs = [
    ...WORK_VIEWS.map(([view, label]) => ({
      id: view,
      label: tabLabel(view, label),
      content: query.view === view ? workPanel : null,
    })),
    {
      id: "automation",
      label: "Automation",
      content: query.view === "automation" ? <TenantAutomationPanel tenants={data.tenants} /> : null,
    },
  ];

  return (
    <div className={styles.workspace} aria-busy={navigating}>
      <header className={styles.header}>
        <Eyebrow>Developer</Eyebrow>
        <h1>Feedback operations</h1>
        <p className={styles.scope}>{scope}</p>
      </header>
      {notices.length ? (
        <div className={styles.notice} role="status" aria-live="polite">
          {notices.join(" ")}
        </div>
      ) : null}
      <Tabs idBase="developer-workspace" tabs={tabs} value={query.view} onChange={changeView} />
    </div>
  );
}
