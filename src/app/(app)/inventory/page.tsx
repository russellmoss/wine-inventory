import { prisma } from "@/lib/prisma";
import { requireActiveTenant, requireReadyUser } from "@/lib/dal";
import { casesAndLoose } from "@/lib/bottling/draw";
import { FinishedGoodsSection as FinishedGoodsPanel, type ItemOpt, type OnHandRow } from "./sections/FinishedGoodsSection";
import { InventoryTabs } from "./InventoryTabs";
// coerceSection is called on the SERVER — it must come from the client-SAFE shared module, never from
// the "use client" tab bar (that is a runtime-only error the build does not catch).
import { coerceSection, type InventorySection } from "./sections-shared";
import { listMaterials, onHandByLocationForMaterials, type LocationOnHand } from "@/lib/cellar/materials";
import { listVendors } from "@/lib/vendors/vendors";
import { listCustomUnitsCore } from "@/lib/units/custom-unit-core";
import { ConsumablesSection as ConsumablesPanel } from "./sections/ConsumablesSection";
import { listEquipment } from "@/lib/equipment/equipment";
import { listLocations } from "@/lib/work-orders/data";
import { EquipmentSection as EquipmentPanel } from "./sections/EquipmentSection";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory" };

// Plan 080 U6 — ONE Inventory page with three URL-addressable sections (Finished goods / Consumables /
// Equipment & parts), replacing the split IA where finished goods lived at /inventory, consumables at
// /setup/expendables and equipment at an unlinked /setup/equipment. The old routes now redirect in.
//
// Each section is its OWN async server component, rendered only when it is the active one, so switching
// tabs doesn't load (or pay for) the other sections' queries — the reason this is URL-driven rather than a
// client Tabs component that mounts every panel at once.
//
// U6 is the SHELL: it relocates the three EXISTING surfaces unchanged so nothing regresses the day the old
// routes start redirecting. U7/U8/U9 then move each client into ./sections/ and add the new capabilities
// (per-location on-hand + Receive/Adjust/Transfer, the add modals, costed equipment).

async function FinishedGoodsSection() {
  const [categories, skus, goods, locations, bottled, fg] = await Promise.all([
    prisma.finishedGoodCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.wineSku.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { vintage: "desc" }], include: { category: { select: { name: true } } } }),
    prisma.finishedGood.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { category: { select: { name: true } } } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.bottledInventory.findMany({ where: { totalBottles: { gt: 0 } }, include: { wineSku: { select: { name: true, vintage: true, categoryId: true, category: { select: { name: true } } } }, location: { select: { name: true } } } }),
    prisma.finishedGoodInventory.findMany({ where: { quantity: { gt: 0 } }, include: { finishedGood: { select: { name: true, categoryId: true, category: { select: { name: true } } } }, location: { select: { name: true } } } }),
  ]);

  const items: ItemOpt[] = [
    ...skus.map((s) => ({ kind: "BOTTLED_WINE" as const, id: s.id, label: `${s.name} ${s.vintage}`, category: s.category?.name ?? "Wine" })),
    ...goods.map((g) => ({ kind: "FINISHED_GOOD" as const, id: g.id, label: g.name, category: g.category.name })),
  ];

  const onHand: OnHandRow[] = [
    ...bottled.map((b) => {
      const { cases, loose } = casesAndLoose(b.totalBottles);
      return { kind: "BOTTLED_WINE" as const, itemId: b.wineSkuId, item: `${b.wineSku.name} ${b.wineSku.vintage}`, name: b.wineSku.name, vintage: b.wineSku.vintage, categoryId: b.wineSku.categoryId, category: b.wineSku.category?.name ?? "Wine", locationId: b.locationId, location: b.location.name, qty: b.totalBottles, cases, loose, detail: `${cases}c + ${loose}` };
    }),
    ...fg.map((f) => ({ kind: "FINISHED_GOOD" as const, itemId: f.finishedGoodId, item: f.finishedGood.name, name: f.finishedGood.name, vintage: null, categoryId: f.finishedGood.categoryId, category: f.finishedGood.category.name, locationId: f.locationId, location: f.location.name, qty: f.quantity, cases: 0, loose: f.quantity, detail: "" })),
  ].sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));

  return <FinishedGoodsPanel categories={categories} items={items} locations={locations} onHand={onHand} />;
}

async function ConsumablesSection() {
  const [materials, vendors, customUnits, locations] = await Promise.all([
    listMaterials({ includeInactive: true }),
    listVendors({ activeOnly: true }),
    listCustomUnitsCore(),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  // Plan 080 U8: per-location on-hand for every listed material, in ONE grouped query rather than N.
  // Serialized to a plain Record — a Map cannot cross the server/client boundary.
  const byLoc = await onHandByLocationForMaterials(materials.map((m) => m.id));
  const onHandByLocation: Record<string, LocationOnHand[]> = {};
  for (const [materialId, rows] of byLoc) onHandByLocation[materialId] = rows;

  return (
    <ConsumablesPanel
      materials={materials}
      vendors={vendors}
      customUnits={customUnits}
      locations={locations}
      onHandByLocation={onHandByLocation}
    />
  );
}

async function EquipmentSection() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  // Plan 080 U9: "Equipment & parts" is TWO stores — individually-tracked EquipmentAssets, and
  // quantity-tracked EQUIPMENT-category materials. Parts are surfaced by CATEGORY, so no data moves.
  const [equipment, locations, parts] = await Promise.all([
    listEquipment(tenantId),
    listLocations(tenantId),
    listMaterials({ category: "EQUIPMENT", includeInactive: false }),
  ]);
  const byLoc = await onHandByLocationForMaterials(parts.map((p) => p.id));
  const partsOnHand: Record<string, LocationOnHand[]> = {};
  for (const [materialId, rows] of byLoc) partsOnHand[materialId] = rows;

  return (
    <EquipmentPanel
      equipment={equipment}
      locations={locations}
      isAdmin={user.role === "admin" || user.role === "owner"}
      parts={parts}
      partsOnHand={partsOnHand}
    />
  );
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  await requireActiveTenant();
  const section: InventorySection = coerceSection((await searchParams).section);

  return (
    <div>
      <div style={{ padding: "0 0 16px" }}>
        <InventoryTabs active={section} />
      </div>
      {section === "finished" ? <FinishedGoodsSection /> : null}
      {section === "consumables" ? <ConsumablesSection /> : null}
      {section === "equipment" ? <EquipmentSection /> : null}
    </div>
  );
}
