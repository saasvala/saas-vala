import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    const githubToken = Deno.env.get("SAASVALA_GITHUB_TOKEN")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apkCallbackSecret = Deno.env.get("APK_CALLBACK_SECRET") ?? "";

    if (!githubToken) {
      return respond({ error: "GitHub token not configured" }, 500);
    }

    const gh = (path: string, options: RequestInit = {}) =>
      fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${githubToken}`,
          "User-Agent": "SaaSVala-APK-Factory",
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });

    switch (action) {
      // ═══════════════════════════════════════
      // Setup: Create apk-factory repo + workflow
      // ═══════════════════════════════════════
      case "setup_factory": {
        // Check if repo exists
        const repoCheck = await gh("/repos/saasvala/apk-factory");

        if (repoCheck.status === 404) {
          // Create repo
          const createRes = await gh("/user/repos", {
            method: "POST",
            body: JSON.stringify({
              name: "apk-factory",
              description:
                "Automated APK build factory using GitHub Actions - Software Vala",
              private: false,
              auto_init: true,
            }),
          });

          if (!createRes.ok) {
            const err = await createRes.text();
            return respond({ error: `Failed to create repo: ${err}` }, 500);
          }
          await createRes.json();
          // Wait for repo to be ready
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          await repoCheck.json();
        }

        // Create the GitHub Actions workflow
        const workflowContent = generateWorkflowYaml(supabaseUrl, supabaseAnonKey, apkCallbackSecret);
        const encodedContent = btoa(unescape(encodeURIComponent(workflowContent)));

        // Check if workflow exists
        const workflowCheck = await gh(
          "/repos/saasvala/apk-factory/contents/.github/workflows/build-apk.yml"
        );

        const workflowBody: any = {
          message: "Add APK build workflow",
          content: encodedContent,
        };

        if (workflowCheck.ok) {
          const existing = await workflowCheck.json();
          workflowBody.sha = existing.sha;
          workflowBody.message = "Update APK build workflow";
        } else {
          await workflowCheck.text();
        }

        const putRes = await gh(
          "/repos/saasvala/apk-factory/contents/.github/workflows/build-apk.yml",
          {
            method: "PUT",
            body: JSON.stringify(workflowBody),
          }
        );

        if (!putRes.ok) {
          const err = await putRes.text();
          return respond(
            { error: `Failed to create workflow: ${err}` },
            500
          );
        }
        await putRes.json();

        // Also create the build script
        const buildScriptContent = generateBuildScript();
        const encodedScript = btoa(unescape(encodeURIComponent(buildScriptContent)));

        const scriptCheck = await gh(
          "/repos/saasvala/apk-factory/contents/build-apk.sh"
        );
        const scriptBody: any = {
          message: "Add APK build script",
          content: encodedScript,
        };
        if (scriptCheck.ok) {
          const existing = await scriptCheck.json();
          scriptBody.sha = existing.sha;
          scriptBody.message = "Update APK build script";
        } else {
          await scriptCheck.text();
        }

        await gh("/repos/saasvala/apk-factory/contents/build-apk.sh", {
          method: "PUT",
          body: JSON.stringify(scriptBody),
        });

        return respond({
          success: true,
          message: "✅ APK Factory repo created with GitHub Actions workflow",
          repo_url: "https://github.com/saasvala/apk-factory",
        });
      }

      // ═══════════════════════════════════════
      // Trigger: Dispatch APK build for a repo
      // ═══════════════════════════════════════
      case "trigger_build": {
        const { slug, repo_url, product_id, callback_url, trace_id, idempotency_key, queue_id } = data || {};
        if (!slug)
          return respond({ error: "slug required" }, 400);

        const targetRepo =
          repo_url || `https://github.com/saasvala/${slug}`;

        // Trigger workflow dispatch
        const dispatchRes = await gh(
          "/repos/saasvala/apk-factory/actions/workflows/build-apk.yml/dispatches",
          {
            method: "POST",
            body: JSON.stringify({
              ref: "main",
              inputs: {
                repo_url: targetRepo,
                app_slug: slug,
                package_name: `com.saasvala.${slug.replace(/-/g, "_")}`,
                product_id: product_id || "",
                trace_id: trace_id || "",
                supabase_url: supabaseUrl,
              },
            }),
          }
        );

        if (!dispatchRes.ok) {
          const err = await dispatchRes.text();
          return respond(
            {
              error: `Failed to trigger build: ${err}`,
              status: dispatchRes.status,
            },
            500
          );
        }

        return respond({
          success: true,
          slug,
          repo_url: targetRepo,
          status: "building",
          trace_id: trace_id || null,
          idempotency_key: idempotency_key || null,
          queue_id: queue_id || null,
          message: `🔧 APK build triggered via GitHub Actions for ${slug}`,
        });
      }

      // ═══════════════════════════════════════
      // Check build status
      // ═══════════════════════════════════════
      case "check_build_status": {
        const { slug } = data || {};

        // Get recent workflow runs
        const runsRes = await gh(
          `/repos/saasvala/apk-factory/actions/workflows/build-apk.yml/runs?per_page=10`
        );

        if (!runsRes.ok) {
          const err = await runsRes.text();
          return respond({ error: `Failed to check status: ${err}` }, 500);
        }

        const runsData = await runsRes.json();
        const runs = (runsData.workflow_runs || []).map((r: any) => ({
          id: r.id,
          status: r.status,
          conclusion: r.conclusion,
          created_at: r.created_at,
          updated_at: r.updated_at,
          head_branch: r.head_branch,
          display_title: r.display_title,
        }));

        // If slug provided, try to find matching run
        let matchedRun = null;
        if (slug) {
          matchedRun = runs.find(
            (r: any) =>
              r.display_title?.includes(slug) || r.head_branch === "main"
          );
        }

        return respond({
          success: true,
          runs,
          matched_run: matchedRun,
          total_runs: runsData.total_count,
        });
      }

      // ═══════════════════════════════════════
      // Callback: APK build complete (called by workflow)
      // ═══════════════════════════════════════
      case "build_complete": {
        // Verify shared-secret to prevent unauthorized callback abuse
        if (apkCallbackSecret) {
          const providedSecret = req.headers.get("x-callback-secret") ?? "";
          if (providedSecret !== apkCallbackSecret) {
            return respond({ error: "Unauthorized callback" }, 401);
          }
        }

        const {
          slug: completeSlug,
          apk_path,
          status: buildStatus,
          error: buildError,
          product_id: pid,
        } = data || {};

        if (!completeSlug)
          return respond({ error: "slug required" }, 400);

        const callbackPayload = {
          action: "factory_build_callback",
          data: {
            slug: completeSlug,
            product_id: pid || null,
            apk_path: apk_path || null,
            status: buildStatus || "failed",
            error: buildError || null,
            trace_id: data?.trace_id || null,
          },
        };

        const internalToken = Deno.env.get("APK_PIPELINE_INTERNAL_TOKEN") || "";

        const pipelineRes = await fetch(`${supabaseUrl}/functions/v1/auto-apk-pipeline`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
            "x-internal-token": internalToken,
          },
          body: JSON.stringify(callbackPayload),
        });

        const pipelineJson = await pipelineRes.json().catch(() => ({}));

        if (!pipelineRes.ok) {
          return respond({
            success: false,
            error: "Failed forwarding callback to canonical pipeline",
            details: pipelineJson,
          }, 500);
        }

        return respond({
          success: buildStatus === "success",
          message: buildStatus === "success"
            ? `✅ Build callback forwarded for ${completeSlug}`
            : `❌ Failed build callback forwarded for ${completeSlug}`,
          pipeline: pipelineJson,
        });
      }

      default:
        return respond({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  function respond(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateWorkflowYaml(supabaseUrl: string, supabaseAnonKey: string, callbackSecret = ""): string {
  // Only allow alphanumeric and simple punctuation in the secret to prevent
  // shell injection in the generated YAML/bash workflow template.
  const safeSecret = callbackSecret.replace(/[^a-zA-Z0-9_\-]/g, "");
  return `name: Build APK
on:
  workflow_dispatch:
    inputs:
      repo_url:
        description: 'GitHub repo URL to build'
        required: true
      app_slug:
        description: 'App slug name'
        required: true
      package_name:
        description: 'Android package name'
        required: true
        default: 'com.saasvala.app'
      product_id:
        description: 'Product ID in database'
        required: false
      trace_id:
        description: 'Pipeline trace id'
        required: false
      supabase_url:
        description: 'Supabase URL for callback'
        required: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    steps:
      - name: Checkout factory
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Clone target repo
        run: |
          git clone \${{ github.event.inputs.repo_url }} target-app
          cd target-app
          echo "Repo cloned: \${{ github.event.inputs.app_slug }}"
          ls -la

      - name: Install dependencies & build
        run: |
          cd target-app
          if [ -f "package.json" ]; then
            npm install --legacy-peer-deps 2>/dev/null || npm install --force 2>/dev/null || echo "npm install failed, trying yarn"
            if [ -f "yarn.lock" ]; then
              yarn install 2>/dev/null || echo "yarn install failed"
            fi
            npm run build 2>/dev/null || npx vite build 2>/dev/null || echo "Build step skipped"
          fi

      - name: Setup Capacitor
        run: |
          cd target-app
          npm install @capacitor/core @capacitor/cli @capacitor/android --legacy-peer-deps 2>/dev/null || npm install @capacitor/core @capacitor/cli @capacitor/android --force
          
          # Initialize Capacitor
          npx cap init "\${{ github.event.inputs.app_slug }}" "\${{ github.event.inputs.package_name }}" --web-dir dist 2>/dev/null || \\
          npx cap init "\${{ github.event.inputs.app_slug }}" "\${{ github.event.inputs.package_name }}" --web-dir build 2>/dev/null || \\
          npx cap init "\${{ github.event.inputs.app_slug }}" "\${{ github.event.inputs.package_name }}" --web-dir public 2>/dev/null || \\
          echo "Cap init with fallback"
          
          # Ensure web dir exists
          if [ ! -d "dist" ] && [ ! -d "build" ]; then
            mkdir -p dist
            echo "<html><head><title>\${{ github.event.inputs.app_slug }}</title></head><body><h1>\${{ github.event.inputs.app_slug }}</h1><p>Software Vala Product</p></body></html>" > dist/index.html
          fi
          
          npx cap add android
          npx cap sync

      - name: Configure signing materials
        run: |
          if [ -n "\${{ secrets.ANDROID_KEYSTORE_BASE64 }}" ]; then
            umask 077
            KEYSTORE_FILE="$(mktemp /tmp/release-keystore-XXXXXX.jks)"
            echo "\${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > "$KEYSTORE_FILE"
            echo "KEYSTORE_PATH=$KEYSTORE_FILE" >> $GITHUB_ENV
            echo "KEYSTORE_READY=true" >> $GITHUB_ENV
          else
            echo "KEYSTORE_READY=false" >> $GITHUB_ENV
          fi

      - name: Build APK
        run: |
          cd target-app/android
          chmod +x gradlew
          if [ "$KEYSTORE_READY" = "true" ]; then
            ./gradlew assembleRelease \
              -Pandroid.injected.signing.store.file=$KEYSTORE_PATH \
              -Pandroid.injected.signing.store.password="\${{ secrets.ANDROID_KEYSTORE_PASSWORD }}" \
              -Pandroid.injected.signing.key.alias="\${{ secrets.ANDROID_KEY_ALIAS }}" \
              -Pandroid.injected.signing.key.password="\${{ secrets.ANDROID_KEY_PASSWORD }}" \
              --no-daemon
          else
            # Fallback keeps the build moving when signing secrets are unavailable; output signing depends on project Gradle config.
            ./gradlew assembleRelease --no-daemon
          fi
          
          # Find the release APK
          APK_PATH=\$(find . -path "*/outputs/apk/release/*.apk" -type f | head -1)
          if [ -n "$APK_PATH" ]; then
            cp "$APK_PATH" /tmp/\${{ github.event.inputs.app_slug }}.apk
            echo "APK_BUILT=true" >> $GITHUB_ENV
            echo "APK built: $APK_PATH"
            ls -la "$APK_PATH"
          else
            echo "APK_BUILT=false" >> $GITHUB_ENV
            echo "No APK found!"
          fi

      - name: Upload APK artifact
        if: env.APK_BUILT == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: \${{ github.event.inputs.app_slug }}-apk
          path: /tmp/\${{ github.event.inputs.app_slug }}.apk
          retention-days: 30

      - name: Notify build complete
        if: always()
        run: |
          SUPABASE_URL="\${{ github.event.inputs.supabase_url }}"
          if [ -z "$SUPABASE_URL" ]; then
            SUPABASE_URL="${supabaseUrl}"
          fi
          
          if [ "\${{ env.APK_BUILT }}" = "true" ]; then
            STATUS="success"
          else
            STATUS="failed"
          fi
          
          curl -s -X POST "$SUPABASE_URL/functions/v1/apk-factory" \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer ${supabaseAnonKey}" \\
            -H "x-callback-secret: ${safeSecret}" \\
            -d "{
              \\"action\\": \\"build_complete\\",
              \\"data\\": {
                \\"slug\\": \\"\${{ github.event.inputs.app_slug }}\\",
                \\"status\\": \\"$STATUS\\",
                \\"product_id\\": \\"\${{ github.event.inputs.product_id }}\\",
                \\"trace_id\\": \\"\${{ github.event.inputs.trace_id }}\\",
                \\"apk_path\\": \\"\${{ github.event.inputs.app_slug }}/release.apk\\"
              }
            }" || echo "Callback failed"
`;
}

function generateBuildScript(): string {
  return `#!/bin/bash
# APK Factory Build Script
# Usage: ./build-apk.sh <repo_url> <app_slug> <package_name>

set -euo pipefail

REPO_URL=\${1:?"Usage: ./build-apk.sh <repo_url> <app_slug> <package_name>"}
APP_SLUG=\${2:?"App slug required"}
PACKAGE_NAME=\${3:-"com.saasvala.\${APP_SLUG//-/_}"}

echo "Building APK for: $APP_SLUG"
echo "   Repo: $REPO_URL"
echo "   Package: $PACKAGE_NAME"

# Clone
git clone "$REPO_URL" "build-$APP_SLUG"
cd "build-$APP_SLUG"

# Install & Build
npm install --legacy-peer-deps 2>/dev/null || npm install --force
npm run build 2>/dev/null || npx vite build 2>/dev/null || echo "Build skipped"

# Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android --legacy-peer-deps
npx cap init "$APP_SLUG" "$PACKAGE_NAME" --web-dir dist
npx cap add android
npx cap sync

# Build APK
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon

echo "APK built for $APP_SLUG"
find . -name "*.apk" -type f
`;
}
