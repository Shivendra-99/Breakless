"""Music and sound effects for the Breakless store demo (synthesised, no samples)."""
import sys
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.io import wavfile
import audio_lib as A
from audio_lib import SR, t_arr, lp, hp, bp, note, saw, env, pad, kick, clap, hat, tick, bass, riser, impact, chime, pop

DUR = 38.5
N = int(SR * DUR)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))
rng = np.random.default_rng(11)

def put(buf, sig, start, gain=1.0, pan=0.0):
    A.N, A.out = N, buf
    A.place(sig, start, gain, pan)

def marimba(m, d=0.5):
    t = t_arr(d); f = note(m)
    s = np.sin(2*np.pi*f*t) + 0.35*np.sin(2*np.pi*f*4*t)*np.exp(-t*30)
    return s * np.exp(-t*6) * env(d, 0.002, 0.05)
def square(m, d):
    t = t_arr(d); f = note(m)
    return lp(np.sign(np.sin(2*np.pi*f*t)), 3000) * env(d, 0.004, 0.03)
def whoosh(d=.5):
    t = t_arr(d); return bp(rng.standard_normal(len(t)), 500, 6000) * np.sin(np.pi*t/d)**2 * 0.45
def scratch():
    d = 0.45; t = t_arr(d)
    f = 900*np.exp(-t*5) + 120
    ph = 2*np.pi*np.cumsum(f)/SR
    s = np.sign(np.sin(ph))*0.4 + bp(rng.standard_normal(len(t)), 800, 4000)*0.8
    return s * np.exp(-t*4) * env(d, 0.003, 0.05)
def sparkle():
    s = np.zeros(int(.8*SR))
    for k, m in enumerate((84, 88, 91, 96)):
        x = np.sin(2*np.pi*note(m)*t_arr(.4)) * np.exp(-t_arr(.4)*9)
        i = int(k*.06*SR); s[i:i+len(x)] += x
    return s * 0.3
def ffwd(d=0.9):  # tape fast-forward: rising chirp + air
    t = t_arr(d)
    f = 220 * (8 ** (t/d))
    ph = 2*np.pi*np.cumsum(f)/SR
    s = 0.35*np.sin(ph) * (0.6 + 0.4*np.sign(np.sin(2*np.pi*32*t))) + bp(rng.standard_normal(len(t)), 1500, 8000)*0.35
    return s * env(d, 0.05, 0.12)
def click():
    p = pop(420)*0.6; tk = tick()*0.9
    p[:len(tk)] += tk
    return p

# ---- 0-4.6 s: the movie (calm, building) ----------------------------------
put(music, pad([57, 60, 64], 2.45, 1100), 0.0, 0.42)
put(music, pad([53, 57, 60], 2.25, 1300), 2.35, 0.48)
arp = [69, 72, 76, 72, 69, 72, 76, 79, 65, 69, 72, 69, 65, 69, 72, 77]
for i, m in enumerate(arp):
    put(music, marimba(m, .45), 0.15 + i*0.28, 0.20, pan=(-0.3 if i % 2 else 0.3))
put(music, bass(45, 2.3), 0.0, 0.35); put(music, bass(41, 2.2), 2.35, 0.35)
put(sfx, riser(2.0), 2.6, 0.30)
for k, tt in enumerate(np.arange(2.6, 4.55, 0.29 - 0.0)):
    put(sfx, A.kick() if False else tick(), tt, 0.10 + 0.08*k/7)

# ---- 4.6-9.35 s: the ad (cheesy, loud, then muted) -------------------------
put(sfx, scratch(), 4.58, 0.75)
ad = np.zeros(int(SR*(9.35-4.65)))
mel = [72, 76, 79, 84, 79, 76, 77, 81, 84, 81, 77, 74, 76, 79, 83, 79]
beat = 0.17
i = 0; t0 = 0.0
while t0 < len(ad)/SR - beat:
    m = mel[i % len(mel)]
    s = square(m, beat*0.9) * 0.32
    j = int(t0*SR); ad[j:j+len(s)] += s[:len(ad)-j]
    if i % 2 == 0:
        bm = [48, 55, 53, 55][(i//4) % 4]
        b = square(bm, beat*0.8) * 0.28
        ad[j:j+len(b)] += b[:len(ad)-j]
    if i % 4 == 2:
        c = clap(); ad[j:j+len(c)] += c[:len(ad)-j]*0.5
    i += 1; t0 += beat
ad[-int(0.012*SR):] *= np.linspace(1, 0, int(0.012*SR))
put(music, ad, 4.65, 0.55)
put(sfx, click(), 9.35, 0.9)       # muted
# quiet bed while muted + the jump
put(music, pad([48, 55, 64], 2.0, 900), 9.4, 0.18)
put(sfx, ffwd(0.95), 10.03, 0.55)

# ---- 11.3 s onward: Breakless groove ----------------------------------------
put(sfx, sparkle(), 11.3, 0.9); put(sfx, chime(), 11.32, 0.7); put(sfx, impact(), 11.28, 0.35)
BPM = 104; B = 60/BPM; BAR = 4*B
prog = [([48, 55, 60, 64], 36), ([43, 50, 55, 59], 31), ([45, 52, 57, 60], 33), ([41, 48, 53, 57], 29)]
start, end = 11.3, 32.75
bar = 0; t = start
while t < end - 0.05:
    ch, root = prog[bar % 4]
    d = min(BAR, end - t)
    put(music, pad([n + 12 for n in ch[1:]], d + 0.2, 1700), t, 0.30)
    for k in range(4):
        bt = t + k*B
        if bt >= end: break
        put(music, kick(), bt, 0.55)
        if k in (1, 3): put(music, clap(), bt, 0.30, pan=0.1)
        put(music, hat(), bt + B/2, 0.30, pan=-0.2)
        put(music, hat(), bt, 0.14, pan=0.2)
        put(music, bass(root, B*0.9), bt, 0.42)
        put(music, bass(root + (7 if k == 3 else 0), B*0.45), bt + B/2, 0.25)
    # light melody on alternate bars
    if bar % 2 == 1:
        for k, m in enumerate([ch[3] + 12, ch[2] + 12, ch[3] + 12, ch[1] + 24]):
            put(music, marimba(m, .4), t + k*B, 0.16, pan=0.25)
    bar += 1; t += BAR

# scene transitions + feature sounds
for tt in (15.2, 21.2, 32.55): put(sfx, whoosh(0.55), tt, 0.55)
for tt in (15.75, 21.6): put(sfx, whoosh(0.4), tt, 0.30)
def eio(x): return 4*x*x*x if x < .5 else 1 - ((-2*x + 2)**3)/2
def inv(y):
    lo, hi = 0, 1
    for _ in range(40):
        m = (lo + hi)/2
        lo, hi = (m, hi) if eio(m) < y else (lo, m)
    return (lo + hi)/2
for k, p in enumerate((0.13, 0.38, 0.62, 0.86)):
    put(sfx, pop([880, 988, 1175, 1319][k]), 16.7 + (19.5 - 16.7)*inv(p), 0.85)
put(sfx, sparkle(), 19.7, 0.8)
put(sfx, pop(784), 22.7, 0.8); put(sfx, pop(988), 23.4, 0.8)
put(sfx, whoosh(0.5), 24.55, 0.35)
put(sfx, click(), 28.35, 0.9); put(sfx, pop(1175), 28.45, 0.45)
for tt in (29.05, 29.85, 30.65, 31.45): put(sfx, tick(), tt, 0.35)
put(sfx, pop(660), 32.2, 0.4)

# ---- end card -------------------------------------------------------------
put(sfx, impact(), 32.88, 0.6); put(sfx, chime(), 32.95, 0.8)
put(music, pad([48, 55, 60, 64, 67], 5.6, 1500), 32.9, 0.40)
put(music, bass(36, 3.0), 32.9, 0.45)
for k, m in enumerate([72, 76, 79, 84]):
    put(music, marimba(m, .8), 33.2 + k*0.22, 0.22)

mix = music + sfx
fade = np.ones(N); fi = int(37.4*SR); fade[fi:] = np.linspace(1, 0, N - fi)
mix *= fade[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.85
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'mix.wav', SR, (mix*32767).astype(np.int16))
print('ok', DUR)
