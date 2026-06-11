#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Xタイムライン取得システム実行スクリプト
自動でタイムラインを取得し、結果を表示します。
"""

import asyncio
from twitter_timeline import TwitterTimelineManager

async def main():
    """メイン実行関数"""
    print("=== Xタイムライン取得システム ===")
    
    manager = TwitterTimelineManager()
    
    # ログイン
    print("Xにログイン中...")
    if not await manager.login():
        print("ログインに失敗しました。プログラムを終了します。")
        return
    
    print("ログインに成功しました！")
    
    # タイムライン取得と表示（フォロー中のタイムライン）
    print("\nフォロー中のタイムラインを取得中...")
    tweets = await manager.get_timeline(10, "following")  # 10件取得
    
    if tweets:
        # データベースに保存
        new_count = manager.save_tweets_to_db(tweets)
        total_count = manager.get_tweet_count()
        print(f"新しいツイート {new_count}件を保存しました")
        print(f"データベース内の総ツイート数: {total_count}件")
        
        # ツイート表示
        print("\n最新のツイートを表示します:")
        manager.display_tweets(10)
    else:
        print("タイムラインの取得に失敗しました")

if __name__ == "__main__":
    asyncio.run(main())