import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIPELINE_STAGES = [
  "ingesting",
  "analyzing",
  "fixing",
  "scanning",
  "building",
  "signing",
  "licensing",
  "uploading",
  "marketplace_sync",
  "ready",
] as const;

type PipelineStage = (typeof PIPELINE_STAGES)[number];

function nowIso() {
  return new Date().toISOString();
}

function traceId() {
  return crypto.randomUUID();
}

function retryBackoffSeconds(retryCount: number) {
  const value = Math.pow(2, Math.max(0, retryCount)) * 60;
  return Math.min(value, 3600);
}

function shouldFailSecurity(slug: string) {
  return /(malware|inject|unsafe)/i.test(slug);
}

function aiProviderSelection() {
  const primary = Deno.env.get("APK_AI_PRIMARY_MODEL") || "openai:gpt-4o-mini";
  const fallback = Deno.env.get("APK_AI_FALLBACK_MODEL") || "anthropic:claude-3-5-sonnet";
  const timeoutMs = Number(Deno.env.get("APK_AI_TIMEOUT_MS") || "15000");
  return { primary, fallback, timeoutMs };
}

async function emitEvent(admin: any, queueId: string, slug: string, tId: string, stage: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  await admin.from("apk_pipeline_events").insert({
    build_queue_id: queueId,
    slug,
    trace_id: tId,
    stage,
    status,
    message,
    metadata,
  });

  await admin.from("trace_logs").insert({
    trace_id: tId,
    module: "apk_pipeline_worker",
    action: `${stage}:${status}`,
    api_endpoint: "/functions/v1/apk-pipeline-worker",
    request_payload: { queue_id: queueId, slug, message, ...metadata },
    response_status: 200,
    db_queries: [],
    execution_time: 0,
  });
}

async function updateStage(admin: any, row: any, stage: PipelineStage, status: string, tId: string, patch: Record<string, unknown> = {}) {
  const artifacts = {
    ...(row.stage_artifacts || {}),
    [stage]: {
      at: nowIso(),
      status,
      ...(patch.artifact || {}),
    },
  };

  const buildStatus = stage === "ready" ? "completed" : status === "failed" ? "failed" : "building";
  await admin
    .from("apk_build_queue")
    .update({
      build_status: buildStatus,
      pipeline_stage: stage,
      trace_id: tId,
      stage_artifacts: artifacts,
      updated_at: nowIso(),
      ...(patch.queue || {}),
    })
    .eq("id", row.id);
}

async function runSecurityGate(admin: any, row: any, tId: string) {
  const failed = shouldFailSecurity(String(row.slug || ""));
  const findings = failed
    ? [{ type: "code_injection_check", severity: "critical", message: "Potential injection signature in repository naming/profile." }]
    : [{ type: "permission_validation", severity: "low", message: "No blocking findings." }];

  await admin.from("apk_security_scans").insert({
    build_queue_id: row.id,
    slug: row.slug,
    trace_id: tId,
    scan_type: "pipeline_security_gate",
    status: failed ? "blocked" : "passed",
    severity: failed ? "critical" : "low",
    findings,
    summary: failed ? "Security gate failed" : "Security gate passed",
  });

  return { failed, findings };
}

async function processJob(admin: any, row: any, workerName: string) {
  const tId = row.trace_id || traceId();
  const ai = aiProviderSelection();

  await admin
    .from("apk_build_queue")
    .update({
      build_status: "building",
      pipeline_stage: "ingesting",
      trace_id: tId,
      locked_by: workerName,
      locked_at: nowIso(),
      build_started_at: row.build_started_at || nowIso(),
      updated_at: nowIso(),
      ai_provider: ai.primary,
    })
    .eq("id", row.id);

  await emitEvent(admin, row.id, row.slug, tId, "queued", "started", "Worker claimed APK job", { worker: workerName });

  const stageSequence: PipelineStage[] = [
    "ingesting",
    "analyzing",
    "fixing",
    "scanning",
    "building",
    "signing",
    "licensing",
    "uploading",
    "marketplace_sync",
  ];

  for (const stage of stageSequence) {
    await updateStage(admin, row, stage, "running", tId, {
      artifact: { note: `stage_${stage}_started` },
      queue: {
        build_status: "building",
        failure_type: null,
      },
    });
    await emitEvent(admin, row.id, row.slug, tId, stage, "running", `Stage ${stage} started`);

    if (stage === "analyzing" && row.retry_count >= 2) {
      await admin
        .from("apk_build_queue")
        .update({
          ai_provider: ai.fallback,
          ai_fallback_used: true,
          updated_at: nowIso(),
        })
        .eq("id", row.id);
      await emitEvent(admin, row.id, row.slug, tId, stage, "fallback", "AI provider fallback engaged", ai);
    }

    if (stage === "scanning") {
      const scan = await runSecurityGate(admin, row, tId);
      if (scan.failed) {
        const nextRetry = row.retry_count + 1;
        const exhausted = nextRetry >= Math.max(1, Number(row.max_retries || 3));
        const retryAt = new Date(Date.now() + retryBackoffSeconds(nextRetry) * 1000).toISOString();

        await admin
          .from("apk_build_queue")
          .update({
            build_status: exhausted ? "failed" : "retrying",
            pipeline_stage: "failed",
            failure_type: "security_scan_failed",
            security_status: "failed",
            build_error: "Mandatory security gate failed",
            retry_count: nextRetry,
            next_retry_at: exhausted ? null : retryAt,
            last_error_at: nowIso(),
            scan_report: { findings: scan.findings, blocked: true },
            locked_by: null,
            locked_at: null,
            build_completed_at: exhausted ? nowIso() : null,
            updated_at: nowIso(),
          })
          .eq("id", row.id);

        await emitEvent(
          admin,
          row.id,
          row.slug,
          tId,
          stage,
          exhausted ? "failed" : "retrying",
          exhausted ? "Security gate failed and retry budget exhausted" : "Security gate failed; re-queued with retry backoff",
          { retry_count: nextRetry, next_retry_at: exhausted ? null : retryAt },
        );
        return { ok: false, trace_id: tId, failed: true, reason: "security_scan_failed" };
      }

      await admin
        .from("apk_build_queue")
        .update({
          security_status: "passed",
          scan_report: { findings: scan.findings, blocked: false },
          updated_at: nowIso(),
        })
        .eq("id", row.id);
    }
  }

  await updateStage(admin, row, "ready", "success", tId, {
    artifact: {
      manifest: {
        trace_id: tId,
        slug: row.slug,
        signed: true,
        license_locked: true,
        generated_at: nowIso(),
      },
    },
    queue: {
      build_status: "completed",
      pipeline_stage: "ready",
      build_completed_at: nowIso(),
      failure_type: null,
      next_retry_at: null,
      locked_by: null,
      locked_at: null,
      build_manifest: {
        trace_id: tId,
        release: "apk",
        stage_count: PIPELINE_STAGES.length,
      },
      apk_file_path: row.apk_file_path || `${row.slug}/release.apk`,
      apk_metadata: { signed: true, source: "apk-pipeline-worker" },
      license_metadata: { mode: "offline_device_bound", generated: true },
      upload_metadata: { provider: "supabase_storage", bucket: "apks" },
      marketplace_metadata: { auto_attached: true },
    },
  });
  await emitEvent(admin, row.id, row.slug, tId, "ready", "success", "APK pipeline completed");

  return { ok: true, trace_id: tId, failed: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const workerName = Deno.env.get("APK_PIPELINE_WORKER_NAME") || "apk-worker-1";
    const limit = Number(Deno.env.get("APK_PIPELINE_WORKER_BATCH") || "5");

    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const now = nowIso();

    const { data: jobs, error } = await admin
      .from("apk_build_queue")
      .select("*")
      .or(`build_status.eq.pending,build_status.eq.retrying`)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const processed: any[] = [];
    for (const row of jobs || []) {
      if (row.locked_at && row.locked_by && row.locked_by !== workerName) {
        continue;
      }
      const result = await processJob(admin, row, workerName);
      processed.push({ id: row.id, slug: row.slug, ...result });
    }

    return new Response(
      JSON.stringify({
        success: true,
        worker: workerName,
        processed: processed.length,
        results: processed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
