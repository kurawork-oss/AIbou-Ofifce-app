"use client";

import { useEffect, useState } from "react";
import { useCompanyStore } from "@/lib/store";
import OfficeView from "@/components/OfficeView";
import ApprovalBox from "@/components/ApprovalBox";
import EmployeeAdmin from "@/components/EmployeeAdmin";

const TICK_MS = 3000;

type Mode = "office" | "approval" | "admin";

function KpiBar() {
  const kpi = useCompanyStore((s) => s.kpi);
  const items = [
    { label: "獲得アポ", value: kpi.appointments, icon: "🎯" },
    { label: "架電・営業メール", value: kpi.outreach, icon: "📞" },
    { label: "営業リスト在庫", value: kpi.leadLists, icon: "📋" },
    { label: "リサーチ知見", value: kpi.insights, icon: "📚" },
    { label: "無料発信", value: kpi.posts, icon: "📣" },
    { label: "問い合わせ対応", value: kpi.inquiriesHandled, icon: "💬" },
    { label: "戦略レベル", value: kpi.strategies, icon: "✨" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((i) => (
        <div
          key={i.label}
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200 shrink-0"
        >
          <span className="text-sm">{i.icon}</span>
          <div>
            <p className="text-[9px] text-slate-400 leading-none">{i.label}</p>
            <p className="text-sm font-bold text-slate-800 leading-tight">
              {i.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("office");
  const [hydrated, setHydrated] = useState(false);
  const tick = useCompanyStore((s) => s.tick);
  const resetCompany = useCompanyStore((s) => s.resetCompany);
  const pendingCount = useCompanyStore(
    (s) => s.approvals.filter((a) => a.status === "pending").length
  );

  // localStorageからの復元(SSRとの不一致を避けるためクライアントで実行)
  useEffect(() => {
    useCompanyStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  // 会社エンジンのtickループ
  useEffect(() => {
    if (!hydrated) return;
    const timer = setInterval(() => tick(), TICK_MS);
    return () => clearInterval(timer);
  }, [hydrated, tick]);

  const tabs: { id: Mode; label: string; badge?: number }[] = [
    { id: "office", label: "🏢 オフィス" },
    { id: "approval", label: "📥 確認事項", badge: pendingCount },
    { id: "admin", label: "👥 社員管理" },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
      <header className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              AIbou Office
            </h1>
            <p className="text-[11px] text-slate-500">
              AI社員だけで回るバーチャルカンパニー — あなたは代表として承認するだけ
            </p>
          </div>
          <button
            onClick={() => {
              if (
                confirm(
                  "会社を初期状態にリセットしますか?(社員・履歴・KPIが初期化されます)"
                )
              ) {
                resetCompany();
              }
            }}
            className="rounded-lg px-3 py-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200 hover:bg-white hover:text-slate-600 transition"
          >
            会社をリセット
          </button>
        </div>
        {hydrated && <KpiBar />}
      </header>

      <nav className="mb-4 flex gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`relative rounded-xl px-4 py-2 text-sm font-bold transition ${
              mode === t.id
                ? "bg-slate-900 text-white shadow"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {!hydrated ? (
        <div className="py-24 text-center text-sm text-slate-400">
          オフィスの鍵を開けています…
        </div>
      ) : (
        <>
          {mode === "office" && <OfficeView />}
          {mode === "approval" && <ApprovalBox />}
          {mode === "admin" && <EmployeeAdmin />}
        </>
      )}
    </main>
  );
}
