import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch existing product slugs
    const { data: existing } = await admin
      .from("products")
      .select("id, slug")
      .eq("marketplace_visible", true);

    const existingSlugs = new Set((existing || []).map((p: any) => p.slug));

    // Fetch catalog entries not yet on marketplace
    const { data: catalog } = await admin
      .from("source_code_catalog")
      .select("id, slug, project_name, github_repo_url, target_industry, ai_description, marketplace_price")
      .eq("is_on_marketplace", false)
      .not("slug", "is", null)
      .limit(200);

    const missing = (catalog || []).filter((c: any) => c.slug && !existingSlugs.has(c.slug));

    if (missing.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No missing products to sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inserts = missing.map((c: any) => ({
      name: c.project_name || c.slug,
      slug: c.slug,
      description: c.ai_description || `${c.project_name} - Software Vala™`,
      business_type: c.target_industry || "general",
      git_repo_url: c.github_repo_url,
      demo_url: `https://${c.slug}.saasvala.com`,
      price: c.marketplace_price || 5,
      status: "active",
      marketplace_visible: true,
    }));

    const { error: insertErr } = await admin.from("products").insert(inserts);
    if (insertErr) throw insertErr;

    // Mark as listed
    const syncedIds = missing.map((c: any) => c.id);
    await admin
      .from("source_code_catalog")
      .update({ is_on_marketplace: true, status: "listed", listed_at: new Date().toISOString() })
      .in("id", syncedIds);

    return new Response(
      JSON.stringify({ success: true, synced: missing.length, message: `✅ Synced ${missing.length} missing products to marketplace` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
