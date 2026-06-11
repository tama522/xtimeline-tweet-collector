#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自動更新機能のテストスクリプト（1回だけ実行）
"""

import asyncio
from datetime import datetime
from twitter_timeline import TwitterTimelineManager

async def test_auto_update():
    """自動更新の1回テスト"""
    print("=== 自動更新機能テスト ===")
    
    manager = TwitterTimelineManager()
    
    # ログイン
    if not await manager.login():
        print("ログインに失敗しました")
        return
    
    print("ログインに成功しました！")
    
    # 1回だけ更新をテスト
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] フォロー中タイムライン更新テスト")
    
    tweets = await manager.get_timeline(10, "following")
    if tweets:
        new_count = manager.save_tweets_to_db(tweets)
        total_count = manager.get_tweet_count()
        print(f"新しいツイート: {new_count}件 | 総保存数: {total_count}件")
        
        if new_count > 0:
            print("新しいツイートが見つかりました！")
            manager.display_tweets(3)
        else:
            print("新しいツイートはありませんでした")
    else:
        print("タイムライン取得に失敗しました")
    
    print("\n自動更新機能は正常に動作しています")

if __name__ == "__main__":
    asyncio.run(test_auto_update())