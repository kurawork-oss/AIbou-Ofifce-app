"use client";

import type { Employee } from "@/lib/types";

const STATUS_DOT: Record<Employee["status"], string> = {
  working: "bg-emerald-500",
  meeting: "bg-amber-500",
  break: "bg-sky-400",
  waiting: "bg-slate-400",
};

export default function EmployeeAvatar({
  employee,
  showBubble = true,
}: {
  employee: Employee;
  showBubble?: boolean;
}) {
  const task = employee.currentTask;
  const bubbleText =
    employee.status === "break"
      ? employee.statusLabel
      : task
        ? task.detail
        : employee.statusLabel;

  return (
    <div className="flex flex-col items-center w-24 select-none">
      {showBubble && (
        <div className="relative mb-1 max-w-[9rem] rounded-lg bg-white px-2 py-1 text-[10px] leading-tight text-slate-700 shadow-sm ring-1 ring-slate-200 text-center min-h-[1.5rem]">
          {bubbleText}
          <span className="absolute left-1/2 -bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-white ring-1 ring-slate-200 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
        </div>
      )}
      <div className="relative animate-bob">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow-md ring-2 ring-white"
          style={{ backgroundColor: `${employee.color}22`, borderColor: employee.color }}
        >
          {employee.emoji}
        </div>
        <span
          className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white animate-pulse-dot ${STATUS_DOT[employee.status]}`}
        />
      </div>
      <div className="mt-1 text-[11px] font-semibold text-slate-800">
        {employee.name}
      </div>
      <div className="text-[9px] text-slate-500">{employee.role}</div>
      {task && employee.status !== "break" && (
        <div className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (task.progress / task.total) * 100)}%`,
              backgroundColor: employee.color,
            }}
          />
        </div>
      )}
    </div>
  );
}
