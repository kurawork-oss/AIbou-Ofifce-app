"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase連携(任意)。
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていれば有効。
// 未設定でもアプリはlocalStorageのみで完全動作する。

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}
