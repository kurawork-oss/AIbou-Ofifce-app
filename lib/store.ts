"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActivityEntry,
  ApprovalRequest,
  Artifact,
  Employee,
  EmployeeTask,
  Kpi,
  MeetingMinutes,
} from "./types";
import {
  COMPANY_NAMES,
  DEPARTMENTS,
  EXPENSE_REQUESTS,
  GAMES,
  HIRE_CANDIDATES,
  MEETING_AGENDAS,
  SEED_EMPLOYEES,
  TASK_TEMPLATES,
  TOOL_REQUESTS,
  type TaskTemplate,
} from "./data";
import { saveCompanySnapshot, syncActivityDiff } from "./sync";

const SNAPSHOT_INTERVAL = 20; // このtick数ごとにSupabaseへスナップショット保存

const MEETING_INTERVAL = 60; // このtick数ごとに定例MTG
const MEETING_DURATION = 6;
const MAX_ACTIVITY = 120;
const MAX_PENDING_APPROVALS = 3;

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function makeTask(tpl: TaskTemplate): EmployeeTask {
  return {
    kind: tpl.kind,
    label: tpl.label,
    detail: pick(tpl.details),
    progress: 0,
    total: randInt(tpl.ticks[0], tpl.ticks[1]),
  };
}

function seedEmployees(): Employee[] {
  const now = Date.now();
  return SEED_EMPLOYEES.map((e) => ({
    ...e,
    status: "working" as const,
    statusLabel: "出社準備中",
    currentTask: null,
    joinedAt: now,
  }));
}

const initialKpi: Kpi = {
  insights: 2,
  leadLists: 1,
  outreach: 0,
  appointments: 0,
  posts: 0,
  inquiriesHandled: 0,
  strategies: 0,
};

interface CompanyState {
  employees: Employee[];
  approvals: ApprovalRequest[];
  activity: ActivityEntry[];
  meetings: MeetingMinutes[];
  artifacts: Artifact[];
  kpi: Kpi;
  tickCount: number;
  lastMeetingTick: number;
  usedToolRequests: string[];
  usedExpenseRequests: string[];
  proposedHires: string[]; // 提案済み候補者名

  tick: () => void;
  decideApproval: (
    id: string,
    approved: boolean,
    account?: { email: string; password: string }
  ) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  startMeetingNow: () => void;
  resetCompany: () => void;
}

function log(
  activity: ActivityEntry[],
  employeeId: string,
  message: string,
  category: ActivityEntry["category"]
): ActivityEntry[] {
  const entry: ActivityEntry = {
    id: uid(),
    employeeId,
    message,
    category,
    timestamp: Date.now(),
  };
  return [entry, ...activity].slice(0, MAX_ACTIVITY);
}

// 部署とKPIの状況から次のタスクを決める。仕事がなければ null(=休憩)。
function nextTaskFor(emp: Employee, kpi: Kpi): TaskTemplate | null {
  const templates = TASK_TEMPLATES[emp.department];
  if (emp.department === "sales") {
    if (kpi.leadLists > 0) {
      return pick(templates.filter((t) => t.kind === "call" || t.kind === "salesMail"));
    }
    if (kpi.insights > 0) {
      return templates.find((t) => t.kind === "proposal") ?? null;
    }
    return null; // リストも知見もない → 休憩
  }
  if (emp.department === "admin") {
    if (kpi.insights > 0 && Math.random() < 0.6) {
      return templates.find((t) => t.kind === "leadList") ?? null;
    }
    return pick(templates.filter((t) => t.kind !== "leadList"));
  }
  // marketing: 常に仕事がある
  return pick(templates);
}

function stamp(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function makeArtifact(
  emp: Employee,
  type: Artifact["type"],
  title: string,
  summary: string,
  rows?: string[][]
): Artifact {
  return {
    id: uid(),
    type,
    title,
    ownerId: emp.id,
    department: emp.department,
    createdAt: Date.now(),
    summary,
    rows,
  };
}

// タスク完了時のKPI反映。ログ用メッセージと、生成された成果物を返す。
function applyTaskEffect(
  emp: Employee,
  task: EmployeeTask,
  kpi: Kpi
): { message: string; artifact?: Artifact } {
  switch (task.kind) {
    case "research":
      kpi.insights += 1;
      return {
        message: `📚 ${task.detail} を完了。リサーチ知見が貯まりました(知見: ${kpi.insights})`,
        artifact: makeArtifact(
          emp,
          "doc",
          `リサーチメモ ${stamp()}`,
          `${task.detail}。ターゲット業界の課題と需要テーマを整理し、営業リスト作成と提案改善に使える知見としてまとめた。`
        ),
      };
    case "post":
      kpi.posts += 1;
      return {
        message: `📣 ${task.detail} を完了。無料発信 累計${kpi.posts}件`,
        artifact: makeArtifact(
          emp,
          "note",
          `発信ドラフト ${stamp()}`,
          `${task.detail}。反応データを見てテーマを調整予定。`
        ),
      };
    case "adPlan":
      return {
        message: `🗓️ ${task.detail} を完了`,
        artifact: makeArtifact(
          emp,
          "doc",
          `発信企画メモ ${stamp()}`,
          `${task.detail}。今週の発信チャネルと担当を整理。`
        ),
      };
    case "leadList": {
      let gained = 1;
      if (kpi.insights > 0) {
        kpi.insights -= 1;
        gained = 2;
      }
      kpi.leadLists += gained;
      const picks = [...COMPANY_NAMES].sort(() => Math.random() - 0.5).slice(0, 4);
      const priorities = ["高", "中", "高", "低"];
      return {
        message: `📋 ${task.detail} を完了。営業リスト +${gained}(在庫: ${kpi.leadLists})`,
        artifact: makeArtifact(
          emp,
          "spreadsheet",
          `営業リスト ${stamp()}`,
          `${task.detail}。リサーチ知見${gained === 2 ? "を反映した高精度" : "なしの標準"}リスト。`,
          [
            ["社名", "優先度", "状態", "メモ"],
            ...picks.map((c, i) => [
              c,
              priorities[i],
              "未接触",
              i === 0 ? "ニーズ強め・最優先" : "リサーチ知見より抽出",
            ]),
          ]
        ),
      };
    }
    case "inquiry":
      kpi.inquiriesHandled += 1;
      return {
        message: `💬 ${task.detail} を完了(対応累計: ${kpi.inquiriesHandled})`,
      };
    case "mailSort":
      return { message: `🗂️ ${task.detail} を完了` };
    case "call":
    case "salesMail": {
      if (kpi.leadLists > 0) kpi.leadLists -= 1;
      kpi.outreach += 1;
      const rate = Math.min(0.25 + kpi.strategies * 0.05, 0.6);
      if (Math.random() < rate) {
        kpi.appointments += 1;
        const company = task.detail.split("へ")[0];
        return {
          message: `🎉 ${task.detail} → アポ獲得!(累計アポ: ${kpi.appointments})`,
          artifact: makeArtifact(
            emp,
            "report",
            `アポ獲得報告:${company}`,
            `${task.detail}の結果、商談アポを獲得。日程調整メモと先方の関心ポイントを記録。`
          ),
        };
      }
      return { message: `📞 ${task.detail} → 今回は見送り。次に活かします` };
    }
    case "proposal": {
      if (kpi.insights > 0) kpi.insights -= 1;
      kpi.strategies += 1;
      return {
        message: `✨ ${task.detail} を完了。提案の質が向上(戦略レベル: ${kpi.strategies})`,
        artifact: makeArtifact(
          emp,
          "doc",
          `提案資料 v${kpi.strategies} ${stamp()}`,
          `${task.detail}。MTG決定事項とリサーチ知見を反映した最新版。`
        ),
      };
    }
    default:
      return { message: `✅ ${task.detail} を完了` };
  }
}

function buildMeetingMinutes(
  participants: Employee[],
  kpi: Kpi,
  agenda: string
): { minutes: string[]; decisions: string[] } {
  const byDept = (d: string) =>
    participants.find((p) => p.department === d)?.name ?? "担当";
  const minutes = [
    `【司会】${byDept("marketing")}:「${agenda}」を開始します。`,
    `${byDept("marketing")}:直近のリサーチ知見は${kpi.insights}件。発信は累計${kpi.posts}件で、業界の反応から需要のあるテーマが見えてきました。`,
    `${byDept("admin")}:営業リストの在庫は${kpi.leadLists}件です。リサーチ知見を反映して、ニーズの強い業界を優先してリスト化します。`,
    `${byDept("sales")}:架電・メールは累計${kpi.outreach}件、アポは${kpi.appointments}件。MTGで決めた切り口を提案トークに反映します。`,
  ];
  const decisions = [
    "マーケの最新リサーチをもとに事務がターゲットリストを更新する",
    "営業はニーズ別の提案パターンをブラッシュアップして次週のアポ率を上げる",
    "無料発信は反応の良いテーマへ集中する",
  ];
  return { minutes, decisions };
}

// MTG終了後、/api/meeting でClaudeによる議事録生成を試みる。
// APIキー未設定・エラー時はテンプレート議事録のまま(フォールバック)。
async function enhanceMinutes(
  meetingId: string,
  agenda: string,
  participants: { name: string; role: string; department: string }[],
  kpi: Kpi
): Promise<void> {
  try {
    const res = await fetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agenda, participants, kpi }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      source: string;
      minutes?: string[];
      decisions?: string[];
    };
    if (data.source === "template" || !data.minutes || !data.decisions) return;
    useCompanyStore.setState((s) => ({
      meetings: s.meetings.map((m) =>
        m.id === meetingId
          ? { ...m, minutes: data.minutes!, decisions: data.decisions! }
          : m
      ),
    }));
  } catch {
    // ネットワークエラー等はテンプレート議事録のまま
  }
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set, get) => ({
      employees: seedEmployees(),
      approvals: [],
      activity: [],
      meetings: [],
      artifacts: [],
      kpi: { ...initialKpi },
      tickCount: 0,
      lastMeetingTick: 0,
      usedToolRequests: [],
      usedExpenseRequests: [],
      proposedHires: [],

      tick: () => {
        const s = get();
        const kpi: Kpi = { ...s.kpi };
        let activity = s.activity;
        let approvals = s.approvals.slice();
        const meetings = s.meetings.slice();
        const tickCount = s.tickCount + 1;
        let lastMeetingTick = s.lastMeetingTick;
        const usedToolRequests = s.usedToolRequests.slice();
        const usedExpenseRequests = s.usedExpenseRequests.slice();
        const proposedHires = s.proposedHires.slice();
        let artifacts = s.artifacts;

        let employees = s.employees.map((e) => ({ ...e }));

        // --- 進行中MTGの処理 ---
        const currentMeeting = meetings.find((m) => m.status === "in_progress");
        if (currentMeeting) {
          // MTGの進行は司会(先頭参加者)のタスクprogressで管理する
          const chair = employees.find(
            (e) => e.id === currentMeeting.participantIds[0]
          );
          if (chair?.currentTask && chair.currentTask.kind === "mtg") {
            chair.currentTask.progress += 1;
            if (chair.currentTask.progress >= chair.currentTask.total) {
              // MTG終了:議事録確定、参加者を解放
              const participants = employees.filter((e) =>
                currentMeeting.participantIds.includes(e.id)
              );
              const built = buildMeetingMinutes(
                participants,
                kpi,
                currentMeeting.agenda
              );
              currentMeeting.minutes = built.minutes;
              currentMeeting.decisions = built.decisions;
              currentMeeting.status = "done";
              currentMeeting.endedAt = Date.now();
              kpi.strategies += 1;
              if (chair) {
                artifacts = [
                  makeArtifact(
                    chair,
                    "report",
                    `議事録:${currentMeeting.agenda}`,
                    `決定事項: ${built.decisions.join(" / ")}`
                  ),
                  ...artifacts,
                ].slice(0, 80);
              }
              for (const p of participants) {
                p.status = "working";
                p.statusLabel = "MTG内容を反映中";
                p.currentTask = null;
              }
              activity = log(
                activity,
                currentMeeting.participantIds[0],
                `🤝 「${currentMeeting.agenda}」が終了。決定事項${built.decisions.length}件を各部署へ展開(戦略レベル: ${kpi.strategies})`,
                "meeting"
              );
              // ANTHROPIC_API_KEY があればClaudeがリアルな議事録に差し替える
              void enhanceMinutes(
                currentMeeting.id,
                currentMeeting.agenda,
                participants.map((p) => ({
                  name: p.name,
                  role: p.role,
                  department: DEPARTMENTS[p.department].name,
                })),
                { ...kpi }
              );
            }
          }
        }

        // --- 定例MTGの開始 ---
        if (!currentMeeting && tickCount - lastMeetingTick >= MEETING_INTERVAL) {
          lastMeetingTick = tickCount;
          const agenda = pick(MEETING_AGENDAS);
          const participantIds: string[] = [];
          for (const dept of ["marketing", "admin", "sales"] as const) {
            const member = employees.find(
              (e) => e.department === dept && e.status !== "meeting"
            );
            if (member) participantIds.push(member.id);
          }
          if (participantIds.length >= 2) {
            const meeting: MeetingMinutes = {
              id: uid(),
              title: agenda,
              participantIds,
              startedAt: Date.now(),
              endedAt: null,
              agenda,
              minutes: [],
              decisions: [],
              status: "in_progress",
            };
            meetings.unshift(meeting);
            for (const id of participantIds) {
              const e = employees.find((x) => x.id === id)!;
              e.status = "meeting";
              e.statusLabel = "MTG中";
              e.currentTask = {
                kind: "mtg",
                label: "定例MTG",
                detail: agenda,
                progress: 0,
                total: MEETING_DURATION,
              };
            }
            activity = log(
              activity,
              participantIds[0],
              `🤝 「${agenda}」を開始(参加: ${participantIds.length}名)`,
              "meeting"
            );
          }
        }

        // --- 各社員の業務進行 ---
        for (const emp of employees) {
          if (emp.status === "meeting") continue;

          // 休憩中:仕事が発生していれば復帰
          if (emp.status === "break") {
            const tpl = nextTaskFor(emp, kpi);
            if (tpl) {
              emp.status = "working";
              emp.statusLabel = tpl.statusLabel;
              emp.currentTask = makeTask(tpl);
              activity = log(
                activity,
                emp.id,
                `🔔 仕事が入ったため休憩を切り上げ、「${emp.currentTask.label}」を開始`,
                "work"
              );
            }
            continue;
          }

          // タスク未割り当て → 割り当て or 休憩へ
          if (!emp.currentTask) {
            const tpl = nextTaskFor(emp, kpi);
            if (tpl) {
              emp.status = "working";
              emp.statusLabel = tpl.statusLabel;
              emp.currentTask = makeTask(tpl);
            } else {
              emp.status = "break";
              const game = pick(GAMES);
              emp.statusLabel = `休憩中(${game}をプレイ)`;
              activity = log(
                activity,
                emp.id,
                `🎮 手持ちの仕事がないため休憩スペースへ。${game}で息抜き中`,
                "break"
              );
            }
            continue;
          }

          // タスク進行
          emp.currentTask.progress += 1;
          if (emp.currentTask.progress >= emp.currentTask.total) {
            const result = applyTaskEffect(emp, emp.currentTask, kpi);
            activity = log(activity, emp.id, result.message, "work");
            if (result.artifact) {
              artifacts = [result.artifact, ...artifacts].slice(0, 80);
            }
            emp.currentTask = null;
            emp.statusLabel = "次の業務を確認中";
          }
        }

        // --- 申請の自動生成 ---
        const pendingCount = approvals.filter((a) => a.status === "pending").length;
        if (pendingCount < MAX_PENDING_APPROVALS) {
          // ツール申請
          const availableTools = TOOL_REQUESTS.filter(
            (t) => !usedToolRequests.includes(t.toolName)
          );
          if (availableTools.length > 0 && Math.random() < 0.03) {
            const tool = pick(availableTools);
            const requester = pick(employees);
            usedToolRequests.push(tool.toolName);
            approvals = [
              {
                id: uid(),
                type: "tool",
                title: `ツール利用申請:${tool.toolName}`,
                description: `${tool.purpose}。追加方法:${tool.howToAdd}`,
                requesterId: requester.id,
                status: "pending",
                createdAt: Date.now(),
                decidedAt: null,
                tool,
              },
              ...approvals,
            ];
            activity = log(
              activity,
              requester.id,
              `📨 代表へ「${tool.toolName}」の利用申請を提出しました`,
              "approval"
            );
          }

          // 経費申請
          const availableExpenses = EXPENSE_REQUESTS.filter(
            (t) => !usedExpenseRequests.includes(t.itemName)
          );
          if (availableExpenses.length > 0 && Math.random() < 0.015) {
            const expense = pick(availableExpenses);
            const requester = pick(employees);
            usedExpenseRequests.push(expense.itemName);
            approvals = [
              {
                id: uid(),
                type: "expense",
                title: `経費申請:${expense.itemName}(月額${expense.monthlyCost.toLocaleString()}円)`,
                description: `無料代替の検討:${expense.freeAlternativeConsidered} 有料が良い理由:${expense.whyPaidIsBetter}`,
                requesterId: requester.id,
                status: "pending",
                createdAt: Date.now(),
                decidedAt: null,
                expense,
              },
              ...approvals,
            ];
            activity = log(
              activity,
              requester.id,
              `📨 代表へ経費申請「${expense.itemName}」を提出しました(無料代替を検討済み)`,
              "approval"
            );
          }

          // 社員追加提案:リスト在庫過多 or 定期的な提案
          const availableHires = HIRE_CANDIDATES.filter(
            (h) => !proposedHires.includes(h.name)
          );
          const salesOverloaded =
            kpi.leadLists >= 6 &&
            availableHires.some((h) => h.department === "sales");
          if (
            availableHires.length > 0 &&
            (salesOverloaded ? Math.random() < 0.1 : Math.random() < 0.008)
          ) {
            const candidate = salesOverloaded
              ? availableHires.find((h) => h.department === "sales")!
              : pick(availableHires);
            const proposer =
              employees.find(
                (e) =>
                  e.department === candidate.department &&
                  e.role.includes("リーダー")
              ) ?? pick(employees.filter((e) => e.department === candidate.department)) ?? pick(employees);
            proposedHires.push(candidate.name);
            approvals = [
              {
                id: uid(),
                type: "hire",
                title: `AI社員の追加提案:${candidate.name}(${candidate.role})`,
                description: candidate.reason,
                requesterId: proposer.id,
                status: "pending",
                createdAt: Date.now(),
                decidedAt: null,
                hire: candidate,
              },
              ...approvals,
            ];
            activity = log(
              activity,
              proposer.id,
              `📨 代表へAI社員の追加を提案:${candidate.name}(${DEPARTMENTS[candidate.department].name}・${candidate.role})`,
              "approval"
            );
          }
        }

        set({
          employees,
          approvals,
          activity,
          meetings: meetings.slice(0, 20),
          artifacts,
          kpi,
          tickCount,
          lastMeetingTick,
          usedToolRequests,
          usedExpenseRequests,
          proposedHires,
        });

        // Supabaseが設定されていれば記憶保管庫へ同期(fire-and-forget)
        syncActivityDiff(s.activity, activity, employees);
        if (tickCount % SNAPSHOT_INTERVAL === 0) {
          saveCompanySnapshot({
            employees,
            approvals,
            meetings: meetings.slice(0, 20),
            kpi,
            tickCount,
          });
        }
      },

      decideApproval: (id, approved, account) => {
        const s = get();
        const approvals = s.approvals.map((a) => ({ ...a }));
        const target = approvals.find((a) => a.id === id);
        if (!target || target.status !== "pending") return;

        target.status = approved ? "approved" : "rejected";
        target.decidedAt = Date.now();

        let employees = s.employees;
        let activity = s.activity;

        if (approved && target.type === "hire" && target.hire && account) {
          const h = target.hire;
          const newEmp: Employee = {
            id: uid(),
            name: h.name,
            role: h.role,
            department: h.department,
            status: "working",
            statusLabel: "入社手続き中",
            currentTask: null,
            googleEmail: account.email,
            googlePassword: account.password,
            emoji: h.emoji,
            color: h.color,
            bio: h.bio,
            joinedAt: Date.now(),
          };
          employees = [...employees, newEmp];
          activity = log(
            activity,
            newEmp.id,
            `🎊 ${h.name}が${DEPARTMENTS[h.department].name}に入社!Googleアカウント(${account.email})が付与されました`,
            "system"
          );
        } else if (target.type !== "hire") {
          const requester = employees.find((e) => e.id === target.requesterId);
          activity = log(
            activity,
            target.requesterId,
            approved
              ? `✅ 代表が「${target.title}」を許可。${requester?.name ?? "社員"}が対応を開始します`
              : `❌ 代表が「${target.title}」を未許可に。${requester?.name ?? "社員"}は無料の代替案で進めます`,
            "approval"
          );
        } else if (!approved) {
          activity = log(
            activity,
            target.requesterId,
            `❌ 代表が「${target.title}」を見送りました`,
            "approval"
          );
        }

        set({ approvals, employees, activity });
        syncActivityDiff(s.activity, activity, employees);
      },

      updateEmployee: (id, patch) => {
        set({
          employees: get().employees.map((e) =>
            e.id === id ? { ...e, ...patch } : e
          ),
        });
      },

      startMeetingNow: () => {
        set({ lastMeetingTick: get().tickCount - MEETING_INTERVAL });
      },

      resetCompany: () => {
        set({
          employees: seedEmployees(),
          approvals: [],
          activity: [],
          meetings: [],
          artifacts: [],
          kpi: { ...initialKpi },
          tickCount: 0,
          lastMeetingTick: 0,
          usedToolRequests: [],
          usedExpenseRequests: [],
          proposedHires: [],
        });
      },
    }),
    {
      name: "aibou-office-v1",
      version: 2,
      skipHydration: true,
      migrate: (persisted, version) => {
        const state = persisted as Partial<CompanyState>;
        if (version < 2) {
          state.artifacts = state.artifacts ?? [];
        }
        return state as CompanyState;
      },
    }
  )
);
