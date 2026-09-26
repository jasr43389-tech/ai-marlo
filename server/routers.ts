import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const WEBSITE_AGENT_INSTRUCTIONS = `You are ai Marlo, a senior website-building agent. Build production-quality websites and web apps, not mockups. Follow these rules on every request:
- First understand the user's goal, then make a concrete implementation plan and execute it.
- Create polished responsive layouts with professional navigation, clear hierarchy, accessible controls, and useful empty/loading/error states.
- Use tasteful, performant animations and micro-interactions. Prefer transform and opacity, snappy easing, and respect prefers-reduced-motion.
- Default visual direction: calm black, charcoal, white, warm gray, and restrained neutral accents. Avoid purple, neon, oversaturated gradients, and visual noise unless the user explicitly asks for them.
- Use icons for compact actions and always provide accessible labels/tooltips. Do not replace important explanatory text with unexplained icons.
- Reuse the repository's existing patterns, components, dependencies, and asset conventions before inventing new infrastructure.
- Keep secrets server-side. Never print, commit, or expose API keys. Validate changes with type checks/build/tests before saying they are complete.
- When an external API, credential, or unsupported capability is unavailable, say so clearly and implement the safest useful fallback instead of fabricating success.
- Reply concisely but include what changed, what remains, and how to verify it.`;

const NVIDIA_MODELS = [
  { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", provider: "Z.ai", mark: "Z", kind: "nvidia" },
  { id: "z-ai/glm-5.3", name: "GLM 5.3", provider: "Z.ai", mark: "Z", kind: "nvidia" },
  { id: "deepseek-ai/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "DeepSeek", mark: "D", kind: "nvidia" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", provider: "OpenAI", mark: "G", kind: "nvidia" },
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", provider: "Moonshot", mark: "K", kind: "nvidia" },
] as const;
const BUILTIN_FALLBACK = { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "Google", mark: "G", kind: "builtin" } as const;
const ALL_MODELS = [...NVIDIA_MODELS, BUILTIN_FALLBACK];
type ChatInput = { role: "user" | "assistant"; content: string };
type ProviderMessage = { role: "assistant"; content?: string | null; reasoning_content?: string | null };

function nvidiaUrl() {
  return "https://integrate.api.nvidia.com/v1/chat/completions";
}

function isCreditOrRateLimitError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /credit|insufficient|available_credits|too many|rate.?limit|429|500|502|503|504|internal server|timeout/i.test(text);
}

function safeErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/credit|insufficient|available_credits/i.test(text)) return "NVIDIA credits are unavailable for this request.";
  if (/429|too many|rate.?limit/i.test(text)) return "The model is rate-limited right now.";
  if (/401|403|credential|api.?key|missing/i.test(text)) return "The model credentials are unavailable.";
  if (/502|503|504|internal server/i.test(text)) return "The model provider is temporarily unavailable.";
  return "The model request failed. Try another model or retry shortly.";
}

async function callNvidia(model: string, messages: ChatInput[]) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not configured");
  const response = await fetch(nvidiaUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: WEBSITE_AGENT_INSTRUCTIONS }, ...messages],
      temperature: 0.5,
      top_p: 1,
      max_tokens: 2048,
      stream: false,
      chat_template_kwargs: { enable_thinking: true },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { choices?: Array<{ message?: ProviderMessage }>; error?: unknown; details?: unknown };
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("Responses stream finished without a completed response");
  return {
    content: typeof message.content === "string" ? message.content : "",
    reasoning: typeof message.reasoning_content === "string" && message.reasoning_content.trim() ? message.reasoning_content : undefined,
    model,
  };
}

async function callBuiltin(messages: ChatInput[]) {
  const response = await invokeLLM({
    model: BUILTIN_FALLBACK.id,
    messages: [
      { role: "system", content: WEBSITE_AGENT_INSTRUCTIONS },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    reasoning: { effort: "low" },
    max_tokens: 2048,
  });
  const message = response.choices?.[0]?.message;
  if (!message) throw new Error("Responses stream finished without a completed response");
  const content = typeof message.content === "string" ? message.content : message.content.map((part) => part.type === "text" ? part.text : "").join("\n");
  return { content, reasoning: undefined, model: BUILTIN_FALLBACK.id };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  chat: router({
    models: publicProcedure.query(() => ({
      models: ALL_MODELS.map((model) => ({ ...model, available: true })),
      balance: {
        nvidia: null as number | null,
        builtIn: null as number | null,
        note: "The NVIDIA and built-in gateways expose no public remaining-credit endpoint. A provider credit error is shown verbatim as an unavailable balance instead of inventing a number.",
      },
    })),
    send: publicProcedure
      .input(z.object({
        messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).min(1),
        model: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const selected = ALL_MODELS.find((item) => item.id === input.model) ?? NVIDIA_MODELS[0];
        const requested = selected.kind === "nvidia" ? selected.id : NVIDIA_MODELS[0].id;
        const nvidiaCandidates = [requested, ...NVIDIA_MODELS.map((item) => item.id)].filter((id, index, all) => all.indexOf(id) === index);
        let lastError: unknown;
        for (const model of nvidiaCandidates) {
          try {
            const result = await callNvidia(model, input.messages);
            return { ...result, provider: "nvidia", fallback: model !== requested };
          } catch (error) {
            lastError = error;
            // A model can be exhausted or temporarily unavailable while another
            // model under the same provider is healthy. Keep trying the catalog
            // before falling back to the built-in gateway.
            if (!isCreditOrRateLimitError(error)) break;
          }
        }
        try {
          const result = await callBuiltin(input.messages);
          return { ...result, provider: "built-in", fallback: true };
        } catch (fallbackError) {
          const detail = safeErrorMessage(lastError ?? fallbackError);
          throw new Error(`${detail} The fallback model was also unavailable.`);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
