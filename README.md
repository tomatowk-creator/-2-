# 📘 簿記2級 CBT模擬試験 - Googleスプレッドシート ＋ GAS サーバーレス連携Webアプリ

Googleスプレッドシートをデータベースとし、Google Apps Script (GAS) をAPIとして活用してフロントエンド（Vanilla HTML/CSS/JS）とリアルタイム双方向連携する、サーバー代永久0円・完全無料のCBT模擬試験Webアプリケーションです。

---

## 🏛 アーキテクチャ構成

本システムは **「フロントエンドの表示・状態管理」** と **「バックエンドの永続化処理」** を完全に分離させたJamstack型構成です。

- **フロントエンド (Front-End)**: `index.html`（Vanilla HTML5 / CSS3 / ES6+ JavaScript）
  - Node.jsやビルドツール・外部ライブラリ非依存。ブラウザ単体および GitHub Pages で即座に動作。
  - **楽観的UI更新 (Optimistic UI Update)**: ユーザーの操作（★復習チェック・採点等）に対し体感速度0msで画面とメモリ状態を即時更新。
  - **タイムアウト＆フォールバック**: 10秒の `AbortController` タイムアウト制限と、オフライン時のローカルデータフォールバック機構を搭載。
- **バックエンド (API Gateway)**: Google Apps Script (`gas_code.js`)
  - `doGet(e)` 単一エンドポイント。`ContentService.MimeType.JSON` により CORS 制限を根本回避。
  - 全データ取得（GET）および特定レコードのセル単位リアルタイム更新（POST風GET）を非同期処理（`mode: 'no-cors'`）。
- **データベース (Storage)**: Google スプレッドシート（5つの専用シート）
  - GUI付きのRDBテーブルとして永続データを保持・一括編集可能。

---

## 📂 ファイル構成

```text
.
├── index.html        # Webアプリケーション本体（HTML/CSS/JS完全一体型）
├── gas_code.js       # Google Apps Script（GAS）用バックエンドコード
└── README.md         # 本ドキュメント
```

---

## 🚀 導入・デプロイ手順

### STEP 1: スプレッドシートの作成
Googleスプレッドシートを新規作成し、以下の5つのシート（タブ名）を作成します：

1. **`仕訳問題`** (第1問の仕訳問題)
2. **`商業簿記_総合`** (第2問・第3問の総合問題)
3. **`工業簿記_総合`** (第4問・第5問の総合問題)
4. **`勘定科目マスタ`** (プルダウン選択肢・混同科目マスタ)
5. **`学習履歴`** (ユーザーの解答履歴・復習フラグ書き込み用)

> ※ スプレッドシートの入力用プロンプト・詳細なカラム構造は後述の「📊 スプレッドシートのカラム構造」を参照してください。

### STEP 2: GAS（Google Apps Script）のデプロイ
1. スプレッドシートの上部メニュー **「拡張機能」➔ 「Apps Script」** を開きます。
2. エディタ内の既存コードを削除し、本リポジトリの [`gas_code.js`](./gas_code.js) の内容をすべて貼り付けて保存（`Ctrl + S` / `Cmd + S`）します。
3. 右上の **「デプロイ」➔ 「新しいデプロイ」** をクリックします。
   - **種類**: `ウェブアプリ`
   - **実行ユーザー**: `自分`
   - **アクセスできるユーザー**: `全員` *(※必須)*
4. **「デプロイ」** をクリックし、発行された **ウェブアプリURL**（`https://script.google.com/macros/s/.../exec`）をコピーします。

### STEP 3: `index.html` にURLを設定してGitHub Pagesで公開
1. [`index.html`](./index.html) を開き、`script` タグ内の最上部付近にある `GAS_URL` にコピーしたURLを貼り付けます：
   ```javascript
   const GAS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec';
   ```
2. 本リポジトリを GitHub にプッシュし、リポジトリの **「Settings」➔ 「Pages」** から Branch を `main / (root)` に指定して Save します。
3. 発行された GitHub Pages のURLにアクセスし、画面上に **「📡 スプレッドシート連携中」**（緑色バッジ）が表示されればセットアップ完了です！

---

## 📊 スプレッドシートのカラム構造

### 1. `仕訳問題`
| A列 | B列 | C列 | D列 | E列 | F列 | G列 | H列 | I列 | J列 | K列 | L列 | M列 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `id` | `text` | `explanation` | `debit_account_1` | `debit_amount_1` | `debit_account_2` | `debit_amount_2` | `credit_account_1` | `credit_amount_1` | `credit_account_2` | `credit_amount_2` | `credit_account_3` | `credit_amount_3` |

### 2. `商業簿記_総合` / 3. `工業簿記_総合`
| A列 | B列 | C列 | D列 | E列 | F列 | G列 | H列 | ... | Q列 |
|---|---|---|---|---|---|---|---|---|---|
| `id` | `question_type` | `title` | `points` | `explanation` | `ans_1_id` | `ans_1_correct` | `ans_1_points` | ... | `ans_4_points` |

※ `question_type` の指定値: `q2_commercial`, `q3_commercial_closing`, `q4_industrial`, `q5_industrial`

### 4. `勘定科目マスタ`
| A列 | B列 | C列 |
|---|---|---|
| `account_name` | `category` | `confusable_group` |

### 5. `学習履歴`
| A列 | B列 | C列 | D列 | E列 | F列 |
|---|---|---|---|---|---|
| `question_id` | `is_starred` | `attempt_count` | `correct_count` | `last_attempted_at` | `last_result` |

---

## 🛡 ライセンス・免責事項
本アプリケーションは日商簿記2級ネット試験（CBT方式）のUIおよび挙動を再現した学習用教材です。
