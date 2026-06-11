#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
時間帯別更新間隔のテストスクリプト
"""

from datetime import datetime, timedelta

def get_update_interval(test_hour=None):
    """
    現在時刻に基づいて更新間隔を決定
    
    Args:
        test_hour: テスト用の時間（指定しない場合は現在時刻）
    
    Returns:
        int: 更新間隔（秒）
    """
    if test_hour is not None:
        hour = test_hour
    else:
        now = datetime.now()
        hour = now.hour
    
    if 10 <= hour < 15:
        # 朝10時〜15時: 20分毎
        return 20 * 60
    elif 15 <= hour < 18:
        # 15時〜18時: 15分毎
        return 15 * 60
    elif 18 <= hour < 22:
        # 18時〜22時: 12分毎
        return 12 * 60
    elif 22 <= hour < 24:
        # 22時〜24時: 15分毎
        return 15 * 60
    else:
        # 0時〜朝10時: 45分毎
        return 45 * 60

def format_interval(seconds):
    """更新間隔を分で表示"""
    minutes = seconds // 60
    return f"{minutes}分"

def test_all_time_zones():
    """全時間帯の更新間隔をテスト"""
    print("=== 時間帯別更新間隔テスト ===")
    
    test_times = [
        (0, "00:00 (深夜)"),
        (5, "05:00 (早朝)"),
        (10, "10:00 (朝)"),
        (13, "13:00 (午後)"),
        (15, "15:00 (夕方開始)"),
        (18, "18:00 (夜開始)"),
        (20, "20:00 (夜)"),
        (22, "22:00 (深夜開始)"),
        (23, "23:00 (深夜)")
    ]
    
    for hour, description in test_times:
        interval = get_update_interval(test_hour=hour)
        interval_str = format_interval(interval)
        print(f"{description}: {interval_str}")

def main():
    """メイン関数"""
    # 現在時刻での更新間隔
    current_time = datetime.now()
    current_interval = get_update_interval()
    
    print(f"現在時刻: {current_time.strftime('%H:%M:%S')}")
    print(f"現在の更新間隔: {format_interval(current_interval)}")
    print()
    
    # 全時間帯のテスト
    test_all_time_zones()
    
    print("\n=== 更新スケジュール ===")
    print("10:00-15:00: 20分毎")
    print("15:00-18:00: 15分毎") 
    print("18:00-22:00: 12分毎")
    print("22:00-24:00: 15分毎")
    print("00:00-10:00: 45分毎")

if __name__ == "__main__":
    main()