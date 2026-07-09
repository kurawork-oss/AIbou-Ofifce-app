"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { DepartmentId, Employee, OfficeSelection } from "@/lib/types";
import EmployeeAvatar from "./EmployeeAvatar";
import OfficeInspector from "./OfficeInspector";

// three.jsはクライアント専用なのでSSRを無効化して遅延読み込み
const Office3D = dynamic(() => import("./Office3D"), {
  ssr: false,
  loading: () => (
    <div className="h-[clamp(340px,56vh,560px)] w-full rounded-3xl ring-1 ring-white/30 bg-slate-800/40 flex items-center justify-center text-sm text-indigo-100">
      3Dオフィスを準備中…
    </div>
  ),
});

function DeptZone({
  deptId,
  employees,
}: {
  deptId: DepartmentId;
  employees: Employee[];
}) {
  const dept = DEPARTMENTS[deptId];
  const members = employees.filter(
    (e) => e.department === deptId && e.status !== "meeting" && e.status !== "break"
  );
  return (
    <div
      className="rounded-2xl border-2 p-4 min-h-[220px] bg-white/70"
      style={{ borderColor: `${dept.color}55` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: dept.color }}
        />
        <h3 className="font-bold text-sm" style={{ color: dept.color }}>
          {dept.name}
        </h3>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">{dept.mission}</p>
      {/* デスク列 */}
      <div className="flex flex-wrap gap-4 items-end">
        {members.map((e) => (
          <div key={e.id} className="flex flex-col items-center">
            <EmployeeAvatar employee={e} />
            {/* デスク */}
            <div className="mt-1 h-3 w-20 rounded-md bg-amber-200/80 shadow-inner ring-1 ring-amber-300/60" />
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-xs text-slate-400 py-6">全員離席中(MTG・休憩)</p>
        )}
      </div>
    </div>
  );
}

function MeetingRoom({ employees }: { employees: Employee[] }) {
  const meetings = useCompanyStore((s) => s.meetings);
  const startMeetingNow = useCompanyStore((s) => s.startMeetingNow);
  const inMeeting = employees.filter((e) => e.status === "meeting");
  const current = meetings.find((m) => m.status === "in_progress");
  const lastDone = meetings.find((m) => m.status === "done");

  return (
    <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50/70 p-4 min-h-[180px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm text-amber-700">🤝 会議室</h3>
        {!current && (
          <button
            onClick={startMeetingNow}
            className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-amber-600 transition"
          >
            MTGを招集する
          </button>
        )}
      </div>
      {current ? (
        <>
          <p className="text-[11px] font-semibold text-amber-800 mb-2">
            議題:{current.agenda}
          </p>
          <div className="flex items-end justify-center gap-2">
            {inMeeting.map((e) => (
              <EmployeeAvatar key={e.id} employee={e} showBubble={false} />
            ))}
          </div>
          {/* 会議テーブル */}
          <div className="mx-auto mt-2 h-4 w-3/4 rounded-full bg-amber-300/70 shadow-inner" />
        </>
      ) : (
        <div className="text-xs text-slate-500 space-y-1">
          <p>現在MTGはありません。定例MTGは自動で開催されます。</p>
          {lastDone && (
            <div className="mt-2 rounded-lg bg-white/80 p-2 ring-1 ring-amber-200">
              <p className="font-semibold text-amber-800 text-[11px] mb-1">
                📝 直近の議事録:{lastDone.agenda}
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-slate-600">
                {lastDone.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BreakSpace({ employees }: { employees: Employee[] }) {
  const onBreak = employees.filter((e) => e.status === "break");
  return (
    <div className="rounded-2xl border-2 border-sky-300/70 bg-sky-50/70 p-4 min-h-[180px]">
      <h3 className="font-bold text-sm text-sky-700 mb-1">🎮 休憩スペース</h3>
      <p className="text-[10px] text-slate-500 mb-3">
        仕事がないときはここでゲームOK
      </p>
      {onBreak.length > 0 ? (
        <div className="flex flex-wrap gap-3 items-end">
          {onBreak.map((e) => (
            <EmployeeAvatar key={e.id} employee={e} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-6">
          いまは全員仕事中。えらい!
        </p>
      )}
      <div className="mt-2 flex gap-2 text-lg">
        <span title="ゲーム機">🕹️</span>
        <span title="ソファ">🛋️</span>
        <span title="コーヒー">☕</span>
        <span title="観葉植物">🪴</span>
      </div>
    </div>
  );
}

function ActivityFeed() {
  const activity = useCompanyStore((s) => s.activity);
  const employees = useCompanyStore((s) => s.employees);
  const nameOf = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "システム";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-white/40 h-full flex flex-col max-h-[clamp(340px,56vh,560px)]">
      <h3 className="font-bold text-sm text-slate-700 mb-2">📡 社内タイムライン</h3>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {activity.length === 0 && (
          <p className="text-xs text-slate-400">まだ動きはありません…</p>
        )}
        {activity.map((a) => (
          <div
            key={a.id}
            className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug ring-1 ring-slate-100"
          >
            <span className="font-semibold text-slate-700">{nameOf(a.employeeId)}</span>
            <span className="text-slate-400 ml-1">
              {new Date(a.timestamp).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <p className="text-slate-600 mt-0.5">{a.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingStatusPanel() {
  const meetings = useCompanyStore((s) => s.meetings);
  const startMeetingNow = useCompanyStore((s) => s.startMeetingNow);
  const current = meetings.find((m) => m.status === "in_progress");
  const lastDone = meetings.find((m) => m.status === "done");

  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 shadow-sm flex items-start gap-3 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        {current ? (
          <p className="text-xs font-semibold text-amber-700">
            🤝 MTG中:{current.agenda}
          </p>
        ) : lastDone ? (
          <div>
            <p className="text-[11px] font-semibold text-slate-700 mb-1">
              📝 直近の議事録:{lastDone.agenda}
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-slate-500">
              {lastDone.decisions.slice(0, 3).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            定例MTGは自動開催されます。
          </p>
        )}
      </div>
      {!current && (
        <button
          onClick={startMeetingNow}
          className="rounded-full bg-amber-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-amber-600 transition shrink-0"
        >
          MTGを招集する
        </button>
      )}
    </div>
  );
}

export default function OfficeView() {
  const employees = useCompanyStore((s) => s.employees);
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [selection, setSelection] = useState<OfficeSelection | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* クリックしたオブジェクトの詳細パネル */}
      <OfficeInspector selection={selection} onClose={() => setSelection(null)} />
      {/* オフィスフロア */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex justify-end">
          <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200 shadow-sm">
            {(["3d", "2d"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${
                  view === v
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {v === "3d" ? "🎥 3Dオフィス" : "🗺️ 2Dマップ"}
              </button>
            ))}
          </div>
        </div>
        {view === "3d" ? (
          <>
            <Office3D onSelect={setSelection} />
            <MeetingStatusPanel />
          </>
        ) : (
          <div className="rounded-3xl bg-gradient-to-b from-slate-50 to-slate-200/70 p-4 ring-1 ring-slate-200 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DeptZone deptId="sales" employees={employees} />
              <DeptZone deptId="admin" employees={employees} />
              <DeptZone deptId="marketing" employees={employees} />
              <div className="grid grid-rows-2 gap-4">
                <MeetingRoom employees={employees} />
                <BreakSpace employees={employees} />
              </div>
            </div>
          </div>
        )}
      </div>
      {/* タイムライン */}
      <ActivityFeed />
    </div>
  );
}
