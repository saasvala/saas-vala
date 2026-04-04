export const PIPELINE_ORDER = [
  "queued",
  "analyzing",
  "fixing",
  "scanning",
  "building",
  "signing",
  "licensing",
  "uploading",
  "marketplace",
  "ready",
] as const;

export type PipelineState = typeof PIPELINE_ORDER[number] | "failed" | "blocked";

export function normalizePipelineState(value: unknown, fallback: PipelineState = "queued"): PipelineState {
  const v = String(value || "").toLowerCase();
  const allowed = new Set<PipelineState>([
    ...PIPELINE_ORDER,
    "failed",
    "blocked",
  ]);
  return allowed.has(v as PipelineState) ? (v as PipelineState) : fallback;
}

export function nextPipelineState(current: PipelineState): PipelineState {
  if (current === "failed" || current === "blocked" || current === "ready") return current;
  const idx = PIPELINE_ORDER.indexOf(current as (typeof PIPELINE_ORDER)[number]);
  if (idx < 0 || idx === PIPELINE_ORDER.length - 1) return "ready";
  return PIPELINE_ORDER[idx + 1] as PipelineState;
}

export function buildPipelineIdempotencyKey(input: {
  provided?: string | null;
  slug: string;
  dateBucket?: string;
}) {
  const provided = String(input.provided || "").trim();
  if (provided) return provided;
  const dateBucket = String(input.dateBucket || new Date().toISOString().slice(0, 10));
  return `${input.slug}:${dateBucket}`;
}
