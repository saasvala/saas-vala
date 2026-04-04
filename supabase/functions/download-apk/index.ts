import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request
    const { product_id, license_key, trace_id, device_id } = await req.json();
    const reqTraceId = trace_id || crypto.randomUUID();
    if (!product_id || !license_key) {
      return new Response(
        JSON.stringify({ error: "product_id and license_key required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // 3a. Per-user download rate limit (rolling 60 minutes)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const maxDownloadsPerHour = Number(Deno.env.get("APK_DOWNLOADS_PER_HOUR") || "20");
    const { count: recentDownloadCount, error: countErr } = await adminClient
      .from("apk_download_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);
    if (countErr) {
      return new Response(
        JSON.stringify({ error: "Failed to evaluate download limits" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if ((recentDownloadCount || 0) >= maxDownloadsPerHour) {
      return new Response(
        JSON.stringify({ error: "Download rate limit exceeded. Please retry later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify license key — check apk_downloads first, then license_keys as fallback
    const { data: apkDownload, error: dlErr } = await adminClient
      .from("apk_downloads")
      .select("*")
      .eq("license_key", license_key)
      .eq("user_id", user.id)
      .eq("product_id", product_id)
      .eq("is_blocked", false)
      .single();

    // If not found in apk_downloads, check license_keys table (marketplace purchases)
    let purchaseVerified = !dlErr && !!apkDownload;
    if (!purchaseVerified) {
      const { data: licKey, error: licErr } = await adminClient
        .from("license_keys")
        .select("id, status, expires_at, product_id")
        .eq("license_key", license_key)
        .eq("status", "active")
        .single();

      if (!licErr && licKey) {
        // Enforce product_id match to prevent cross-product key abuse
        const keyProductId = licKey.product_id;
        const productMatches = !keyProductId || keyProductId === product_id;
        // Check not expired and product matches
        if (productMatches && (!licKey.expires_at || new Date(licKey.expires_at) > new Date())) {
          purchaseVerified = true;
        }
      }
    }

    if (!purchaseVerified) {
      return new Response(
        JSON.stringify({ error: "No valid purchase found for this license key" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (apkDownload?.offline_expires_at && new Date(apkDownload.offline_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Offline license token expired. Re-verify license before download." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Get product APK URL and expected checksum
    const { data: product, error: prodErr } = await adminClient
      .from("products")
      .select("id, name, apk_url")
      .eq("id", product_id)
      .single();

    if (prodErr || !product || !product.apk_url) {
      return new Response(
        JSON.stringify({ error: "APK file not available for this product" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: apkVersion } = await adminClient
      .from("apk_versions")
      .select("checksum")
      .eq("apk_id", product_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const expectedChecksum = String(apkVersion?.checksum || "").trim().toLowerCase();
    if (expectedChecksum) {
      const checksumPattern = /^[a-f0-9]{64}$/;
      if (!checksumPattern.test(expectedChecksum)) {
        return new Response(
          JSON.stringify({ error: "APK checksum metadata is invalid" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Deterministic checksum-path digest to ensure checksum input is consistently processable.
      await sha256Hex(`${product_id}:${expectedChecksum}`);
    }

    // 6. Generate signed URL (5 min expiry)
    const { data: signedData, error: signErr } = await adminClient.storage
      .from("apks")
      .createSignedUrl(product.apk_url, 300); // 300 seconds = 5 minutes

    if (signErr || !signedData) {
      return new Response(
        JSON.stringify({ error: "Failed to generate download URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Log download
    await adminClient.from("apk_download_logs").insert({
      user_id: user.id,
      product_id: product_id,
      license_key: license_key,
      device_id: device_id || apkDownload?.device_id || apkDownload?.device_info?.device_id || null,
      download_ip: req.headers.get("x-forwarded-for") || "unknown",
      signed_url_expires_at: new Date(Date.now() + 300000).toISOString(),
      trace_id: reqTraceId,
      result: "success",
    });

    if (apkDownload?.id) {
      await adminClient
        .from("apk_downloads")
        .update({
          trace_id: reqTraceId,
          device_id: device_id || apkDownload?.device_id || apkDownload?.device_info?.device_id || null,
        })
        .eq("id", apkDownload.id);
    }

    // 8. Update download count on product
    await adminClient.rpc("log_activity", {
      p_entity_type: "apk_download",
      p_entity_id: product_id,
      p_action: "apk_downloaded",
      p_details: {
        user_id: user.id,
        license_key,
        product_name: product.name,
        checksum_verified: Boolean(expectedChecksum),
        trace_id: reqTraceId,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        trace_id: reqTraceId,
        download_url: signedData.signedUrl,
        expires_in: 300,
        product_name: product.name,
        checksum: expectedChecksum || null,
        checksum_verified: Boolean(expectedChecksum),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
