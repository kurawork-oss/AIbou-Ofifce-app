"use client";

import { useState } from "react";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { Employee } from "@/lib/types";

function CredentialCell({
  employee,
  field,
}: {
  employee: Employee;
  field: "googleEmail" | "googlePassword";
}) {
  const updateEmployee = useCompanyStore((s) => s.updateEmployee);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(employee[field]);
  const [revealed, setRevealed] = useState(false);
  const isPassword = field === "googlePassword";

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-44 rounded border border-slate-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-400"
          autoFocus
        />
        <button
          onClick={() => {
            updateEmployee(employee.id, { [field]: value });
            setEditing(false);
          }}
          className="text-[10px] font-bold text-emerald-600 hover:underline"
        >
          保存
        </button>
        <button
          onClick={() => {
            setValue(employee[field]);
            setEditing(false);
          }}
          className="text-[10px] text-slate-400 hover:underline"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group">
      <span className="font-mono text-[11px] text-slate-600">
        {isPassword && !revealed ? "••••••••" : employee[field]}
      </span>
      {isPassword && (
        <button
          onClick={() => setRevealed(!revealed)}
          className="text-[10px] text-slate-400 hover:text-slate-600"
          title={revealed ? "隠す" : "表示"}
        >
          {revealed ? "🙈" : "👁️"}
        </button>
      )}
      <button
        onClick={() => {
          setValue(employee[field]);
          setEditing(true);
        }}
        className="text-[10px] text-slate-300 hover:text-sky-500 opacity-0 group-hover:opacity-100 transition"
        title="編集"
      >
        ✏️
      </button>
    </div>
  );
}

const STATUS_STYLE: Record<Employee["status"], string> = {
  working: "bg-emerald-100 text-emerald-700",
  meeting: "bg-amber-100 text-amber-700",
  break: "bg-sky-100 text-sky-700",
  waiting: "bg-slate-100 text-slate-600",
};

export default function EmployeeAdmin() {
  const allEmployees = useCompanyStore((s) => s.employees);
  const products = useCompanyStore((s) => s.company.products);
  const [divFilter, setDivFilter] = useState<string>("all");
  const employees =
    divFilter === "all"
      ? allEmployees
      : allEmployees.filter((e) => e.divisionId === divFilter);
  const divName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-base text-white drop-shadow">
          👥 AI社員一覧({employees.length}名)
        </h2>
        <p className="text-[11px] text-indigo-200/70">
          ⚠️ パスワードはブラウザ内(ローカル)保存。実運用ではパスワード管理ツールを推奨。
        </p>
      </div>
      {/* 事業部フィルタ */}
      <div className="mb-3 flex gap-1 flex-wrap">
        <button
          onClick={() => setDivFilter("all")}
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
            divFilter === "all" ? "bg-slate-900 text-white" : "bg-white/90 text-slate-500"
          }`}
        >
          全事業部 ({allEmployees.length})
        </button>
        {products.map((p) => {
          const n = allEmployees.filter((e) => e.divisionId === p.id).length;
          return (
            <button
              key={p.id}
              onClick={() => setDivFilter(p.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                divFilter === p.id ? "bg-slate-900 text-white" : "bg-white/90 text-slate-500"
              }`}
            >
              {p.name} ({n})
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-lg ring-1 ring-white/40">
        <table className="w-full text-left text-xs min-w-[860px]">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">社員</th>
              <th className="px-4 py-3">事業部</th>
              <th className="px-4 py-3">役職</th>
              <th className="px-4 py-3">部署</th>
              <th className="px-4 py-3">ステータス</th>
              <th className="px-4 py-3">Googleメールアドレス</th>
              <th className="px-4 py-3">パスワード</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const dept = DEPARTMENTS[e.department];
              return (
                <tr
                  key={e.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: `${e.color}22` }}
                      >
                        {e.emoji}
                      </span>
                      <div>
                        <p className="font-bold text-slate-800">
                          {e.avatar === "human" ? "🙂" : "🤖"} {e.name}
                        </p>
                        <p className="text-[10px] text-slate-400">{e.bio}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {divName(e.divisionId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: dept.color }}
                    >
                      {dept.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[e.status]}`}
                    >
                      {e.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CredentialCell employee={e} field="googleEmail" />
                  </td>
                  <td className="px-4 py-3">
                    <CredentialCell employee={e} field="googlePassword" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
