"use client";

import Link from "next/link";
import React from "react";
import { Badge } from "@/components/ui";
import type {
  DeveloperFeedbackItem,
  DeveloperTenantFeedbackPage,
} from "@/lib/developer/feedback";
import {
  buildDeveloperWorkspaceHref,
  type DeveloperWorkspaceQuery,
} from "@/lib/developer/workspace-query";
import styles from "./developer.module.css";

type SortKey = "attention" | "item" | "createdAt";

function attention(item: DeveloperFeedbackItem): { label: string; tone: "red" | "neutral" } {
  if (item.automationConflict) return { label: "Route conflict", tone: "red" };
  if (item.automationStatus === "FAILED") return { label: "Automation failed", tone: "red" };
  if (item.severity === "P0") return { label: "P0", tone: "red" };
  if (item.awaitingRunId) {
    return {
      label: `${item.awaitingRunKind === "PLAN" ? "Plan" : "Fix"} approval`,
      tone: "neutral",
    };
  }
  if (item.severity === "P1") return { label: "P1 · attention", tone: "neutral" };
  return { label: item.severity ?? "Routine", tone: "neutral" };
}

function delivery(item: DeveloperFeedbackItem): string {
  if (item.linearLink) return `Open ${item.linearLink.linearIssueKey}`;
  if (item.prUrl) return "Review pull request";
  if (item.githubIssueUrl) return "Open GitHub issue";
  if (item.awaitingRunId) {
    return `Start ${item.awaitingRunKind === "PLAN" ? "plan" : "fix"}`;
  }
  if (item.queue === "CLOSED") return "Review outcome";
  return "Review and route";
}

function compare(a: DeveloperFeedbackItem, b: DeveloperFeedbackItem, sort: SortKey): number {
  if (sort === "createdAt") return b.createdAt.localeCompare(a.createdAt);
  if (sort === "item") return a.title.localeCompare(b.title);
  const rank = (item: DeveloperFeedbackItem) => {
    if (item.automationConflict || item.automationStatus === "FAILED" || item.severity === "P0") return 0;
    if (item.awaitingRunId || item.severity === "P1") return 1;
    return 2;
  };
  return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
}

function ItemLink({ item, query }: { item: DeveloperFeedbackItem; query: DeveloperWorkspaceQuery }) {
  const href = buildDeveloperWorkspaceHref(query, {
    tenantId: item.tenantId,
    source: item.sourceType,
    item: item.id,
  });
  const current = query.source === item.sourceType && query.item === item.id;
  return (
    <Link
      className={`${styles.queueLink} ${current ? styles.queueLinkSelected : ""}`}
      href={href}
      aria-current={current ? "page" : undefined}
    >
      <span className={styles.itemTitle}>{item.title}</span>
      <span className={styles.itemMeta}>
        {item.tenantName} · {item.kind}
      </span>
      <span className={styles.itemId}>{item.id}</span>
    </Link>
  );
}

export function DeveloperQueueList({
  items,
  query,
  exactPage,
}: {
  items: DeveloperFeedbackItem[];
  query: DeveloperWorkspaceQuery;
  exactPage: DeveloperTenantFeedbackPage | null;
}) {
  const [sort, setSort] = React.useState<SortKey>("attention");
  const sorted = React.useMemo(() => [...items].sort((a, b) => compare(a, b, sort)), [items, sort]);
  const emptyCopy = query.tenantId
    ? `This tenant has no ${query.view} items matching the current filters.`
    : `No ${query.view} items in recent loaded activity. Choose a tenant to inspect older history.`;
  const nextHref =
    exactPage?.hasMore && query.tenantId
      ? buildDeveloperWorkspaceHref(query, {
          source: null,
          item: null,
          assistantCursor: exactPage.nextAssistantCursor,
          ticketCursor: exactPage.nextTicketCursor,
        })
      : null;

  if (!sorted.length) return <div className={styles.emptyQueue}>{emptyCopy}</div>;

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.queueTable}>
          <thead>
            <tr>
              <th aria-sort={sort === "attention" ? "ascending" : "none"}>
                <button
                  className={`${styles.sortButton} ${sort === "attention" ? styles.sortButtonActive : ""}`}
                  type="button"
                  onClick={() => setSort("attention")}
                >
                  Attention <span aria-hidden="true">{sort === "attention" ? "↑" : ""}</span>
                </button>
              </th>
              <th aria-sort={sort === "item" ? "ascending" : "none"}>
                <button
                  className={`${styles.sortButton} ${sort === "item" ? styles.sortButtonActive : ""}`}
                  type="button"
                  onClick={() => setSort("item")}
                >
                  Item and tenant <span aria-hidden="true">{sort === "item" ? "↑" : ""}</span>
                </button>
              </th>
              <th aria-sort={sort === "createdAt" ? "descending" : "none"}>
                <button
                  className={`${styles.sortButton} ${sort === "createdAt" ? styles.sortButtonActive : ""}`}
                  type="button"
                  onClick={() => setSort("createdAt")}
                >
                  Next action and time <span aria-hidden="true">{sort === "createdAt" ? "↓" : ""}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const signal = attention(item);
              return (
                <tr key={`${item.sourceType}:${item.id}`}>
                  <td>
                    <Badge tone={signal.tone} variant={signal.tone === "neutral" ? "outline" : "soft"}>
                      {signal.label}
                    </Badge>
                    {item.queueDiagnostic ? (
                      <span className={styles.deliverySignal}>{item.queueDiagnostic}</span>
                    ) : null}
                  </td>
                  <td>
                    <ItemLink item={item} query={query} />
                  </td>
                  <td>
                    <span>{delivery(item)}</span>
                    <time className={styles.deliverySignal} dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className={styles.mobileQueue} aria-label={`${query.view} feedback`}>
        {sorted.map((item) => {
          const signal = attention(item);
          return (
            <li key={`${item.sourceType}:${item.id}`}>
              <div className={styles.inlineActions}>
                <Badge tone={signal.tone} variant={signal.tone === "neutral" ? "outline" : "soft"}>
                  {signal.label}
                </Badge>
                <span className={styles.deliverySignal}>{delivery(item)}</span>
              </div>
              <ItemLink item={item} query={query} />
            </li>
          );
        })}
      </ul>
      {nextHref ? (
        <div className={styles.pagination}>
          <Link className={styles.buttonLink} href={nextHref}>
            More from this tenant
          </Link>
        </div>
      ) : null}
    </>
  );
}
