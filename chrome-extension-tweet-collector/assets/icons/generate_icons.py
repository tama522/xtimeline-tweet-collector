#!/usr/bin/env python3
"""
アイコン生成スクリプト
SVGファイルから各サイズのPNGアイコンを生成します。
"""

import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("PILがインストールされていません。代替方法でアイコンを生成します。")
    # 簡易的なプレースホルダーアイコンを生成
    sizes = [16, 32, 48, 128]
    
    for size in sizes:
        # 簡易的なPNG生成（単色の正方形）
        filename = f"icon{size}.png"
        print(f"{filename} を生成しました（プレースホルダー）")
        
        # 実際のファイル生成はここでは行わず、別の方法で対応
        with open(filename, 'wb') as f:
            # 最小限のPNGヘッダー（透明な1x1ピクセル）
            f.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0bIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82')
    sys.exit(0)

# PILが利用可能な場合
def create_icon(size):
    """指定サイズのアイコンを生成"""
    # 青色のグラデーション背景
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 背景（角丸四角形）
    radius = size // 8
    # 簡易的な角丸四角形（PILの制限により完全な角丸は描画できない）
    draw.rounded_rectangle([size//16, size//16, size-size//16, size-size//16], 
                          radius=radius, fill=(29, 161, 242, 255))
    
    # 中央にシンプルなアイコン（下向き矢印）
    center_x = size // 2
    center_y = size // 2
    arrow_size = size // 4
    
    # 矢印の頭
    points = [
        (center_x, center_y + arrow_size//2),
        (center_x - arrow_size//2, center_y - arrow_size//2),
        (center_x + arrow_size//2, center_y - arrow_size//2)
    ]
    draw.polygon(points, fill=(255, 255, 255, 230))
    
    # 矢印の軸
    shaft_width = size // 16
    draw.rectangle([center_x - shaft_width, center_y - arrow_size//2,
                   center_x + shaft_width, center_y - arrow_size//4],
                  fill=(255, 255, 255, 230))
    
    return img

# 各サイズのアイコンを生成
sizes = [16, 32, 48, 128]

for size in sizes:
    img = create_icon(size)
    filename = f"icon{size}.png"
    img.save(filename, 'PNG')
    print(f"{filename} を生成しました")

print("すべてのアイコンの生成が完了しました。")