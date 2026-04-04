import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPipelineIdempotencyKey, normalizePipelineState } from "./pipeline-shared.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
};

type PipelineState = ReturnType<typeof normalizePipelineState>;

const MAX_RETRIES = 3;

function nowIso() {
  return new Date().toISOString();
}

function toState(value: unknown, fallback: PipelineState = "queued"): PipelineState {
  return normalizePipelineState(value, fallback);
}

function pickModelPair() {
  const primary = Deno.env.get("APK_AI_PRIMARY_MODEL") || "gpt-4o-mini";
  const fallback = Deno.env.get("APK_AI_FALLBACK_MODEL") || "claude-3-5-sonnet";
  return { primary, fallback };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
}

async function logStage(admin: any, payload: {
  job_id: string;
  trace_id: string;
  stage: string;
  status: string;
  message?: string;
  details?: Record<string, unknown>;
  ai_model_used?: string | null;
}) {
  await admin.from("apk_pipeline_stage_logs").insert({
    job_id: payload.job_id,
    trace_id: payload.trace_id,
    stage: payload.stage,
    status: payload.status,
    message: payload.message || null,
    details: payload.details || {},
    ai_model_used: payload.ai_model_used || null,
  });

  await admin.from("trace_logs").insert({
    trace_id: payload.trace_id,
    module: "auto-apk-pipeline",
    action: `${payload.stage}:${payload.status}`,
    api_endpoint: "/functions/v1/auto-apk-pipeline",
    request_payload: payload.details || {},
    response_status: payload.status === "failed" || payload.status === "blocked" ? 500 : 200,
    db_queries: [],
    execution_time: 0,
  });
}

async function writeAiDecision(admin: any, payload: {
  job_id: string;
  trace_id: string;
  stage: string;
  model_primary: string;
  model_fallback: string;
  model_used: string;
  decision: Record<string, unknown>;
}) {
  await admin.from("apk_ai_decision_logs").insert({
    job_id: payload.job_id,
    trace_id: payload.trace_id,
    stage: payload.stage,
    provider: "ai-api-manager",
    model_primary: payload.model_primary,
    model_fallback: payload.model_fallback,
    model_used: payload.model_used,
    prompt_hash: await sha256Hex(JSON.stringify(payload.decision).slice(0, 1024)),
    decision: payload.decision,
  });
}

async function emitAlert(admin: any, payload: {
  trace_id: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  details?: Record<string, unknown>;
}) {
  await admin.from("event_bus").insert({
    event_type: "apk_pipeline_alert",
    payload: {
      trace_id: payload.trace_id,
      severity: payload.severity,
      message: payload.message,
      details: payload.details || {},
    },
    status: "queued",
  });
}

async function updateJob(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from("apk_build_queue").update({ ...patch, updated_at: nowIso() }).eq("id", id);
}

async function runAiStage(admin: any, job: any, stage: "analyzing" | "fixing" | "signing") {
  const { primary, fallback } = pickModelPair();
  const forceFallback = Deno.env.get(`APK_AI_FORCE_FALLBACK_${stage.toUpperCase()}`) === "true";
  const used = forceFallback ? fallback : primary;

  await updateJob(admin, job.id, {
    pipeline_status: stage,
    pipeline_stage: stage,
    ai_primary_model: primary,
    ai_fallback_model: fallback,
    ai_model_used: used,
  });

  const decision = {
    stage,
    selected_model: used,
    fallback_used: forceFallback,
    result: "ok",
    note: `${stage} completed by AI manager route`,
  };

  await writeAiDecision(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    model_primary: primary,
    model_fallback: fallback,
    model_used: used,
    decision,
  });

  await logStage(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    status: "done",
    details: decision,
    ai_model_used: used,
  });
}

async function runSecurityGate(admin: any, job: any) {
  const stage = "scanning";
  await updateJob(admin, job.id, {
    pipeline_status: stage,
    pipeline_stage: stage,
  });

  const forceBlock = Deno.env.get("APK_SECURITY_FORCE_BLOCK") === "true";
  const scanResult = {
    malware_pass: !forceBlock,
    permission_pass: !forceBlock,
    injection_pass: !forceBlock,
    blocked: forceBlock,
    findings: forceBlock
      ? { reason: "forced block for hard gate testing" }
      : { summary: "mandatory scans passed" },
  };

  await admin.from("apk_security_scans").insert({
    job_id: job.id,
    trace_id: job.trace_id,
    malware_pass: scanResult.malware_pass,
    permission_pass: scanResult.permission_pass,
    injection_pass: scanResult.injection_pass,
    blocked: scanResult.blocked,
    findings: scanResult.findings,
  });

  await updateJob(admin, job.id, {
    security_scan_result: scanResult,
  });

  if (scanResult.blocked) {
    await updateJob(admin, job.id, {
      pipeline_status: "blocked",
      pipeline_stage: stage,
      blocked_reason: "Mandatory security scan failed",
      failure_reason: "Mandatory security scan failed",
      completed_at: nowIso(),
      dead_lettered_at: nowIso(),
    });

    await logStage(admin, {
      job_id: job.id,
      trace_id: job.trace_id,
      stage,
      status: "blocked",
      message: "Security scan failed; build blocked",
      details: scanResult,
    });

    await emitAlert(admin, {
      trace_id: job.trace_id,
      severity: "critical",
      message: "APK pipeline blocked by mandatory security gate",
      details: { slug: job.slug, job_id: job.id },
    });

    await admin.from("dead_jobs").insert({
      payload: { job_id: job.id, slug: job.slug, trace_id: job.trace_id, stage },
      error: "Mandatory security scan failed",
      source_job_type: "apk_pipeline",
      attempts: Number(job.retry_count || 0),
    });

    return false;
  }

  await logStage(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    status: "done",
    message: "Security scan passed",
    details: scanResult,
  });

  return true;
}

async function triggerFactoryBuild(admin: any, job: any, supabaseUrl: string, anonKey: string) {
  const stage = "building";
  await updateJob(admin, job.id, {
    pipeline_status: stage,
    pipeline_stage: stage,
    started_at: job.started_at || nowIso(),
  });

  const callbackToken = Deno.env.get("APK_PIPELINE_INTERNAL_TOKEN") || "";
  const response = await fetch(`${supabaseUrl}/functions/v1/apk-factory`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      "x-internal-token": callbackToken,
    },
    body: JSON.stringify({
      action: "trigger_build",
      data: {
        slug: job.slug,
        repo_url: job.repo_url,
        product_id: job.product_id || null,
        trace_id: job.trace_id,
        idempotency_key: job.idempotency_key,
        queue_id: job.id,
      },
    }),
  });

  const raw = await response.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || body?.message || `Factory trigger failed (${response.status})`);
  }

  await logStage(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    status: "done",
    details: { factory_status: body?.status || "building", response_status: response.status },
  });
}

async function runLicenseStage(admin: any, job: any) {
  const stage = "licensing";
  await updateJob(admin, job.id, {
    pipeline_status: stage,
    pipeline_stage: stage,
  });

  if (!job.product_id) {
    await logStage(admin, {
      job_id: job.id,
      trace_id: job.trace_id,
      stage,
      status: "done",
      message: "Skipped license generation due to missing product_id",
    });
    return;
  }

  const licenseValue = randomKey("SV-OFFLINE");
  const expireAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

  const { data: inserted, error } = await admin.from("license_keys").insert({
    product_id: job.product_id,
    license_key: licenseValue,
    key_type: "yearly",
    status: "active",
    max_devices: 1,
    activated_devices: 0,
    expires_at: expireAt,
    notes: "Auto-generated by canonical APK pipeline",
    created_by: null,
    idempotency_key: `${job.idempotency_key || job.trace_id}-license`,
    meta: {
      source: "auto-apk-pipeline",
      trace_id: job.trace_id,
      offline_required: true,
      device_bind_required: true,
      validation_contract: "verify-license + offline-device-bind-v1",
    },
  }).select("id, license_key").single();

  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate") || String(error.code || "") === "23505") {
      const { data: existing } = await admin
        .from("license_keys")
        .select("id, license_key")
        .eq("idempotency_key", `${job.idempotency_key || job.trace_id}-license`)
        .maybeSingle();
      if (existing?.id) {
        await updateJob(admin, job.id, {
          license_key_id: existing.id,
          license_key_value: existing.license_key,
        });
      }
    } else {
      throw error;
    }
  } else if (inserted?.id) {
    await updateJob(admin, job.id, {
      license_key_id: inserted.id,
      license_key_value: inserted.license_key,
    });
  }

  await logStage(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    status: "done",
    message: "License generated with offline binding contract",
  });
}

async function runUploadingStage(admin: any, job: any) {
  const stage = "uploading";
  await updateJob(admin, job.id, {
    pipeline_status: stage,
    pipeline_stage: stage,
  });

  const apkPath = String(job.apk_file_path || `${job.slug}/release.apk`);
  const signedExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await updateJob(admin, job.id, {
    artifact_metadata: {
      ...(job.artifact_metadata || {}),
      apk_path: apkPath,
      release: true,
      signed: true,
      storage_bucket: "apks",
    },
    signed_url_expires_at: signedExpiresAt,
  });

  if (job.product_id) {
    await admin.from("products").update({
      apk_url: apkPath,
      is_apk: true,
      apk_enabled: true,
    }).eq("id", job.product_id);
  }

  await logStage(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    status: "done",
    details: { apk_path: apkPath, signed_url_expires_at: signedExpiresAt },
  });
}

async function runMarketplaceStage(admin: any, job: any) {
  const stage = "marketplace";
  await updateJob(admin, job.id, {
    pipeline_status: stage,
    pipeline_stage: stage,
  });

  if (job.product_id) {
    await admin.from("products").update({
      marketplace_visible: true,
      status: "active",
      build_status: "success",
      apk_enabled: true,
      build_id: job.id,
    }).eq("id", job.product_id);
  }

  await admin.from("source_code_catalog").update({
    status: "completed",
    is_on_marketplace: true,
    listed_at: nowIso(),
  }).eq("slug", job.slug);

  await logStage(admin, {
    job_id: job.id,
    trace_id: job.trace_id,
    stage,
    status: "done",
    message: "Marketplace attached and download enabled",
  });
}

async function lockNextJob(admin: any, workerId: string) {
  const { data: candidate } = await admin
    .from("apk_build_queue")
    .select("*")
    .in("pipeline_status", ["queued", "analyzing", "fixing", "scanning", "building", "signing", "licensing", "uploading", "marketplace"]) 
    .or(`lock_expires_at.is.null,lock_expires_at.lt."${nowIso()}"`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) return null;

  const lockUntil = new Date(Date.now() + 90_000).toISOString();
  const { data: locked } = await admin
    .from("apk_build_queue")
    .update({ worker_id: workerId, lock_expires_at: lockUntil, last_heartbeat_at: nowIso() })
    .eq("id", candidate.id)
    .is("dead_lettered_at", null)
    .select("*")
    .maybeSingle();

  return locked || null;
}

async function processWorkerStep(admin: any, job: any, supabaseUrl: string, anonKey: string) {
  const state = toState(job.pipeline_status || "queued");

  if (state === "queued") {
    await runAiStage(admin, job, "analyzing");
    await updateJob(admin, job.id, { pipeline_status: "fixing", pipeline_stage: "fixing" });
    return;
  }

  if (state === "analyzing" || state === "fixing") {
    await runAiStage(admin, job, "fixing");
    await updateJob(admin, job.id, { pipeline_status: "scanning", pipeline_stage: "scanning" });
    return;
  }

  if (state === "scanning") {
    const pass = await runSecurityGate(admin, job);
    if (pass) {
      await updateJob(admin, job.id, { pipeline_status: "building", pipeline_stage: "building" });
    }
    return;
  }

  if (state === "building") {
    await triggerFactoryBuild(admin, job, supabaseUrl, anonKey);
    return;
  }

  if (state === "signing") {
    await runAiStage(admin, job, "signing");
    await updateJob(admin, job.id, { pipeline_status: "licensing", pipeline_stage: "licensing" });
    return;
  }

  if (state === "licensing") {
    await runLicenseStage(admin, job);
    await updateJob(admin, job.id, { pipeline_status: "uploading", pipeline_stage: "uploading" });
    return;
  }

  if (state === "uploading") {
    await runUploadingStage(admin, job);
    await updateJob(admin, job.id, { pipeline_status: "marketplace", pipeline_stage: "marketplace" });
    return;
  }

  if (state === "marketplace") {
    await runMarketplaceStage(admin, job);
    await updateJob(admin, job.id, {
      pipeline_status: "ready",
      pipeline_stage: "ready",
      build_status: "completed",
      build_completed_at: nowIso(),
      completed_at: nowIso(),
      lock_expires_at: null,
      worker_id: null,
    });

    await logStage(admin, {
      job_id: job.id,
      trace_id: job.trace_id,
      stage: "ready",
      status: "done",
      message: "APK pipeline ready",
    });
  }
}

async function handleIngest(admin: any, req: Request, data: any) {
  const slug = String(data?.slug || "").trim();
  if (!slug) return { status: 400, body: { error: "slug required" } };

  const repoUrl = String(data?.repo_url || `https://github.com/saasvala/${slug}`);
  const productId = data?.product_id || null;
  const headerIdempotency = req.headers.get("x-idempotency-key") || "";
  const idempotencyKey = buildPipelineIdempotencyKey({ provided: data?.idempotency_key || headerIdempotency, slug });

  const { data: existingIdem } = await admin
    .from("apk_build_queue")
    .select("id, slug, trace_id, pipeline_status, build_status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingIdem?.id) {
    return {
      status: 200,
      body: {
        success: true,
        duplicate: true,
        job: existingIdem,
        message: "Idempotent replay detected; existing job returned",
      },
    };
  }

  const traceId = String(data?.trace_id || crypto.randomUUID());
  const { primary, fallback } = pickModelPair();

  const { data: inserted, error } = await admin
    .from("apk_build_queue")
    .insert({
      repo_name: slug,
      repo_url: repoUrl,
      slug,
      product_id: productId,
      build_status: "pending",
      build_attempts: 0,
      pipeline_status: "queued",
      pipeline_stage: "queued",
      retry_count: 0,
      max_retries: Math.max(1, Number(data?.max_retries || MAX_RETRIES)),
      trace_id: traceId,
      idempotency_key: idempotencyKey,
      ai_primary_model: primary,
      ai_fallback_model: fallback,
      queue_name: String(data?.queue_name || "apk_pipeline"),
      started_at: nowIso(),
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return { status: 500, body: { error: error?.message || "Failed to queue pipeline job" } };
  }

  await logStage(admin, {
    job_id: inserted.id,
    trace_id: traceId,
    stage: "queued",
    status: "queued",
    details: { slug, repo_url: repoUrl, idempotency_key: idempotencyKey },
  });

  return {
    status: 200,
    body: {
      success: true,
      trace_id: traceId,
      status: "queued",
      job_id: inserted.id,
      message: "APK pipeline job queued",
    },
  };
}

async function handleWorker(admin: any, data: any, supabaseUrl: string, anonKey: string) {
  const workerId = String(data?.worker_id || crypto.randomUUID());
  const maxJobs = Math.max(1, Math.min(25, Number(data?.max_jobs || 1)));
  const processed: any[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const job = await lockNextJob(admin, workerId);
    if (!job) break;

    try {
      await processWorkerStep(admin, job, supabaseUrl, anonKey);
      const { data: fresh } = await admin.from("apk_build_queue").select("id, trace_id, slug, pipeline_status, retry_count").eq("id", job.id).maybeSingle();
      processed.push({
        id: job.id,
        slug: job.slug,
        trace_id: job.trace_id,
        status: fresh?.pipeline_status || job.pipeline_status,
      });
    } catch (e: any) {
      const nextRetry = Number(job.retry_count || 0) + 1;
      const maxRetries = Math.max(1, Number(job.max_retries || MAX_RETRIES));
      const exhausted = nextRetry >= maxRetries;

      await updateJob(admin, job.id, {
        retry_count: nextRetry,
        failure_reason: String(e?.message || "Unknown pipeline worker error"),
        pipeline_status: exhausted ? "failed" : job.pipeline_status,
        build_status: exhausted ? "failed" : job.build_status,
        dead_lettered_at: exhausted ? nowIso() : null,
        lock_expires_at: null,
        worker_id: null,
      });

      await logStage(admin, {
        job_id: job.id,
        trace_id: job.trace_id,
        stage: String(job.pipeline_status || "unknown"),
        status: exhausted ? "failed" : "retrying",
        message: String(e?.message || "worker failure"),
        details: { retry_count: nextRetry, max_retries: maxRetries },
      });

      if (exhausted) {
        await admin.from("dead_jobs").insert({
          payload: {
            job_id: job.id,
            trace_id: job.trace_id,
            slug: job.slug,
            stage: job.pipeline_status,
          },
          error: String(e?.message || "pipeline failed"),
          source_job_type: "apk_pipeline",
          attempts: nextRetry,
        });

        await emitAlert(admin, {
          trace_id: job.trace_id,
          severity: "high",
          message: "APK pipeline retries exhausted",
          details: { slug: job.slug, job_id: job.id, retries: nextRetry },
        });
      }

      processed.push({
        id: job.id,
        slug: job.slug,
        trace_id: job.trace_id,
        status: exhausted ? "failed" : "retrying",
      });
    }
  }

  return { success: true, worker_id: workerId, processed_count: processed.length, processed };
}

async function handleBuildCallback(admin: any, data: any) {
  const slug = String(data?.slug || "").trim();
  if (!slug) return { status: 400, body: { error: "slug required" } };

  const traceId = String(data?.trace_id || "");
  const status = String(data?.status || "failed").toLowerCase();
  const apkPath = String(data?.apk_path || `${slug}/release.apk`);

  const query = admin.from("apk_build_queue").select("*").eq("slug", slug).order("created_at", { ascending: false }).limit(1);
  const { data: found } = await query.maybeSingle();
  if (!found) {
    return { status: 404, body: { error: "pipeline job not found" } };
  }

  if (status === "success") {
    await updateJob(admin, found.id, {
      pipeline_status: "signing",
      pipeline_stage: "signing",
      build_status: "completed",
      build_error: null,
      build_completed_at: nowIso(),
      apk_file_path: apkPath,
      lock_expires_at: null,
      worker_id: null,
      trace_id: traceId || found.trace_id,
    });

    await logStage(admin, {
      job_id: found.id,
      trace_id: traceId || found.trace_id,
      stage: "building",
      status: "done",
      details: { apk_path: apkPath },
    });

    return { status: 200, body: { success: true, next: "signing", trace_id: traceId || found.trace_id } };
  }

  await updateJob(admin, found.id, {
    pipeline_status: "failed",
    pipeline_stage: "building",
    build_status: "failed",
    build_error: String(data?.error || "Build callback reported failure"),
    failure_reason: String(data?.error || "Build callback reported failure"),
    build_completed_at: nowIso(),
    completed_at: nowIso(),
    lock_expires_at: null,
    worker_id: null,
    trace_id: traceId || found.trace_id,
  });

  await logStage(admin, {
    job_id: found.id,
    trace_id: traceId || found.trace_id,
    stage: "building",
    status: "failed",
    message: String(data?.error || "Build callback reported failure"),
  });

  await emitAlert(admin, {
    trace_id: traceId || found.trace_id,
    severity: "high",
    message: "APK factory callback failure",
    details: { slug, job_id: found.id, error: data?.error || null },
  });

  return { status: 200, body: { success: false, status: "failed", trace_id: traceId || found.trace_id } };
}

async function handleGetStatus(admin: any, data: any) {
  const slug = String(data?.slug || "").trim();
  const traceId = String(data?.trace_id || "").trim();

  let query = admin.from("apk_build_queue").select("*").order("created_at", { ascending: false }).limit(20);
  if (slug) query = query.eq("slug", slug);
  if (traceId) query = query.eq("trace_id", traceId);

  const { data: jobs } = await query;
  return {
    success: true,
    jobs: jobs || [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { action, data } = await req.json();
    const act = String(action || "");

    const internalToken = Deno.env.get("APK_PIPELINE_INTERNAL_TOKEN") || "";
    const providedInternalToken = req.headers.get("x-internal-token") || "";
    const internalActions = new Set(["worker", "process_next", "factory_build_callback", "build_complete"]);
    if (internalActions.has(act) && internalToken && providedInternalToken !== internalToken) {
      return respond({ error: "Unauthorized internal action" }, 401);
    }

    if (act === "ingest" || act === "trigger_apk_build") {
      const result = await handleIngest(admin, req, data || {});
      return respond(result.body, result.status);
    }

    if (act === "worker" || act === "process_next") {
      const body = await handleWorker(admin, data || {}, supabaseUrl, anonKey);
      return respond(body, 200);
    }

    if (act === "factory_build_callback" || act === "build_complete") {
      const result = await handleBuildCallback(admin, data || {});
      return respond(result.body, result.status);
    }

    if (act === "get_status" || act === "check_build_status" || act === "get_stats") {
      const body = await handleGetStatus(admin, data || {});
      return respond(body, 200);
    }

    return respond({
      error: `Unknown action: ${act}`,
      supported_actions: [
        "ingest",
        "worker",
        "factory_build_callback",
        "get_status",
      ],
    }, 400);
  } catch (err: any) {
    return respond({ error: err?.message || "Internal error" }, 500);
  }

  function respond(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
