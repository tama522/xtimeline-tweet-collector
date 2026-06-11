# XTimeline Chrome拡張機能 セットアップガイド

このガイドでは、XTimeline Chrome拡張機能を使用するためのサーバー起動とAPIキー取得方法を説明します。

## 📋 前提条件

- Python 3.8+
- Node.js 18+
- Docker & Docker Compose
- Chrome ブラウザ

## 🚀 サーバーの建て方

### 1. バックエンドサーバーの起動

```bash
# プロジェクトルートに移動
cd /Users/mono/Develop/xtimeline-dev

# バックエンドディレクトリに移動
cd backend

# 仮想環境を作成・有効化（初回のみ）
python -m venv venv
source venv/bin/activate  # Mac/Linux
# または venv\Scripts\activate  # Windows

# 依存関係をインストール（初回のみ）
pip install -r requirements.txt

# データベースマイグレーション（初回のみ）
alembic upgrade head

# サーバー起動
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**起動成功時の表示例**：
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx] using statchange
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### 2. フロントエンドの起動（ユーザー登録用）

```bash
# 新しいターミナルを開いて
cd /Users/mono/Develop/xtimeline-dev/frontend

# 依存関係をインストール（初回のみ）
npm install

# 開発サーバー起動
npm run dev
```

フロントエンドは `http://localhost:5173` で起動します。

### 3. Docker を使用する場合

```bash
# プロジェクトルートで
# 新しいDocker（Docker Desktop 3.4.0以降）の場合
docker compose up -d postgres redis  # データベースのみ
docker compose up -d  # 全サービス

# 古いDockerの場合
docker-compose up -d postgres redis  # データベースのみ
docker-compose up -d  # 全サービス
```

**注意**: 最新のDockerでは`docker-compose`の代わりに`docker compose`（ハイフンなし）を使用します。

## 🔑 APIキーの取得方法

### Method 1: フロントエンド経由（推奨）

#### Step 1: ユーザー登録

1. ブラウザで `http://localhost:5173` にアクセス
2. 「新規登録」をクリック
3. 以下の情報を入力：
   - **メール**: `admin@xtimeline.com`
   - **パスワード**: 任意の強力なパスワード
   - **名前**: `System Administrator`
4. 登録完了後、自動的にログインされます

#### Step 2: APIキーの作成

1. ログイン後、ダッシュボードで「設定」または「API管理」メニューを探す
2. 「APIキーを作成」ボタンをクリック
3. APIキー作成フォームで以下を入力：
   - **名前**: `Chrome Extension` （識別用）
   - **権限**: `read`, `write` を選択
4. 「作成」ボタンをクリック
5. **⚠️ 重要**: 表示されたAPIキーをコピーして保存（二度と表示されません）

### Method 2: コマンドライン経由

#### 管理者ユーザーの作成

```bash
# backendディレクトリで管理者を作成
cd backend
python create_admin.py
```

#### API Endpointsを直接使用

```bash
# 1. ユーザー登録
curl -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@xtimeline.com",
    "password": "your_password",
    "full_name": "System Administrator"
  }'

# 2. ログイン
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin@xtimeline.com",
    "password": "your_password"
  }'

# レスポンスからaccess_tokenを取得

# 3. APIキー作成
curl -X POST "http://localhost:8000/api/v1/auth/api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "Chrome Extension",
    "permissions": ["read", "write"]
  }'
```

### Method 3: データベース直接操作

```bash
# PostgreSQLに直接接続
docker-compose exec postgres psql -U xtimeline -d xtimeline

-- 管理者ユーザー作成
INSERT INTO tenants (id, name, is_active) VALUES (gen_random_uuid(), 'Default Tenant', true);

-- 作成されたテナントIDを確認
SELECT id, name FROM tenants;

-- 管理者ユーザー作成（テナントIDを上記で確認したものに置き換え）
INSERT INTO users (id, tenant_id, email, hashed_password, full_name, role)
VALUES (
  gen_random_uuid(),
  'テナントID',  -- 上記で確認したID
  'admin@xtimeline.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFyD',  -- パスワードハッシュ
  'System Administrator',
  'admin'
);
```

## ✅ 動作確認

### 1. サーバーの動作確認

```bash
# ヘルスチェック
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-XX..."}

# API仕様の確認
curl http://localhost:8000/docs
# ブラウザで http://localhost:8000/docs にアクセス
```

### 2. APIキーの動作確認

```bash
# 作成したAPIキーをテスト
curl -X GET "http://localhost:8000/api/v1/twitter/credentials" \
  -H "X-API-Key: YOUR_API_KEY"

# Expected response:
# {
#   "credentials": [],
#   "total": 0
# }
```

## 🔧 Chrome拡張機能のインストールと設定

### 1. 拡張機能のインストール

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `chrome-extension-tweet-collector` ディレクトリを選択

### 2. 拡張機能の設定

1. Chrome拡張機能のアイコンをクリック
2. 「詳細設定」ボタンをクリック
3. 設定画面で以下を入力：
   - **APIエンドポイント**: `http://localhost:8000`
   - **APIキー**: 取得したAPIキー（`xta_` で始まる文字列）
4. 「接続テスト」ボタンをクリックして接続確認
5. 「設定を保存」ボタンで保存

### 3. 使用開始

1. X.com (twitter.com) にアクセス
2. 拡張機能のポップアップを開く
3. 「開始」ボタンをクリック
4. タイムラインを閲覧すると自動的にツイートが収集されます

## 🚨 トラブルシューティング

### サーバーが起動しない場合

```bash
# ポートが使用中かチェック
lsof -i :8000
# 使用中の場合、プロセスを終了するか別のポートを使用

# PostgreSQLの状態確認
docker compose ps  # 新しいDockerの場合
# または
docker-compose ps  # 古いDockerの場合

# ログ確認
docker compose logs backend
docker compose logs postgres
```

### docker-compose: command not found エラーの場合

最新のDockerでは`docker-compose`の代わりに`docker compose`（ハイフンなし）を使用します：

```bash
# 古いコマンド（エラーになる場合）
docker-compose up -d postgres redis

# 新しいコマンド
docker compose up -d postgres redis
```

### Dockerが起動していない場合

エラー: `Cannot connect to the Docker daemon`

**解決方法**:

1. **Docker Desktopを起動**（macOS/Windows）:
   - アプリケーションフォルダから「Docker」を起動
   - メニューバーにDockerアイコンが表示されるまで待機
   - Dockerアイコンが「Docker Desktop is running」と表示されることを確認

2. **Dockerなしでローカル環境を構築**:

   ```bash
   # PostgreSQLのインストール（Homebrew使用）
   brew install postgresql@15
   brew services start postgresql@15
   
   # データベースを作成
   createdb xtimeline_saas
   
   # ユーザーを作成
   psql -d xtimeline_saas -c "CREATE USER xtimeline WITH PASSWORD 'password';"
   psql -d xtimeline_saas -c "GRANT ALL PRIVILEGES ON DATABASE xtimeline_saas TO xtimeline;"
   
   # Redisのインストール
   brew install redis
   brew services start redis
   ```

### Pydantic ValidationError の場合

エラー: `Extra inputs are not permitted`

**原因**: .envファイルに古い環境変数が残っている

**解決方法**:

1. `.env`ファイルの不要な環境変数をコメントアウト：
   ```bash
   # Twitter/X API設定（現在は使用していません）
   # TWITTER_API_KEY=your_twitter_api_key
   # TWITTER_API_SECRET=your_twitter_api_secret
   # TWITTER_ACCESS_TOKEN=your_twitter_access_token
   # TWITTER_ACCESS_TOKEN_SECRET=your_twitter_access_token_secret
   ```

2. または`config.py`を修正して余分な環境変数を無視：
   ```python
   model_config = {
       "env_file": ".env",
       "case_sensitive": True,
       "extra": "ignore"  # 未定義の環境変数を無視
   }
   ```

### データベース接続エラーの場合

```bash
# データベースコンテナを再起動
docker-compose restart postgres

# マイグレーション実行
cd backend
alembic upgrade head

# データベース接続確認
docker-compose exec postgres pg_isready -U xtimeline
```

### APIキーが作成できない場合

1. **ユーザーログイン確認**:
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"username": "admin@xtimeline.com", "password": "your_password"}'
   ```

2. **バックエンドログ確認**:
   ```bash
   docker-compose logs -f backend
   ```

3. **権限確認**: ユーザーが適切な権限を持っているか確認

### Chrome拡張機能の問題

#### 「APIキーが設定されていません」エラー
- Options画面でAPIキーが正しく設定されているか確認
- APIキーの形式が `xta_` で始まっているか確認

#### 「接続に失敗しました」エラー
- バックエンドサーバーが起動しているか確認: `curl http://localhost:8000/health`
- APIエンドポイントURLが正しいか確認
- ファイアウォールやプロキシ設定を確認

#### ツイートが収集されない
- X.comにログインしているか確認
- Content Scriptが正常に読み込まれているか確認（デベロッパーツールのコンソール確認）
- デバッグモードを有効化してログ確認

## 📝 設定オプション詳細

### API接続設定
- **APIエンドポイント**: `http://localhost:8000` (開発環境)
- **APIキー**: `xta_` で始まる32文字の文字列

### 収集設定
- **収集間隔**: 5000-10000ms 推奨
- **バッチサイズ**: 10-20 推奨
- **最大リトライ回数**: 3 推奨

### フィルタリング設定
- **リプライを収集**: 返信ツイートの収集可否
- **リツイートを収集**: リツイートの収集可否
- **引用ツイートを収集**: 引用ツイートの収集可否
- **除外キーワード**: 改行区切りで指定
- **必須キーワード**: 改行区切りで指定（空の場合は全て収集）

### プライバシー設定
- **データを匿名化**: ユーザー名等の個人情報を除去
- **ローカルストレージのみ**: API送信せずローカル保存のみ
- **データ保持期間**: 1-365日で指定

### 高度な設定
- **デバッグモード**: コンソールに詳細ログ出力
- **カスタムセレクター**: X.com構造変更時の対応用JSON設定

## 🔐 セキュリティ注意事項

- APIキーは安全に保管し、他人と共有しないでください
- 定期的にAPIキーをローテーションすることを推奨します
- 本番環境では必ずHTTPS通信を使用してください
- 過度なスクレイピングはX.comの利用規約違反となる可能性があります

## 📞 サポート

問題が解決しない場合は、以下の情報を含めてサポートに連絡してください：

1. エラーメッセージの全文
2. ブラウザのコンソールログ
3. 実行したコマンドとその結果
4. 使用している環境（OS、Chromeバージョンなど）

---

**最終更新**: 2024年1月