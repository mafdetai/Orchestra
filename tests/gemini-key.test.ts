import { describe, it, expect } from "vitest";

describe("Gemini API Key validation", () => {
  const runLiveGeminiTest = process.env.RUN_LIVE_GEMINI_TEST === "true";

  it("GEMINI_API_KEY env var should be set", () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key).toBeTruthy();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
  });

  (runLiveGeminiTest ? it : it.skip)("Gemini API should respond to a simple request", async () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with just the word: OK" }] }],
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(0);
  }, 15000);
});
