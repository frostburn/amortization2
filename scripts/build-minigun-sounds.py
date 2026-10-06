#!/usr/bin/env python3
"""Deterministic CC0 sound edit. Requires ffmpeg with Rubber Band, numpy and scipy.

Run from any directory: python scripts/build-minigun-sounds.py
The checked-in 48 kHz mono PCM16 assets need no Python at runtime/build time.
"""
from pathlib import Path
import io
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


def save(name, x, flac=False):
    assert np.isfinite(x).all() and np.max(np.abs(x)) < 1
    destination = io.BytesIO() if flac else str(OUT / f"{name}.wav")
    with wave.open(destination, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(np.rint(x * 32767).astype("<i2").tobytes())
    if flac:
        # Auditions are not runtime assets. Lossless compression keeps their source
        # files small without changing a sample or the WAVs imported by the game.
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-f", "wav", "-i", "-",
            "-map_metadata", "-1", "-compression_level", "12",
            str(OUT / f"{name}.flac"),
        ], input=destination.getvalue(), check=True)
    print(f"{name:20s} {len(x) / SR:.3f} s  peak {np.max(np.abs(x)):.3f}")


def stretch(x, seconds, pitch=0.4):
    """Keep the recorded motor sweep while shortening it independently of pitch."""
    tempo = len(x) / SR / seconds
    guard = round(0.3 * SR)
    # Analysis windows need context around an edit. Discard this reflected handle
    # afterwards, so a cut in the saw recording cannot become a stretched thump.
    padded = fade(np.pad(x, (guard, guard), mode="reflect"), 0.02, 0.02)
    edit = subprocess.run([
        "ffmpeg", "-v", "error", "-f", "f64le", "-ar", str(SR), "-ac", "1",
        "-i", "-", "-af",
        f"rubberband=tempo={tempo}:pitch={pitch}:"
        "transients=smooth:detector=soft:window=long:pitchq=quality",
        "-f", "f64le", "-",
    ], input=padded.astype("<f8").tobytes(), stdout=subprocess.PIPE, check=True)
    result = np.frombuffer(edit.stdout, dtype="<f8").copy()
    handle, length = round(guard / tempo), round(seconds * SR)
    # Rubber Band's final analysis window can round the requested sample count.
    # Correct only that rounding, rather than padding a silent transition/loop seam.
    result = signal.resample(result, length + 2 * handle)
    return result[handle:handle + length]


def motor_fragments():
    # olliehahn12's saw records an actual run-up, steady motor and coast-down.
    # Keep those performances; do not manufacture both ramps from a steady loop.
    source = read("262004")
    section = lambda start, end: source[round(start * SR):round(end * SR)]

    def body(x):
        x = filter_audio(x, [65, 4200], "bandpass")
        # Retain the audible gear whine, with more weight below it and less cutting hiss.
        return x * 0.7 + filter_audio(x, 450, "lowpass") * 0.9

    overlap = round(0.04 * SR)
    raw = body(stretch(section(3.35, 4.31), 0.84))
    motor = raw[overlap:].copy()
    blend = np.linspace(0, 1, overlap)
    motor[-overlap:] = raw[-overlap:] * (1 - blend) + raw[:overlap] * blend
    motor -= np.mean(motor)
    correction = round(0.004 * SR)
    motor[-correction:] -= np.linspace(0, motor[-1] - motor[0], correction)

    up = body(stretch(section(0.025, 2.15), 0.5))
    down = body(stretch(section(7.22, 10), 0.7))
    rms = lambda x: np.sqrt(np.mean(x * x))
    # Match the powered ends to the loop, preserving each recording's natural envelope.
    powered = round(0.08 * SR)
    up *= rms(motor[:powered]) / rms(up[-powered:])
    down *= rms(motor[:powered]) / rms(down[:powered])
    up[-overlap:] = up[-overlap:] * (1 - blend) + motor[-overlap:] * blend
    down[:overlap] = motor[:overlap] * (1 - blend) + down[:overlap] * blend
    up = fade(up, 0.012, 0)
    # The supplied recording ends before complete rest: taper the remaining room/motor tail.
    down = fade(down, 0.004, 0.13)
    gain = 0.7 / max(np.max(np.abs(x)) for x in (up, motor, down))
    return up * gain, motor * gain, down * gain


def build():
    OUT.mkdir(exist_ok=True)
    up, motor, down = motor_fragments()
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
        mix_at(demo, motor, 0.6 + i * 0.8, 0.4)
    mix_at(demo, attack, 0.6, 0.72)
    for i in range(4):
        mix_at(demo, sustain, 1 + i * 0.4, 0.72)
    # Remove motor frames after release before mixing its independent coast.
    demo[round(2.6 * SR):] = 0
    mix_at(demo, down, 2.6, 0.4)
    mix_at(demo, fade(tail, 0.003, 0.04), 2.6, 0.72)
    mix_at(demo, fade(up[:round(0.18 * SR)], 0.008, 0.008), 3.8, 0.4)
    mix_at(demo, down[round(0.7 * 0.64 * SR):], 3.98, 0.4)
    save("demo", fade(demo, 0.005, 0.02), flac=True)

    # Expose the motor on its own so the reports do not mask a sound-design audition.
    motor_demo = np.zeros(round(4.4 * SR))
    mix_at(motor_demo, up, 0.1, 0.8)
    for i in range(2):
        mix_at(motor_demo, motor, 0.6 + i * 0.8, 0.8)
    mix_at(motor_demo, down, 2.2, 0.8)
    mix_at(motor_demo, fade(up[:round(0.18 * SR)], 0.008, 0.008), 3.4, 0.8)
    mix_at(motor_demo, down[round(0.7 * 0.64 * SR):], 3.58, 0.8)
    save("motor-demo", fade(motor_demo, 0.005, 0.02), flac=True)


if __name__ == "__main__":
    build()
