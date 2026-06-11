# Gitを使用したXタイムライン取得システムのデプロイ方法

## 前提条件

- サーバーにgitがインストールされていること
- GitHubまたはGitリポジトリにプロジェクトがアップロードされていること

## 初回デプロイ手順

### 1. gitのインストール（必要に応じて）

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install git
```

**CentOS/RHEL:**
```bash
sudo dnf install git
```

### 2. リポジトリのクローン

```bash
# 作業ディレクトリに移動
cd /tmp

# リポジトリをクローン（GitHubの場合）
git clone https://github.com/youruser/xtimeline.git

# プライベートリポジトリの場合（認証が必要）
git clone https://username:token@github.com/youruser/xtimeline.git

# または SSH鍵を使用
git clone git@github.com:youruser/xtimeline.git

# クローンしたディレクトリに移動
cd xtimeline
```

### 3. 自動インストールの実行

```bash
# インストールスクリプトに実行権限を付与
chmod +x install.sh

# インストールを実行
sudo ./install.sh
```

## アップデート手順

### 1. 最新版の取得

```bash
# インストールディレクトリに移動
cd /opt/xtimeline

# 最新版を取得
sudo -u xtimeline git pull origin main

# または一時ディレクトリで更新してからコピー
cd /tmp/xtimeline
git pull origin main
sudo cp -r ./*.py /opt/xtimeline/
sudo chown -R xtimeline:xtimeline /opt/xtimeline/*.py
```

### 2. サービスの再起動

```bash
# サービスを再起動
sudo systemctl restart xtimeline

# 状態確認
sudo systemctl status xtimeline
```

## 特定のバージョンのデプロイ

### タグ付きバージョンのデプロイ

```bash
# 利用可能なタグを確認
git tag -l

# 特定のタグをチェックアウト
git checkout v1.0.0

# または特定のコミットを指定
git checkout <commit-hash>
```

### ブランチの切り替え

```bash
# 利用可能なブランチを確認
git branch -r

# 特定のブランチに切り替え
git checkout develop
git pull origin develop
```

## GitHubとの連携設定

### 1. Personal Access Token（PAT）の作成

1. GitHub → Settings → Developer settings → Personal access tokens
2. 「Generate new token」をクリック
3. 必要な権限（repo）を選択
4. トークンを生成してコピー

### 2. 認証情報の設定

```bash
# HTTPS認証の場合
git config --global credential.helper store
echo "https://username:your_token@github.com" > ~/.git-credentials

# または環境変数で設定
export GITHUB_TOKEN="your_token"
git clone https://${GITHUB_TOKEN}@github.com/youruser/xtimeline.git
```

### 3. SSH鍵認証の設定

```bash
# SSH鍵の生成
ssh-keygen -t ed25519 -C "your_email@example.com"

# 公開鍵をGitHubに登録
cat ~/.ssh/id_ed25519.pub

# SSH設定ファイルの作成
cat >> ~/.ssh/config << EOF
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
EOF
```

## 自動デプロイスクリプト

### update-from-git.sh の作成

```bash
cat > /opt/xtimeline/update-from-git.sh << 'EOF'
#!/bin/bash

# 自動アップデートスクリプト
set -e

REPO_URL="https://github.com/youruser/xtimeline.git"
INSTALL_DIR="/opt/xtimeline"
SERVICE_NAME="xtimeline"
TEMP_DIR="/tmp/xtimeline-update"

echo "Xタイムライン取得システムを更新しています..."

# 一時ディレクトリでリポジトリを更新
rm -rf "${TEMP_DIR}"
git clone "${REPO_URL}" "${TEMP_DIR}"
cd "${TEMP_DIR}"

# サービスを停止
echo "サービスを停止中..."
systemctl stop "${SERVICE_NAME}"

# ファイルを更新
echo "ファイルを更新中..."
cp -r ./*.py "${INSTALL_DIR}/"
cp -r ./systemd_service_template.txt "${INSTALL_DIR}/"
cp -r ./CLAUDE.md "${INSTALL_DIR}/"
cp -r ./README.md "${INSTALL_DIR}/"

# 権限を設定
chown -R xtimeline:xtimeline "${INSTALL_DIR}"
chmod -R 755 "${INSTALL_DIR}"
chmod 600 "${INSTALL_DIR}"/*.json 2>/dev/null || true

# サービスを開始
echo "サービスを開始中..."
systemctl start "${SERVICE_NAME}"

# 状態確認
sleep 5
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    echo "更新が完了しました！"
    systemctl status "${SERVICE_NAME}" --no-pager
else
    echo "エラー: サービスの開始に失敗しました"
    systemctl status "${SERVICE_NAME}" --no-pager
    exit 1
fi

# 一時ディレクトリを削除
rm -rf "${TEMP_DIR}"
EOF

# 実行権限を付与
chmod +x /opt/xtimeline/update-from-git.sh
chown xtimeline:xtimeline /opt/xtimeline/update-from-git.sh
```

### 使用方法

```bash
# 手動更新
sudo /opt/xtimeline/update-from-git.sh

# cronで定期更新（例：毎日午前3時）
echo "0 3 * * * root /opt/xtimeline/update-from-git.sh >> /var/log/xtimeline-update.log 2>&1" >> /etc/crontab
```

## GitHub Actionsを使用した自動デプロイ

### .github/workflows/deploy.yml の作成

```yaml
name: Deploy to Server

on:
  push:
    branches: [ main ]
  release:
    types: [ published ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.KEY }}
        script: |
          cd /opt/xtimeline
          sudo -u xtimeline git pull origin main
          sudo systemctl restart xtimeline
          sudo systemctl status xtimeline
```

## トラブルシューティング

### 認証エラーの場合

```bash
# 認証情報をクリア
git config --global --unset credential.helper
rm ~/.git-credentials

# 再度認証設定
git config --global credential.helper store
```

### プルエラーの場合

```bash
# 競合状態をリセット
git fetch origin
git reset --hard origin/main

# または強制的にプル
git pull --force origin main
```

### 権限エラーの場合

```bash
# 所有権を修正
sudo chown -R xtimeline:xtimeline /opt/xtimeline

# gitディレクトリの権限を修正
sudo chmod -R 755 /opt/xtimeline/.git
```

## セキュリティ考慮事項

1. **認証情報の管理**
   - Personal Access Tokenは環境変数で管理
   - SSH鍵は適切な権限で保護

2. **リポジトリの保護**
   - プライベートリポジトリの使用を推奨
   - 機密情報はリポジトリに含めない

3. **自動更新の注意点**
   - 本番環境では手動更新を推奨
   - 更新前のバックアップを実施

この手順に従って、gitを使用した効率的なデプロイと更新が可能になります。