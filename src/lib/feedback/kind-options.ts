/**
 * Which feedback kinds a reporter may choose from.
 *
 * The invariant: **a rendered option is always a selectable option.** A locked
 * control collapses to the single kind in force rather than rendering the
 * alternatives disabled — a greyed-out "Feature request" button reads as
 * "this app is broken", not as "not available here". That is not hypothetical:
 * the assistant's report widget locked the kind to BUG_REPORT while still
 * painting both buttons, so reporters could see "Feature request" and never
 * select it, and every submission was silently forced to BUG_REPORT.
 */

export type FeedbackKind = "BUG_REPORT" | "FEATURE_REQUEST";

export type FeedbackKindOption = { value: FeedbackKind; label: string };

export const FEEDBACK_KIND_OPTIONS: readonly FeedbackKindOption[] = [
  { value: "BUG_REPORT", label: "Bug report" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
];

/**
 * The options to render for a kind picker. When `lockKind` is set only the kind
 * already in force is returned, so the picker never offers a choice it will
 * refuse to honour.
 */
export function feedbackKindOptions(
  kind: FeedbackKind,
  lockKind: boolean,
): readonly FeedbackKindOption[] {
  return lockKind ? FEEDBACK_KIND_OPTIONS.filter((option) => option.value === kind) : FEEDBACK_KIND_OPTIONS;
}
