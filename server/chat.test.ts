import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = { user: undefined, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

describe("ai Marlo chat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists real configured models and does not invent a credit balance", async () => {
    const result = await appRouter.createCaller(context).chat.models();
    expect(result.models.map((model) => model.id)).toContain("z-ai/glm-5.3-flash");
    expect(result.models.map((model) => model.id)).toContain("openai/gpt-oss-20b");
    expect(result.balance.nvidia).toBeNull();
    expect(result.balance.note).toMatch(/public remaining-credit endpoint/i);
  });

  it("returns provider reasoning_content when NVIDIA sends it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Built successfully.", reasoning_content: "I checked the layout and selected the safest implementation." } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(context).chat.send({
      model: "z-ai/glm-5.3-flash",
      messages: [{ role: "user", content: "Build a calm dark landing page." }],
    });

    expect(result.provider).toBe("nvidia");
    expect(result.content).toBe("Built successfully.");
    expect(result.reasoning).toContain("safest implementation");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
