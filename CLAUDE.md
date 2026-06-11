# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

XタイムラインシステムはXのタイムラインを取得・表示するシステムです。スタンドアロンのPythonスクリプト版とSaaS版の両方を提供します。

**表示や解説は日本語で。**

## アーキテクチャ

### スタンドアロン版
- **Python Scripts**: twikitライブラリを使用したX API接続
- **SQLite Database**: ツイートデータの永続化
- **Cookie認証**: ログイン情報の保存と再利用

### SaaS版
- **Backend**: FastAPI + PostgreSQL + Redis
- **Frontend**: React (Vite) + TypeScript + Tailwind CSS
- **Admin Frontend**: 運営管理画面
- **Widget API**: JavaScript埋め込みウィジェット (Node.js + Express)
- **Nginx**: リバースプロキシ

## 開発コマンド

### Docker環境
```bash
# 開発環境の起動
docker-compose up -d

# 個別サービスの起動
docker-compose up postgres redis  # データベースのみ
docker-compose up backend         # バックエンドのみ

# ログ確認
docker-compose logs -f backend
```

### フロントエンド開発
```bash
# React フロントエンド
cd frontend
npm run dev          # 開発サーバー
npm run build        # 本番ビルド
npm run lint         # リント
npm run type-check   # 型チェック

# Admin フロントエンド
cd admin-frontend
npm run dev
npm run build
npm run lint
npm run type-check
```

### バックエンド開発
```bash
cd backend
# 仮想環境作成・有効化
python -m venv venv
source venv/bin/activate  # Linux/Mac
# または venv\Scripts\activate  # Windows

# 依存関係インストール
pip install -r requirements.txt

# 開発サーバー起動
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# テスト実行
pytest

# リント・フォーマット
black .
isort .
mypy .
```

### スタンドアロン版
```bash
# 一回のタイムライン取得
python run_timeline.py

# 特定ユーザーのタイムライン取得
python get_user_timeline.py elonmusk --count 20

# 自動更新モード
python auto_update.py

# 保存されたツイートの表示
python view_tweets.py
```

## 重要な設定情報

### X API認証情報
- ユーザーID: shonanesthefan
- パスワード: hevrEq-1gibhi-bysrut
- 認証はcookies.jsonに保存され、以降の実行で再利用される

### データベース構造
- **スタンドアロン版**: SQLite (timeline.db)
- **SaaS版**: PostgreSQL
  - テナント管理 (tenants)
  - ユーザー管理 (users) 
  - ツイートデータ (tweets)
  - X認証情報 (twitter_credentials)

## ディレクトリ構造

```
xtimeline-dev/
├── backend/               # FastAPI バックエンド
│   ├── app/
│   │   ├── api/          # API エンドポイント
│   │   ├── core/         # 設定・DB・セキュリティ
│   │   ├── models/       # SQLAlchemy モデル
│   │   ├── schemas/      # Pydantic スキーマ
│   │   └── services/     # ビジネスロジック
│   └── requirements.txt
├── frontend/             # React フロントエンド
├── admin-frontend/       # 運営管理画面
├── xtimeline-widget/     # Widget API (Node.js)
├── xtimeline-widget-saas/# Widget API SaaS版
├── *.py                  # スタンドアロン版スクリプト
├── docker-compose.yml    # 開発環境
└── nginx/               # プロキシ設定
```

## デプロイメント

### 本番環境
```bash
# インストールスクリプト実行
sudo ./install.sh

# systemdサービス管理
sudo systemctl start xtimeline
sudo systemctl status xtimeline
sudo journalctl -u xtimeline -f

# 統合管理スクリプト
sudo ./xtimeline-control.sh start   # 全サービス開始
sudo ./xtimeline-control.sh health  # ヘルスチェック
sudo ./xtimeline-control.sh logs    # ログ確認
```

### Docker本番デプロイ
```bash
# 本番用ビルド
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# SSL設定
# ssl-setup.md を参照
```

## API エンドポイント

### Backend API (FastAPI)
- `/api/v1/docs` - API ドキュメント
- `/api/v1/auth/` - 認証関連
- `/api/v1/tenants/` - テナント管理
- `/api/v1/timeline/` - タイムライン操作
- `/health` - ヘルスチェック

### Widget API
- `/widget.js?user=username&count=10` - JavaScript埋め込み

## セキュリティ

- JWT認証 (Access Token + Refresh Token)
- パスワードハッシュ化 (bcrypt)
- X認証情報の暗号化保存
- CORS設定
- Rate Limiting
- ファイアウォール設定 (UFW)
- 侵入検知 (fail2ban)

## トラブルシューティング

### 権限エラー
```bash
sudo chown -R xtimeline:xtimeline /opt/xtimeline
sudo chmod 600 /opt/xtimeline/cookies.json
```

### データベース接続エラー
```bash
# PostgreSQL接続確認
docker-compose exec postgres pg_isready -U xtimeline

# Redis接続確認  
docker-compose exec redis redis-cli ping
```

### Widget API キャッシュ問題
- Nginx設定でキャッシュ無効化が必要
- ブラウザキャッシュクリア (Ctrl+F5)

## twikitライブラリ使用上の注意

- X API rate limitを遵守
- 認証情報の適切な管理
- Cookie認証による自動ログイン
- SQLiteでのツイート重複除外
- 時間帯別更新間隔の最適化