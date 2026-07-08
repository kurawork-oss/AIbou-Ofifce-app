"use client";

import { useState } from "react";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS, DEPT_GOALS } from "@/lib/data";
import type { Artifact, DepartmentId, OfficeSelection } from "@/lib/types";

const TYPE_META: Record<Artifact["type"], { icon: string; label: string; className: string }> = {
  spreadsheet: { icon: "📊", label: "スプレッドシート", className: "bg-emerald-100 text-emerald-700" },
  doc: { icon: "📄", label: "ドキュメント", className: "bg-sky-100 text-sky-700" },
  note: { icon: "📝", label: "発信ドラフト", className: "bg-violet-100 text-violet-700" },
  report: { icon: "📑", label: "レポート", className: "bg-amber-100 text-amber-700" },
};

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 成果物1件(クリックで中身を展開)
function ArtifactCard({ artifact, ownerName }: { artifact: Artifact; ownerName: string }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[artifact.type];
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition"
      >
        <span className="text-base">{meta.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[11px] font-bold text-slate-800">{artifact.title}</span>
          <span className="block text-[9px] text-slate-400">
            {ownerName}・{timeLabel(artifact.createdAt)}
          </span>
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold shrink-0 ${meta.className}`}>
          {meta.label}
        </span>
        <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/60">
          <p className="text-[10px] leading-relaxed text-slate-600 mb-2">{artifact.summary}</p>
          {artifact.rows && (
            <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200 bg-white">
              <table className="w-full text-[9px]">
                <thead>
                  <tr className="bg-emerald-50 text-emerald-800">
                    {artifact.rows[0].map((h, i) => (
                      <th key={i} className="px-2 py-1 text-left font-bold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {artifact.rows.slice(1).map((row, ri) => (
                    <tr key={ri} className="border-t border-slate-100">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-2 py-1 text-slate-600 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShelfPanel() {
  const artifacts = useCompanyStore((s) => s.artifacts);
  const employees = useCompanyStore((s) => s.employees);
  const [filter, setFilter] = useState<DepartmentId | "all">("all");
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "退職済み";
  const filtered = filter === "all" ? artifacts : artifacts.filter((a) => a.department === filter);

  return (
    <>
      <div className="flex gap-1 mb-3 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
            filter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          すべて ({artifacts.length})
        </button>
        {(Object.keys(DEPARTMENTS) as DepartmentId[]).map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            className="rounded-full px-2.5 py-1 text-[10px] font-bold transition text-white"
            style={{
              backgroundColor: filter === d ? DEPARTMENTS[d].color : `${DEPARTMENTS[d].color}55`,
            }}
          >
            {DEPARTMENTS[d].name}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-6 text-center">
          まだ成果物がありません。社員が働くとここに溜まっていきます。
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <ArtifactCard key={a.id} artifact={a} ownerName={nameOf(a.ownerId)} />
          ))}
        </div>
      )}
    </>
  );
}

function EmployeePanel({ employeeId }: { employeeId: string }) {
  const employees = useCompanyStore((s) => s.employees);
  const artifacts = useCompanyStore((s) => s.artifacts);
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return <p className="text-xs text-slate-400">社員が見つかりません</p>;
  const dept = DEPARTMENTS[emp.department];
  const own = artifacts.filter((a) => a.ownerId === emp.id);
  const task = emp.currentTask;

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shrink-0"
          style={{ backgroundColor: `${emp.color}22` }}
        >
          🤖
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-slate-800">{emp.name}</p>
          <p className="text-[10px] text-slate-500">
            <span className="rounded-full px-1.5 py-px text-white font-bold mr-1" style={{ backgroundColor: dept.color }}>
              {dept.name}
            </span>
            {emp.role}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">{emp.bio}</p>

      <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2 mb-3">
        <p className="text-[9px] font-bold text-slate-400 mb-1">現在のステータス</p>
        <p className="text-[11px] font-bold text-slate-700">{emp.statusLabel}</p>
        {task && (
          <>
            <p className="text-[10px] text-slate-500 mt-1">{task.detail}</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (task.progress / task.total) * 100)}%`,
                  backgroundColor: emp.color,
                }}
              />
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2 mb-3">
        <p className="text-[9px] font-bold text-slate-400 mb-1">Googleアカウント</p>
        <p className="text-[10px] font-mono text-slate-600">{emp.googleEmail}</p>
      </div>

      <p className="text-[10px] font-bold text-slate-500 mb-2">
        📁 {emp.name}のデスクのデータ({own.length}件)
      </p>
      {own.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-4 text-center">まだ成果物がありません</p>
      ) : (
        <div className="space-y-2">
          {own.map((a) => (
            <ArtifactCard key={a.id} artifact={a} ownerName={emp.name} />
          ))}
        </div>
      )}
    </>
  );
}

function WhiteboardPanel({ department }: { department: DepartmentId }) {
  const kpi = useCompanyStore((s) => s.kpi);
  const employees = useCompanyStore((s) => s.employees);
  const meetings = useCompanyStore((s) => s.meetings);
  const dept = DEPARTMENTS[department];
  const goals = DEPT_GOALS[department];
  const members = employees.filter((e) => e.department === department);
  const lastMeeting = meetings.find((m) => m.status === "done");

  return (
    <>
      <div className="rounded-xl px-3 py-2 mb-3 text-white" style={{ backgroundColor: dept.color }}>
        <p className="text-[10px] opacity-80">ミッション</p>
        <p className="text-[11px] font-bold">{dept.mission}</p>
      </div>

      <p className="text-[10px] font-bold text-slate-500 mb-2">🎯 目標と進捗</p>
      <div className="space-y-2.5 mb-4">
        {goals.map((g) => {
          const current = kpi[g.kpiKey];
          const pct = Math.min(100, Math.round((current / g.target) * 100));
          return (
            <div key={g.label}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="font-semibold text-slate-600">{g.label}</span>
                <span className="font-bold text-slate-800">
                  {current} / {g.target}({pct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: dept.color }}
                />
              </div>
            </div>
          );
        })}
        {department === "admin" && (
          <div className="flex justify-between text-[10px] rounded-lg bg-slate-50 ring-1 ring-slate-200 px-2 py-1.5">
            <span className="text-slate-500">営業リスト在庫(営業部へ供給)</span>
            <span className="font-bold text-slate-800">{kpi.leadLists}件</span>
          </div>
        )}
        {department === "marketing" && (
          <div className="flex justify-between text-[10px] rounded-lg bg-slate-50 ring-1 ring-slate-200 px-2 py-1.5">
            <span className="text-slate-500">リサーチ知見ストック(事務部へ供給)</span>
            <span className="font-bold text-slate-800">{kpi.insights}件</span>
          </div>
        )}
      </div>

      {lastMeeting && (
        <>
          <p className="text-[10px] font-bold text-slate-500 mb-2">📌 直近MTGの決定事項</p>
          <ul className="mb-4 space-y-1">
            {lastMeeting.decisions.map((d, i) => (
              <li key={i} className="text-[10px] text-slate-600 rounded-lg bg-amber-50 ring-1 ring-amber-100 px-2 py-1.5">
                {d}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-[10px] font-bold text-slate-500 mb-2">👥 メンバー({members.length}名)</p>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-100 px-2 py-1.5">
            <span className="text-sm">🤖</span>
            <span className="flex-1 text-[10px] font-bold text-slate-700">{m.name}</span>
            <span className="text-[9px] text-slate-400">{m.role}</span>
            <span className="rounded-full bg-white px-1.5 py-px text-[8px] font-bold text-slate-500 ring-1 ring-slate-200">
              {m.statusLabel}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function MeetingPanel() {
  const meetings = useCompanyStore((s) => s.meetings);
  const employees = useCompanyStore((s) => s.employees);
  const current = meetings.find((m) => m.status === "in_progress");
  const done = meetings.filter((m) => m.status === "done");
  const target = current ?? done[0];
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "?";

  if (!target) {
    return <p className="text-[11px] text-slate-400 py-6 text-center">まだMTGは開催されていません。</p>;
  }

  return (
    <>
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3 py-2 mb-3">
        <p className="text-[9px] font-bold text-amber-600 mb-0.5">
          {current ? "🔴 進行中のMTG" : "📝 直近の議事録"}
        </p>
        <p className="text-[11px] font-bold text-slate-800">{target.agenda}</p>
        <p className="text-[9px] text-slate-500 mt-0.5">
          参加: {target.participantIds.map(nameOf).join("、")}
        </p>
      </div>

      {current ? (
        <p className="text-[11px] text-slate-500">議事録はMTG終了後にここに表示されます…</p>
      ) : (
        <>
          <p className="text-[10px] font-bold text-slate-500 mb-2">発言ログ</p>
          <div className="space-y-1.5 mb-4">
            {target.minutes.map((line, i) => (
              <p key={i} className="text-[10px] leading-relaxed text-slate-600 rounded-lg bg-slate-50 px-2 py-1.5">
                {line}
              </p>
            ))}
          </div>
          <p className="text-[10px] font-bold text-slate-500 mb-2">✅ 決定事項</p>
          <ul className="space-y-1">
            {target.decisions.map((d, i) => (
              <li key={i} className="text-[10px] text-slate-700 rounded-lg bg-emerald-50 ring-1 ring-emerald-100 px-2 py-1.5">
                {d}
              </li>
            ))}
          </ul>
        </>
      )}

      {done.length > 1 && (
        <>
          <p className="text-[10px] font-bold text-slate-400 mt-4 mb-2">過去のMTG</p>
          <div className="space-y-1">
            {done.slice(1, 6).map((m) => (
              <p key={m.id} className="text-[9px] text-slate-400 truncate">
                ・{m.agenda}
              </p>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function OfficeInspector({
  selection,
  onClose,
}: {
  selection: OfficeSelection | null;
  onClose: () => void;
}) {
  if (!selection) return null;

  const title =
    selection.kind === "shelf"
      ? "🗄️ 共有キャビネット"
      : selection.kind === "whiteboard"
        ? `📋 ${DEPARTMENTS[selection.department].name}ホワイトボード`
        : selection.kind === "meeting"
          ? "🤝 会議室"
          : "🤖 社員デスク";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" />
      <aside
        className="relative h-full w-[380px] max-w-[92vw] bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
        style={{ animationName: "slideIn" }}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-bold text-sm text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full h-7 w-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition text-sm"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {selection.kind === "shelf" && <ShelfPanel />}
          {selection.kind === "employee" && <EmployeePanel employeeId={selection.employeeId} />}
          {selection.kind === "whiteboard" && <WhiteboardPanel department={selection.department} />}
          {selection.kind === "meeting" && <MeetingPanel />}
        </div>
      </aside>
    </div>
  );
}
