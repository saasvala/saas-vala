import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PIPELINE_ORDER, buildPipelineIdempotencyKey, normalizePipelineState } from "./pipeline-shared.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
};


  }
  return { ok: true, payload: { ai_model: ai.model, security_gate: "passed", fallback_used: ai.fallbackUsed } };
}


  }
  return { ok: true, payload: { license_key: licenseKey, offline_lock: true } };
}



    return respond({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    return respond({ error: err?.message || "Internal error" }, 500);
  }
});
