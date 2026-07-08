// AIカンパニー コアデータモデル

export type DepartmentId = "sales" | "admin" | "marketing";

export interface Department {
  id: DepartmentId;
  name: string;
  mission: string;
  color: string;
}

export type EmployeeStatus =
  | "working" // 業務中
  | "meeting" // MTG中
  | "break" // 休憩中(ゲーム)
  | "waiting"; // 承認待ち

export interface EmployeeTask {
  label: string; // 例: 「架電アポどり」
  detail: string; // 例: 「株式会社〇〇へ架電中」
  progress: number; // 0〜total
  total: number; // 完了までのtick数
  kind: string; // エンジン内部でのタスク種別
}

export interface Employee {
  id: string;
  name: string;
  role: string; // 役職
  department: DepartmentId;
  status: EmployeeStatus;
  statusLabel: string; // 「架電中」「リサーチ中」「ゲーム中」など
  currentTask: EmployeeTask | null;
  googleEmail: string;
  googlePassword: string;
  emoji: string;
  color: string; // アバター色
  bio: string;
  joinedAt: number; // epoch ms
}

export type ApprovalType =
  | "hire" // AI社員の追加提案
  | "tool" // 無料ツール・アカウント作成申請
  | "expense"; // 経費(有料ツール等)申請

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface HirePayload {
  name: string;
  role: string;
  department: DepartmentId;
  emoji: string;
  color: string;
  bio: string;
  reason: string; // 提案理由(生産性・売上向上の観点)
}

export interface ToolPayload {
  toolName: string;
  purpose: string;
  howToAdd: string; // 追加方法(申請書に含める)
}

export interface ExpensePayload {
  itemName: string;
  monthlyCost: number; // 円/月
  freeAlternativeConsidered: string; // 検討した無料代替案
  whyPaidIsBetter: string;
}

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  title: string;
  description: string;
  requesterId: string; // 申請したAI社員
  status: ApprovalStatus;
  createdAt: number;
  decidedAt: number | null;
  hire?: HirePayload;
  tool?: ToolPayload;
  expense?: ExpensePayload;
}

export interface ActivityEntry {
  id: string;
  employeeId: string;
  message: string;
  category: "work" | "meeting" | "break" | "approval" | "system";
  timestamp: number;
}

export interface MeetingMinutes {
  id: string;
  title: string;
  participantIds: string[];
  startedAt: number;
  endedAt: number | null;
  agenda: string;
  minutes: string[]; // 発言ログ / 議事録
  decisions: string[]; // 決定事項
  status: "in_progress" | "done";
}

// 3Dオフィス内でクリックできるオブジェクトの選択状態
export type OfficeSelection =
  | { kind: "shelf" } // 共有キャビネット(全社の成果物)
  | { kind: "employee"; employeeId: string } // 個人デスク(本人の成果物)
  | { kind: "whiteboard"; department: DepartmentId } // 部署の目標・進捗
  | { kind: "meeting" }; // 会議室(議事録)

// AI社員が業務で作成する成果物(スプレッドシート・ドキュメント等)
export type ArtifactType = "spreadsheet" | "doc" | "note" | "report";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  ownerId: string;
  department: DepartmentId;
  createdAt: number;
  summary: string;
  rows?: string[][]; // spreadsheetの場合の中身(先頭行はヘッダー)
}

export interface Kpi {
  insights: number; // マーケのリサーチ知見(未消費ストック)
  leadLists: number; // 事務が作った営業リスト(未消費ストック)
  outreach: number; // 架電・営業メール累計
  appointments: number; // 獲得アポ累計
  posts: number; // X/note/YouTube発信累計
  inquiriesHandled: number; // 問い合わせ対応累計
  strategies: number; // MTGで決まった戦略(営業提案の質を上げる)
}
