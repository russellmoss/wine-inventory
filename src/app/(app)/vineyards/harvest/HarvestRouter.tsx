"use client";

import React from "react";
import { Card, Eyebrow } from "@/components/ui";
import type { Unit } from "@/lib/harvest/units";
import type { HarvestBlockDTO } from "@/lib/harvest/actions";
import { HarvestManagerView, type ManagerBlock } from "./manager/HarvestManagerView";
import { HarvestYieldsView } from "./admin/HarvestYieldsView";

export type ManagerData = {
  vineyardId: string;
  vineyardName: string;
  defaultUnit: Unit;
  blocks: ManagerBlock[];
  latestBrix: Record<string, { brixValue: number; recordedAt: string }>;
  records: HarvestBlockDTO[];
};

export type AdminData = {
  vineyards: { id: string; name: string }[];
};

type Props =
  | { mode: "manager-unassigned" }
  | { mode: "manager"; manager: ManagerData }
  | { mode: "admin"; admin: AdminData };

export function HarvestRouter(props: Props) {
  if (props.mode === "admin") {
    return <HarvestYieldsView vineyards={props.admin.vineyards} />;
  }

  if (props.mode === "manager") {
    return <HarvestManagerView {...props.manager} />;
  }

  // Unassigned manager — friendly empty state.
  return (
    <div>
      <Eyebrow rule>Harvest</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Harvest log
      </h1>
      <Card style={{ maxWidth: 520, marginTop: 16 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: 0, lineHeight: 1.6 }}>
          You aren&rsquo;t assigned to a vineyard yet. Ask an admin to assign your vineyard so you
          can log Brix readings, yield estimates, and harvest picks for its blocks.
        </p>
      </Card>
    </div>
  );
}
