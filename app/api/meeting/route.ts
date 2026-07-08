import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

// AI社員の定例MTGの議事録をLLMで生成する。
// プロバイダ優先順位: Gemini(無料枠あり) → Claude → テンプレート
//   - GEMINI_API_KEY     … Google AI Studio のAPIキー(無料枠で運用可能)
//   - ANTHROPIC_API_KEY  … Claude APIキー(従量課金)
// どちらも未設定なら {source:"template"} を返し、クライアント側の
// テンプレート議事録がそのまま使われる。

interface MeetingRequest {
  agenda: string;
  participants: { name: string; role: string; department: string }[];
  kpi: {
    insights: number;
    leadLists: number;
    outreach: number;
    appointments: number;
    posts: number;
    inquiriesHandled: number;
    strategies: number;
  };
}

interface MinutesResult {
  minutes: string[];
  decisions: string[];
}

const SYSTEM_PROMPT =
  "あなたはAIだけで運営される会社の定例MTGをシミュレートする書記です。" +
  "参加者はAI社員で、会社の売上向上と経費削減を最優先に議論します。" +
  "マーケのリサーチ→事務のリスト構築→営業の提案改善、という連携を意識した、" +
  "現実的で具体的な日本語の議事録を生成してください。";

function buildUserPrompt(body: MeetingRequest): string {
  const participantList = body.participants
    .map((p) => `- ${p.name}(${p.department}・${p.role})`)
    .join("\n");
  return (
    `議題:${body.agenda}\n\n参加者:\n${participantList}\n\n` +
    `現在の会社KPI:\n` +
    `- リサーチ知見ストック: ${body.kpi.insights}件\n` +
    `- 営業リスト在庫: ${body.kpi.leadLists}件\n` +
    `- 架電・営業メール累計: ${body.kpi.outreach}件\n` +
    `- 獲得アポ累計: ${body.kpi.appointments}件\n` +
    `- 無料発信(X/note/YouTube)累計: ${body.kpi.posts}件\n` +
    `- 問い合わせ対応累計: ${body.kpi.inquiriesHandled}件\n\n` +
    `このKPIを踏まえたMTGの議事録を生成してください。` +
    `minutes は「名前:発言内容」形式で6〜10行、参加者全員が最低1回発言。` +
    `decisions は具体的なアクション3〜4件。`
  );
}

function isValidResult(v: unknown): v is MinutesResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.minutes) &&
    o.minutes.length > 0 &&
    o.minutes.every((m) => typeof m === "string") &&
    Array.isArray(o.decisions) &&
    o.decisions.length > 0 &&
    o.decisions.every((d) => typeof d === "string")
  );
}

// ---------- Gemini(Google AI Studio・無料枠あり) ----------

async function generateWithGemini(
  apiKey: string,
  body: MeetingRequest
): Promise<MinutesResult | null> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(body) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              minutes: { type: "ARRAY", items: { type: "STRING" } },
              decisions: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["minutes", "decisions"],
          },
        },
      }),
    }
  );
  if (!res.ok) {
    console.error("Gemini API error:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return isValidResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------- Claude ----------

const MINUTES_SCHEMA = {
  type: "object" as const,
  properties: {
    minutes: {
      type: "array" as const,
      description:
        "MTGでの発言ログ。「名前:発言内容」形式で6〜10行。参加者全員が最低1回は発言する",
      items: { type: "string" as const },
    },
    decisions: {
      type: "array" as const,
      description: "決定事項。具体的なアクションを3〜4件",
      items: { type: "string" as const },
    },
  },
  required: ["minutes", "decisions"],
  additionalProperties: false as const,
};

async function generateWithClaude(body: MeetingRequest): Promise<MinutesResult | null> {
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: MINUTES_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    });
    if (response.stop_reason === "refusal") return null;
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return null;
    const parsed = JSON.parse(textBlock.text);
    return isValidResult(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error:", error.status, error.message);
    } else {
      console.error("Claude generation failed:", error);
    }
    return null;
  }
}

// ---------- ルート ----------

export async function POST(req: Request) {
  let body: MeetingRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // 1. Gemini(無料枠優先)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const result = await generateWithGemini(geminiKey, body);
      if (result) return NextResponse.json({ source: "gemini", ...result });
    } catch (error) {
      console.error("Gemini generation failed:", error);
    }
  }

  // 2. Claude
  if (process.env.ANTHROPIC_API_KEY) {
    const result = await generateWithClaude(body);
    if (result) return NextResponse.json({ source: "claude", ...result });
  }

  // 3. テンプレートにフォールバック
  return NextResponse.json({ source: "template" });
}
