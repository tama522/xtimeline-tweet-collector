#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * XTimeline SaaS Widget API
 * マルチテナント対応のツイート埋め込みWidget APIサーバー
 */

const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// セキュリティ設定
app.use(helmet({
    contentSecurityPolicy: false, // Widget用にCSPを無効化
    crossOriginEmbedderPolicy: false
}));

// CORS設定
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: false
};
app.use(cors(corsOptions));

// データベース接続プール
const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL || 
        'postgresql://xtimeline:password@localhost:5432/xtimeline_saas',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Redis接続（キャッシュ用）
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
});

// レート制限設定
const createRateLimiter = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // API Key + IP Address でレート制限
        const apiKey = req.query.api_key || req.headers['x-api-key'] || '';
        return `${crypto.createHash('sha256').update(apiKey + req.ip).digest('hex')}`;
    }
});

// 速度制限設定
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15分
    delayAfter: 50, // 50リクエスト後に遅延開始
    delayMs: 500 // 500ms遅延
});

// レート制限適用
if (NODE_ENV === 'production') {
    app.use('/widget.js', createRateLimiter(
        15 * 60 * 1000, // 15分
        1000, // 最大1000リクエスト
        'Too many widget requests, please try again later.'
    ));
    app.use('/widget.js', speedLimiter);
}

/**
 * APIキーでテナント認証
 * @param {string} apiKey - APIキー
 * @returns {Promise<Object|null>} テナント情報
 */
async function authenticateTenant(apiKey) {
    if (!apiKey || !validator.isLength(apiKey, { min: 10, max: 100 })) {
        return null;
    }

    try {
        // キャッシュから確認
        const cacheKey = `tenant:${crypto.createHash('sha256').update(apiKey).digest('hex')}`;
        const cached = await redis.get(cacheKey);
        
        if (cached) {
            return JSON.parse(cached);
        }

        // データベースから確認
        const query = `
            SELECT id, name, subdomain, plan_id, is_active, 
                   max_accounts, max_tweets_per_month
            FROM tenants 
            WHERE api_key = $1 AND is_active = true
        `;
        
        const result = await dbPool.query(query, [apiKey]);
        
        if (result.rows.length === 0) {
            return null;
        }

        const tenant = result.rows[0];
        
        // キャッシュに保存（5分間）
        await redis.setex(cacheKey, 300, JSON.stringify(tenant));
        
        return tenant;
        
    } catch (error) {
        console.error('テナント認証エラー:', error);
        return null;
    }
}

/**
 * テナントのツイートを取得
 * @param {string} tenantId - テナントID
 * @param {string} username - ユーザー名
 * @param {number} count - 取得件数
 * @param {boolean} excludeRetweets - リツイート除外
 * @returns {Promise<Array>} ツイートの配列
 */
async function getTweetsByTenant(tenantId, username, count = 10, excludeRetweets = true) {
    try {
        // キャッシュキー
        const cacheKey = `tweets:${tenantId}:${username}:${count}:${excludeRetweets}`;
        const cached = await redis.get(cacheKey);
        
        if (cached) {
            return JSON.parse(cached);
        }

        // データベースから取得
        let query = `
            SELECT id, user_screen_name, created_at, text, 
                   retweet_count, favorite_count, reply_count
            FROM tweets 
            WHERE tenant_id = $1 
              AND LOWER(user_screen_name) = LOWER($2)
        `;
        
        const params = [tenantId, username];
        
        if (excludeRetweets) {
            query += ` AND is_retweet = false`;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $3`;
        params.push(count);

        const result = await dbPool.query(query, params);
        const tweets = result.rows;

        // キャッシュに保存（2分間）
        await redis.setex(cacheKey, 120, JSON.stringify(tweets));
        
        return tweets;
        
    } catch (error) {
        console.error('ツイート取得エラー:', error);
        return [];
    }
}

/**
 * Twitter埋め込み用JavaScriptコードを生成
 * @param {Array} tweets - ツイートデータの配列
 * @param {string} username - ユーザー名
 * @param {Object} config - ウィジェット設定
 * @returns {string} JavaScript コード
 */
function generateEmbedJS(tweets, username, config = {}) {
    const {
        theme = 'default',
        width = 550,
        showStats = true,
        showDate = true,
        customCSS = ''
    } = config;

    const tweetData = tweets.map(tweet => ({
        id: tweet.id,
        username: tweet.user_screen_name,
        date: tweet.created_at,
        stats: showStats ? {
            retweets: tweet.retweet_count || 0,
            likes: tweet.favorite_count || 0,
            replies: tweet.reply_count || 0
        } : null
    }));

    return `
(function() {
    // XTimeline SaaS Widget v2.0
    var tweets = ${JSON.stringify(tweetData, null, 2)};
    var config = ${JSON.stringify({ theme, width, showStats, showDate }, null, 2)};
    var containerClass = 'xtimeline-saas-widget-${username}';
    
    // CSSスタイルを追加
    if (!document.getElementById('xtimeline-saas-widget-styles')) {
        var style = document.createElement('style');
        style.id = 'xtimeline-saas-widget-styles';
        style.textContent = \`
            .xtimeline-saas-widget {
                max-width: \${config.width}px;
                margin: 10px 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                border: 1px solid #e1e8ed;
                border-radius: 12px;
                background: #ffffff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.12);
            }
            .xtimeline-saas-widget.theme-dark {
                background: #192734;
                border-color: #38444d;
                color: #ffffff;
            }
            .xtimeline-saas-widget .widget-header {
                padding: 12px 16px;
                border-bottom: 1px solid #e1e8ed;
                font-weight: bold;
                font-size: 14px;
                color: #536471;
            }
            .xtimeline-saas-widget .widget-header.theme-dark {
                border-bottom-color: #38444d;
                color: #71767b;
            }
            .xtimeline-saas-widget .twitter-tweet {
                margin: 10px 0 !important;
                border: none !important;
                box-shadow: none !important;
            }
            .xtimeline-saas-widget .widget-footer {
                padding: 8px 16px;
                text-align: center;
                font-size: 11px;
                color: #71767b;
                border-top: 1px solid #e1e8ed;
            }
            .xtimeline-saas-widget .widget-footer.theme-dark {
                border-top-color: #38444d;
            }
            .xtimeline-saas-widget .widget-footer a {
                color: #1d9bf0;
                text-decoration: none;
            }
            ${customCSS}
        \`;
        document.head.appendChild(style);
    }
    
    // コンテナを作成
    var container = document.createElement('div');
    container.className = 'xtimeline-saas-widget ' + containerClass;
    if (config.theme === 'dark') {
        container.classList.add('theme-dark');
    }
    
    // ヘッダー追加
    var header = document.createElement('div');
    header.className = 'widget-header' + (config.theme === 'dark' ? ' theme-dark' : '');
    header.textContent = '@${username} のタイムライン';
    container.appendChild(header);
    
    // 各ツイートの埋め込みタグを生成
    var tweetsContainer = document.createElement('div');
    tweets.forEach(function(tweet) {
        if (tweet.id && tweet.username) {
            var blockquote = document.createElement('blockquote');
            blockquote.className = 'twitter-tweet';
            blockquote.setAttribute('data-dnt', 'true');
            blockquote.setAttribute('data-theme', config.theme);
            
            var link = document.createElement('a');
            link.href = 'https://twitter.com/' + tweet.username + '/status/' + tweet.id;
            link.textContent = 'ツイートを読み込み中...';
            
            blockquote.appendChild(link);
            tweetsContainer.appendChild(blockquote);
        }
    });
    container.appendChild(tweetsContainer);
    
    // フッター追加
    var footer = document.createElement('div');
    footer.className = 'widget-footer' + (config.theme === 'dark' ? ' theme-dark' : '');
    footer.innerHTML = 'Powered by <a href="https://x-timeline.net" target="_blank">XTimeline SaaS</a>';
    container.appendChild(footer);
    
    // 現在のスクリプトタグの位置に挿入
    var scripts = document.getElementsByTagName('script');
    var currentScript = scripts[scripts.length - 1];
    currentScript.parentNode.insertBefore(container, currentScript);
    
    // Twitter Widget APIを読み込み
    if (!window.twttr) {
        var twitterScript = document.createElement('script');
        twitterScript.async = true;
        twitterScript.src = 'https://platform.twitter.com/widgets.js';
        twitterScript.charset = 'utf-8';
        twitterScript.onload = function() {
            if (window.twttr && window.twttr.widgets) {
                window.twttr.widgets.load(tweetsContainer);
            }
        };
        document.head.appendChild(twitterScript);
    } else if (window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load(tweetsContainer);
    }
    
    console.log('XTimeline SaaS Widget: ' + tweets.length + ' tweets loaded for @${username}');
})();`;
}

// メインエンドポイント: /widget.js
app.get('/widget.js', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const {
            user: username,
            count = 10,
            api_key: apiKey,
            include_retweets = 'false',
            theme = 'default',
            width = 550
        } = req.query;

        // パラメータ検証
        if (!username || !validator.isLength(username, { min: 1, max: 50 })) {
            return res.status(400)
                .set('Content-Type', 'application/javascript; charset=utf-8')
                .send(`
                    console.error('XTimeline SaaS Widget Error: Invalid username');
                    document.write('<p style="color: red;">エラー: ユーザー名が無効です</p>');
                `);
        }

        if (!apiKey) {
            return res.status(401)
                .set('Content-Type', 'application/javascript; charset=utf-8')
                .send(`
                    console.error('XTimeline SaaS Widget Error: API key required');
                    document.write('<p style="color: red;">エラー: APIキーが必要です</p>');
                `);
        }

        const tweetCount = Math.min(Math.max(parseInt(count) || 10, 1), 50);
        const excludeRetweets = include_retweets !== 'true' && include_retweets !== '1';

        // テナント認証
        const tenant = await authenticateTenant(apiKey);
        if (!tenant) {
            return res.status(401)
                .set('Content-Type', 'application/javascript; charset=utf-8')
                .send(`
                    console.error('XTimeline SaaS Widget Error: Invalid API key');
                    document.write('<p style="color: red;">エラー: 無効なAPIキーです</p>');
                `);
        }

        console.log(`Widget request: tenant=${tenant.name}, user=${username}, count=${tweetCount}`);

        // ツイート取得
        const tweets = await getTweetsByTenant(tenant.id, username, tweetCount, excludeRetweets);

        if (tweets.length === 0) {
            return res.status(200)
                .set({
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Cache-Control': 'public, max-age=120',
                    'X-Tenant-ID': tenant.id
                })
                .send(`
                    console.warn('XTimeline SaaS Widget: No tweets found for @${username}');
                    document.write('<div style="padding: 20px; text-align: center; color: #666; border: 1px solid #e1e8ed; border-radius: 12px;">@${username} のツイートが見つかりませんでした</div>');
                `);
        }

        // ウィジェット設定
        const widgetConfig = {
            theme: ['default', 'dark'].includes(theme) ? theme : 'default',
            width: Math.min(Math.max(parseInt(width) || 550, 300), 800),
            showStats: true,
            showDate: true
        };

        // JavaScriptコード生成
        const jsCode = generateEmbedJS(tweets, username, widgetConfig);

        // レスポンス
        res.set({
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
            'X-Tenant-ID': tenant.id,
            'X-Tweet-Count': tweets.length,
            'X-Response-Time': Date.now() - startTime
        });

        res.send(jsCode);

        console.log(`Widget served: ${tweets.length} tweets for @${username} (${Date.now() - startTime}ms)`);

    } catch (error) {
        console.error('Widget API Error:', error);
        res.status(500)
            .set('Content-Type', 'application/javascript; charset=utf-8')
            .send(`
                console.error('XTimeline SaaS Widget Error: Server error');
                document.write('<p style="color: red;">エラー: サーバーエラーが発生しました</p>');
            `);
    }
});

// ヘルスチェック
app.get('/health', async (req, res) => {
    try {
        // データベース接続確認
        await dbPool.query('SELECT 1');
        
        // Redis接続確認
        await redis.ping();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0'
        });
        
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// ルートページ
app.get('/', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>XTimeline SaaS Widget API</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 40px; line-height: 1.6; }
                .container { max-width: 800px; margin: 0 auto; }
                code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-size: 85%; }
                pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
                .badge { background: #2ea043; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>XTimeline SaaS Widget API <span class="badge">v2.0</span></h1>
                <p>マルチテナント対応のTwitterタイムライン埋め込みウィジェットAPIです。</p>
                
                <h2>使用方法</h2>
                <p>以下のスクリプトタグをHTMLに挿入してください：</p>
                <pre><code>&lt;script src="${req.protocol}://${req.get('host')}/widget.js?api_key=YOUR_API_KEY&amp;user=USERNAME&amp;count=10"&gt;&lt;/script&gt;</code></pre>
                
                <h3>パラメータ</h3>
                <ul>
                    <li><code>api_key</code> (必須): あなたのAPIキー</li>
                    <li><code>user</code> (必須): 表示したいTwitterユーザー名</li>
                    <li><code>count</code> (オプション): 表示件数（1〜50、デフォルト10）</li>
                    <li><code>include_retweets</code> (オプション): リツイートを含む（true/false、デフォルトfalse）</li>
                    <li><code>theme</code> (オプション): テーマ（default/dark、デフォルトdefault）</li>
                    <li><code>width</code> (オプション): 幅（300〜800px、デフォルト550）</li>
                </ul>
                
                <h3>新機能（v2.0）</h3>
                <ul>
                    <li>✅ マルチテナント対応</li>
                    <li>✅ APIキー認証</li>
                    <li>✅ レート制限・速度制限</li>
                    <li>✅ Redisキャッシュ</li>
                    <li>✅ ダークテーマ対応</li>
                    <li>✅ セキュリティ強化</li>
                </ul>
                
                <h2>エンドポイント</h2>
                <ul>
                    <li><code>GET /widget.js</code> - ウィジェットJavaScript</li>
                    <li><code>GET /health</code> - ヘルスチェック</li>
                    <li><code>GET /</code> - このページ</li>
                </ul>
            </div>
        </body>
        </html>
    `);
});

// グレースフルシャットダウン
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await dbPool.end();
    await redis.quit();
    process.exit(0);
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`XTimeline SaaS Widget API v2.0 running on port ${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;