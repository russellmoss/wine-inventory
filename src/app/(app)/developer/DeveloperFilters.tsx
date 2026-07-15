import Link from "next/link";
import { Button } from "@/components/ui";
import type { DeveloperTenantSummary } from "@/lib/developer/feedback";
import type { DeveloperWorkspaceQuery } from "@/lib/developer/workspace-query";
import styles from "./developer.module.css";

const DISPOSITIONS = [
  ["DEFECT", "Defect"],
  ["MODEL_BEHAVIOR", "Model behavior"],
  ["PRODUCT_GAP", "Product gap"],
  ["NOT_A_BUG", "Not a bug"],
  ["UNCLEAR", "Unclear"],
] as const;

export function DeveloperFilters({
  query,
  tenants,
}: {
  query: DeveloperWorkspaceQuery;
  tenants: DeveloperTenantSummary[];
}) {
  const activeCount = [query.tenantId, query.q, query.severity, query.disposition].filter(
    Boolean,
  ).length;
  return (
    <details className={styles.filterDisclosure}>
      <summary className={styles.filterSummary}>Filters ({activeCount})</summary>
      <form action="/developer" method="get" className={styles.filters}>
        <input type="hidden" name="view" value={query.view} />
        <label className={styles.field}>
          Exact tenant
          <select className={styles.control} name="tenantId" defaultValue={query.tenantId ?? ""}>
            <option value="">Recent loaded tenants</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Search title, body, or ID
          <input
            className={styles.control}
            name="q"
            defaultValue={query.q}
            maxLength={120}
            placeholder="Search loaded feedback"
          />
        </label>
        <label className={styles.field}>
          Severity
          <select className={styles.control} name="severity" defaultValue={query.severity ?? ""}>
            <option value="">Any severity</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
        <label className={styles.field}>
          Disposition
          <select
            className={styles.control}
            name="disposition"
            defaultValue={query.disposition ?? ""}
          >
            <option value="">Any disposition</option>
            {DISPOSITIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.filterActions}>
          <Button type="submit" size="sm">
            Apply
          </Button>
          {activeCount ? (
            <Link className={styles.plainLink} href={`/developer?view=${query.view}`}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>
    </details>
  );
}
