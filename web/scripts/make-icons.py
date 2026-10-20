# Genere icon-192.png / icon-512.png (meme dessin que public/icon.svg). python scripts/make-icons.py
import struct, zlib
import numpy as np

BARS = [(96, 216, 80), (166, 166, 180), (236, 116, 280), (306, 176, 160), (376, 226, 60)]  # x, y, h (w=40, r=20)

def render(size, ss=4):
    n = size * ss
    y, x = np.mgrid[0:n, 0:n] * (512 / n)
    on = np.zeros((n, n), bool)
    for bx, by, bh in BARS:
        cx = np.clip(x, bx + 20, bx + 20)  # axe vertical de la barre
        cy = np.clip(y, by + 20, by + bh - 20)
        on |= (x - cx) ** 2 + (y - cy) ** 2 <= 20 ** 2
    a = on.reshape(size, ss, size, ss).mean(axis=(1, 3))[..., None]
    bg, fg = np.array([0x6b, 0x3f, 0xd4]), np.array([255, 255, 255])
    return (bg * (1 - a) + fg * a).round().astype(np.uint8)

def png(path, img):
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[r].tobytes() for r in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

for s in (192, 512):
    png(f'public/icon-{s}.png', render(s))
