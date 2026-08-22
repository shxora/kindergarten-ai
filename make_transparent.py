#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert white/near-white background of desktop-pet-sitting.png to transparent."""

from PIL import Image
import os

src = r"C:\Users\shxxx\Desktop\kindergarten-ai\desktop-pet-sitting.png"
dst = r"C:\Users\shxxx\Desktop\kindergarten-ai\desktop-pet-transparent.png"

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

# Threshold: pixels with all RGB channels above this are considered background.
# 235 is a safe cut-off for "near white" while preserving highlights on hair/clothes.
THRESHOLD = 235

# Build new pixel data
new_data = []
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r >= THRESHOLD and g >= THRESHOLD and b >= THRESHOLD:
            # Make fully transparent
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append((r, g, b, a))

new_img = Image.new("RGBA", (w, h))
new_img.putdata(new_data)
new_img.save(dst, "PNG", optimize=True)
print(f"Saved: {dst}  ({os.path.getsize(dst)} bytes)")
print(f"Size: {w}x{h}")
