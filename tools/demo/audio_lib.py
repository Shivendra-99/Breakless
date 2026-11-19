"""Original background track for the Breakless reel (synthesised, no samples).
18 s, 120 BPM. Tense pad + clock ticks during the ad, riser into the skip,
impact + full beat from 5.0 s, chime when the ad is skipped, pops for each feature,
soft impact on the end card, fade out.
Usage: python3 music.py out.wav
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(7)


def t_arr(d):
    return np.arange(int(SR * d)) / SR


def place(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    out[i:i + len(sig), 0] += sig * gain * l * 1.414
    out[i:i + len(sig), 1] += sig * gain * r * 1.414


def lp(x, f):
    return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)


def hp(x, f):
    return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def note(n):  # midi -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(f, d):
    t = t_arr(d)
    return 2 * ((t * f) % 1) - 1


def env(d, a=0.01, r=0.1):
    n = int(SR * d)
    e = np.ones(n)
    ai, ri = int(SR * a), int(SR * r)
    if ai:
        e[:ai] = np.linspace(0, 1, ai)
    if ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return e


def pad(chord, d, cutoff=1400):
    s = np.zeros(int(SR * d))
    for m in chord:
        for det in (-0.08, 0.0, 0.08):
            s += saw(note(m) * 2 ** (det / 12), d)
    s = lp(s, cutoff) / (len(chord) * 3)
    return s * env(d, 0.25, 0.35)


def kick():
    d = 0.35
    t = t_arr(d)
    f = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)


def clap():
    d = 0.18
    t = t_arr(d)
    return bp(rng.standard_normal(len(t)), 900, 3200) * np.exp(-t * 22) * 0.9


def hat():
    d = 0.05
    t = t_arr(d)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * 90) * 0.5


def tick():
    d = 0.03
    t = t_arr(d)
    return (np.sin(2 * np.pi * 2400 * t) + 0.4 * hp(rng.standard_normal(len(t)), 4000)) * np.exp(-t * 160)


def bass(m, d):
    t = t_arr(d)
    s = np.sin(2 * np.pi * note(m) * t) + 0.25 * np.sin(2 * np.pi * note(m) * 2 * t)
    return s * np.exp(-t * 3.5) * env(d, 0.005, 0.05)


def riser(d):
    t = t_arr(d)
    noise = rng.standard_normal(len(t))
    # sweep by blending progressively higher bands
    s = np.zeros(len(t))
    bands = [(300, 900), (900, 2500), (2500, 7000), (6000, 14000)]
    for i, (lo, hi) in enumerate(bands):
        w = np.clip((t / d) * len(bands) - i + 0.5, 0, 1)
        s += bp(noise, lo, hi) * w
    return s * (t / d) ** 2 * 0.6


def impact():
    d = 1.2
    t = t_arr(d)
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t * 6)) * t) * np.exp(-t * 3.2)
    air = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 7) * 0.5
    return boom + air


def chime():
    d = 1.4
    t = t_arr(d)
    s = np.zeros(len(t))
    for f, a in ((1318.5, 1.0), (1975.5, 0.6), (2637.0, 0.3)):
        s += a * np.sin(2 * np.pi * f * t)
    s2 = np.zeros(len(t))
    lag = int(0.09 * SR)
    for f, a in ((1760.0, 0.9), (2637.0, 0.4)):
        s2[lag:] += a * np.sin(2 * np.pi * f * t[: len(t) - lag])
    return (s + s2) * np.exp(-t * 4.5) * 0.35


def pop(f=880):
    d = 0.18
    t = t_arr(d)
    fr = f * (1 + 0.6 * np.exp(-t * 40))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 24) * 0.5
