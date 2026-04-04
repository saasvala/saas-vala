import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-policy-signature, x-policy-timestamp",
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signPolicy(payload: Record<string, unknown>, secret: string) {
  const signedAt = new Date().toISOString();
  const body = { ...payload, signed_at: signedAt };
  const signature = await hmacSha256Hex(secret, stableStringify(body));
  return { ...body, signature, signature_alg: "hmac-sha256" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const policySigningKey = Deno.env.get("APK_POLICY_SIGNING_KEY");
    if (!policySigningKey) return respond({ error: "APK_POLICY_SIGNING_KEY is required" }, 500);
    const syncIntervalMinutes = Number(Deno.env.get("APK_POLICY_SYNC_MINUTES") || "60");
    const analyticsPerMinuteLimit = Number(Deno.env.get("APK_ANALYTICS_PER_MINUTE_PER_LICENSE") || "120");
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const action = body?.action || "sync_policy";

    if (action === "ingest_event") {
      const { license_key, device_id, app_version_code, event_type, event_name, payload, product_id } = body || {};
      if (!license_key || !event_type) {
        return respond({ error: "license_key and event_type are required" }, 400);
      }

      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin
        .from("apk_usage_analytics")
        .select("id", { count: "exact", head: true })
        .eq("license_key", license_key)
        .gte("created_at", minuteAgo);
      if ((count || 0) >= analyticsPerMinuteLimit) {
        return respond({ error: "analytics_rate_limited" }, 429);
      }

      const { data: lic } = await admin
        .from("license_keys")
        .select("created_by, product_id")
        .eq("license_key", license_key)
        .maybeSingle();

      await admin.from("apk_usage_analytics").insert({
        license_key,
        user_id: lic?.created_by || null,
        product_id: product_id || lic?.product_id || null,
        device_id: device_id || null,
        app_version_code: Number(app_version_code || 0) || null,
        event_type,
        event_name: event_name || null,
        payload: payload || {},
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
        user_agent: req.headers.get("user-agent") || null,
      });

      return respond({ success: true });
    }

    const { license_key, device_id, app_version_code, app_signature } = body || {};
    if (!license_key) {
      return respond({ error: "license_key is required" }, 400);
    }

    const { data: lic } = await admin
      .from("license_keys")
      .select("id, status, expires_at, created_by, product_id, offline_grace_hours, runtime_blocked, runtime_block_reason")
      .eq("license_key", license_key)
      .maybeSingle();

    if (!lic) {
      const signed = await signPolicy({
        license_key,
        status: "invalid",
        blocked: true,
        reason: "License key not found",
        sync_interval_minutes: syncIntervalMinutes,
        offline_grace_hours: 0,
      }, policySigningKey);
      return respond({ status: "invalid", policy: signed }, 200);
    }

    const now = new Date();
    const expired = Boolean(lic.expires_at && new Date(lic.expires_at) < now);
    const licenseBlocked = lic.status !== "active" || expired || Boolean(lic.runtime_blocked);

    const { data: product } = lic.product_id
      ? await admin
        .from("products")
        .select("id, apk_kill_switch, apk_kill_reason, min_supported_apk_version_code, force_update_required, current_stable_apk_checksum, current_stable_apk_path")
        .eq("id", lic.product_id)
        .maybeSingle()
      : { data: null as any };

    const minSupportedVersionCode = Number(product?.min_supported_apk_version_code || 1);
    const currentVersion = Number(app_version_code || 0);
    const isOutdated = currentVersion > 0 && currentVersion < minSupportedVersionCode;
    const killSwitch = Boolean(product?.apk_kill_switch);

    const blocked = licenseBlocked || killSwitch || isOutdated;
    const reason =
      expired
        ? "License expired"
        : lic.runtime_block_reason || product?.apk_kill_reason || (isOutdated ? "Version no longer supported" : "Policy synced");

    const updateMode = blocked && isOutdated ? "force" : (product?.force_update_required ? "force" : "notify");
    const policy = await signPolicy({
      license_key,
      status: blocked ? "blocked" : "valid",
      blocked,
      reason,
      user_id: lic.created_by || null,
      product_id: lic.product_id || null,
      bound_device: device_id || null,
      min_supported_version_code: minSupportedVersionCode,
      update_mode: updateMode,
      force_update: Boolean(updateMode === "force"),
      latest_checksum: product?.current_stable_apk_checksum || null,
      latest_path: product?.current_stable_apk_path || null,
      sync_interval_minutes: syncIntervalMinutes,
      offline_grace_hours: Number(lic.offline_grace_hours || 72),
    }, policySigningKey);

    await admin.from("license_keys").update({ last_policy_sync_at: now.toISOString() }).eq("id", lic.id);

    await admin.from("apk_runtime_policy_logs").insert({
      license_key,
      user_id: lic.created_by || null,
      product_id: lic.product_id || null,
      device_id: device_id || null,
      app_version_code: Number(app_version_code || 0) || null,
      app_hash: app_signature || null,
      policy_status: blocked ? "blocked" : "valid",
      update_mode: String(policy.update_mode || "notify"),
      blocked,
      reason,
      response_signature: String(policy.signature || ""),
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
    });

    return respond({ status: blocked ? "blocked" : "valid", policy }, 200);
  } catch (err: any) {
    return respond({ error: err?.message || "Internal error" }, 500);
  }

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
