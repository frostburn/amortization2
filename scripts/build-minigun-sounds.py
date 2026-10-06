#!/usr/bin/env python3
"""Deterministic CC0 sound edit. Requires ffmpeg, Python, numpy and scipy.

Run from any directory: python scripts/build-minigun-sounds.py
The checked-in 48 kHz mono PCM16 assets need no Python at runtime/build time.
"""
from pathlib import Path
import subprocess
import wave

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sounds" / "minigun"
SR = 48000
CADENCE = 30


def read(stem):
    path = next((ROOT / "sounds").glob(f"{stem}__*"))
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
        "-ar", str(SR), "-ac", "1", "-",
    ])
    return np.frombuffer(raw, dtype="<f4").astype(np.float64)


def filter_audio(x, cutoffs, kind):
    return signal.sosfiltfilt(signal.butter(3, cutoffs, kind, fs=SR, output="sos"), x)


def level(x, peak=0.8):
    return x * peak / max(1e-9, np.max(np.abs(x)))


def fade(x, attack=0.002, release=0.015):
    x = x.copy()
    a, r = min(len(x), round(attack * SR)), min(len(x), round(release * SR))
    if a:
        x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if r:
        x[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return x


def mix_at(destination, sound, seconds, gain=1):
    i = round(seconds * SR)
    count = min(len(sound), len(destination) - i)
    if count > 0:
        destination[i:i + count] += sound[:count] * gain


def save(name, x):
    assert np.isfinite(x).all() and np.max(np.abs(x)) < 1
    with wave.open(str(OUT / f"{name}.wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(np.rint(x * 32767).astype("<i2").tobytes())
    print(f"{name:20s} {len(x) / SR:.3f} s  peak {np.max(np.abs(x)):.3f}")


def build():
    OUT.mkdir(exist_ok=True)
    # A stable two-second saw section, softened to keep the motor below the reports.
    raw = filter_audio(read("185232")[2 * SR:4 * SR], [80, 2200], "bandpass")
    # Circular overlap: the final crossfade joins the samples before the first frame.
    n, overlap = round(0.8 * SR), round(0.08 * SR)
    raw = raw[:n + overlap]
    motor = raw[overlap:].copy()
    blend = np.linspace(0, 1, overlap)
    motor[-overlap:] = raw[-overlap:] * (1 - blend) + raw[:overlap] * blend
    motor -= np.mean(motor)
    # Remove a possible endpoint discontinuity without creating a silent loop seam.
    correction = round(0.004 * SR)
    motor[-correction:] -= np.linspace(0, motor[-1] - motor[0], correction)
    motor = level(motor, 0.64)
    click = fade(level(read("67613"), 0.6), 0.0003, 0.004)
    shake = fade(level(filter_audio(read("67614"), [120, 2800], "bandpass"), 0.4))

    def ramp(seconds, start_rate, end_rate, end_at_zero=False):
        length = round(seconds * SR)
        rates = np.linspace(start_rate, end_rate, length)
        phase = np.cumsum(rates) - rates[0]
        if end_at_zero:
            phase -= phase[-1]
        return np.interp(phase % len(motor), np.arange(len(motor) + 1), np.r_[motor, motor[0]])

    up = ramp(0.5, 0.25, 1, True)
    up *= np.linspace(0.12, 1, len(up))
    up = fade(up, 0.008, 0)
    mix_at(up, click, 0.03, 0.32)
    mix_at(up, shake, 0.08, 0.07)
    down = ramp(0.7, 1, 0.2)
    down *= np.linspace(1, 0, len(down)) ** 0.8
    down = fade(down, 0.006, 0.04)
    mix_at(down, click, 0.64, 0.25)
    save("spin-up", up)
    save("motor-loop", motor)
    save("spin-down", down)

    # Align the M240's attack; retain 210 ms of body/tail beneath the dry short shot.
    m240 = read("854641")
    onset = max(0, np.flatnonzero(np.abs(m240) > 0.08)[0] - round(0.001 * SR))
    m240 = m240[onset:onset + round(0.24 * SR)]
    body = fade(level(filter_audio(m240, 1600, "lowpass"), 0.54), 0.0005, 0.045)
    dry = fade(level(read("854347"), 0.52), 0.0003, 0.008)
    shot = np.zeros(round(0.24 * SR))
    mix_at(shot, body, 0)
    mix_at(shot, dry, 0, 0.85)
    t = np.arange(round(0.09 * SR)) / SR
    bass = np.sin(2 * np.pi * (115 * t - 200 * t * t)) * np.exp(-t * 55)
    mix_at(shot, fade(bass * 0.16, 0.001, 0.015), 0)
    shot = level(shot, 0.82)

    # Twelve rounds / 0.4 s. Circular overlap carries preceding tails across the seam.
    length, period = round(0.4 * SR), SR // CADENCE
    sustain = np.zeros(length)
    for i in range(12):
        rate = [0.98, 1.015, 1.0, 1.025][i % 4]
        variant = np.interp(np.arange(0, len(shot), rate), np.arange(len(shot)), shot)
        gain = [1.0, 0.91, 0.97, 0.94][i % 4]
        indices = (i * period + np.arange(len(variant))) % length
        np.add.at(sustain, indices, variant * gain)
    # One shared gain keeps attack, sustain and release at the same level.
    gain = 0.86 / max(np.max(np.abs(sustain)), np.max(np.abs(shot)))
    sustain *= gain
    attack = np.zeros(length)
    for i in range(12):
        rate = [0.98, 1.015, 1.0, 1.025][i % 4]
        variant = np.interp(np.arange(0, len(shot), rate), np.arange(len(shot)), shot)
        mix_at(attack, variant, i / CADENCE, gain * [1.0, 0.91, 0.97, 0.94][i % 4])
    # Tail of the preceding rounds, with no new attack after trigger release.
    tail = np.zeros(len(shot))
    for i in range(1, 8):
        offset = i * period
        if offset < len(shot):
            tail[:len(shot) - offset] += shot[offset:] * gain * 0.94
    save("fire-start", attack)
    save("fire-loop", sustain)
    save("fire-tail", fade(tail, 0.003, 0.04))

    # Short metal hits: edited individually, rather than layering full crashes per bullet.
    for i, stem in enumerate(["67597", "67601", "67609"], 1):
        hit = filter_audio(read(stem), [130, 6200], "bandpass")
        hit = hit[:round(0.13 * SR)]
        save(f"impact-{i}", fade(level(hit, 0.76), 0.0005, 0.012))

    # Audition: wind-up, 2 s burst, release; then a cancelled 180 ms wind-up.
    demo = np.zeros(round(5.5 * SR))
    mix_at(demo, up, 0.1, 0.4)
    for i in range(3):
        mix_at(demo, motor, 0.6 + i * 0.8, 0.32)
    mix_at(demo, attack, 0.6, 0.72)
    for i in range(4):
        mix_at(demo, sustain, 1 + i * 0.4, 0.72)
    # Remove motor frames after release before mixing its independent coast.
    demo[round(2.6 * SR):] = 0
    mix_at(demo, down, 2.6, 0.4)
    mix_at(demo, fade(tail, 0.003, 0.04), 2.6, 0.72)
    mix_at(demo, fade(up[:round(0.18 * SR)], 0.008, 0.008), 3.8, 0.4)
    mix_at(demo, down[round(0.7 * 0.64 * SR):], 3.98, 0.25)
    save("demo", fade(demo, 0.005, 0.02))


if __name__ == "__main__":
    build()
