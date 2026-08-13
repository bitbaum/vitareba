/**
 * AI provider — OpenAI-compatible chat completions over fetch.
 *
 * Health data leaves this server ONLY when all three env vars are set, which
 * is a deliberate operator act: the provider must be EU/CH-hosted and under a
 * signed data-processing agreement (GDPR Art. 28 / revFADP) — e.g. Mistral
 * (Paris), IONOS AI (Berlin), a self-hosted vLLM. US-hosted APIs without an
 * adequacy basis fail Schrems II — see lib/config/regulation.ts.
 *
 *   AI_BASE_URL  e.g. https://api.mistral.ai/v1
 *   AI_API_KEY   provider key
 *   AI_MODEL     e.g. mistral-large-latest
 */

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);
}

/**
 * Set AI_DPA_SIGNED=true once the provider is EU/CH-hosted under a signed
 * data-processing agreement. Until then AI features still run — house rule —
 * but every response carries a legal warning the UI must show.
 */
export function isAiDpaSigned(): boolean {
  return process.env.AI_DPA_SIGNED === "true";
}

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

export async function aiChat({
  system,
  user,
  maxTokens = 900,
}: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<AiResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI provider not configured" };
  }

  try {
    const res = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[ai] provider returned ${res.status}:`, body.slice(0, 300));
      return { ok: false, error: `AI provider error (${res.status})` };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: "AI provider returned an empty response" };
    return { ok: true, text };
  } catch (err) {
    console.error("[ai] request failed:", err);
    return { ok: false, error: "AI provider unreachable" };
  }
}
