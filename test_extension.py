#!/usr/bin/env python3
"""
Chrome拡張機能のツイート収集機能をテスト
Playwrightを使用してX.comでコンテンツスクリプトの動作を確認
"""

import asyncio
from playwright.async_api import async_playwright

async def test_extension():
    async with async_playwright() as p:
        # ブラウザを起動（ヘッドレスモードをオフにして表示）
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # X.comを開く
        print("🌐 X.comを開いています...")
        await page.goto('https://x.com', wait_until='domcontentloaded')
        
        # ページが読み込まれるまで待機（タイムアウトを短めに設定）
        try:
            await page.wait_for_load_state('networkidle', timeout=5000)
        except:
            print("⚠️ ネットワークアイドル待機タイムアウト、続行します...")
        
        # スクリーンショットを撮って状態を確認
        await page.screenshot(path='test_screenshot.png')
        print("📸 スクリーンショットを保存しました: test_screenshot.png")
        
        # 現在のURLを確認
        current_url = page.url
        print(f"📍 現在のURL: {current_url}")
        
        # ページタイトルを確認
        title = await page.title()
        print(f"📄 ページタイトル: {title}")
        
        await asyncio.sleep(3)
        
        # コンテンツスクリプトの簡易版を注入
        content_script = """
        (function() {
            'use strict';
            
            console.log('[XTimeline Test] ✅ コンテンツスクリプト注入成功！');
            
            // ツイート要素を検出
            const tweets = document.querySelectorAll('[data-testid="tweet"]');
            console.log(`[XTimeline Test] 📊 ${tweets.length}個のツイート要素を検出`);
            
            // 収集したツイートのカウント
            let collectedCount = 0;
            const collectedIds = new Set();
            
            // 各ツイートからデータを抽出
            tweets.forEach((tweet, index) => {
                try {
                    // ツイートIDを取得
                    const tweetLink = tweet.querySelector('a[href*="/status/"]');
                    const tweetId = tweetLink ? tweetLink.href.match(/status\\/(\\d+)/)?.[1] : null;
                    
                    if (tweetId && !collectedIds.has(tweetId)) {
                        collectedIds.add(tweetId);
                        
                        // ユーザー情報を取得
                        const usernameElement = tweet.querySelector('[data-testid="User-Name"] a');
                        const userName = usernameElement ? usernameElement.textContent.split('@')[0].trim() : 'Unknown';
                        
                        // ツイート本文を取得
                        const textElement = tweet.querySelector('[data-testid="tweetText"]');
                        const text = textElement ? textElement.textContent.trim() : '';
                        
                        // エンゲージメント指標を取得
                        const retweetElement = tweet.querySelector('[data-testid="retweet"] span');
                        const likeElement = tweet.querySelector('[data-testid="like"] span');
                        const replyElement = tweet.querySelector('[data-testid="reply"] span');
                        
                        const tweetData = {
                            id: tweetId,
                            user_name: userName,
                            text: text ? text.substring(0, 50) + '...' : '',
                            retweet_count: parseInt(retweetElement?.textContent || '0', 10),
                            favorite_count: parseInt(likeElement?.textContent || '0', 10),
                            reply_count: parseInt(replyElement?.textContent || '0', 10)
                        };
                        
                        if (index < 3) {  // 最初の3つのツイートを表示
                            console.log(`[XTimeline Test] ツイート ${index + 1}:`, tweetData);
                        }
                        
                        collectedCount++;
                    }
                } catch (err) {
                    console.error('[XTimeline Test] ❌ ツイート抽出エラー:', err);
                }
            });
            
            console.log(`[XTimeline Test] ✅ ${collectedCount}個のユニークなツイートを収集`);
            
            // DOM監視のテスト
            let mutationCount = 0;
            const observer = new MutationObserver((mutations) => {
                let hasNewTweets = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE && 
                                node.querySelector && 
                                node.querySelector('[data-testid="tweet"]')) {
                                hasNewTweets = true;
                                break;
                            }
                        }
                    }
                }
                if (hasNewTweets) {
                    mutationCount++;
                    console.log(`[XTimeline Test] 🔄 新しいツイートが検出されました！(検出回数: ${mutationCount})`);
                }
            });
            
            const timelineContainer = document.querySelector('main');
            if (timelineContainer) {
                observer.observe(timelineContainer, {
                    childList: true,
                    subtree: true
                });
                console.log('[XTimeline Test] 👁️ DOM監視を開始しました');
            }
            
            return {
                collectedCount: collectedCount,
                totalTweets: tweets.length,
                observerActive: timelineContainer !== null
            };
        })();
        """
        
        # スクリプトを注入して実行
        print("💉 コンテンツスクリプトを注入中...")
        result = await page.evaluate(content_script)
        
        if result:
            print(f"\n✅ テスト結果:")
            print(f"  - 検出したツイート総数: {result['totalTweets']}")
            print(f"  - 収集したユニークツイート数: {result['collectedCount']}")
            print(f"  - DOM監視: {'有効' if result['observerActive'] else '無効'}")
        
        # コンソールログを取得
        page.on("console", lambda msg: print(f"[Browser Console] {msg.text}"))
        
        print("\n📜 スクロールして新しいツイートの検出をテスト中...")
        for i in range(3):
            await page.evaluate("window.scrollBy(0, 500)")
            await asyncio.sleep(2)
            
            # 現在のツイート数を確認
            tweet_count = await page.evaluate("document.querySelectorAll('[data-testid=\"tweet\"]').length")
            print(f"  スクロール {i+1}/3: ツイート数 = {tweet_count}")
        
        # セレクターの互換性をテスト
        print("\n🔍 セレクターの互換性テスト:")
        selectors_test = await page.evaluate("""
        ({
            tweet: document.querySelectorAll('[data-testid="tweet"]').length > 0,
            username: document.querySelector('[data-testid="User-Name"] a') !== null,
            tweetText: document.querySelector('[data-testid="tweetText"]') !== null,
            timestamp: document.querySelector('time') !== null,
            retweet: document.querySelector('[data-testid="retweet"]') !== null,
            like: document.querySelector('[data-testid="like"]') !== null,
            fallbackTweet: document.querySelectorAll('article[role="article"]').length > 0
        })
        """)
        
        for selector, found in selectors_test.items():
            status = "✅" if found else "❌"
            print(f"  {status} {selector}: {'検出' if found else '未検出'}")
        
        print("\n⏸️ ブラウザを開いたまま10秒間待機中...")
        print("  （開発者ツールのコンソールでログを確認できます）")
        await asyncio.sleep(10)
        
        await browser.close()
        print("\n✅ テスト完了!")

if __name__ == "__main__":
    print("🚀 Chrome拡張機能テストを開始します...\n")
    asyncio.run(test_extension())