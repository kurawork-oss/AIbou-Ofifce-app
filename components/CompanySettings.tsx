"use client";

import { useState } from "react";
import { useCompanyStore } from "@/lib/store";
import type { CompanyProfile, ProductLine, SalesTargetType } from "@/lib/types";

const TARGET_LABEL: Record<SalesTargetType, string> = {
  b2b: "法人(B2B)",
  b2c: "個人(B2C)",
  both: "法人+個人",
};

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function CompanySettings({ onClose }: { onClose: () => void }) {
  const company = useCompanyStore((s) => s.company);
  const updateCompany = useCompanyStore((s) => s.updateCompany);
  const [draft, setDraft] = useState<CompanyProfile>(() => ({
    companyName: company.companyName,
    products: company.products.map((p) => ({ ...p })),
  }));

  const setProduct = (id: string, patch: Partial<ProductLine>) => {
    setDraft((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const addProduct = () => {
    setDraft((d) => ({
      ...d,
      products: [
        ...d.products,
        {
          id: uid(),
          name: `新しい商材 ${d.products.length + 1}`,
          description: "",
          target: "b2b",
        },
      ],
    }));
  };

  const removeProduct = (id: string) => {
    setDraft((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
  };

  const canSave = draft.companyName.trim().length > 0 && draft.products.length > 0 && draft.products.every((p) => p.name.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base text-slate-800">⚙️ 会社設定</h3>
          <button
            onClick={onClose}
            className="rounded-full h-7 w-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition text-sm"
          >
            ✕
          </button>
        </div>

        <label className="block text-[11px] font-bold text-slate-500 mb-1">会社名</label>
        <input
          value={draft.companyName}
          onChange={(e) => setDraft((d) => ({ ...d, companyName: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-sky-400"
        />

        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-slate-500">
            🧩 取扱商材(=事業部)— {draft.products.length}事業部
          </p>
          <button
            onClick={addProduct}
            className="rounded-full bg-sky-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-sky-600 transition"
          >
            + 事業部を追加
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mb-3">
          商材ごとに営業対象(法人/個人)を設定できます。AI社員の架電・メール・リスト作成・リサーチが商材ごとに回ります。
        </p>

        <div className="space-y-3 mb-5">
          {draft.products.map((p, i) => (
            <div key={p.id} className="rounded-xl ring-1 ring-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-white shrink-0">
                  事業部{i + 1}
                </span>
                <input
                  value={p.name}
                  onChange={(e) => setProduct(p.id, { name: e.target.value })}
                  placeholder="商材名(例: AI業務自動化ツール)"
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                {draft.products.length > 1 && (
                  <button
                    onClick={() => removeProduct(p.id)}
                    className="text-[10px] text-rose-400 hover:text-rose-600 shrink-0"
                    title="この事業部を削除"
                  >
                    🗑️
                  </button>
                )}
              </div>
              <input
                value={p.description}
                onChange={(e) => setProduct(p.id, { description: e.target.value })}
                placeholder="商材の説明(任意)"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white mb-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <div className="flex gap-1.5">
                {(Object.keys(TARGET_LABEL) as SalesTargetType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setProduct(p.id, { target: t })}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                      p.target === t
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {TARGET_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 transition"
          >
            キャンセル
          </button>
          <button
            disabled={!canSave}
            onClick={() => {
              updateCompany({
                companyName: draft.companyName.trim(),
                products: draft.products.map((p) => ({ ...p, name: p.name.trim() })),
              });
              onClose();
            }}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-700 transition disabled:opacity-40"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}
