#!/usr/bin/env python3
"""
Cadence Audio DSP Analyzer
Extracts deterministic digital signal processing metrics (onset stability, BPM,
sliding-window tempo anomalies, and RMS dynamic range) for the AI Piano Mentor.
"""

import argparse
import io
import json
import os
import subprocess
import sys
import numpy as np


def format_timestamp(seconds: float) -> str:
    total_sec = max(0, int(round(seconds)))
    mins = total_sec // 60
    secs = total_sec % 60
    return f"{mins:02d}:{secs:02d}"


def load_audio(file_path: str, target_sr: int = 24000):
    import soundfile as sf

    try:
        data, sr = sf.read(file_path, dtype="float32")
    except Exception:
        # Fallback to FFmpeg pipe if soundfile cannot read format directly
        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            file_path,
            "-f",
            "wav",
            "-ar",
            str(target_sr),
            "-ac",
            "1",
            "pipe:1",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        data, sr = sf.read(io.BytesIO(proc.stdout), dtype="float32")

    # Convert to mono if multi-channel
    if data.ndim > 1:
        data = np.mean(data, axis=1)

    # Resample if sample rate does not match target
    if sr != target_sr:
        import librosa

        data = librosa.resample(data, orig_sr=sr, target_sr=target_sr)
        sr = target_sr

    return data, sr


def analyze_audio(file_path: str) -> dict:
    import librosa

    target_sr = 24000
    y, sr = load_audio(file_path, target_sr=target_sr)

    total_samples = len(y)
    duration_sec = round(float(total_samples / sr), 2)

    if duration_sec < 0.5 or np.max(np.abs(y)) < 1e-5:
        return {
            "analyzerStatus": "Available",
            "durationSeconds": duration_sec,
            "estimatedMeanBpm": 0.0,
            "tempoStabilityStdDevBpm": 0.0,
            "detectedTempoAnomalies": [],
            "dynamicRangeRmsDb": 0.0,
            "dynamicEnvelopeNotes": "Audio file contains silence or near-zero acoustic signal.",
        }

    # 1. Onset Envelope & Beat Tracking
    hop_length = 512
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop_length, units="time")

    tempo, beats = librosa.beat.beat_track(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=hop_length,
        units="time",
    )

    mean_bpm_raw = float(np.atleast_1d(tempo)[0])
    beat_times = np.array(beats)

    # 2. Inter-Onset & Beat Interval Stability
    if len(beat_times) >= 2:
        ibis = np.diff(beat_times)
        valid_ibis = ibis[(ibis >= 0.15) & (ibis <= 3.0)]  # 20 to 400 BPM range
        if len(valid_ibis) >= 2:
            instant_bpms = 60.0 / valid_ibis
            tempo_std_dev = float(np.std(instant_bpms))
            if mean_bpm_raw <= 0:
                mean_bpm_raw = float(np.median(instant_bpms))
        else:
            tempo_std_dev = 0.0
    elif len(onsets) >= 3:
        iois = np.diff(onsets)
        valid_iois = iois[(iois >= 0.15) & (iois <= 3.0)]
        if len(valid_iois) >= 2:
            instant_bpms = 60.0 / valid_iois
            tempo_std_dev = float(np.std(instant_bpms))
            if mean_bpm_raw <= 0:
                mean_bpm_raw = float(np.median(instant_bpms))
        else:
            tempo_std_dev = 0.0
    else:
        tempo_std_dev = 0.0

    estimated_mean_bpm = round(max(0.0, mean_bpm_raw), 1)
    tempo_stability_std_dev_bpm = round(max(0.0, tempo_std_dev), 2)

    # 3. Sliding Window Tempo Anomaly Detection (4-6 second windows, hop 2.5s)
    window_sec = 5.0
    hop_sec = 2.5
    detected_tempo_anomalies = []

    if duration_sec >= 4.0 and estimated_mean_bpm > 0:
        current_start = 0.0
        while current_start + 2.0 <= duration_sec:
            current_end = min(duration_sec, current_start + window_sec)
            # Find beats or onsets in window
            w_beats = beat_times[(beat_times >= current_start) & (beat_times <= current_end)]
            w_bpm = None

            if len(w_beats) >= 3:
                w_ibis = np.diff(w_beats)
                w_valid = w_ibis[(w_ibis >= 0.15) & (w_ibis <= 3.0)]
                if len(w_valid) >= 2:
                    w_bpm = float(np.mean(60.0 / w_valid))
            elif len(onsets) >= 3:
                w_onsets = onsets[(onsets >= current_start) & (onsets <= current_end)]
                if len(w_onsets) >= 3:
                    w_iois = np.diff(w_onsets)
                    w_valid = w_iois[(w_iois >= 0.15) & (w_iois <= 3.0)]
                    if len(w_valid) >= 2:
                        w_bpm = float(np.median(60.0 / w_valid))

            if w_bpm is not None and w_bpm > 0:
                dev_pct = ((w_bpm - estimated_mean_bpm) / estimated_mean_bpm) * 100.0
                if abs(dev_pct) > 8.0:
                    anomaly_type = "Rushing" if dev_pct > 0 else "Dragging"
                    range_str = f"{format_timestamp(current_start)}-{format_timestamp(current_end)}"
                    detected_tempo_anomalies.append(
                        {
                            "timestampRange": range_str,
                            "localBpm": round(w_bpm, 1),
                            "deviationPercent": round(dev_pct, 1),
                            "type": anomaly_type,
                        }
                    )

            if current_end >= duration_sec:
                break
            current_start += hop_sec

    # Deduplicate closely overlapping anomalies of the same type if necessary
    filtered_anomalies = []
    for anom in detected_tempo_anomalies:
        if not filtered_anomalies:
            filtered_anomalies.append(anom)
        else:
            prev = filtered_anomalies[-1]
            if prev["type"] == anom["type"] and abs(prev["deviationPercent"] - anom["deviationPercent"]) < 4.0:
                # Merge into longer range
                p_start = prev["timestampRange"].split("-")[0]
                a_end = anom["timestampRange"].split("-")[1]
                prev["timestampRange"] = f"{p_start}-{a_end}"
                prev["localBpm"] = round((prev["localBpm"] + anom["localBpm"]) / 2, 1)
                prev["deviationPercent"] = round((prev["deviationPercent"] + anom["deviationPercent"]) / 2, 1)
            else:
                filtered_anomalies.append(anom)

    # 4. RMS Dynamic Range (dB)
    frame_length = int(sr * 0.05)  # 50ms
    rms_hop = int(sr * 0.025)  # 25ms
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=rms_hop)[0]

    max_rms = float(np.max(rms)) if len(rms) > 0 else 0.0
    active_rms = rms[rms > (max_rms * 0.02)] if max_rms > 0 else np.array([])

    if len(active_rms) >= 10:
        p95 = float(np.percentile(active_rms, 95))
        p10 = float(np.percentile(active_rms, 10))
        db95 = 20.0 * np.log10(max(p95, 1e-7))
        db10 = 20.0 * np.log10(max(p10, 1e-7))
        dynamic_range_rms_db = round(float(max(0.0, db95 - db10)), 1)
    else:
        dynamic_range_rms_db = 0.0

    # 5. Dynamic Envelope Notes (Loudest vs Quietest active segments + Ceiling evaluation)
    rms_frames_per_sec = sr / rms_hop
    seg_len_frames = int(4.0 * rms_frames_per_sec)
    loudest_start_sec = 0.0
    loudest_db = -99.0
    quietest_start_sec = 0.0
    quietest_db = 0.0

    if len(rms) >= seg_len_frames:
        for idx in range(0, len(rms) - seg_len_frames, max(1, seg_len_frames // 2)):
            window = rms[idx : idx + seg_len_frames]
            w_mean = float(np.mean(window))
            if w_mean < 1e-6:
                continue
            w_db = 20.0 * np.log10(w_mean)
            sec = idx / rms_frames_per_sec
            if w_db > loudest_db:
                loudest_db = w_db
                loudest_start_sec = sec
            if (quietest_db == 0.0 or w_db < quietest_db) and w_db > -60.0:
                quietest_db = w_db
                quietest_start_sec = sec

    loudest_range = f"{format_timestamp(loudest_start_sec)}-{format_timestamp(min(duration_sec, loudest_start_sec + 4.0))}"
    quietest_range = f"{format_timestamp(quietest_start_sec)}-{format_timestamp(min(duration_sec, quietest_start_sec + 4.0))}"

    if dynamic_range_rms_db < 10.0:
        ceiling_eval = "Dynamic ceiling appears compressed (<10 dB contrast); accents lack room to breathe."
    elif dynamic_range_rms_db < 18.0:
        ceiling_eval = "Moderate dynamic headroom (10-18 dB); noticeable dynamic variance with slight floor elevation."
    else:
        ceiling_eval = "Expansive expressive dynamic headroom (>18 dB contrast); clear separation between cantabile projection and soft accompaniment."

    dynamic_envelope_notes = (
        f"Dynamic contrast: {dynamic_range_rms_db} dB. "
        f"Peak volume at {loudest_range} ({loudest_db:.1f} dB RMS); "
        f"subdued section at {quietest_range} ({quietest_db:.1f} dB RMS). "
        f"{ceiling_eval}"
    )

    return {
        "analyzerStatus": "Available",
        "durationSeconds": duration_sec,
        "estimatedMeanBpm": estimated_mean_bpm,
        "tempoStabilityStdDevBpm": tempo_stability_std_dev_bpm,
        "detectedTempoAnomalies": filtered_anomalies,
        "dynamicRangeRmsDb": dynamic_range_rms_db,
        "dynamicEnvelopeNotes": dynamic_envelope_notes,
    }


def main():
    parser = argparse.ArgumentParser(description="Cadence Audio DSP Analyzer")
    parser.add_argument("input_audio_path", help="Path to input audio file (.mp3 or .wav)")
    parser.add_argument("--output", help="Optional path to output json file", default=None)

    args = parser.parse_args()

    if not os.path.isfile(args.input_audio_path):
        error_result = {
            "analyzerStatus": "Unavailable",
            "error": f"Audio file not found: {args.input_audio_path}",
            "durationSeconds": 0.0,
            "estimatedMeanBpm": 0.0,
            "tempoStabilityStdDevBpm": 0.0,
            "detectedTempoAnomalies": [],
            "dynamicRangeRmsDb": 0.0,
            "dynamicEnvelopeNotes": "Audio file not found on disk.",
        }
        output_json = json.dumps(error_result, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_json)
        else:
            print(output_json)
        sys.exit(0)

    try:
        results = analyze_audio(args.input_audio_path)
    except Exception as e:
        results = {
            "analyzerStatus": "Unavailable",
            "error": str(e),
            "durationSeconds": 0.0,
            "estimatedMeanBpm": 0.0,
            "tempoStabilityStdDevBpm": 0.0,
            "detectedTempoAnomalies": [],
            "dynamicRangeRmsDb": 0.0,
            "dynamicEnvelopeNotes": f"DSP analysis error: {str(e)}",
        }

    output_json = json.dumps(results, indent=2)

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
