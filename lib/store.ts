"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActivityEntry,
  ApprovalRequest,
  Artifact,
  CompanyProfile,
  Employee,
  EmployeeTask,
  Kpi,
  MeetingMinutes,
  ProductLine,
  SalesTargetType,
} from "./types";
import {
  COMPANY_NAMES,
  DEFAULT_COMPANY,
  DEPARTMENTS,
  EXPENSE_REQUESTS,
  GAMES,
  HIRE_CANDIDATES,
  makeDivisionTeam,
  MEETING_AGENDAS,
  PERSON_NAMES,
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

// 営業対象(法人/個人)に応じたターゲット名
function pickTargetName(target: SalesTargetType): string {
  const b2c = target === "b2c" || (target === "both" && Math.random() < 0.5);
  return b2c ? `${pick(PERSON_NAMES)}様` : pick(COMPANY_NAMES);
}

// その事業部の商材・営業対象を反映してタスクを生成
function makeTask(tpl: TaskTemplate, product: ProductLine): EmployeeTask {
  let detail = pick(tpl.details);
  if (tpl.kind === "call") {
    detail = `${pickTargetName(product.target)}へ架電・「${product.name}」のアポ打診`;
  } else if (tpl.kind === "salesMail") {
    detail = `${pickTargetName(product.target)}へ「${product.name}」の提案メールを作成・送信`;
  } else if (tpl.kind === "proposal" || tpl.kind === "research" || tpl.kind === "leadList") {
    detail = `「${product.name}」: ${detail}`;
  }
  return {
    kind: tpl.kind,
    label: tpl.label,
    detail,
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

function freshKpi(): Kpi {
  return {
    insights: 2,
    leadLists: 1,
    outreach: 0,
    appointments: 0,
    posts: 0,
    inquiriesHandled: 0,
    strategies: 0,
  };
}

// 全事業部のKPIを合算(会社全体のヘッダー表示用)
export function aggregateKpi(kpis: Record<string, Kpi>): Kpi {
  const total = {
    insights: 0,
    leadLists: 0,
    outreach: 0,
    appointments: 0,
    posts: 0,
    inquiriesHandled: 0,
    strategies: 0,
  };
  for (const k of Object.values(kpis)) {
    total.insights += k.insights;
    total.leadLists += k.leadLists;
    total.outreach += k.outreach;
    total.appointments += k.appointments;
    total.posts += k.posts;
    total.inquiriesHandled += k.inquiriesHandled;
    total.strategies += k.strategies;
  }
  return total;
}

interface CompanyState {
  company: CompanyProfile;
  employees: Employee[];
  approvals: ApprovalRequest[];
  activity: ActivityEntry[];
  meetings: MeetingMinutes[];
  artifacts: Artifact[];
  kpis: Record<string, Kpi>; // 事業部(商材)ごとのKPI
  tickCount: number;
  lastMeetingTicks: Record<string, number>; // 事業部ごとのMTGタイマー
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
  startMeetingNow: (divisionId?: string) => void;
  updateCompany: (profile: CompanyProfile) => void;
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
    divisionId: emp.divisionId,
    createdAt: Date.now(),
    summary,
    rows,
  };
}

// タスク完了時のKPI反映。ログ用メッセージと、生成された成果物を返す。
function applyTaskEffect(
  emp: Employee,
  task: EmployeeTask,
  kpi: Kpi,
  product: ProductLine
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
      const b2c = product.target === "b2c";
      const pool = b2c ? PERSON_NAMES : COMPANY_NAMES;
      const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
      const priorities = ["高", "中", "高", "低"];
      return {
        message: `📋 ${task.detail} を完了。営業リスト +${gained}(在庫: ${kpi.leadLists})`,
        artifact: makeArtifact(
          emp,
          "spreadsheet",
          `営業リスト【${product.name}】 ${stamp()}`,
          `${task.detail}。対象: ${b2c ? "個人(B2C)" : "法人(B2B)"}。リサーチ知見${gained === 2 ? "を反映した高精度" : "なしの標準"}リスト。`,
          [
            [b2c ? "氏名" : "社名", "商材", "優先度", "状態", "メモ"],
            ...picks.map((c, i) => [
              b2c ? `${c}様` : c,
              product.name,
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
      company: DEFAULT_COMPANY,
      employees: seedEmployees(),
      approvals: [],
      activity: [],
      meetings: [],
      artifacts: [],
      kpis: { "prod-default": freshKpi() },
      tickCount: 0,
      lastMeetingTicks: {},
      usedToolRequests: [],
      usedExpenseRequests: [],
      proposedHires: [],

      tick: () => {
        const s = get();
        const kpis: Record<string, Kpi> = {};
        for (const [k, v] of Object.entries(s.kpis)) kpis[k] = { ...v };
        let activity = s.activity;
        let approvals = s.approvals.slice();
        const meetings = s.meetings.slice();
        const tickCount = s.tickCount + 1;
        const lastMeetingTicks = { ...s.lastMeetingTicks };
        const usedToolRequests = s.usedToolRequests.slice();
        const usedExpenseRequests = s.usedExpenseRequests.slice();
        const proposedHires = s.proposedHires.slice();
        let artifacts = s.artifacts;
        const company = s.company ?? DEFAULT_COMPANY;

        // 商材=事業部。各事業部のKPIと商材を用意
        const products = company.products.length > 0 ? company.products : DEFAULT_COMPANY.products;
        const productById = new Map(products.map((p) => [p.id, p]));
        for (const p of products) if (!kpis[p.id]) kpis[p.id] = freshKpi();
        const kpiOf = (divId: string): Kpi => {
          if (!kpis[divId]) kpis[divId] = freshKpi();
          return kpis[divId];
        };
        const productOf = (divId: string): ProductLine =>
          productById.get(divId) ?? products[0];

        let employees = s.employees.map((e) => ({ ...e }));

        // --- 進行中MTGの処理(事業部ごとに同時進行しうる) ---
        for (const meeting of meetings.filter((m) => m.status === "in_progress")) {
          const chair = employees.find((e) => e.id === meeting.participantIds[0]);
          if (!chair?.currentTask || chair.currentTask.kind !== "mtg") continue;
          chair.currentTask.progress += 1;
          if (chair.currentTask.progress < chair.currentTask.total) continue;

          const dKpi = kpiOf(meeting.divisionId);
          const participants = employees.filter((e) =>
            meeting.participantIds.includes(e.id)
          );
          const built = buildMeetingMinutes(participants, dKpi, meeting.agenda);
          meeting.minutes = built.minutes;
          meeting.decisions = built.decisions;
          meeting.status = "done";
          meeting.endedAt = Date.now();
          dKpi.strategies += 1;
          artifacts = [
            makeArtifact(
              chair,
              "report",
              `議事録:${meeting.agenda}`,
              `決定事項: ${built.decisions.join(" / ")}`
            ),
            ...artifacts,
          ].slice(0, 80);
          for (const p of participants) {
            p.status = "working";
            p.statusLabel = "MTG内容を反映中";
            p.currentTask = null;
          }
          activity = log(
            activity,
            meeting.participantIds[0],
            `🤝 「${meeting.agenda}」が終了。決定事項${built.decisions.length}件を展開(戦略Lv: ${dKpi.strategies})`,
            "meeting"
          );
          void enhanceMinutes(
            meeting.id,
            meeting.agenda,
            participants.map((p) => ({
              name: p.name,
              role: p.role,
              department: DEPARTMENTS[p.department].name,
            })),
            { ...dKpi }
          );
        }

        // --- 定例MTGの開始(事業部ごと) ---
        for (const div of products) {
          const hasActive = meetings.some(
            (m) => m.status === "in_progress" && m.divisionId === div.id
          );
          const last = lastMeetingTicks[div.id] ?? 0;
          if (hasActive || tickCount - last < MEETING_INTERVAL) continue;
          const divEmployees = employees.filter((e) => e.divisionId === div.id);
          if (divEmployees.length < 2) continue;

          lastMeetingTicks[div.id] = tickCount;
          const agenda = `【${div.name}】${pick(MEETING_AGENDAS)}`;
          const participantIds: string[] = [];
          for (const dept of ["marketing", "admin", "sales"] as const) {
            const member = divEmployees.find(
              (e) => e.department === dept && e.status !== "meeting"
            );
            if (member) participantIds.push(member.id);
          }
          if (participantIds.length < 2) continue;

          meetings.unshift({
            id: uid(),
            title: agenda,
            divisionId: div.id,
            participantIds,
            startedAt: Date.now(),
            endedAt: null,
            agenda,
            minutes: [],
            decisions: [],
            status: "in_progress",
          });
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

        // --- 各社員の業務進行(所属事業部のKPI・商材で回る) ---
        for (const emp of employees) {
          if (emp.status === "meeting") continue;
          const kpi = kpiOf(emp.divisionId);
          const product = productOf(emp.divisionId);

          // 休憩中:仕事が発生していれば復帰
          if (emp.status === "break") {
            const tpl = nextTaskFor(emp, kpi);
            if (tpl) {
              emp.status = "working";
              emp.statusLabel = tpl.statusLabel;
              emp.currentTask = makeTask(tpl, product);
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
              emp.currentTask = makeTask(tpl, product);
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
            const result = applyTaskEffect(emp, emp.currentTask, kpi, product);
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

          // 社員追加提案:リスト在庫が溜まっている事業部を優先
          const availableHires = HIRE_CANDIDATES.filter(
            (h) => !proposedHires.includes(h.name)
          );
          // 営業リストが過多な事業部を探す(営業増員の必要性)
          const overloadedDiv = products.find(
            (p) => (kpis[p.id]?.leadLists ?? 0) >= 6
          );
          if (
            availableHires.length > 0 &&
            (overloadedDiv ? Math.random() < 0.1 : Math.random() < 0.008)
          ) {
            const targetDiv = overloadedDiv ?? pick(products);
            const divEmployees = employees.filter((e) => e.divisionId === targetDiv.id);
            const candidateBase = overloadedDiv
              ? availableHires.find((h) => h.department === "sales") ?? pick(availableHires)
              : pick(availableHires);
            const candidate: typeof candidateBase = {
              ...candidateBase,
              divisionId: targetDiv.id,
            };
            const proposer =
              divEmployees.find(
                (e) => e.department === candidate.department && e.role.includes("リーダー")
              ) ??
              pick(divEmployees.filter((e) => e.department === candidate.department)) ??
              (divEmployees.length > 0 ? pick(divEmployees) : pick(employees));
            proposedHires.push(candidate.name);
            approvals = [
              {
                id: uid(),
                type: "hire",
                title: `AI社員の追加提案:${candidate.name}(${targetDiv.name}・${candidate.role})`,
                description: `【${targetDiv.name}事業部】${candidate.reason}`,
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
              `📨 代表へAI社員の追加を提案:${candidate.name}(${targetDiv.name}・${DEPARTMENTS[candidate.department].name})`,
              "approval"
            );
          }
        }

        set({
          employees,
          approvals,
          activity,
          meetings: meetings.slice(0, 30),
          artifacts,
          kpis,
          tickCount,
          lastMeetingTicks,
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
            meetings: meetings.slice(0, 30),
            kpi: aggregateKpi(kpis),
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
          const divName =
            s.company.products.find((p) => p.id === h.divisionId)?.name ?? "";
          const newEmp: Employee = {
            id: uid(),
            name: h.name,
            avatar: h.avatar,
            role: h.role,
            department: h.department,
            divisionId: h.divisionId,
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
            `🎊 ${h.name}が${divName ? divName + "・" : ""}${DEPARTMENTS[h.department].name}に入社!Googleアカウント(${account.email})が付与されました`,
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

      startMeetingNow: (divisionId) => {
        const s = get();
        const targetTick = s.tickCount - MEETING_INTERVAL;
        const next = { ...s.lastMeetingTicks };
        if (divisionId) {
          next[divisionId] = targetTick;
        } else {
          for (const p of s.company.products) next[p.id] = targetTick;
        }
        set({ lastMeetingTicks: next });
      },

      updateCompany: (profile) => {
        const s = get();
        // 新しく追加された事業部にはスターターチーム(営業・事務・マーケ各1)を配属
        const existingDivs = new Set(s.employees.map((e) => e.divisionId));
        let employees = s.employees;
        const kpis = { ...s.kpis };
        for (const p of profile.products) {
          if (!existingDivs.has(p.id)) {
            const team = makeDivisionTeam(p.id, p.id + p.name).map((e) => ({
              ...e,
              status: "working" as const,
              statusLabel: "出社準備中",
              currentTask: null,
              joinedAt: Date.now(),
            }));
            employees = [...employees, ...team];
            if (!kpis[p.id]) kpis[p.id] = freshKpi();
          }
        }
        set({ company: profile, employees, kpis });
      },

      resetCompany: () => {
        set({
          company: DEFAULT_COMPANY,
          employees: seedEmployees(),
          approvals: [],
          activity: [],
          meetings: [],
          artifacts: [],
          kpis: { "prod-default": freshKpi() },
          tickCount: 0,
          lastMeetingTicks: {},
          usedToolRequests: [],
          usedExpenseRequests: [],
          proposedHires: [],
        });
      },
    }),
    {
      name: "aibou-office-v1",
      version: 4,
      skipHydration: true,
      migrate: (persisted, version) => {
        const state = persisted as Partial<CompanyState> & {
          kpi?: Kpi;
          lastMeetingTick?: number;
        };
        if (version < 2) {
          state.artifacts = state.artifacts ?? [];
        }
        if (version < 3) {
          state.company = state.company ?? DEFAULT_COMPANY;
        }
        if (version < 4) {
          // 単一KPI → 事業部別KPIへ。既存データは既定事業部(prod-default)に集約
          const defId = state.company?.products[0]?.id ?? "prod-default";
          state.kpis = { [defId]: state.kpi ?? freshKpi() };
          state.lastMeetingTicks = {};
          delete state.kpi;
          delete state.lastMeetingTick;
          state.employees = (state.employees ?? []).map((e) => ({
            ...e,
            divisionId: e.divisionId ?? defId,
          }));
          state.artifacts = (state.artifacts ?? []).map((a) => ({
            ...a,
            divisionId: a.divisionId ?? defId,
          }));
          state.meetings = (state.meetings ?? []).map((m) => ({
            ...m,
            divisionId: m.divisionId ?? defId,
          }));
        }
        return state as CompanyState;
      },
    }
  )
);
