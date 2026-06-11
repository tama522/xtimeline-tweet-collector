#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Twitter埋め込みWidget API
 * 指定されたユーザーのツイートを埋め込み用JavaScriptとして返すAPIサーバー
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// レート制限設定
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 最大リクエスト数
    message: {
        error: 'Too many requests from this IP, please try again later.',
        message: 'リクエストが多すぎます。しばらく待ってから再度お試しください。'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 本番環境でのみレート制限を適用
if (NODE_ENV === 'production' && process.env.ENABLE_RATE_LIMITING !== 'false') {
    app.use(limiter);
}

// データベースパス
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'timeline.db');

/**
 * データベースからユーザーのツイートを取得
 * @param {string} username - ユーザー名
 * @param {number} count - 取得件数
 * @param {boolean} excludeRetweets - リポストを除外するかどうか
 * @returns {Promise<Array>} ツイートの配列
 */
function getTweetsByUser(username, count = 10, excludeRetweets = true) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error('データベース接続エラー:', err.message);
                reject(err);
                return;
            }
        });

        const retweetCondition = excludeRetweets ? 'AND text NOT LIKE \'RT%\'' : '';
        const query = `
            SELECT id, user_screen_name, created_at
            FROM tweets 
            WHERE LOWER(user_screen_name) = LOWER(?) 
              ${retweetCondition}
            ORDER BY created_at DESC 
            LIMIT ?
        `;

        console.log(`Database query for user: "${username}" (searching case-insensitive)`);

        db.all(query, [username, count], (err, rows) => {
            if (err) {
                console.error('クエリエラー:', err.message);
                reject(err);
            } else {
                console.log(`Found ${rows ? rows.length : 0} tweets for user "${username}"`);
                if (rows && rows.length > 0) {
                    console.log(`First tweet from: @${rows[0].user_screen_name}`);
                }
                resolve(rows || []);
            }
            db.close();
        });
    });
}

/**
 * Twitter埋め込み用JavaScriptコードを生成
 * @param {Array} tweets - ツイートデータの配列
 * @param {string} username - ユーザー名
 * @returns {string} JavaScript コード
 */
function generateEmbedJS(tweets, username) {
    const tweetData = tweets.map(tweet => ({
        id: tweet.id,
        username: tweet.user_screen_name,
        date: tweet.created_at
    }));

    return `
(function() {
    // ツイートデータ
    var tweets = ${JSON.stringify(tweetData, null, 2)};
    var containerClass = 'xtimeline-widget-${username}';
    
    // CSSスタイルを追加
    if (!document.getElementById('xtimeline-widget-styles')) {
        var style = document.createElement('style');
        style.id = 'xtimeline-widget-styles';
        style.textContent = \`
            .xtimeline-widget {
                max-width: 550px;
                margin: 10px 0;
            }
            .xtimeline-widget .twitter-tweet {
                margin: 10px 0 !important;
            }
        \`;
        document.head.appendChild(style);
    }
    
    // コンテナを作成
    var container = document.createElement('div');
    container.className = 'xtimeline-widget ' + containerClass;
    
    // 各ツイートの埋め込みタグを生成
    tweets.forEach(function(tweet) {
        if (tweet.id && tweet.username) {
            var blockquote = document.createElement('blockquote');
            blockquote.className = 'twitter-tweet';
            blockquote.setAttribute('data-dnt', 'true'); // Do Not Track
            
            var link = document.createElement('a');
            link.href = 'https://twitter.com/' + tweet.username + '/status/' + tweet.id;
            link.textContent = 'ツイートを読み込み中...';
            
            blockquote.appendChild(link);
            container.appendChild(blockquote);
        }
    });
    
    // 現在のスクリプトタグの位置に挿入
    var scripts = document.getElementsByTagName('script');
    var currentScript = scripts[scripts.length - 1];
    currentScript.parentNode.insertBefore(container, currentScript);
    
    // Twitter Widget APIを読み込み（重複回避）
    if (!window.twttr) {
        var twitterScript = document.createElement('script');
        twitterScript.async = true;
        twitterScript.src = 'https://platform.twitter.com/widgets.js';
        twitterScript.charset = 'utf-8';
        document.head.appendChild(twitterScript);
    } else if (window.twttr && window.twttr.widgets) {
        // 既に読み込まれている場合は再レンダリング
        window.twttr.widgets.load(container);
    }
    
    console.log('XTimeline Widget: ' + tweets.length + ' tweets loaded for @' + '${username}');
})();`;
}

// CORS設定
app.use((req, res, next) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : ['*'];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// メインエンドポイント: /widget.js
app.get('/widget.js', async (req, res) => {
    try {
        const username = req.query.user;
        const count = parseInt(req.query.count) || 10;

        // パラメータ検証
        if (!username) {
            res.status(400).set({
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.send(`
                console.error('XTimeline Widget Error: user parameter is required');
                document.write('<p style="color: red;">エラー: ユーザー名が指定されていません</p>');
            `);
            return;
        }

        if (count < 1 || count > 50) {
            res.status(400).set({
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.send(`
                console.error('XTimeline Widget Error: count must be between 1 and 50');
                document.write('<p style="color: red;">エラー: 取得件数は1〜50の間で指定してください</p>');
            `);
            return;
        }

        const includeRetweets = req.query.include_retweets === 'true' || req.query.include_retweets === '1';
        const excludeRetweets = !includeRetweets;

        console.log(`Widget API request: user="${username}", count=${count}, excludeRetweets=${excludeRetweets}`);

        // データベースからツイートを取得
        const tweets = await getTweetsByUser(username, count, excludeRetweets);

        console.log(`Widget API result: ${tweets.length} tweets found for "${username}"`);

        if (tweets.length === 0) {
            res.set({
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.send(`
                console.warn('XTimeline Widget: No tweets found for user @${username}');
                document.write('<p style="color: #666;">@${username} のツイートが見つかりませんでした</p>');
            `);
            return;
        }

        // JavaScriptコードを生成
        const jsCode = generateEmbedJS(tweets, username);

        // キャッシュ制御ヘッダーを設定
        res.set({
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Last-Modified': new Date().toUTCString(),
            'ETag': `"${Date.now()}-${tweets.length}"`
        });

        // JavaScriptとして返却
        res.send(jsCode);

        console.log(`Widget served: ${tweets.length} tweets for @${username}`);

    } catch (error) {
        console.error('Widget API Error:', error);
        res.status(500).set({
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.send(`
            console.error('XTimeline Widget Error:', ${JSON.stringify(error.message)});
            document.write('<p style="color: red;">エラー: サーバーエラーが発生しました</p>');
        `);
    }
});

// ルートページ: 使用方法の説明
app.get('/', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>XTimeline Widget API</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
                pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
                .example { margin: 20px 0; }
            </style>
        </head>
        <body>
            <h1>XTimeline Widget API</h1>
            <p>指定されたユーザーのツイートを埋め込み表示するJavaScriptウィジェットAPIです。</p>
            
            <h2>使用方法</h2>
            <p>以下のスクリプトタグをHTMLに挿入してください：</p>
            <pre><code>&lt;script src="https://lajelly.x-timeline.net/widget.js?user=ユーザー名&amp;count=件数"&gt;&lt;/script&gt;</code></pre>
            
            <h3>パラメータ</h3>
            <ul>
                <li><code>user</code> (必須): 表示したいTwitterユーザー名（@マークなし）</li>
                <li><code>count</code> (オプション): 表示件数（1〜50、デフォルト10）</li>
            </ul>
            
            <h3>例</h3>
            <div class="example">
                <p><strong>5件のツイートを表示:</strong></p>
                <pre><code>&lt;script src="https://lajelly.x-timeline.net/widget.js?user=shonanesthefan&amp;count=5"&gt;&lt;/script&gt;</code></pre>
            </div>
            
            <h2>テストページ</h2>
            <p><a href="/test.html">テストページ</a>で動作確認ができます。</p>
            
            <h2>API エンドポイント</h2>
            <ul>
                <li><code>GET /widget.js</code> - ウィジェットJavaScript</li>
                <li><code>GET /</code> - このページ</li>
                <li><code>GET /test.html</code> - テストページ</li>
            </ul>
        </body>
        </html>
    `);
});

// テストページ（実際のファイルを使用）
app.use('/test.html', express.static(path.join(__dirname, 'test.html')));

// サーバー起動
app.listen(PORT, () => {
    console.log(`XTimeline Widget API server running on http://localhost:${PORT}`);
    console.log(`Usage: http://localhost:${PORT}/widget.js?user=username&count=10`);
    console.log(`Test page: http://localhost:${PORT}/test.html`);
    console.log(`Database: ${DB_PATH}`);
});

module.exports = app;