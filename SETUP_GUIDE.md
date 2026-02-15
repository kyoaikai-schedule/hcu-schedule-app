# セットアップガイド

## 全体の流れ

```
1. Supabaseでテーブル作成（SQL実行）
2. GitHubに新しいリポジトリを作成
3. このプロジェクトの全ファイルをアップロード
4. VercelでGitHubリポジトリをインポート
5. デプロイ完了！
```

---

## Step 1: Supabaseテーブル作成

1. https://supabase.com のダッシュボードを開く
2. プロジェクト「4W_nurse-schedule」を選択
3. 左メニューの「**SQL Editor**」をクリック
4. 「**New query**」をクリック
5. `supabase_setup.sql` の内容を全て貼り付け
6. 「**Run**」をクリック
7. 「Success」と表示されれば完了

---

## Step 2: GitHubに新しいリポジトリ作成

1. https://github.com/new にアクセス
2. リポジトリ名: `nurse-schedule-v3`（好きな名前でOK）
3. 「Private」を選択
4. 「Create repository」をクリック

---

## Step 3: ファイルをアップロード

### 方法A: GitHubのWebUIから（推奨）

1. 作成したリポジトリのページを開く
2. 「uploading an existing file」のリンクをクリック
3. ZIPを展開したフォルダの **中身全て** をドラッグ&ドロップ
4. 「Commit changes」をクリック

### ⚠️ 重要: フォルダ構造

アップロード後、リポジトリのルートに以下のファイルが直接見えることを確認：

```
nurse-schedule-v3/          ← リポジトリのルート
├── public/                 ← ✅ ルート直下にある
│   ├── manifest.json
│   └── icon-*.png
├── src/
├── index.html              ← ✅ ルート直下にある
├── package.json            ← ✅ ルート直下にある
├── vite.config.ts          ← ✅ ルート直下にある
├── vercel.json             ← ✅ ルート直下にある
└── ...
```

❌ 以下のようにサブフォルダに入っていたらNG：
```
nurse-schedule-v3/
└── nurse-schedule-app/     ← ❌ 余分なフォルダ
    ├── public/
    ├── src/
    └── ...
```

---

## Step 4: Vercelでデプロイ

1. https://vercel.com/new にアクセス
2. 「Import Git Repository」で `nurse-schedule-v3` を選択
3. 設定画面で以下を確認:
   - **Framework Preset**: Vite（自動検出されるはず）
   - **Root Directory**: 空欄のまま（変更不要！）
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. 「**Deploy**」をクリック
5. 1〜2分でデプロイ完了

---

## Step 5: 動作確認

1. Vercelが提供するURLにアクセス
2. ログイン画面が表示されれば成功！
3. 管理者パスワード: `admin123`

### manifest.jsonの確認
ブラウザで `https://あなたのドメイン.vercel.app/manifest.json` にアクセス
→ JSONが表示されればPWA設定も成功

---

## なぜ今回は上手くいくのか

### 以前の問題の根本原因
```
旧リポジトリ:
  nurse-schedule-app-v4/           ← GitHubリポジトリ
    └── nurse-schedule-app/        ← サブフォルダ（Root Directory設定が必要）
        ├── public/
        ├── src/
        └── ...
```
- VercelのRoot Directory設定にスペースが混入
- Viteがpublicフォルダを認識しない
- GitHubとVercelの接続が不安定

### 今回の解決策
```
nurse-schedule-v3/                 ← GitHubリポジトリ = プロジェクトルート
  ├── public/                      ← ルート直下（Root Directory設定不要）
  ├── src/
  ├── vercel.json                  ← ビルド設定を明示的に指定
  ├── vite.config.ts               ← publicDir: 'public' を明示
  └── ...
```
- サブフォルダなし → Root Directory設定が不要
- vercel.json でビルド設定を明示 → Vercelの自動検出に依存しない
- vite.config.ts でpublicDirを明示 → 確実にpublic/がコピーされる
