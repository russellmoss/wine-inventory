import Link from "next/link";
import { EmptyState } from "@/components/ui";

/** Route-level not-found for the barrel-group family (v2 §B30). Never a dead end. */
export default function NotFound() {
  return (
    <EmptyState
      title="We couldn't find that barrel group"
      actions={
        <Link
          href="/cellar/groups"
          style={{ color: "var(--text-accent)", minHeight: "var(--touch-min)", display: "inline-flex", alignItems: "center" }}
        >
          Back to barrel groups
        </Link>
      }
    >
      It may have been deleted, or the link may be out of date. Archived groups are still listed on the index, so if
      you were looking for one that was retired, it is there. Nothing was changed.
    </EmptyState>
  );
}
