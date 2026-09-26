import { describe, expect, it } from "vitest";

describe("NVIDIA API secret", () => {
  it("can access the NVIDIA model catalog without exposing the key", async () => {
    const key = process.env.NVIDIA_API_KEY;
    expect(key, "NVIDIA_API_KEY must be configured").toBeTruthy();

    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    expect(response.ok).toBe(true);
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    expect(Array.isArray(payload.data)).toBe(true);
  }, 30_000);
});
