"use client";

import { useState } from "react";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { ApprovalRequest } from "@/lib/types";

const TYPE_BADGE: Record<
  ApprovalRequest["type"],
  { label: string; className: string }
> = {
  hire: { label: "社員追加提案", className: "bg-purple-100 text-purple-700" },
  tool: { label: "ツール申請", className: "bg-sky-100 text-sky-700" },
  expense: { label: "経費申請", className: "bg-rose-100 text-rose-700" },
};

function HireApproveModal({
  request,
  onClose,
}: {
  request: ApprovalRequest;
  onClose: () => void;
}) {
  const decideApproval = useCompanyStore((s) => s.decideApproval);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const hire = request.hire!;
  const canSubmit = email.includes("@") && password.length >= 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="font-bold text-lg mb-1">
          {hire.emoji} {hire.name} の入社手続き
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          {DEPARTMENTS[hire.department].name}・{hire.role}。この社員用に作成した
          Googleアカウントを登録してください(記憶保管庫・スプレッドシート等が紐づきます)。
        </p>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Googleメールアドレス
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="例: shinnyushain.aibou@gmail.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          パスワード
        </label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="アカウントのパスワード"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              decideApproval(request.id, true, { email, password });
              onClose();
            }}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-40"
          >
            入社を許可する
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestCard({ request }: { request: ApprovalRequest }) {
  const decideApproval = useCompanyStore((s) => s.decideApproval);
  const employees = useCompanyStore((s) => s.employees);
  const [showHireModal, setShowHireModal] = useState(false);
  const requester = employees.find((e) => e.id === request.requesterId);
  const badge = TYPE_BADGE[request.type];
  const pending = request.status === "pending";

  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${
        !pending ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
            >
              {badge.label}
            </span>
            {!pending && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  request.status === "approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {request.status === "approved" ? "✅ 許可済み" : "❌ 未許可"}
              </span>
            )}
            <span className="text-[10px] text-slate-400">
              {new Date(request.createdAt).toLocaleString("ja-JP")}
            </span>
          </div>
          <h4 className="font-bold text-sm text-slate-800">{request.title}</h4>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {request.description}
          </p>
          {request.expense && (
            <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-slate-600 ring-1 ring-rose-100">
              <p>💰 月額: {request.expense.monthlyCost.toLocaleString()}円</p>
              <p className="mt-0.5">
                🔍 無料代替の検討: {request.expense.freeAlternativeConsidered}
              </p>
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-2">
            申請者: {requester ? `${requester.emoji} ${requester.name}(${DEPARTMENTS[requester.department].name})` : "不明"}
          </p>
        </div>
        {pending && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() =>
                request.type === "hire"
                  ? setShowHireModal(true)
                  : decideApproval(request.id, true)
              }
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 transition"
            >
              許可
            </button>
            <button
              onClick={() => decideApproval(request.id, false)}
              className="rounded-lg bg-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-400 transition"
            >
              未許可
            </button>
          </div>
        )}
      </div>
      {showHireModal && request.hire && (
        <HireApproveModal
          request={request}
          onClose={() => setShowHireModal(false)}
        />
      )}
    </div>
  );
}

export default function ApprovalBox() {
  const approvals = useCompanyStore((s) => s.approvals);
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section>
        <h2 className="font-bold text-base text-slate-800 mb-3">
          🔔 代表への確認事項{" "}
          {pending.length > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">
            未処理の申請はありません。AI社員が働きながら、必要になったら申請を上げてきます。
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="font-bold text-sm text-slate-500 mb-3">
            📁 対応済みの履歴
          </h2>
          <div className="space-y-3">
            {decided.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
