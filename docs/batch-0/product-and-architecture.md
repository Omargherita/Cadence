# B0.1 — Product contract and architecture decision packet

Date: 2026-11-10. Authority: PROJECT_ROADMAP.md and the current user's Go for Batch 0 only. This packet finalizes the written contract; it does not approve a stack or establish AI feasibility.

## Product workflows and observable outcomes

1. Weekly organization: capture and edit backlog responsibilities with priority, optional deadline and duration; plan seven days against availability; track independent recurring occurrences and completion/reopening history. Manual planning must work offline. AI may propose a capacity-aware plan, but only explicit acceptance changes commitments.
2. Weekly review: compute completed, unfinished, dropped, and rescheduled activity from recorded history; retain report snapshots, user reflection, and readable exports. Optional AI interpretation must use these computed facts. Provider failure must leave factual reports usable.
3. Piano study: require a valid PDF for every piece; preserve score versions and imported recordings; organize practice sessions; play selected passages and keep source time offsets. Audio is the primary assessment material. Phone video is optional supplementary input, not a promise of visual technique analysis. MIDI is optional future supplementary material; MVP MIDI analysis is deferred.
4. Coaching: request consent for the specific outgoing materials and purpose; deliver qualified score/audio context; save assessments and follow-up discussion locally. Separate supported technical observations, artistic options, and uncertainty. Cite passages/timestamps, give actionable next steps, and avoid fabricated faults. Suggestions become practice goals or planner tasks only after approval.
5. Progress comparison: compare two identified takes of the same passage, preserve take identities and original offsets, and ground any direction-of-change claim in both recordings. Saved results remain available without the provider.
6. Ownership and recovery: keep durable product history and original assets locally, export records, and demonstrate isolated backup restoration. Provider thread references supplement local history.

The intended platform is a personal Linux desktop application with fresh data. Preservation of the legacy deployment and all Git history is mandatory in Batch 1; Batch 0 does not archive or replace anything.

## MVP boundaries

Included: backlog, weekly planning, recurrence, completion history, capacity-aware proposals requiring acceptance, factual reports and optional AI reflection, mandatory PDF scores, audio/video import and excerpt playback, audio assessments and conversation, approved practice goals, two-take comparisons, local storage, export, backup/restore, and Linux packaging.

Deferred: phone application/access, cross-device sync, calendar integration, automatic background scheduling, live recording/coaching, full visual technique assessment, MIDI analysis, automatic score recognition/alignment, additional providers, and multi-agent teaching panels. No equivalence to an elite human teacher is claimed. Calendar delivery estimates await feasibility.

## Decision register and evidence required

Every decision below remains **proposed; user approval pending**. The Batch 0 Go authorizes investigation, not adoption. No version or compatibility claim has been verified by this documentation task.

| ID | Proposal | Evidence/decision required before adoption |
|---|---|---|
| D01 | Electron, React, TypeScript, Vite, Electron Forge | Linux feasibility and packaging review, then explicit stack approval. No production shell in Batch 0. |
| D02 | SQLite via better-sqlite3; recordings as files | Native-module packaging evidence and transactional recovery approach; explicit approval. |
| D03 | Validated IPC application services and background utility process | Review renderer isolation, operation validation, worker failures and credential boundaries; explicit approval. |
| D04 | T3 first; qualify Antigravity/Gemini native audio | B0.3 supported external authentication/lifecycle, B0.4 actual PDF/audio delivery, B0.5 musical evidence and existing-account eligibility; explicit route approval. Current session tools alone do not prove an external client works. |
| D05 | FFmpeg/ffprobe and PDF.js; no separate Python service | Decode/extraction, PDF handling and Linux distribution constraints; explicit approval. |
| D06 | Cadence owns durable product history | Review saved results, conversations, provider references and interrupted-job behavior; explicit technical approval. Local ownership is already a product requirement. |
| D07 | Vitest, integration tests, Playwright, packaged Linux smoke checks | Confirm harness feasibility and coverage at service/desktop/package boundaries; explicit approval. |
| D08 | Separate desktop sources and application-data location | Batch 1 verified archive/restore plus distinct paths before initialization; explicit approval. No archival action in Batch 0. |

Proposed flow: renderer → validated IPC → application services → local database/assets and background work → supported T3 interface → explicitly selected qualified model. Filesystem, credentials, database access, and heavy work stay outside the proposed renderer. This is a design proposal, not an implemented or approved interface.

The existing React/Vite PWA, ASP.NET Core API, IndexedDB synchronization, Python DSP and direct Gemini API integration are legacy implementation. Their presence does not approve the proposed desktop stack or authorize reuse of credentials, data, or paid APIs. Inspected evidence: README.md, src/web-client/package.json, src/Cadence.Api/Cadence.Api.csproj, and baseline commit 2c205e5f81fdf38a87abbd1767d662755f21f943. Legacy tests were not run: this task changes documentation only and makes no runtime readiness claim.

## Feasibility and consent gates

- B0.2 must freeze corpus provenance, clean/altered ground truth, unusable and comparison cases, blind scoring procedure, denominators, and permitted account/upload use before live tests. No recordings or scores have been selected or uploaded by this task.
- Retain the roadmap's proposed gates: no fabricated critique for silent/unusable input; at least 80% supported high-priority factual observations; at least 80% correct direction on deliberately changed comparisons; usable passage references and actionable advice. B0.2 must make these operational before results are observed. Do not lower thresholds afterward without approval.
- B0.3 must prove supported authentication, start/read/cancel, reconnect, authentication failure and credential redaction without credential extraction. No external-client endpoint or authentication method is assumed here.
- B0.4 must prove native media delivery and reject unsupported/oversized, wrong-MIME, missing-audio and path-only substitutes. Model claims of listening are not transport proof.
- B0.5 requires approximately 12–20 excerpts with selected repeats, recorded latency/limits/failures, and rubric-based evaluation. Synthetic controls alone do not establish expressive piano coaching quality.
- B0.V must reconcile evidence and decisions. A failed route may close research, but Batch 1 stays blocked until a revised approach is approved.

Existing subscriptions through supported integrations are preferred. No account eligibility or allowance is assumed. Separate paid APIs require an explanation of technical need and current expected costs, then explicit approval, upload consent, and a spending policy. No paid service is selected or authorized.

Specific personal-material upload consent is separate from Batch 0 authorization. Scores, recordings, private documents, raw sensitive logs, and credentials must not enter committed research artifacts. A material change to scope, architecture, cost, or data handling requires stopping for approval.

## B0.1 verification record

Manual review on 2026-11-10:

- Cross-checked every confirmed requirement and MVP inclusion/exclusion in roadmap Section 1 against the workflows and boundaries above: covered.
- Cross-checked D01–D08 individually against the roadmap register: all retained as proposed; adoption evidence and approval dependencies explicit.
- Cross-checked current user instructions and roadmap Section 2: Batch 0 only, ordered tasks, individual work/record commits, stop on blockers, no push: preserved.
- Cross-checked Batch 0 scope and B0.1 acceptance criteria: decision packet only; no production initialization, archival, legacy modifications, paid API use or live experiment performed.
- Reviewed repository continuity: main at the recorded baseline, only expected untracked roadmap, no tracked diffs or completed rebuild work to reconcile.

Outcome: documentation acceptance criteria satisfied. Architecture approval, fixture/account consent, supported transport, musical quality, and packaging remain unresolved gates for their assigned tasks. No approved deviations.
