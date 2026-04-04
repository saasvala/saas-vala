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

async function signRuntimePolicy(policy: Record<string, unknown>, signingSecret: string) {
  const signed_at = new Date().toISOString();
  const payload = { ...policy, signed_at };
  const canonical = stableStringify(payload);
  const signature = await hmacSha256Hex(signingSecret, canonical);
  return { ...payload, signature, signature_alg: "hmac-sha256" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const policySigningKey = Deno.env.get("APK_POLICY_SIGNING_KEY") || serviceKey;
    const defaultSyncMinutes = Number(Deno.env.get("APK_POLICY_SYNC_MINUTES") || "60");
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { license_key, device_id, app_signature, app_version_code } = await req.json();

    if (!license_key) {
      return new Response(
        JSON.stringify({ status: "invalid", reason: "license_key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const { data: licenseMeta } = await adminClient
      .from("license_keys")
      .select("id, product_id, status, expires_at, created_by, offline_grace_hours, runtime_blocked, runtime_block_reason")
      .eq("license_key", license_key)
      .maybeSingle();

    // 1. Find license record — check apk_downloads first, then license_keys as fallback
    const { data: apkDownload, error: apkErr } = await adminClient
      .from("apk_downloads")
      .select("*")
      .eq("license_key", license_key)
      .single();

    // If not found in apk_downloads, check license_keys table
    if (apkErr || !apkDownload) {
      const licKey = licenseMeta;
      const licErr = !licKey ? new Error("not_found") : null;

      if (licErr || !licKey) {
        await adminClient.from("license_verification_logs").insert({
          license_key,
          device_id: device_id || null,
          app_signature: app_signature || null,
          result: "invalid",
          reason: "License key not found",
          ip_address: ip,
        });

        return new Response(
          JSON.stringify({ status: "invalid", reason: "License key not found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (licKey.status !== "active") {
        const signedPolicy = await signRuntimePolicy({
          license_key,
          status: "blocked",
          blocked: true,
          reason: `License status: ${licKey.status}`,
          offline_grace_hours: 0,
          sync_interval_minutes: defaultSyncMinutes,
        }, policySigningKey);

        await adminClient.from("license_verification_logs").insert({
          license_key,
          device_id: device_id || null,
          app_signature: app_signature || null,
          user_id: licKey.created_by || null,
          result: "blocked",
          reason: `License status: ${licKey.status}`,
          ip_address: ip,
        });

        return new Response(
          JSON.stringify({ status: "blocked", reason: `License status: ${licKey.status}`, policy: signedPolicy }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (licKey.expires_at && new Date(licKey.expires_at) < new Date()) {
        const signedPolicy = await signRuntimePolicy({
          license_key,
          status: "invalid",
          blocked: true,
          reason: "License expired",
          offline_grace_hours: 0,
          sync_interval_minutes: defaultSyncMinutes,
        }, policySigningKey);

        await adminClient.from("license_verification_logs").insert({
          license_key,
          device_id: device_id || null,
          app_signature: app_signature || null,
          user_id: licKey.created_by || null,
          result: "invalid",
          reason: "License expired",
          ip_address: ip,
        });

        return new Response(
          JSON.stringify({ status: "invalid", reason: "License has expired", policy: signedPolicy }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const productId = licKey.product_id || null;
      const { data: productPolicy } = productId
        ? await adminClient
          .from("products")
          .select("id, min_supported_apk_version_code, force_update_required, apk_kill_switch, apk_kill_reason, current_stable_apk_checksum")
          .eq("id", productId)
          .maybeSingle()
        : { data: null as any };

      const minSupportedVersion = Number(productPolicy?.min_supported_apk_version_code || 1);
      const appVersion = Number(app_version_code || 0);
      const mustUpdate = appVersion > 0 && appVersion < minSupportedVersion;
      const runtimeBlocked = Boolean(licKey.runtime_blocked) || Boolean(productPolicy?.apk_kill_switch);
      const runtimeBlockedReason = licKey.runtime_block_reason || productPolicy?.apk_kill_reason || "License revoked";

      const signedPolicy = await signRuntimePolicy({
        license_key,
        status: runtimeBlocked ? "blocked" : "valid",
        blocked: runtimeBlocked || mustUpdate,
        reason: runtimeBlocked ? runtimeBlockedReason : mustUpdate ? "Version no longer supported" : "License verified successfully",
        product_id: productId,
        min_supported_version_code: minSupportedVersion,
        latest_checksum: productPolicy?.current_stable_apk_checksum || null,
        update_mode: mustUpdate || productPolicy?.force_update_required ? "force" : "notify",
        force_update: Boolean(mustUpdate || productPolicy?.force_update_required),
        offline_grace_hours: Number(licKey.offline_grace_hours || 72),
        sync_interval_minutes: defaultSyncMinutes,
      }, policySigningKey);

      await adminClient.from("apk_runtime_policy_logs").insert({
        license_key,
        user_id: licKey.created_by || null,
        product_id: productId || null,
        device_id: device_id || null,
        app_version_code: appVersion || null,
        app_hash: app_signature || null,
        policy_status: runtimeBlocked || mustUpdate ? "blocked" : "valid",
        update_mode: signedPolicy.update_mode as string,
        blocked: Boolean(runtimeBlocked || mustUpdate),
        reason: signedPolicy.reason as string,
        response_signature: signedPolicy.signature as string,
        ip_address: ip,
      });

      await adminClient.from("license_verification_logs").insert({
        license_key,
        device_id: device_id || null,
        app_signature: app_signature || null,
        user_id: licKey.created_by || null,
        result: "valid",
        reason: "License verified successfully",
        ip_address: ip,
      });

      return new Response(
        JSON.stringify({
          status: "valid",
          user_id: licKey.created_by || null,
          verified_at: new Date().toISOString(),
          policy: signedPolicy,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if blocked
    if (apkDownload.is_blocked || licenseMeta?.runtime_blocked) {
      const blockedReason = licenseMeta?.runtime_block_reason || apkDownload.blocked_reason || "License revoked";
      const signedPolicy = await signRuntimePolicy({
        license_key,
        status: "blocked",
        blocked: true,
        reason: blockedReason,
        product_id: apkDownload.product_id || licenseMeta?.product_id || null,
        offline_grace_hours: Number(licenseMeta?.offline_grace_hours || 72),
        sync_interval_minutes: defaultSyncMinutes,
      }, policySigningKey);

      await adminClient.from("license_verification_logs").insert({
        license_key,
        device_id: device_id || null,
        app_signature: app_signature || null,
        user_id: apkDownload.user_id,
        result: "blocked",
        reason: blockedReason,
        ip_address: ip,
      });

      return new Response(
        JSON.stringify({ status: "blocked", reason: blockedReason, policy: signedPolicy }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Device binding check
    if (device_id) {
      const existingDevice = apkDownload.device_info?.device_id;

      if (existingDevice && existingDevice !== device_id) {
        // Already bound to a different device
        await adminClient.from("license_verification_logs").insert({
          license_key,
          device_id,
          app_signature: app_signature || null,
          user_id: apkDownload.user_id,
          result: "wrong_device",
          reason: `Bound to device ${existingDevice.substring(0, 8)}..., attempted from ${device_id.substring(0, 8)}...`,
          ip_address: ip,
        });

        return new Response(
          JSON.stringify({
            status: "invalid",
            reason: "License is bound to a different device. Contact support.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Bind device on first use
      if (!existingDevice) {
        await adminClient
          .from("apk_downloads")
          .update({
            device_info: { device_id, app_signature: app_signature || null, bound_at: new Date().toISOString() },
            verification_attempts: (apkDownload.verification_attempts || 0) + 1,
          })
          .eq("id", apkDownload.id);
      } else {
        // Same device, just update attempts
        await adminClient
          .from("apk_downloads")
          .update({
            verification_attempts: (apkDownload.verification_attempts || 0) + 1,
          })
          .eq("id", apkDownload.id);
      }
    }

    const productId = apkDownload.product_id || licenseMeta?.product_id || null;
    const { data: productPolicy } = productId
      ? await adminClient
        .from("products")
        .select("id, min_supported_apk_version_code, force_update_required, apk_kill_switch, apk_kill_reason, current_stable_apk_checksum")
        .eq("id", productId)
        .maybeSingle()
      : { data: null as any };

    const minSupportedVersion = Number(productPolicy?.min_supported_apk_version_code || 1);
    const appVersion = Number(app_version_code || 0);
    const mustUpdate = appVersion > 0 && appVersion < minSupportedVersion;
    const appBlocked = Boolean(productPolicy?.apk_kill_switch);
    const blockedReason = productPolicy?.apk_kill_reason || "App disabled by admin";

    const signedPolicy = await signRuntimePolicy({
      license_key,
      status: appBlocked ? "blocked" : "valid",
      blocked: appBlocked || mustUpdate,
      reason: appBlocked ? blockedReason : mustUpdate ? "Version no longer supported" : "License verified successfully",
      product_id: productId,
      min_supported_version_code: minSupportedVersion,
      latest_checksum: productPolicy?.current_stable_apk_checksum || null,
      update_mode: mustUpdate || productPolicy?.force_update_required ? "force" : "notify",
      force_update: Boolean(mustUpdate || productPolicy?.force_update_required),
      offline_grace_hours: Number(licenseMeta?.offline_grace_hours || 72),
      sync_interval_minutes: defaultSyncMinutes,
    }, policySigningKey);

    await adminClient.from("apk_runtime_policy_logs").insert({
      license_key,
      user_id: apkDownload.user_id || null,
      product_id: productId || null,
      device_id: device_id || null,
      app_version_code: appVersion || null,
      app_hash: app_signature || null,
      policy_status: appBlocked || mustUpdate ? "blocked" : "valid",
      update_mode: signedPolicy.update_mode as string,
      blocked: Boolean(appBlocked || mustUpdate),
      reason: signedPolicy.reason as string,
      response_signature: signedPolicy.signature as string,
      ip_address: ip,
    });

    // 4. Log valid verification
    await adminClient.from("license_verification_logs").insert({
      license_key,
      device_id: device_id || null,
      app_signature: app_signature || null,
      user_id: apkDownload.user_id,
      result: "valid",
      reason: "License verified successfully",
      ip_address: ip,
    });

    return new Response(
      JSON.stringify({
        status: "valid",
        user_id: apkDownload.user_id,
        product_id: apkDownload.product_id,
        bound_device: apkDownload.device_info?.device_id || device_id || null,
        verified_at: new Date().toISOString(),
        policy: signedPolicy,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ status: "error", reason: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
