"use client";

import { getSupabase } from "./supabase";
import type { ActivityEntry, ApprovalRequest, Employee, Kpi, MeetingMinutes } from "./types";

// Supabaseへの同期(すべてfire-and-forget。失敗してもアプリ動作に影響しない)

// 社員の活動ログを「記憶保管庫」(employee_memories)へ書き込む。
// 各AI社員のGoogleメールアドレスに紐づくので、社員ごとの記憶として蓄積される。
export function syncActivityDiff(
  oldActivity: ActivityEntry[],
  newActivity: ActivityEntry[],
  employees: Employee[]
): void {
  const supabase = getSupabase();
  if (!supabase) return;

  const oldIds = new Set(oldActivity.map((a) => a.id));
  const fresh = newActivity.filter((a) => !oldIds.has(a.id));
  if (fresh.length === 0) return;

  const rows = fresh.map((a) => {
    const emp = employees.find((e) => e.id === a.employeeId);
    return {
      employee_id: a.employeeId,
      employee_name: emp?.name ?? "システム",
      google_email: emp?.googleEmail ?? "system@aibou.local",
      category: a.category,
      content: a.message,
      created_at: new Date(a.timestamp).toISOString(),
    };
  });

  void supabase
    .from("employee_memories")
    .insert(rows)
    .then(({ error }) => {
      if (error) console.warn("Supabase memory sync failed:", error.message);
    });
}

// 会社全体のスナップショットを保存(バックアップ・外部ダッシュボード用)
export function saveCompanySnapshot(snapshot: {
  employees: Employee[];
  approvals: ApprovalRequest[];
  meetings: MeetingMinutes[];
  kpi: Kpi;
  tickCount: number;
}): void {
  const supabase = getSupabase();
  if (!supabase) return;

  void supabase
    .from("company_state")
    .upsert(
      {
        id: 1,
        state: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .then(({ error }) => {
      if (error) console.warn("Supabase snapshot sync failed:", error.message);
    });
}
