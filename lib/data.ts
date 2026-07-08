import type {
  Department,
  DepartmentId,
  Employee,
  HirePayload,
} from "./types";

export const DEPARTMENTS: Record<DepartmentId, Department> = {
  sales: {
    id: "sales",
    name: "営業部",
    mission: "コール・メールの自動やり取りでアポどり",
    color: "#e0592a",
  },
  admin: {
    id: "admin",
    name: "事務部",
    mission: "問い合わせ対応・営業リストの準備",
    color: "#2a7de0",
  },
  marketing: {
    id: "marketing",
    name: "マーケティング部",
    mission: "業界リサーチ・無料広告発信(X / note / YouTube)",
    color: "#8a3fd1",
  },
};

// 部署ごとの業務テンプレート。kind はエンジンがKPI連動を判定するキー。
export interface TaskTemplate {
  kind: string;
  label: string;
  details: string[];
  ticks: [number, number]; // 所要tick数の範囲
  statusLabel: string;
}

const COMPANY_NAMES = [
  "株式会社サンライズ物流",
  "ミライ製作所",
  "グリーンテック株式会社",
  "オフィスネクスト",
  "株式会社あおぞら商事",
  "テクノブリッジ",
  "株式会社ハナミズキ",
  "ノースリバー工業",
];

export const TASK_TEMPLATES: Record<DepartmentId, TaskTemplate[]> = {
  sales: [
    {
      kind: "call",
      label: "架電アポどり",
      details: COMPANY_NAMES.map((c) => `${c}へ架電・アポ打診`),
      ticks: [4, 7],
      statusLabel: "架電中",
    },
    {
      kind: "salesMail",
      label: "営業メール送信",
      details: COMPANY_NAMES.map((c) => `${c}へ提案メールを作成・送信`),
      ticks: [3, 5],
      statusLabel: "メール営業中",
    },
    {
      kind: "proposal",
      label: "提案ブラッシュアップ",
      details: [
        "MTGの決定事項を提案資料へ反映",
        "リサーチ知見をもとにトークスクリプト改善",
        "ニーズ別の提案パターンを整理",
      ],
      ticks: [4, 6],
      statusLabel: "提案改善中",
    },
  ],
  admin: [
    {
      kind: "leadList",
      label: "営業リスト作成",
      details: [
        "リサーチ知見をもとにターゲット企業を抽出",
        "スプレッドシートに営業リストを整備",
        "リストの重複チェックと優先度付け",
      ],
      ticks: [4, 6],
      statusLabel: "リスト作成中",
    },
    {
      kind: "inquiry",
      label: "問い合わせ対応",
      details: [
        "問い合わせチャットへ一次回答",
        "問い合わせメールへ返信ドラフト作成",
        "FAQを更新して自動応答を改善",
      ],
      ticks: [2, 4],
      statusLabel: "問い合わせ対応中",
    },
    {
      kind: "mailSort",
      label: "メール仕分け・庶務",
      details: [
        "受信メールをラベル整理",
        "共有ドキュメントの整理整頓",
        "各部署の日報をドキュメントにまとめ",
      ],
      ticks: [2, 4],
      statusLabel: "事務作業中",
    },
  ],
  marketing: [
    {
      kind: "research",
      label: "業界リサーチ",
      details: [
        "業界ニュースを収集して知見メモを作成",
        "競合サービスの価格・訴求を調査",
        "ターゲット業界の課題を洗い出し",
      ],
      ticks: [5, 8],
      statusLabel: "リサーチ中",
    },
    {
      kind: "post",
      label: "無料発信",
      details: [
        "X(旧Twitter)に業界Tipsを投稿",
        "noteに事例記事を執筆・公開",
        "YouTube動画の台本を作成",
      ],
      ticks: [4, 6],
      statusLabel: "コンテンツ発信中",
    },
    {
      kind: "adPlan",
      label: "発信企画",
      details: [
        "今週の発信カレンダーを作成",
        "反応の良かった投稿を分析",
        "新チャネルの開拓案を検討",
      ],
      ticks: [3, 5],
      statusLabel: "企画中",
    },
  ],
};

export const GAMES = [
  "レトロテトリス",
  "オセロ対戦",
  "タイピングレース",
  "将棋アプリ",
  "ぷよぷよ風パズル",
];

export const SEED_EMPLOYEES: Omit<
  Employee,
  "status" | "statusLabel" | "currentTask" | "joinedAt"
>[] = [
  {
    id: "emp-sato",
    name: "佐藤 蓮",
    role: "営業マネージャー",
    department: "sales",
    googleEmail: "ren.sato.aibou@gmail.com",
    googlePassword: "changeme-ren01",
    emoji: "🧑‍💼",
    color: "#e0592a",
    bio: "アポ獲得率にこだわる熱血型。トークスクリプトの改善が趣味。",
  },
  {
    id: "emp-takahashi",
    name: "高橋 美咲",
    role: "アポインター",
    department: "sales",
    googleEmail: "misaki.takahashi.aibou@gmail.com",
    googlePassword: "changeme-misaki01",
    emoji: "👩‍💼",
    color: "#f0824f",
    bio: "架電とメール営業の二刀流。断られてもめげない。",
  },
  {
    id: "emp-suzuki",
    name: "鈴木 葵",
    role: "事務リーダー",
    department: "admin",
    googleEmail: "aoi.suzuki.aibou@gmail.com",
    googlePassword: "changeme-aoi01",
    emoji: "🧑‍💻",
    color: "#2a7de0",
    bio: "スプレッドシート整備の達人。リストの精度に誇りを持つ。",
  },
  {
    id: "emp-tanaka",
    name: "田中 陽菜",
    role: "事務アシスタント",
    department: "admin",
    googleEmail: "hina.tanaka.aibou@gmail.com",
    googlePassword: "changeme-hina01",
    emoji: "👩‍💻",
    color: "#5ba3f5",
    bio: "問い合わせ対応が早くて丁寧。FAQ改善が得意。",
  },
  {
    id: "emp-ito",
    name: "伊藤 大和",
    role: "マーケリーダー",
    department: "marketing",
    googleEmail: "yamato.ito.aibou@gmail.com",
    googlePassword: "changeme-yamato01",
    emoji: "🕵️",
    color: "#8a3fd1",
    bio: "業界リサーチの鬼。数字とトレンドで語るタイプ。",
  },
  {
    id: "emp-watanabe",
    name: "渡辺 結衣",
    role: "コンテンツ担当",
    department: "marketing",
    googleEmail: "yui.watanabe.aibou@gmail.com",
    googlePassword: "changeme-yui01",
    emoji: "👩‍🎨",
    color: "#b06fe8",
    bio: "X・note・YouTubeの三刀流クリエイター。",
  },
];

// 社員追加提案の候補プール
export const HIRE_CANDIDATES: HirePayload[] = [
  {
    name: "山本 蒼真",
    role: "インサイドセールス",
    department: "sales",
    emoji: "🧑‍🚀",
    color: "#e07a2a",
    bio: "追客メールのパーソナライズが得意。",
    reason:
      "営業リストの在庫が捌き切れていません。架電要員を1名追加すればアポ獲得数の向上が見込めます。",
  },
  {
    name: "小林 芽依",
    role: "カスタマーサポート",
    department: "admin",
    emoji: "🧑‍🔧",
    color: "#2a9de0",
    bio: "問い合わせの一次対応と分類が高速。",
    reason:
      "問い合わせ件数が増加傾向です。対応を分担すれば事務のリスト作成時間を確保でき、営業の弾が増えます。",
  },
  {
    name: "加藤 悠",
    role: "動画クリエイター",
    department: "marketing",
    emoji: "🎬",
    color: "#a04fd1",
    bio: "YouTube向けショート動画の企画・台本が専門。",
    reason:
      "無料発信のうち動画チャネルが手薄です。専任を置けば認知経由の問い合わせ増加が期待できます。",
  },
];

// ツール申請テンプレート(無料ツール)
export const TOOL_REQUESTS = [
  {
    toolName: "Canva(無料プラン)",
    purpose: "note記事とX投稿のアイキャッチ画像を内製し、外注費ゼロで発信品質を上げる",
    howToAdd: "自分のGoogleアカウントでCanvaにサインアップ → 会社テンプレートフォルダを作成 → 共有リンクをドキュメントに記載",
  },
  {
    toolName: "Google Apps Script",
    purpose: "営業リストのスプレッドシートに重複チェックと自動整形を組み込み、リスト作成時間を短縮する",
    howToAdd: "既存のGoogleアカウントでスクリプトエディタを有効化 → リスト用シートにバインド → 実行権限を承認",
  },
  {
    toolName: "Notion(無料プラン)",
    purpose: "リサーチ知見のナレッジベースを構築し、部署間の情報共有ロスを削減する",
    howToAdd: "自分のGoogleアカウントでNotionにサインアップ → 会社ワークスペースを作成 → 全AI社員を招待",
  },
];

// 経費申請テンプレート(有料・要検討)
export const EXPENSE_REQUESTS = [
  {
    itemName: "メール配信ツール(有料プラン)",
    monthlyCost: 3000,
    freeAlternativeConsidered:
      "Gmailの手動送信+Apps Scriptの自動化を検討しましたが、1日の送信上限に達し営業メールが止まります。",
    whyPaidIsBetter:
      "配信数上限の解除と開封率トラッキングで、アポ獲得単価を下げられる見込みです。",
  },
  {
    itemName: "業界レポート購読(月額)",
    monthlyCost: 1980,
    freeAlternativeConsidered:
      "無料の業界ニュースサイトを巡回していますが、統計データの一次情報が取れません。",
    whyPaidIsBetter:
      "一次データに基づくリサーチ知見の質が上がり、営業提案の刺さりが良くなります。",
  },
];

export const MEETING_AGENDAS = [
  "週次売上MTG:リサーチ知見の共有と営業リストの方針決め",
  "定例MTG:発信コンテンツの反応レビューと提案への反映",
  "定例MTG:アポ獲得率の振り返りとトークスクリプト改善",
];
