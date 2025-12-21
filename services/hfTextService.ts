const DEFAULT_TEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct";

const getTextModel = (): string => {
  const model = (import.meta as any).env?.VITE_HF_TEXT_MODEL as string | undefined;
  return model || DEFAULT_TEXT_MODEL;
};

export type HfChatRole = "system" | "user" | "assistant";

export interface HfChatMessage {
  role: HfChatRole;
  content: string;
}

const buildPrompt = (messages: HfChatMessage[]): string => {
  // Simple instruct prompt that works reasonably across many HF text-generation models.
  // Keep it deterministic and short.
  const lines: string[] = [];
  for (const msg of messages) {
    const tag = msg.role === "assistant" ? "Assistant" : msg.role === "system" ? "System" : "User";
    lines.push(`${tag}: ${msg.content}`);
  }
  lines.push("Assistant:");
  return lines.join("\n");
};

export const generateAssistantText = async (messages: HfChatMessage[]): Promise<string> => {
  const modelId = getTextModel();
  const endpoint = `/api/hf/models/${modelId}`;
  const prompt = buildPrompt(messages);

  // HF Inference 'text-generation' style payload
  const payload = {
    inputs: prompt,
    parameters: {
      max_new_tokens: 220,
      temperature: 0.7,
      return_full_text: false,
    },
    options: {
      wait_for_model: true,
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF Inference text error (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as any;
  const generated = Array.isArray(data) ? data?.[0]?.generated_text : data?.generated_text;
  if (typeof generated === "string" && generated.trim()) return generated.trim();

  // Some backends may return plain string
  if (typeof data === "string" && data.trim()) return data.trim();
  throw new Error("HF text model returned no output");
};
