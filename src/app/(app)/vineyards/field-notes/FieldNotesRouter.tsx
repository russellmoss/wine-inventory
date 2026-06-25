"use client";

import React from "react";
import { ManagerView } from "./manager/ManagerView";
import { AdminDashboard, type VineyardSummary } from "./admin/AdminDashboard";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { type FieldInputLists } from "@/lib/fieldnotes/input-actions";
import { type FormBlock } from "./manager/FieldNoteForm";

export type ManagerProps = {
  vineyardId: string;
  vineyardName: string;
  blocks: FormBlock[];
  latestNote: ParsedFieldNote | null;
  inputLists: FieldInputLists;
};

export type AdminProps = {
  vineyards: VineyardSummary[];
};

type Props =
  | { mode: "manager"; manager: ManagerProps }
  | { mode: "admin"; admin: AdminProps };

/** Role switch between the mobile manager form and the desktop admin dashboard. */
export function FieldNotesRouter(props: Props) {
  if (props.mode === "admin") {
    // AdminDashboard reads useSearchParams (URL-addressable drill-in) -> Suspense.
    return (
      <React.Suspense fallback={null}>
        <AdminDashboard vineyards={props.admin.vineyards} />
      </React.Suspense>
    );
  }
  const m = props.manager;
  return (
    <ManagerView
      vineyardId={m.vineyardId}
      vineyardName={m.vineyardName}
      blocks={m.blocks}
      latestNote={m.latestNote}
      inputLists={m.inputLists}
    />
  );
}
