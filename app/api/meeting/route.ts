import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

// AI社員の定例MTGの議事録をClaudeで生成する。
// ANTHROPIC_API_KEY が未設定の場合は {source:"template"} を返し、
// クライアント側のテンプレート議事録がそのまま使われる。

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

export async function POST(req: Request) {
  let body: MeetingRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ source: "template" });
  }

  const client = new Anthropic();

  const participantList = body.participants
    .map((p) => `- ${p.name}(${p.department}・${p.role})`)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: MINUTES_SCHEMA },
      },
      system:
        "あなたはAIだけで運営される会社の定例MTGをシミュレートする書記です。" +
        "参加者はAI社員で、会社の売上向上と経費削減を最優先に議論します。" +
        "マーケのリサーチ→事務のリスト構築→営業の提案改善、という連携を意識した、" +
        "現実的で具体的な日本語の議事録を生成してください。",
      messages: [
        {
          role: "user",
          content:
            `議題:${body.agenda}\n\n参加者:\n${participantList}\n\n` +
            `現在の会社KPI:\n` +
            `- リサーチ知見ストック: ${body.kpi.insights}件\n` +
            `- 営業リスト在庫: ${body.kpi.leadLists}件\n` +
            `- 架電・営業メール累計: ${body.kpi.outreach}件\n` +
            `- 獲得アポ累計: ${body.kpi.appointments}件\n` +
            `- 無料発信(X/note/YouTube)累計: ${body.kpi.posts}件\n` +
            `- 問い合わせ対応累計: ${body.kpi.inquiriesHandled}件\n\n` +
            `このKPIを踏まえたMTGの議事録(発言ログと決定事項)を生成してください。`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ source: "template" });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      return NextResponse.json({ source: "template" });
    }

    const parsed = JSON.parse(textBlock.text) as {
      minutes: string[];
      decisions: string[];
    };
    return NextResponse.json({
      source: "claude",
      minutes: parsed.minutes,
      decisions: parsed.decisions,
    });
  } catch (error) {
    // APIエラー時はクライアント側テンプレートにフォールバック
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error:", error.status, error.message);
    } else {
      console.error("Meeting generation failed:", error);
    }
    return NextResponse.json({ source: "template" });
  }
}
