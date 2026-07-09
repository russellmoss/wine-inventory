import fs from "node:fs";
import path from "node:path";
import { convertVolumeToLiters } from "./units";
import type {
  GenericFixtureBundle,
  MappingSuggestion,
  NormalizedAnalysisReading,
  NormalizedLegacyOperation,
  NormalizedSeedLot,
  NormalizedSeedPosition,
  ParseDiagnostic,
} from "./types";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "migration", "generic");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      field += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((v) => v.length > 0)) rows.push(row);
  const [headers, ...body] = rows;
  if (!headers) return [];
  return body.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}

function readCsv(name: string): Record<string, string>[] {
  return parseCsv(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

const FIELD_SUGGESTIONS: MappingSuggestion[] = [
  { sourceDataset: "current-state", sourceObjectType: "position", sourceField: "sourceLotKey", targetField: "sourceLotKey", confidence: 1 },
  { sourceDataset: "current-state", sourceObjectType: "position", sourceField: "sourceVesselKey", targetField: "sourceVesselKey", confidence: 1 },
  { sourceDataset: "current-state", sourceObjectType: "position", sourceField: "volume", targetField: "volume", confidence: 1 },
  { sourceDataset: "legacy-operations", sourceObjectType: "operation", sourceField: "sourceActionId", targetField: "sourceActionId", confidence: 1 },
  { sourceDataset: "chemistry", sourceObjectType: "reading", sourceField: "analyte", targetField: "analyte", confidence: 1 },
];

export function loadGenericMigrationFixture(): GenericFixtureBundle {
  const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "manifest.json"), "utf8")) as Record<string, unknown>;
  const current = readCsv("current-state.csv");
  const legacyRows = readCsv("legacy-operations.csv");
  const chemistryRows = readCsv("chemistry.csv");
  const diagnostics: ParseDiagnostic[] = [];
  const lotsByKey = new Map<string, NormalizedSeedLot>();
  const positions: NormalizedSeedPosition[] = [];

  for (const r of current) {
    if (r.inventoryKind !== "BULK_VESSEL") {
      diagnostics.push({
        kind: "FINISHED_GOODS",
        subjectType: "INVENTORY",
        subjectKey: r.sourcePositionKey,
        label: r.displayName || r.code || r.sourcePositionKey,
        severity: "WARNING",
        message: "Finished goods are reported as a Phase 3 coverage gap and are not published.",
        actualValue: Number(r.volume || 0),
        unit: r.volumeUnit || null,
      });
      continue;
    }

    if (!lotsByKey.has(r.sourceLotKey)) {
      lotsByKey.set(r.sourceLotKey, {
        sourceLotKey: r.sourceLotKey,
        sourceSystemId: r.sourceSystemId || null,
        code: r.code,
        displayName: r.displayName || null,
        form: (r.form || "WINE") as NormalizedSeedLot["form"],
        productType: (r.productType || "WINE") as NormalizedSeedLot["productType"],
        carbonation: (r.carbonation || "NONE") as NormalizedSeedLot["carbonation"],
        declaredTaxClass: r.declaredTaxClass || null,
        vintageYear: r.vintageYear ? Number(r.vintageYear) : null,
        originVineyardName: r.originVineyardName || null,
        originBlockName: r.originBlockName || null,
        originVarietyName: r.originVarietyName || null,
        legacySnapshot: { sourceRow: r },
      });
    }

    const volume = Number(r.volume);
    const converted = convertVolumeToLiters(volume, r.volumeUnit, {
      subjectType: "POSITION",
      subjectKey: r.sourcePositionKey,
      label: `${r.code} in ${r.vesselCode}`,
    });
    if (!converted.ok) {
      diagnostics.push(converted.diagnostic);
      continue;
    }
    positions.push({
      sourcePositionKey: r.sourcePositionKey,
      sourceLotKey: r.sourceLotKey,
      sourceVesselKey: r.sourceVesselKey,
      vesselCode: r.vesselCode,
      accountType: "VESSEL",
      volumeL: converted.valueL,
      bondKey: r.bondKey || null,
      costAmount: r.costAmount ? Number(r.costAmount) : null,
      costCurrency: r.costCurrency || null,
      costCompleteness: (r.costCompleteness || "UNKNOWN") as NormalizedSeedPosition["costCompleteness"],
    });
  }

  const legacyOperations: NormalizedLegacyOperation[] = legacyRows.map((r) => {
    const converted = r.volume
      ? convertVolumeToLiters(Number(r.volume), r.volumeUnit, {
          subjectType: "LEGACY_OPERATION",
          subjectKey: r.sourceActionId,
          label: r.sourceActionType,
        })
      : null;
    if (converted && !converted.ok) diagnostics.push(converted.diagnostic);
    return {
      sourceDataset: "legacy-operations",
      sourceObjectType: "operation",
      sourceActionId: r.sourceActionId,
      sourceActionType: r.sourceActionType,
      subjectType: r.subjectType || "OTHER",
      occurredAt: r.occurredAt ? new Date(r.occurredAt) : null,
      sourceLotKey: r.sourceLotKey || null,
      lotCode: null,
      sourceVesselKey: r.sourceVesselKey || null,
      vesselCode: null,
      volume: r.volume ? Number(r.volume) : null,
      volumeUnit: r.volumeUnit || null,
      canonicalVolumeL: converted?.ok ? converted.valueL : null,
      actorName: r.actorName || null,
      note: r.note || null,
      evidenceRef: r.evidenceRef || null,
      normalizedPayload: { sourceActionType: r.sourceActionType },
      rawEvidence: r,
    };
  });

  const analysisReadings: NormalizedAnalysisReading[] = chemistryRows.map((r) => ({
    sourcePanelKey: r.sourcePanelKey,
    sourceReadingKey: r.sourceReadingKey || null,
    sourceLotKey: r.sourceLotKey,
    sourceVesselKey: r.sourceVesselKey || null,
    observedAt: new Date(r.observedAt),
    enteredByEmail: r.enteredByEmail || null,
    note: r.note || null,
    analyte: r.analyte,
    value: Number(r.value),
    unit: r.unit,
  }));

  return {
    manifest,
    lots: [...lotsByKey.values()],
    positions,
    legacyOperations,
    analysisReadings,
    diagnostics,
    suggestions: FIELD_SUGGESTIONS,
    expectedFieldMappings: FIELD_SUGGESTIONS.map(({ sourceDataset, sourceObjectType, sourceField, targetField }) => ({
      sourceDataset,
      sourceObjectType,
      sourceField,
      targetField,
    })),
  };
}
