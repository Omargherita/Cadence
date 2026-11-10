# B0.2 follow-up listening proposal — awaiting approval

Prepared 2026-11-10 at user request. Local preparation only; no upload, model run or playback-to-provider. Full B0.2/Batch 0 remain pending and D04 unapproved. Do not run until the user reviews the excerpt, expected events and criteria and explicitly approves this test.

## Excerpt and independent checks

Source: existing verified audio extract from /home/omar/Videos/test.mp4. Select [0.000, 12.000) seconds of that decoded audio timeline. No video. The timeline is relative to the existing decoded audio; no assertion of sample-exact MP4 video synchronization.

Private playable file: /home/omar/.local/share/cadence-b0-pilot/listening-proposal-clip.wav (mode 600, outside Git). Stereo 48 kHz PCM signed 16-bit. Python wave copied exactly the first 576,000 source frames, without normalization/resampling or inserted sounds. Reopening with wave reports 576,000 frames / 48,000 Hz = 12.000000 seconds; ffprobe independently reports 12.000000 seconds. SHA-256: 97461eeb928ad373cb0b8900f94e87d9da0636c8f65a4edc4bfc62f8d90ce37a.

Expected observable events, time relative to excerpt:

- 0.0–3.5 seconds: quiet, low-level opening; not asserted to be digital silence. Mean 10 ms RMS over the first half-second is approximately -57.7 dBFS, with subsequent opening half-seconds roughly -50 to -56 dBFS.
- About 3.6–3.7 seconds: first substantial rise/attack. Measured 10 ms energy peak at 3.69 seconds, approximately -23.2 dBFS.
- Later repeated attacks: energy peaks around 4.68, 6.39 and 7.39 seconds, approximately -20.9, -21.4 and -21.0 dBFS. These are candidate audible landmarks, not claims of specific notes or phrasing. Further prominent peaks occur around 9.20 and 11.86 seconds.

Method actually run: Python wave/array read PCM; compute RMS over nonoverlapping 480-frame (10 ms) windows across both channels, normalized to 32768. Inspect half-second mean RMS levels and local peaks over ±50 ms, retaining peaks above 0.02 RMS and separated by >150 ms. No Gemini results, transcript, musical labels, or model analysis used to derive these measurements. Measurement quantization approximately 10 ms; the hearing-task tolerance below is deliberately larger.

Limitation: no native local listening tool is available to this assistant. Waveform energy establishes physical changes, not their exact audible identity. User must listen to the supplied excerpt and confirm that the initial rise and later landmarks are clearly audible before approving. Do not treat prior Gemini descriptions as ground truth, assert speech/room sounds, or claim independently heard piano notes. If landmarks are not clear to the user, revise the proposal before testing; do not revise after seeing test output.

## Exact model prompt

Listen to the attached audio. Report its approximate total duration in seconds. Describe up to three audible events in chronological order, giving each an approximate time in seconds from the start. State any uncertainty. If you cannot access or hear the audio, say so and do not guess. Report only duration and audible events.

No piece name, expected duration, event labels, measured times or coaching request appears in this prompt. If approved, use a fresh Gemini 4 Argon/Antigravity context, same route and no previous results or project/label documents. Only this excerpt and prompt may be provided. Neutral outgoing filename, without duration/event hints. Exactly one proposed diagnostic run; no automatic retry or coaching afterward.

## Criteria fixed before the test

1. Input integrity: record actual native tool/media evidence, recover persisted media bytes if available and verify they match this excerpt (or independently check any conversion). If this cannot be established, record transport inconclusive; do not score listening as a verified pass.
2. Duration: reported duration must be within ±0.50 seconds of 12.000 seconds, inclusive. Missing duration fails this criterion; a range must be entirely inside 11.50–12.50 seconds.
3. Events: correctly identify the quiet opening followed by a clear sound/attack beginning around 3.69 seconds (onset tolerance ±0.50 seconds), and at least one distinct later attack matching one of 4.68, 6.39, 7.39, 9.20 or 11.86 seconds within ±0.50 seconds. One returned event may describe the quiet-to-sound transition. Distinct landmarks must not be double-counted. For reported time ranges, require the entire range to fit the relevant tolerance interval. User verifies audible identity; a mere matching timestamp without a correct sound description does not pass.
4. No invented out-of-file events: all claimed event times/range ends must lie within 0.00–12.50 seconds. The final 0.50 seconds is reporting tolerance only, not real audio. Clearly false event descriptions fail; disputed/unverifiable descriptions make the result inconclusive pending the sole user's rating.
5. Overall: all four criteria must pass. Honest inability to listen is a safe failure, not a listening pass. No score-based accuracy, note naming or coaching-quality conclusion follows. Do not relax criteria or retry after seeing results without new approval.

This is a small diagnostic, with one human rater and one clip. Even a pass does not distinguish reliable general listening from a lucky answer, nor certify long-recording timestamp accuracy. Failure categories must distinguish missing delivery evidence, wrong duration, event mismatch and beyond-EOF claims.

## Optional stricter synthetic control — proposal only

Recommend a separate 12.000-second PCM clip with two short tones starting at exactly 3.000 and 9.000 seconds, each 0.200 seconds, with distinct frequencies (e.g. 440 and 880 Hz), and silence elsewhere. Two markers help distinguish a constant timing offset from an apparent timing-scale error; a single marker is weaker. They cannot by themselves locate an internal decoding fault or prove musical understanding. Proposed strict tolerances: duration ±0.25 seconds; both onsets ±0.25 seconds; correct two-tone order; no additional claimed sound events. Hide marker schedule from the model.

Not generated or uploaded. It is a new file outside existing named-file consent. Before generating the test artifact for review, propose its local filename; before sending it, obtain separate named consent for that exact file to Gemini via Antigravity through T3 on the user's subscription, solely for one Batch 0 timing/transport control run, no paid API or other use. Show the generated playable clip, measured times, hash, exact prompt and criteria for approval before any listening run. No personal recording is needed or mixed into this control.
