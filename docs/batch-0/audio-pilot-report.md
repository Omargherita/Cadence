# B0.2 approved audio-only pilot — blocked transport report

Date: 2026-11-10. Result: extraction verified; provider listening unverified. Full B0.2 and Batch 0 qualification remain pending. D04 remains proposed and explicitly unapproved.

## Authority and limits

The user approved extraction, one transport check, and two repeat coaching runs on audio from `/home/omar/Videos/test.mp4`, through Gemini via Antigravity on T3 using their subscription. No video, score PDF, other source file, paid API, or alternate route is authorized. Exact approval and pre-test memory labels are preserved in PROJECT_ROADMAP.md. No ground-truth labels were included in the transport prompt.

## Local extraction and verification

Source audio: AAC, stereo, 48 kHz, ffprobe stream duration 188.522667 seconds. Source container duration: 188.618222 seconds. Extracted WAV: PCM signed 16-bit, stereo, 48 kHz, 188.517958 seconds, 36,195,492 bytes. No resampling, normalization, cropping, or deliberate musical alteration. PCM decoding does not restore information lost in the original AAC. The slight duration difference is recorded without claiming sample-exact alignment.

Private artifacts remain outside Git at `/home/omar/.local/share/cadence-b0-pilot/`: `pilot-audio.wav` (mode 600) and `local-manifest.json` (mode 600), containing source/output hashes and selected media properties. Parent directory mode 700. Original preserved; its SHA-256 matched before and after verification. Output hash also matched. No recordings or raw sensitive logs are committed.

Commands actually run:

```bash
ffprobe -v error -select_streams a -show_entries stream=index,codec_name,sample_rate,channels,duration:format=duration -of json /home/omar/Videos/test.mp4
ffmpeg -nostdin -hide_banner -loglevel error -n -i /home/omar/Videos/test.mp4 -map 0:a:0 -vn -sn -dn -map_metadata -1 -map_chapters -1 -c:a pcm_s16le -fflags +bitexact -flags:a +bitexact /home/omar/.local/share/cadence-b0-pilot/pilot-audio.wav
ffprobe -v error -show_entries stream=codec_type,codec_name,sample_rate,channels,duration:format=duration,size:format_tags:stream_tags -of json /home/omar/.local/share/cadence-b0-pilot/pilot-audio.wav
sha256sum /home/omar/Videos/test.mp4 /home/omar/.local/share/cadence-b0-pilot/pilot-audio.wav
ffmpeg -nostdin -hide_banner -loglevel error -i /home/omar/.local/share/cadence-b0-pilot/pilot-audio.wav -map 0:a:0 -f null -
```

All exited successfully. A Python review independently recomputed both hashes, asserted exactly one stream of type audio and no stream/format metadata tags, and wrote the private manifest. All assertions passed. These checks establish local file preparation, not native model listening.

## T3 attachment preparation and provider check

- `orchestrator_capabilities` lists provider `antigravity` with Gemini models. Selected `gemini-4-argon`; delegate returned no explicit option overrides. T3 server identifies as 0.1.7 on Linux x64. Account eligibility and subscription allowances were not independently verified.
- `t3_attachment_prepare_upload` accepted `audio/wav`, file type, 36,195,492 bytes; returned a pending upload. Preparing took approximately 22 ms.
- Exact WAV bytes were POSTed to the supplied signed path on the running local T3 server's origin using Python urllib. HTTP 204 in approximately 74 ms. No credentials were extracted. Signed URL omitted from evidence.
- This proves local T3 attachment storage only. The delegate interface has no initial attachment field. The pending upload was discarded through `t3_attachment_discard` before starting the provider check; it was never sent to a provider thread as an attachment. Cleanup returned success. No provider delivery claim follows from HTTP 204.
- One Gemini/Antigravity delegate run tested whether its native tools could actually read the exact local WAV path. It was instructed to stop without listening claims if media was unavailable; shell/DSP/transcription/text substitutes and further runs were prohibited.
- Delegate reports `view_file` advertises audio support but its call was rejected by the harness pre-tool workspace hook: `denied by pre-tool hook: Access to path "/home/omar/.local/share/cadence-b0-pilot/pilot-audio.wav" is denied. It is outside the allowed workspace directories` (list omitted). The allowed roots in the reported error include the project and T3 attachment storage, but not the private extraction directory.
- This is a path-access failure before a media-tool result, not evidence that Gemini cannot process audio. The delegate made no musical claims and reported no audio delivery. The parent's thread activity read confirms the completed run and final report; it exposes the reported denial in assistant text, not an independently captured raw hook event. Native audio ingestion remains unverified.

[Transport-check evidence](<t3-thread://v2/e0301d2b-f76c-47e1-808d-7311dd4944c9/thread:delegated-task:command%3Amcp%3A8d81611f-4b71-41ae-af7d-137651f4dd4c%3Adelegate-task%3Ae5a22ffb-2a40-476d-8992-47b90e758e0e>)

T3 recorded request 19:18:51.209 UTC, start 19:18:55.670 UTC, completion 19:19:22.413 UTC: 31.204 seconds request-to-completion, 26.743 seconds running. These are failed-check elapsed times, not audio-analysis latency. No usage ceiling or price was established. No paid API was invoked.

## Disposition

Transport-check allocation used: 1/1. Coaching runs: 0/2; both remain unstarted because listening was not established. No user ratings, coaching-quality findings, or comparison results exist. No PDF or video was sent. Memory-based labels and sole-user validation limitations remain unchanged.

Pilot stopped on the recorded blocker. No access hook was bypassed or expanded, and no second transport run was started. A proposed recovery is to stage the same authorized WAV through a supported T3 attachment location and permit one additional transport check on the same route. This is a proposal requiring authorization because the pilot specified one transport check and stopping on blockers. Successful staging would still not prove native listening; actual tool/media delivery must be observed before the two original coaching runs. No unrelated uploads or provider substitution are proposed.

This report records partial work and a failed check, not completion of B0.2, B0.3, B0.4, B0.5, or Batch 0. No threshold was changed. No production or legacy code changed.

## Authorized recovery check — 2026-11-10

User replied “yeah go ahead” to the explicit request to stage the same WAV in T3's allowed attachment directory and perform one additional transport check. Approval/preparation bookkeeping commit: `1b46a32`. No broader consent or D04 approval follows.

Preparation: Python verified the original WAV against its local hash manifest, copied exact bytes using shutil to a unique mode-700 directory beneath T3 attachment storage, set WAV mode 600, and verified identical SHA-256. Private recovery-staging.json records the exact path/hash outside Git. No settings or access hook changed.

The recovery run used Gemini 4 Argon through Antigravity, with no explicit model option overrides. T3 records requested 19:22:59.315 UTC, started 19:23:02.641 UTC, completed 19:23:43.815 UTC: 44.500 seconds request-to-completion, 41.174 seconds running.

[Recovery-check evidence](<t3-thread://v2/e0301d2b-f76c-47e1-808d-7311dd4944c9/thread:delegated-task:command%3Amcp%3A8d81611f-4b71-41ae-af7d-137651f4dd4c%3Adelegate-task%3A34ad7089-98c9-446d-ba08-685a571f9869>)

Independent thread-activity evidence now includes a completed dynamic tool event titled Read for the staged WAV. Its exposed JSON has toolName Read, input file_path for that WAV, start_line 0/end_line 799, and output “View pilot-audio.wav”. This establishes that the prior workspace denial was resolved. The exposed event does not show MIME, media part bytes, byte length, or a content hash delivered to the model. The delegate's prose claims native view_file delivery as part_0/audio/wav, complete content, and a 100 MB limit; these details are not independently established by that event and must not become qualified transport limits.

The delegate's listening description is inconsistent with the prepared input: it places a final chord at 3:11–3:13, a high note at 3:14, and the recording end at approximately 3:21. The verified WAV ends at 188.517958 seconds (3:08.517958). Even 3:11 is about 2.48 seconds past EOF and the claimed 3:21 ending is about 12.48 seconds past EOF, exceeding its claimed ±1.5-second uncertainty. Do not clip or silently correct these timestamps. No other reported pitch, musical event, or weakness is accepted as factual without validation.

Local checks after the run:

```bash
ffprobe -v error -show_entries stream=codec_type,duration:format=duration,size -of json /home/omar/.t3/userdata/attachments/cadence-b0-pilot-xqjzxcn8/pilot-audio.wav
sha256sum /home/omar/.t3/userdata/attachments/cadence-b0-pilot-xqjzxcn8/pilot-audio.wav
```

Both succeeded: one audio stream, 188.517958 seconds, 36,195,492 bytes, SHA-256 equal to the original extraction. Thus staging did not create a longer recording. Source/decoded material was not modified for this recovery.

Updated disposition: 2 transport runs used (the original and one authorized recovery); coaching 0/2. Path access succeeded, but independent native-payload evidence remains incomplete and the listening account has objectively invalid timestamps. This does not prove audio was absent; it prevents accepting the account as successful listening verification. Stop on this discrepancy under the user's instruction; no coaching, additional upload, or model retry started. Full B0.2/Batch 0 remain pending and D04 unapproved.

Next proposed action, requiring a decision before further experiments: examine native payload-level delivery evidence if available through supported diagnostics, then decide whether to continue the original two coaching runs as explicitly unqualified exploratory evaluations. No extra model run, new material, paid API, or alternate route is authorized by this report.
