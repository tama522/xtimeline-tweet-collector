# Widget API Dockerfile

FROM node:18-alpine

# 作業ディレクトリ設定
WORKDIR /app

# システムパッケージ更新・インストール
RUN apk update && apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# package.json をコピー
COPY package.json ./

# 依存関係インストール
RUN npm install --production --no-cache

# アプリケーションコードコピー
COPY . .

# 非rootユーザー作成
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001 \
    && chown -R nextjs:nodejs /app
USER nextjs

# ポート公開
EXPOSE 3001

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# アプリケーション起動
CMD ["node", "widget_api_saas.js"]