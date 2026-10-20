"""Calibration des seuils de detection de cuts (meme algorithme que web/src/media/cutDetect.ts).

    python cut_detect.py video.mp4 [--k 6] [--truth 2.0,4.1]

Decode via ffmpeg (miniatures 64x36 en gris, comme l'OffscreenCanvas du navigateur), affiche les cuts
trouves, et avec --truth (cuts reels, s) le rappel / les faux positifs a +-1 image.
Pas d'OpenCV : ffmpeg fait deja le decodage et la reduction, et c'est ce qui est installe partout.
"""
import argparse, subprocess
import numpy as np

W, H, BINS = 64, 36, 32
MIN_GAP_S, MIN_SCORE = 0.25, 0.08


def frames(path):
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                            'frame=best_effort_timestamp_time', '-of', 'csv=p=0', path],
                           capture_output=True, text=True, check=True).stdout.split()
    times = [float(t.strip(',')) for t in probe if t.strip(',') not in ('', 'N/A')]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H}:flags=area,format=gray',
                          '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    imgs = np.frombuffer(raw, np.uint8).reshape(-1, W * H)
    n = min(len(times), len(imgs))
    t0 = times[0] if times else 0.0
    return [t - t0 for t in times[:n]], imgs[:n]


def frame_score(a, b):
    ha = np.bincount(a >> 3, minlength=BINS) / a.size
    hb = np.bincount(b >> 3, minlength=BINS) / b.size
    s = ha + hb
    chi = np.sum(np.where(s > 0, (ha - hb) ** 2 / np.where(s > 0, s, 1), 0))
    pix = np.abs(a.astype(int) - b.astype(int)).mean() / 255
    return 0.6 * (chi / 2) + 0.4 * pix


def find_cuts(times, scores, k):
    cuts, lo, hi = [], 0, 0
    for n in range(1, len(scores)):
        while times[lo] < times[n] - 1: lo += 1
        while hi + 1 < len(scores) and times[hi + 1] <= times[n] + 1: hi += 1
        win = [scores[i] for i in range(lo, hi + 1) if i != n and i > 0]
        med = sorted(win)[len(win) // 2] if win else 0
        dev = sorted(abs(v - med) for v in win)
        mad = dev[len(dev) // 2] if dev else 0
        s = scores[n]
        if s > med + k * mad and s > MIN_SCORE and (not cuts or times[n] - cuts[-1] >= MIN_GAP_S):
            cuts.append(times[n])
    return cuts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--k', type=float, default=6)
    ap.add_argument('--truth', help='cuts reels en secondes, separes par des virgules')
    a = ap.parse_args()
    times, imgs = frames(a.video)
    scores = [0.0] + [frame_score(imgs[i - 1], imgs[i]) for i in range(1, len(imgs))]
    cuts = find_cuts(times, scores, a.k)
    print('cuts', [round(c, 3) for c in cuts])
    if a.truth:
        truth = [float(t) for t in a.truth.split(',')]
        fps_tol = 1.5 * (times[1] - times[0]) if len(times) > 1 else 0.05
        hit = [t for t in truth if any(abs(t - c) <= fps_tol for c in cuts)]
        fp = [c for c in cuts if not any(abs(t - c) <= fps_tol for t in truth)]
        print(f'rappel {len(hit)}/{len(truth)}, faux positifs {len(fp)} {fp}')


if __name__ == '__main__':
    main()
