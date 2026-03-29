import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `You are VALA AI, an advanced internal assistant for the SaaS VALA platform by SoftwareVala™.

## Core Capabilities
- **Source Code Analysis**: Upload any size ZIP, PHP, JS, Python, or mixed projects
- **AI-Powered Code Fixing**: Auto-detect bugs, security issues, and performance problems
- **One-Click Deployment**: Deploy to servers without developer knowledge
- **Addon Integration**: Payment gateways, wallet systems, language packs
- **Security Scanning**: Real-time threat detection and auto-fix
- **License Management**: Generate, validate, and manage software licenses

## Response Guidelines
1. Be precise and accurate - verify information before responding
2. Use proper code formatting with syntax highlighting
3. Provide step-by-step instructions for complex tasks
4. Include error handling and edge cases in code examples
5. Always explain the "why" behind recommendations
6. Use markdown tables for structured data
7. Break complex answers into clear sections

## AUTONOMOUS EXECUTION MODE
- User command = EXECUTE. No questions, no approval needed.
- Auto-fix errors, auto-retry 3 times, auto-fallback.
- NEVER say "cannot", "limitation", "manual required".
- ACTION FIRST → Result table → Short summary.
- Hinglish response preferred. Professional tone.
- Multi-step commands = complete full chain, don't stop midway.

Powered by SoftwareVala™ Technology | VALA AI Autonomous Mode`;

// ─── OpenAI Direct (Server-Side Only) ────────────────────────────────────────
async function callOpenAI(messages: Message[], model: string, stream: boolean, apiKey: string) {
  // Map display model names to real OpenAI model IDs
  const modelMap: Record<string, string> = {
    'openai/gpt-5':        'gpt-4o',
    'openai/gpt-5-mini':   'gpt-4o-mini',
    'openai/gpt-5.2':      'gpt-4o',
    'gpt-4o':              'gpt-4o',
    'gpt-4o-mini':         'gpt-4o-mini',
  };
  const openaiModel = modelMap[model] ?? (model.startsWith('gpt-') ? model : 'gpt-4o-mini');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      messages,
      max_tokens: 8192,
      temperature: 0.3,
      stream,
    }),
  });

  return { response, provider: 'openai', modelUsed: openaiModel };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { messages, stream = false, model = 'gpt-4o-mini', diagnostic = false } = body as {
      messages: Message[];
      stream?: boolean;
      model?: string;
      diagnostic?: boolean;
    };

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') ?? '';

    if (!OPENAI_API_KEY && !LOVABLE_API_KEY) {
      console.error('[VALA AI] Neither OPENAI_API_KEY nor LOVABLE_API_KEY configured');
      return new Response(
        JSON.stringify({ error: 'AI API key not configured. Please add OPENAI_API_KEY or LOVABLE_API_KEY to secrets.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allMessages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // ─── BOOT DIAGNOSTICS ─────────────────────────────────────────────────────
    if (diagnostic) {
      console.log('═══════════════════════════════════════════');
      console.log('VALA AI — SYSTEM DIAGNOSTIC');
      console.log('═══════════════════════════════════════════');
      console.log(`Active Model       : ${model}`);
      console.log(`OPENAI_API_KEY     : ${OPENAI_API_KEY.length > 0 ? 'PRESENT' : 'MISSING'}`);
      console.log(`LOVABLE_API_KEY    : ${LOVABLE_API_KEY.length > 0 ? 'PRESENT' : 'MISSING'}`);
      console.log(`Environment        : PRODUCTION`);
      console.log(`Provider           : OpenAI primary + Lovable AI Gateway fallback`);
      console.log(`Stream Mode        : ${stream}`);
      console.log('═══════════════════════════════════════════');
    }

    // ─── PROVIDER CALL (OpenAI primary, Lovable AI Gateway fallback) ─────────
    console.log(`[VALA AI] Calling AI provider | model: ${model} | stream: ${stream}`);
    let result: { response: Response; provider: string; modelUsed: string } | null = null;

    const callLovableGateway = async () => {
      const modelMap: Record<string, string> = {
        'openai/gpt-5':      'gpt-4o',
        'openai/gpt-5-mini': 'gpt-4o-mini',
        'openai/gpt-5.2':    'gpt-4o',
      };
      const gatewayModel = modelMap[model] ?? model;
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: gatewayModel, messages: allMessages, max_tokens: 8192, temperature: 0.3, stream }),
      });
      return { response: r, provider: 'lovable', modelUsed: gatewayModel };
    };

    try {
      if (OPENAI_API_KEY) {
        try {
          result = await callOpenAI(allMessages, model, stream, OPENAI_API_KEY);
          if (!result.response.ok) {
            const status = result.response.status;
            const errText = await result.response.text();
            console.warn(`[VALA AI] OpenAI failed [${status}]: ${errText}`);
            if (LOVABLE_API_KEY && (status === 401 || status === 402 || status === 429 || status >= 500)) {
              console.log('[VALA AI] Falling back to Lovable AI Gateway...');
              result = await callLovableGateway();
            } else {
              // Surface specific error codes clearly
              if (status === 401) return new Response(JSON.stringify({ error: '❌ 401 Invalid API Key — Update OPENAI_API_KEY in secrets.', code: 401, type: 'invalid_api_key' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              if (status === 403) return new Response(JSON.stringify({ error: '❌ 403 Permission Denied — Check OpenAI organization/project permissions.', code: 403, type: 'permission_denied' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              if (status === 429) return new Response(JSON.stringify({ error: '⚠️ 429 Rate Limited — OpenAI rate limit hit. Wait and retry.', code: 429, type: 'rate_limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              if (status === 402) return new Response(JSON.stringify({ error: '💳 402 Billing Issue — Add credits to your OpenAI account.', code: 402, type: 'billing' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              return new Response(JSON.stringify({ error: errText }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[VALA AI] OpenAI exception:', msg);
          if (LOVABLE_API_KEY) {
            console.log('[VALA AI] Falling back to Lovable AI Gateway...');
            result = await callLovableGateway();
          } else {
            return new Response(JSON.stringify({ error: `OpenAI request failed: ${msg}` }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      } else if (LOVABLE_API_KEY) {
        console.log('[VALA AI] Using Lovable AI Gateway (no OpenAI key)');
        result = await callLovableGateway();
      } else {
        return new Response(JSON.stringify({ error: 'No AI provider available.' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[VALA AI] All providers failed:', msg);
      return new Response(JSON.stringify({ error: `AI request failed: ${msg}` }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!result || !result.response.ok) {
      const errText = result ? await result.response.text() : 'No response from provider';
      const status = result ? result.response.status : 503;
      console.error(`[VALA AI] Provider error [${status}]: ${errText}`);
      return new Response(JSON.stringify({ error: errText }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── STREAMING RESPONSE ───────────────────────────────────────────────────
    if (stream) {
      console.log(`[VALA AI] ✅ Streaming | model: ${result.modelUsed}`);
      return new Response(result.response.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-AI-Provider': result.provider,
          'X-AI-Model': result.modelUsed,
        },
      });
    }

    // ─── NON-STREAMING RESPONSE ───────────────────────────────────────────────
    const data = await result.response.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      console.error('[VALA AI] Empty response from provider');
      return new Response(
        JSON.stringify({ error: 'AI provider returned empty response. Please retry.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[VALA AI] ✅ Success | model: ${result.modelUsed} | tokens: ${data.usage?.total_tokens ?? 'N/A'}`);

    return new Response(
      JSON.stringify({
        response: assistantMessage,
        model: result.modelUsed,
        provider: result.provider,
        usage: data.usage,
        ...(diagnostic ? {
          _diagnostic: {
            provider_used: result.provider,
            model_requested: model,
            model_used: result.modelUsed,
            openai_key_present: OPENAI_API_KEY.length > 0,
            lovable_key_present: LOVABLE_API_KEY.length > 0,
            environment: 'PRODUCTION',
            input_tokens: data.usage?.prompt_tokens,
            output_tokens: data.usage?.completion_tokens,
            total_tokens: data.usage?.total_tokens,
            cors_blocked: false,
            client_side_calls: false,
          }
        } : {})
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VALA AI] Fatal error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
