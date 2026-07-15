# Vercelへの公開手順

このアプリはNext.js標準構成なので、Vercelにそのままデプロイできます。
(デプロイにはあなたのVercelアカウントが必要です)

## 方法A: GitHub連携(推奨・以後は自動デプロイ)

1. https://vercel.com にGitHubアカウントでログイン
2. **Add New… → Project** → `kurawork-oss/AIbou-Ofifce-app` を **Import**
3. Branch は `main`(このPRをマージ後)または `claude/ai-company-app-development-cy8lgb` を選択
4. Framework Preset は自動で **Next.js** と認識される(設定変更不要)
5. **Environment Variables** に必要なものを設定(すべて任意):
   | 変数名 | 内容 |
   |---|---|
   | `GEMINI_API_KEY` | Google AI StudioのAPIキー(議事録生成・無料枠あり) |
   | `ANTHROPIC_API_KEY` | Claude APIキー(Gemini未設定時のフォールバック) |
   | `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL(記憶保管庫) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonキー |
6. **Deploy** を押す → 1〜2分で `https://<プロジェクト名>.vercel.app` が発行される

以後、GitHubにpushするたびに自動で再デプロイされます(PRごとのプレビューURLも自動発行)。

## 方法B: CLIから即デプロイ

```bash
npm i -g vercel
cd AIbou-Ofifce-app
vercel        # 初回はログイン&プロジェクト設定(全部Enterでok)
vercel --prod # 本番URLへ
```

## Supabaseの準備(記憶保管庫を使う場合)

1. https://supabase.com で無料プロジェクトを作成
2. SQL Editorで `supabase/schema.sql` の内容を実行
3. Project Settings → API から URL と anon キーをコピーして環境変数に設定

## 注意

- 会社の状態(社員・KPI・履歴)はブラウザのlocalStorage保存なので、閲覧者ごとに独立した会社になります
- Supabaseを設定すると、社員の活動が記憶保管庫(`employee_memories`)に蓄積され、会社スナップショットが`company_state`に保存されます
- Googleアカウントのパスワードを実際に入力する場合は、公開URLの共有範囲に注意してください
