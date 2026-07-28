import Link from "next/link";
import { EmptyState } from "@/components/ui";

/**
 * Route-level not-found (v2 §B30). The app had ZERO of these, so a bad id fell
 * through to the framework default with no way back into the product.
 */
export default function NotFound() {
  return (
    <EmptyState
      title="We couldn't find that"
      actions={
        <Link href="/" style={{ color: "var(--text-accent)", minHeight: "var(--touch-min)", display: "inline-flex", alignItems: "center" }}>
          Back to the dashboard
        </Link>
      }
    >
      The record may have been archived, or the link may be out of date. Nothing was changed.
    </EmptyState>
  );
}
