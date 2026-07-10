"use client";

import { useRouter } from "next/navigation";
import { FeedbackForm } from "./FeedbackForm";

/**
 * Client wrapper around the shared FeedbackForm on the help page. Its only job is to refresh the
 * server-rendered "Your reports" list after a submit (router.refresh re-runs the RSC), so a
 * just-sent report appears without a manual reload. Does not change FeedbackForm's API — the
 * assistant modal's use of FeedbackForm is unaffected.
 */
export function FeedbackPanel() {
  const router = useRouter();
  return <FeedbackForm onSubmitted={() => router.refresh()} />;
}
