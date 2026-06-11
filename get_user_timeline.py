#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
特定ユーザーのタイムラインを取得するスクリプト
コマンドライン引数でユーザー名と取得件数を指定できます
"""

import asyncio
import sys
import argparse
from twitter_timeline import TwitterTimelineManager

async def get_user_timeline(screen_name: str, count: int = 10, exclude_retweets: bool = True):
    """
    特定ユーザーのタイムラインを取得してデータベースに保存
    
    Args:
        screen_name: ユーザーのスクリーンネーム（@マークなし）
        count: 取得するツイート数
        exclude_retweets: リポスト（リツイート）を除外するかどうか
    """
    manager = TwitterTimelineManager()
    
    # ログイン
    print("Xにログイン中...")
    if not await manager.login():
        print("ログインに失敗しました。プログラムを終了します。")
        return False
    
    print("ログインに成功しました！")
    
    # 特定ユーザーのタイムライン取得
    tweets = await manager.get_user_timeline(screen_name, count, exclude_retweets)
    
    if tweets:
        # データベースに保存
        new_count = manager.save_tweets_to_db(tweets)
        total_count = manager.get_tweet_count()
        
        print(f"\n=== 結果 ===")
        print(f"@{screen_name} の新しいツイート: {new_count}件")
        print(f"データベース内の総ツイート数: {total_count}件")
        
        # 最新のツイートを表示
        print(f"\n@{screen_name} の最新ツイート:")
        manager.display_tweets(min(10, new_count))
        
        return True
    else:
        print(f"@{screen_name} のタイムライン取得に失敗しました")
        return False

def main():
    """メイン関数"""
    parser = argparse.ArgumentParser(
        description='特定ユーザーのXタイムラインを取得してデータベースに保存します',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
使用例:
  python get_user_timeline.py elonmusk
  python get_user_timeline.py elonmusk --count 20
  python get_user_timeline.py twitter -c 50
  python get_user_timeline.py elonmusk --include-retweets  # リポストも含める
        '''
    )
    
    parser.add_argument(
        'username',
        help='取得するユーザーのスクリーンネーム（@マークなし）'
    )
    
    parser.add_argument(
        '-c', '--count',
        type=int,
        default=10,
        help='取得するツイート数（デフォルト: 10）'
    )
    
    parser.add_argument(
        '--show-only',
        action='store_true',
        help='取得後にツイートを表示せず、結果のみ表示'
    )
    
    parser.add_argument(
        '--include-retweets',
        action='store_true',
        help='リポスト（リツイート）も含めて取得する（デフォルトは除外）'
    )
    
    args = parser.parse_args()
    
    # バリデーション
    if not args.username:
        print("エラー: ユーザー名を指定してください")
        parser.print_help()
        return
    
    if args.count <= 0:
        print("エラー: 取得件数は1以上の数値を指定してください")
        return
    
    if args.count > 100:
        print("警告: 取得件数が多いため、時間がかかる可能性があります")
    
    # ユーザー名から@マークを除去（もしあれば）
    username = args.username.lstrip('@')
    
    # リポスト除外設定
    exclude_retweets = not args.include_retweets
    
    print(f"=== 特定ユーザータイムライン取得システム ===")
    print(f"対象ユーザー: @{username}")
    print(f"取得件数: {args.count}件")
    print(f"リポスト除外: {'はい' if exclude_retweets else 'いいえ'}")
    print("-" * 50)
    
    try:
        # 非同期実行
        success = asyncio.run(get_user_timeline(username, args.count, exclude_retweets))
        
        if success:
            print(f"\n@{username} のタイムライン取得が完了しました")
        else:
            print(f"\n@{username} のタイムライン取得に失敗しました")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\nプログラムを中断しました")
        sys.exit(1)
    except Exception as e:
        print(f"エラーが発生しました: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()