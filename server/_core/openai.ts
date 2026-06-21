import OpenAI from "openai";
import { ENV } from "./env";

let _client: OpenAI | null = null;
function client() {
  if (!_client) _client = new OpenAI({ apiKey: ENV.openaiApiKey });
  return _client;
}

export async function chat(prompt: string, opts?: { model?: string; system?: string }): Promise<string> {
  if (!ENV.openaiApiKey) throw new Error("OPENAI_API_KEY 未設定(請填入 daily-todo-app/.env)");
  const res = await client().chat.completions.create({
    model: opts?.model ?? "gpt-4o-mini",
    messages: [
      ...(opts?.system ? [{ role: "system" as const, content: opts.system }] : []),
      { role: "user" as const, content: prompt },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
