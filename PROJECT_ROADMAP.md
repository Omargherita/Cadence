# Cadence — Project Roadmap

**Standing instruction for every agent and thread:** Read this roadmap before acting. Independently complete the currently authorized batch, make and document technical decisions, and normally request user approval only at the next batch boundary. Do not ask the user to repeat this preference. Follow Section 2's standing autonomy policy and retained consent gates.

**Document state:** Approved for saving, including the user's execution and consent clarifications; saved as the central project roadmap.

**Project phase:** Batch 0 product decisions and feasibility research; no production implementation authorized.

**Implementation authorization:** Explicit Go for Batch 0 only, recorded in Section 7. No later batch is authorized.

**Active batch:** Batch 0 (active).

**Current task:** B0.2 audio-only pilot — blocked on recovery evidence discrepancy; full qualification pending.

**Verified repository baseline:** `2c205e5f81fdf38a87abbd1767d662755f21f943` on `main`; working tree was clean before this document was created.

**Completed rebuild tasks:** B0.1. Existing legacy commits are not evidence of rebuild completion.

## 1. Product contract and decision register

### Confirmed requirements

Cadence is a personal Linux desktop application with two connected workflows:

- **Weekly organization:** capture responsibilities, approve a realistic weekly plan, track completion, and receive a weekly activity report with reflection.
- **Piano development:** study pieces using recordings, receive evidence-based feedback, discuss interpretation, and compare progress across practice sessions.

Every piece requires a PDF score. Audio is the primary performance input. Phone video and MIDI are optional supplementary materials.

Coaching must distinguish technical observations, artistic possibilities, and uncertainty. It must offer meaningful next steps without inventing faults or claiming equivalence to an elite human teacher.

Use existing cloud-model subscriptions through supported provider integrations wherever possible. These are not locally running GPU models.

Separate paid APIs are contingency options only. Explain the technical need and current expected costs before seeking approval. Require explicit upload consent and a spending policy before activation.

Start with fresh application data. Preserve and archive the existing project and data when the relevant batch is authorized. Preserve all Git history. No archival action is currently authorized.

### Technical decisions: candidates for agent evaluation

| ID | Technical candidate | Rationale and validation condition |
|---|---|---|
| D01 | Electron, React, TypeScript, Vite, Electron Forge | One main language and consistent desktop rendering. Confirm after feasibility and Linux packaging review. |
| D02 | SQLite with better-sqlite3; recordings stored as files | Durable local ownership without a synchronization system. Confirm native-module packaging. |
| D03 | Application services behind validated IPC; background utility process | Keep filesystem, credentials, database access, and heavy work outside the renderer. |
| D04 | T3 integration first; qualify Antigravity/Gemini for audio | Existing research identifies native audio support; actual delivery and musical quality remain unverified. |
| D05 | FFmpeg/ffprobe and PDF.js | Media preparation, playback support, and score display without a separate Python service. |
| D06 | Cadence owns all durable product history | Provider threads are references, not the only copy of assessments or conversations. |
| D07 | Vitest, integration tests, Playwright, packaged Linux smoke checks | Verify rules, persistence, integration failures, and actual desktop behavior. |
| D08 | New application alongside preserved legacy sources | Introduce a separate desktop source tree and separate application-data location; do not overwrite the old deployment. |

D01–D08 remain candidates until the agent evaluates and records its selections; this policy update does not claim that they have been validated. The user delegates technical and architectural choices to the agent. Select or revise them using best engineering judgment within authorized product scope, record the reasoning and evidence, and proceed without asking the user to choose technologies or approve engineering details. The retained user approval gates in Section 2 still apply.

### MVP boundaries

Included:

- Backlog, weekly planning, recurring tasks, and completion history.
- Capacity-aware schedule suggestions requiring approval.
- Factual weekly reports and optional AI reflection.
- Mandatory PDF scores, audio/video import, and excerpt playback.
- Audio assessments, follow-up conversation, practice goals, and two-take comparisons.
- Local persistence, export, backup, restore, and Linux packaging.

Deferred:

- Phone application/access and cross-device synchronization.
- Calendar integrations and automatic background scheduling.
- Live recording and real-time coaching.
- Full visual technique assessment.
- MIDI analysis and automatic score recognition/alignment.
- Additional provider integrations and multi-agent teaching panels.

Deferred capabilities are not executable batches. Promote them into separately approved batches only after the MVP.

## 2. Execution, approvals, and Git protocol

### Authorization

- Start no batch without an explicit user **“Go”** referring unambiguously to that batch.
- A Go authorizes only that batch's recorded scope. Tasks within the authorized batch may proceed sequentially without requesting approval after every task.
- A new thread, general discussion, roadmap approval, or silence is not a Go.
- Preserve the authorization record across threads; continuing an already authorized batch does not require a new Go unless its scope changes.
- Technical and architectural decisions are delegated to the agent under the technical decision authority below. Ask only when a decision changes the agreed product scope or user-visible commitments, incurs new costs, changes privacy/data-sharing/retention commitments, requires destructive action, or exceeds an explicit authorization or consent boundary.
- Never upload personal recordings, scores, private documents, or other user-owned material to external providers without the user's explicit consent for that specific purpose. Access to files or an account, roadmap approval, and a batch Go do not constitute that consent.
- Batch authorization does not override separate consent requirements for uploads, paid services, or destructive operations.
- Never push without an explicit request.
- Never amend, squash, rebase, reset away, or otherwise rewrite existing commits without explicit authorization.

An approval entry must record the batch, exact user instruction, date, available conversation reference, and scope restrictions. Never invent missing approval evidence.

### Technical decision authority

The user is not a software engineer and explicitly delegates technical details to the agent. Do not ask the user to select frameworks, libraries, database schemas, protocols, architecture patterns, file layouts, testing tools, or implementation techniques. Use investigation and best judgment to choose a maintainable approach that serves the agreed product requirements.

- Make technical decisions within the authorized batch and task; resolve implementation problems autonomously when they do not cross a retained approval boundary.
- This includes architectural refinements and internal data representations. Preserve promised behavior, local ownership, security, privacy, and consent boundaries.
- Record each significant decision in this roadmap's decision register or architectural decision history: decision ID/date, problem, chosen approach, alternatives considered, rationale/tradeoffs, supporting verification, and affected tasks. Link supporting research when useful; keep the decision and status here as the source of truth.
- Separate a design choice from a verified capability. Do not label a provider, model, library, or architecture qualified without the required evidence.
- If a technical candidate fails, choose and document another approach within these boundaries. Ask only about a consequential product, spending, consent, or destructive-action choice—not how to implement it.
- When a user decision is necessary, explain the practical effect in plain language and give a recommendation. Do not turn it into an engineering questionnaire.
- This delegation supersedes older generic requirements for user technical or architecture approval, including those in supporting decision packets. It does not supersede specific limits on experiments, uploads, provider/account use, spending, task order, or batch Go messages.
- The current B0.2 follow-up listening test still requires its expressly requested review and consent. This policy change alone does not authorize any new run or upload.

### Standing autonomy and minimal-question policy

This is a persistent project instruction for every future thread and agent, not a preference that expires with a conversation. The user should not need to restate it. Apply it together with the technical decision authority above and the continuity checks in Section 4.

- **Default behavior:** After verifying an authorized batch and its prerequisites, carry out its tasks sequentially through verification, work commits, and roadmap-record commits. Do not stop after each task to ask “Should I continue?” or offer to do work already authorized.
- **Engineering ownership:** Research and resolve technical questions yourself. For non-blocking ambiguities, choose a reasonable approach, record the assumption and rationale, and proceed within the authorized scope. Do not ask the user to select an implementation strategy or fix a technical problem.
- **Normal approval checkpoint:** Complete and verify the current batch, report its outcome and the next batch's objective/tasks, then ask for “Go for Batch N” and stop. Do not start the next batch early.
- **Cross-thread continuation:** A thread change alone neither revokes nor extends authorization. Reconcile this roadmap with Git, then resume the next unfinished task in the already authorized batch without asking again for the same Go. Honor any later pause, revocation, restart instruction, or explicit requirement for renewed approval.
- **Ask only when genuinely necessary:** Interrupt execution for a material product/scope or acceptance-criteria decision, new spending, unapproved destructive action, privacy/data-handling change, missing purpose-specific personal-material upload consent, an explicit approval restriction, or essential user information/musical judgment that investigation cannot supply. Preserve the stop-and-report rule for repository discrepancies; do not conceal a blocker to avoid asking a question.
- **Anticipate and consolidate:** Before a batch starts, identify foreseeable user decisions and consent needs and present them together with a plain-language recommendation. During a batch, bundle related unavoidable questions instead of sending them one at a time. Explain the concrete blocker and why the agent cannot decide it independently.
- **Reuse valid answers:** Check the approval and consent ledger before asking. Do not request the same permission again while it remains valid for the exact materials, destination, purpose, actions, and limits already authorized. New purposes, exhausted run limits, or changed destinations are not covered by earlier consent.
- **Keep updates informational:** Give concise progress updates without turning them into approval requests. If blocked, record the exact blocker and next required action; do not skip to another task or mark the batch complete.
- **Handoff responsibility:** Before ending a thread, record current task/status, work and record commits, verification evidence, uncommitted work, applicable approvals/consents and their limits, outstanding decisions, and the precise next action. A new agent must be able to continue without asking the user to reconstruct prior context.

This policy does not authorize a rollback, a new batch, additional provider runs, uploads, spending, pushes, or relaxation of quality gates. In particular, the specific B0.2 follow-up test approval boundary remains in force.

### One-task execution loop

For every task:

1. Read its scope, dependencies, acceptance criteria, and approval record.
2. Inspect repository state and relevant implementation.
3. Mark that task active; no other task may be active.
4. Implement only its scope.
5. Run its required verification.
6. Inspect staged and unstaged changes for unrelated modifications and secrets.
7. Create its dedicated work commit.
8. Record the full commit hash, summary, verification results, and limitations.
9. Commit that roadmap record before starting another task.

Resolve technical ambiguity through inspection, research, tests, and engineering judgment; do not ask the user to make engineering choices. If an essential product requirement remains unclear or a dependency is genuinely unavailable, mark the task blocked and document why. Do not silently change product scope or bypass the dependency.

Small fixes necessary to satisfy the current task stay within that task. Record technical or architectural refinements and their rationale without requesting technical approval. New product requirements, altered acceptance criteria, task-order changes, or decisions crossing a retained approval boundary require approval; technical autonomy does not authorize skipping tasks, lowering verification standards, or starting another batch.

### Commit convention and hash recording

Use Conventional Commit-style messages with task IDs:

- `feat(planner): B3.2 add weekly scheduling`
- `test(coaching): B6.4 verify take comparisons`
- `docs(roadmap): record B3.2 completion`

A commit cannot contain its own final hash. Therefore:

- The **work commit** contains the task deliverable and its verification evidence, with status `verified-awaiting-record` if included in the roadmap.
- A separate **roadmap record commit** records the work commit's full SHA and changes the task to `completed`.
- The record commit contains only bookkeeping for that same task.
- Record commits do not recursively record their own hashes; they remain discoverable through Git history.
- Do not begin another task between the work commit and its roadmap record commit.

This preserves focused commits and traceability without rewriting history.

### Status vocabulary

Task states:

`pending` → `in_progress` → `verified-awaiting-record` → `completed`

Additional state: `blocked`, with a reason and explicit condition for resuming.

Batch states:

`awaiting-go` → `active` → `completed`

A blocked active batch remains authorized only within its original scope.

### Required completion record

Each completed task receives an entry containing:

- Task ID and final scope.
- Full work commit SHA.
- Implementation or research summary.
- Exact verification commands or manual procedure.
- Outcomes, including failures and subsequent fixes.
- Evidence locations, excluding secrets and private recordings.
- Limitations and approved deviations.
- Completion date.

Never equate “implemented,” “tests written,” or “agent reported success” with verified completion.

### Batch closure

Every batch ends with its own verification task:

- Check every task's acceptance criteria and work commit.
- Run the listed batch-level checks.
- Confirm the final working tree is clean.
- Record the batch result and any unresolved limitations.
- Set active batch to none and the next batch to `awaiting-go`.
- Report completed work, verification, commit references, and the next batch's tasks.
- **Stop and wait for Go.**

## 3. Ordered development batches

### Shared dependency and tracking rules

Tasks execute in their listed order.

- Within a batch, each task depends on the immediately preceding task.
- The first task of a batch depends on the previous batch's successful closure and a new explicit Go.
- Additional dependencies appear in task descriptions where needed.
- `V` tasks are batch verification and closure tasks.
- Each row inherits **status `pending` and work commit `—`** until individually updated in the task completion ledger. Batch 0 is `active`; Batches 1–8 remain `awaiting-go`.
- Only Batch 0 tasks are authorized, sequentially and subject to separate consent and decision requirements.

### Batch 0 — Product decisions and AI feasibility

**Objective:** Establish that the intended coaching experience is technically and musically credible before initializing the application.

**Scope:** Decision documents, controlled research artifacts, and isolated integration experiments. No production application initialization, archival operations, paid APIs, or legacy changes.

**Entry:** Explicit Go for Batch 0. Uploads of user-owned materials require separate recorded consent for the specific purpose.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B0.1 | Finalize product contract and architecture decision packet | MVP workflows, exclusions, proposed stack, and approval states are explicit; no proposal is mislabelled approved | Cross-check against user instructions and decision register |
| B0.2 | Define evaluation corpus, rubric, and consent manifest | Representative score/audio cases, clean and altered takes, unusable input, and comparison cases have predetermined labels; permitted uploads and account use are recorded | Review fixture provenance, private-data handling, and scoring procedure |
| B0.3 | Prototype external T3 authentication and run lifecycle | A standalone client can connect through supported interfaces, start/read/cancel a run, and reconnect without credential extraction | Authentication failure, cancellation, reconnection, and credential-redaction checks |
| B0.4 | Verify native PDF/audio transport | Supported media reaches the intended model; unsupported/oversized input cannot masquerade as successful listening | Valid media, size boundaries, MIME mismatch, missing audio, and path-only fallback cases |
| B0.5 | Evaluate coaching and comparisons | Blind evaluation results, latency, observed usage limits, and failures are recorded; capability verdict follows the rubric | Approximately 12–20 excerpts; repeat selected cases; verify factual findings, timestamps, and comparison direction |
| B0.V | Publish feasibility and decision report | Evidence supports either proceeding or stopping; architecture decisions and remaining approvals are explicit | Audit B0 evidence, rerun failed transport checks, verify commits and clean tree |

**Proposed musical gates:** no fabricated critique for silent/unusable inputs; at least 80% supported high-priority factual observations; at least 80% correct direction on deliberately changed comparison cases; usable passage references and actionable advice.

Freeze exact denominators and scoring rules in B0.2 before testing. Do not lower thresholds after seeing results without approval.

**Deliverables:** Product contract, decision record, reproducible experiment artifacts, evaluation report, and recommendation.

**Completion condition:** Research is fully documented and verified. If the coaching route fails, Batch 0 may close as research completed, but Batch 1 remains blocked pending an approved revised approach.

### Batch 1 — Preservation and desktop foundation

**Objective:** Protect the legacy system and establish a minimal, isolated Linux desktop foundation.

**Scope:** Archival verification, new application shell, build tooling, and process boundaries. No planner or coaching features.

**Entry:** Batch 0 passed, architecture selected and documented by the agent with supporting evidence, and explicit Go for Batch 1.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B1.1 | Inventory and archive legacy project/data | Archive includes Git history and identified persistent data; source deployment and data remain intact; browser-only state is accounted for if present | Manifest/checksum checks and restoration into a separate scratch location |
| B1.2 | Initialize separate desktop application and toolchain | Application launches on Linux, uses a distinct data location, and leaves legacy sources/deployment untouched | Dependency install, typecheck, production build, launch/exit smoke test |
| B1.3 | Establish test harness and quality commands | Repeatable typecheck, tests, and build commands exist with a meaningful smoke test | Run all commands from documented setup |
| B1.4 | Add validated IPC and utility-process lifecycle | Renderer has only explicit operations; malformed requests are rejected; worker failure is visible | IPC validation, forbidden access, process failure and restart tests |
| B1.5 | Create neutral navigation shell | My Week, Piano, and Settings are keyboard-accessible without placeholder domain behavior | Navigation, focus, resize, and packaged-window smoke checks |
| B1.V | Verify protected baseline and desktop foundation | New shell works and preserved legacy material remains recoverable | Full foundation suite, Linux launch, archive manifest and Git review |

**Deliverables:** Verified archive, runnable shell, build/test commands, and process interfaces.

**Completion condition:** Legacy preservation verified; foundation builds and runs; no feature work included.

### Batch 2 — Local storage and recovery

**Objective:** Establish reliable product-owned data before user workflows depend on it.

**Scope:** SQLite infrastructure, files, migrations, backups, and recovery.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B2.1 | Add database lifecycle and migrations | Database opens in the new location; migrations are transactional and versioned | Fresh database, upgrade, failed migration, and reopen tests |
| B2.2 | Add managed asset storage | Imported originals are preserved; assets have stable IDs, hashes, and recoverable staging | Interrupted copy, duplicate content, insufficient space, and path-handling tests |
| B2.3 | Add backup and restore | Database and referenced assets restore consistently into an isolated destination | Round-trip restore, missing/corrupt assets, and backup interruption |
| B2.4 | Add diagnostic and credential-storage boundaries | Logs omit credentials and private payloads; secret-store failure produces an explicit safe state | Redaction checks and unavailable secret-store tests |
| B2.V | Verify persistence and recovery | Restart and restore preserve all seeded records and files | Migration suite, asset suite, complete backup/restore rehearsal |

**Deliverables:** Persistence services, asset library, backup/restore, and safe diagnostics.

**Completion condition:** Recovery has been demonstrated, not merely implemented.

### Batch 3 — Manual weekly organization

**Objective:** Deliver a useful weekly planner that works independently of AI.

**Scope:** Tasks, weekly scheduling, availability, recurrence, and completion history.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B3.1 | Add task backlog | Tasks support title, priority, optional deadline/duration, editing, and explicit removal | CRUD validation and restart persistence |
| B3.2 | Add seven-day planning | Tasks can move between backlog and days; available time and overload are visible | Move/reschedule tests, date boundaries, keyboard workflow |
| B3.3 | Add completion history | Complete/reopen actions preserve sufficient history for accurate reports | Repeated actions, reopen/recomplete, rename, and reschedule cases |
| B3.4 | Add recurring task occurrences | Daily/selected-weekday occurrences are independently actionable; edits and skips have documented effects | Duplicate prevention, missed days, week boundaries, and recurrence changes |
| B3.5 | Add planner preferences | Timezone and week-start settings produce consistent calendar behavior | Week rollover and timezone-change cases |
| B3.V | Verify complete manual planning workflow | A representative week can be planned and tracked without T3 or internet | Offline end-to-end week, recurrence suite, restart and restore |

**Deliverables:** Functional manual planner and dependable activity history.

**Completion condition:** All planner actions work offline with correct persisted history.

### Batch 4 — Factual weekly reports

**Objective:** Make weekly reflection trustworthy before adding AI interpretation.

**Scope:** Computed activity reports, snapshots, personal reflection, and export.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B4.1 | Compute weekly activity facts | Completed, unfinished, dropped, and rescheduled work are represented consistently | Fixture weeks with reopened, renamed, moved, and recurring tasks |
| B4.2 | Add report generation and snapshots | Reports generate on request or next launch after week end; historical reports do not silently change | Boundary, repeat-generation, snapshot, and regeneration tests |
| B4.3 | Add reflection and export | User reflection persists and a readable report can be exported | Save/reopen and export-content verification |
| B4.V | Verify reports against recorded history | Displayed/exported facts match underlying activity | End-to-end sample week, offline generation, backup/restore |

**Deliverables:** Reliable weekly reports without AI dependency.

**Completion condition:** Report facts can be reconciled with recorded task events.

### Batch 5 — Pieces, scores, and recordings

**Objective:** Build the complete local piano workspace before connecting coaching.

**Scope:** Mandatory scores, practice records, media import, playback, and excerpt preparation.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B5.1 | Add pieces and versioned mandatory PDFs | A piece requires a valid PDF; replacing it preserves previous score references | Missing/corrupt PDF, replacement, and persistence tests |
| B5.2 | Add score viewer and passage selection | Pages display reliably; selected pages and optional measure labels persist | Multi-page, zoom, page selection, and keyboard checks |
| B5.3 | Add practice sessions and recording import | Audio and phone video originals are retained and linked to the correct session | Supported formats, invalid media, missing audio, restart tests |
| B5.4 | Add playback and excerpts | Selected ranges replay correctly and preserve original time offsets | Seek, range boundaries, long files, and audio/video playback |
| B5.5 | Prepare analysis media | Excerpts satisfy qualified provider limits while preserving dynamics and original files | Duration/size checks, extraction failures, output decoding, source preservation |
| B5.V | Verify local practice workflow | A scored piece supports multiple sessions and recordings without AI | PDF → import → playback → excerpt → backup/restore workflow |

**Deliverables:** Local repertoire and recording workspace with provider-ready excerpts.

**Completion condition:** Musical materials are usable, durable, and correctly referenced.

### Batch 6 — Production coaching integration

**Objective:** Turn the qualified feasibility route into a reliable coaching experience.

**Scope:** T3 connection, durable jobs, assessments, conversations, goals, and comparisons.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B6.1 | Add T3 connection and capability checks | Supported authentication and explicit provider/model selection work; incompatible configurations are explained | Expired authentication, unavailable T3, capability mismatch |
| B6.2 | Add durable analysis jobs and consent | User approves outgoing materials for the specific purpose; jobs survive interruption without blind duplicate sends | Upload denial, cancellation, restart, timeout, uncertain-send recovery |
| B6.3 | Add assessment validation and display | Results separate strengths, factual observations, options, drills, and limitations; evidence links to playback | Malformed results, missing evidence, invalid timestamps, no-audio cases |
| B6.4 | Add piece conversation and context | Follow-ups retain relevant goals and evidence; new listening requests require appropriate media | Context reconstruction, missing provider thread, score-version references |
| B6.5 | Add user-approved practice goals | Goals can be accepted, revised, or dismissed; model suggestions do not silently change them | Approval, edit, dismissal, persistence tests |
| B6.6 | Add two-take comparison | Both excerpts and their context reach the model; comparison cites the correct recordings | Swapped order, mismatched passages, absent take, original-offset tests |
| B6.V | Requalify the complete coaching workflow | Production behavior meets the approved rubric and recovers from provider failures | B0 evaluation regression, consent audit, multi-session workflow, offline saved-history access |

**Deliverables:** Assessments, discussion, goals, and comparisons using the qualified route.

**Completion condition:** Coaching quality and operational reliability pass together. Mocked tests alone cannot close this batch.

### Batch 7 — AI planning and connected reflection

**Objective:** Connect planning and piano without allowing AI to alter commitments autonomously.

**Scope:** Schedule proposals, approved practice tasks, and grounded report interpretation.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B7.1 | Add schedule proposals | Suggestions respect recorded availability and identify unscheduled work; current plan remains unchanged | Overload, missing duration, conflicting deadlines, malformed output |
| B7.2 | Add proposal approval | User can adjust/accept proposals; acceptance produces one consistent plan snapshot | Repeated acceptance, stale proposal, concurrent local edits |
| B7.3 | Add practice-to-planner bridge | Accepted drills create editable linked tasks; duplicate acceptance does not duplicate commitments | Create/edit/navigation and duplicate prevention |
| B7.4 | Add grounded AI weekly reflection | Interpretation uses computed facts and saved piano activity; unavailable AI leaves factual reports intact | Invented-statistic rejection, missing data, provider failure |
| B7.V | Verify the combined weekly cycle | Planning, practice, completion, and reflection form one traceable workflow | Full representative week and provider-outage regression |

**Deliverables:** Approved AI planning, connected practice commitments, and reflective reports.

**Completion condition:** No unapproved schedule mutations; report facts remain authoritative.

### Batch 8 — Linux release qualification

**Objective:** Make the MVP dependable for everyday use.

**Scope:** Packaging, accessibility, operational recovery, documentation, and user acceptance.

| Task | Scope and deliverable | Acceptance criteria | Required verification |
|---|---|---|---|
| B8.1 | Package the Linux application | Installable artifact launches with database and media dependencies available | Clean-environment install, launch, import, and uninstall-preservation checks |
| B8.2 | Resolve accessibility and usability defects | Core workflows are keyboard-accessible with clear loading/error states | Focus order, contrast, scaling, score readability, long-running analysis |
| B8.3 | Validate failure recovery and performance | Supported workloads remain responsive; interruptions do not lose acknowledged data | Worker crash, disk-full, corrupt asset, provider timeout, restart tests |
| B8.4 | Complete export, restore, and operating guide | User can export records, restore a backup, reconnect providers, and understand upload behavior | Follow documentation from a fresh setup; full restore rehearsal |
| B8.5 | Conduct MVP acceptance trial | A real planning/practice cycle meets the product criteria; findings are recorded and resolved or explicitly accepted | User trial with traceable observations; retest approved fixes |
| B8.V | Publish release readiness report | All task evidence and commits reconcile; limitations are explicit; working tree is clean | Full relevant suite, packaged smoke test, final history/roadmap audit |

**Deliverables:** Local Linux release artifact, user guide, verification report, and known-limitations list.

**Completion condition:** MVP accepted for use. Publication, pushing, and additional feature batches require separate authorization.

## 4. Continuity and repository reconciliation

Before changing anything in a continuation thread:

1. Read this entire roadmap and apply the standing autonomy/minimal-question policy without asking the user to repeat it.
2. Identify the active batch, its authorization, next task, existing consents, and any later pause or restriction.
3. Run `git status` and inspect `git log`.
4. Review relevant work and roadmap-record commits with `git show`.
5. Inspect staged and unstaged changes with `git diff`.
6. Verify every completed task's recorded SHA exists and belongs to the current history.
7. Confirm the relevant commit actually contains the claimed task changes.
8. Identify unfinished work, missing verification evidence, and discrepancies.

A SHA existing somewhere is insufficient; it must be reachable from the current project history.

If records and repository disagree, **stop and report** before modifying anything. Do not automatically discard changes, repeat work, or “repair” the roadmap to match assumptions.

If a work commit exists but its roadmap record is missing, report the interrupted bookkeeping state and verify the task before proposing reconciliation.

For an interrupted task, preserve:

- Current task ID and status.
- Existing work commit, if any.
- Uncommitted files and their intended purpose.
- Last successful verification and outstanding failures.
- Blocking questions.
- Exact authorized next action.

Avoid rerunning expensive live evaluations unnecessarily. Reuse recorded evidence when its inputs and qualified configuration remain applicable; rerun when changes invalidate it. Previous evaluation consent does not authorize uploads for a different purpose.

## 5. Verification policy

- Each implementation task includes focused tests for its behavior and failure modes.
- Documentation/research tasks use explicit review procedures and reproducible evidence.
- Each task records what was actually run, not merely a list of suggested commands.
- Skipped or unavailable required checks block completion.
- Tests use temporary databases and synthetic or consented fixtures, never production data.
- Private recordings, credentials, and raw sensitive provider logs are not committed.
- Provider results are qualified against a recorded version/model/configuration.
- Deterministic report facts are tested independently of AI prose.
- AI assertions are not accepted as proof that audio was delivered or correctly understood.
- Verification-only tasks produce committed reports rather than empty commits.

## 6. Risks and unresolved decisions

| Item | Current state | Resolution owner/task |
|---|---|---|
| T3 external-client authentication and upload compatibility | Research-supported; not live-tested | B0.3–B0.4 |
| Musical listening quality and repeatability | Unverified | B0.5 |
| Exact provider account eligibility and allowances | Must be measured through existing access | B0.3–B0.5 |
| Evaluation recordings, ground truth, and upload consent | Required before live experiments | B0.2 |
| Technology stack selection and validation | Agent-owned decision; candidates await evidence, not user technical approval | B0.1/B0.V |
| PDF reading and passage alignment accuracy | Do not assume exact note-level understanding | B0.4–B0.5 |
| Archival completeness, including browser-only state | Requires inventory before archival writes | B1.1 |
| Linux codecs, native SQLite module, and packaging | Requires packaged validation | B1.2 and B8.1 |
| Model/provider updates changing capability | Requalification may be necessary | B6.V and later maintenance |
| Separate API costs | No paid API selected or authorized | New approval decision only if needed |
| Calendar delivery estimates | Not committed before feasibility | Reassess after B0 |
| Optional video technique and MIDI | Outside current MVP | Future approved roadmap amendment |

For technical or architectural risks, investigate, choose a solution, and document the reasoning without asking the user to decide. If the solution changes product scope, task sequence, acceptance criteria, costs, privacy/data-sharing/retention commitments, or an explicit consent boundary, document the proposed amendment and wait for approval.

## 7. Live project ledger

### Roadmap approval and documentation-only authorization

The user approved saving this roadmap in the current conversation with the instruction: “The proposed roadmap looks good. I approve saving it as `PROJECT_ROADMAP.md`, with the following clarifications”. The subsequent “PLEASE IMPLEMENT THIS PLAN” message authorizes this document save; it does not supply a Go for any batch.

The six original approval conditions are preserved below as history. Condition 3's requirement for technical/architectural approval is superseded by the technical decision delegation in Section 2 and the policy amendment recorded below; the other consent and batch boundaries remain in force.

1. Roadmap approval is not authorization to execute Batch 0.
2. A Go authorizes the specified batch only; tasks within that batch may proceed sequentially without per-task approval.
3. Stop and ask for approval if a decision changes agreed scope, architecture, cost, or data handling.
4. Never upload personal recordings, scores, private documents, or other user-owned material to external providers without explicit consent for that specific purpose.
5. Keep the work-commit followed by roadmap-record-commit protocol.
6. Do not initialize the application, archive the old project, run provider experiments, or modify anything else as part of this documentation-only action.

No durable message permalink or approval timestamp was supplied; do not infer one. This section records documentation approval, not batch authorization.

### POLICY-01 — Technical decision delegation

- **Authority:** User instruction in this conversation: “I’m not a software engineer, so tell the agent in the PROJECT_ROADMAP.md to decide technical details yourself and don't ask me about them. Use your best judgment and record your reasoning.” No durable message permalink or exact timestamp was supplied.
- **Scope:** Roadmap policy amendment only, outside the development task sequence. Delegate engineering and architectural choices to the agent; require recorded rationale and evidence; retain product-scope, cost, privacy, consent, destructive-action, Git, and batch approval gates.
- **Status:** completed (documentation policy amendment only). No development task is advanced or completed by this amendment.
- **Work commit:** `462f18ba48dce21384e2d58d6ffb4875a86bd294`.
- **Completion date:** 2026-11-10.
- **Outcome:** Agents decide engineering details and record reasoning; user-facing approval and consent boundaries remain intact. Verified the work commit with `git show --stat` and an ancestor check. No application changes, provider experiments, uploads, or pushes.
- **Verification:** Reviewed the roadmap diff against the user instruction; Python comparisons confirmed every batch task row, batch authorization entry, and development task ledger is unchanged. Checked retained batch, consent, Git, and experiment boundaries; `git diff --check` passed. Only `PROJECT_ROADMAP.md` changed. Documentation-only review; no application tests or provider runs were needed or performed.
- **Historical treatment:** Prior approval and experiment records are retained. The new policy overrides generic technical-sign-off requirements, not specific consent or experiment restrictions.

### POLICY-02 — Persistent autonomy across threads

- **Authority:** User request in this conversation: “The work will be on a lot of thread so I don't want every time to tell the agent that I don't want many questions and to let it decide by itself what it should do so if you can edit the md file that would be great”. No durable message permalink or exact timestamp supplied.
- **Scope:** Roadmap-only standing instruction for all future agents: execute an authorized batch independently, decide technical details, reuse valid decisions/consents, consolidate unavoidable questions, and preserve complete handoff records.
- **Status:** verified-awaiting-record; work commit pending. This amendment does not advance any development task or authorize rollback/provider work.
- **Verification:** Read the complete roadmap and inspected Git history/status/diffs; all recorded SHAs are reachable. Reviewed the policy diff and used Python comparisons to verify all task rows, the batch authorization ledger, and the development task ledger remain unchanged. Checked retained consent/experiment/Git gates and ran `git diff --check`; passed. Only `PROJECT_ROADMAP.md` changed. No application tests required for this documentation-only amendment.
- **Preserved boundaries:** Existing batch Go, personal-material consent, costs, destructive-action restrictions, experiment limits, Git discipline, verification requirements, and the B0.2 blocker remain in force.

### Batch authorization ledger

- **Batch:** 0 only.
- **Exact instruction:** “**This prompt is my explicit "Go" for Batch  [0] only**.”
- **Date:** 2026-11-10 (session date, Asia/Amman); no exact message timestamp supplied.
- **Conversation reference:** Current continuation-thread user message beginning “We are continuing the Cadence project.” No durable message permalink supplied.
- **Restrictions:** Follow existing task order; complete, verify, and commit each task individually, followed by its roadmap record. Stop on discrepancies, blockers, or decisions requiring user input. No later batch without explicit Go. No push requested. Separate upload, account-use, cost, and destructive-operation restrictions remain in force.

### Task completion ledger

#### B0.1 — completed

- **Final scope:** Written product contract and architecture decision packet; all D01–D08 remain proposed.
- **Work commit:** `a4deae7784457467ea0dae2592bb398846edd028`.
- **Summary/evidence:** `docs/batch-0/product-and-architecture.md`, including workflow outcomes, exclusions, approval/evidence gates, and the manual review record. Work commit also preserves the previously untracked approved roadmap and records Batch 0 authorization.
- **Verification performed:** Manually cross-checked roadmap Section 1 requirements/exclusions and every D01–D08 entry, Sections 2–3 execution/scope restrictions, and the current user message against the packet. Reviewed staged content with `git diff --cached -- PROJECT_ROADMAP.md` and `git diff --cached -- docs/batch-0/product-and-architecture.md`; ran `git diff --cached --check`, `git diff --exit-code`, and `git status --short`. Confirmed committed content with `git show --stat a4deae7784457467ea0dae2592bb398846edd028` and reachability with `git merge-base --is-ancestor a4deae7784457467ea0dae2592bb398846edd028 HEAD`.
- **Outcome:** Documentation criteria passed; whitespace check passed; staged paths contained only the task packet and roadmap, without private assets or credentials. No failures or fixes required.
- **Limitations:** Documentation review only; no runtime, packaging, transport or musical-quality claim. No stack approval inferred; no live experiment or upload. No approved deviations.
- **Completion date:** 2026-11-10.

#### B0.2 — blocked

- **Status/date:** blocked, 2026-11-10. Approved pilot partially executed; evidence report work commit `6afa400f687be91c1564d85d1ffbc4b2f77578b8`. Full B0.2 has no completion commit.
- **Prerequisite review:** Provider/account and audio-source consent are now explicit, and memory-based pre-test labels have been supplied. Full corpus coverage, fixed denominators, and scoring procedure remain unfinished.
- **Consent history:** Earlier bracketed consent and sole-rater assignment were recorded in commit `046eec3b10ec66ffd519e6e3608a2a0c436bb589`. The clarification below narrows and supersedes its media scope.
- **Exact clarification (2026-11-10, current conversation; no message permalink or exact timestamp supplied):** “Confirmed: the destination is Gemini via Antigravity, through T3, using my own subscription. Batch 0 evaluation only, no paid API. D04 stays unapproved.

  Upload only the audio from /home/omar/Videos/test.mp4, not the video. No score PDF for now.”
- **Current consent manifest:** Source `/home/omar/Videos/test.mp4`; outgoing material restricted to its extracted audio. Destination: Gemini via Antigravity through T3, user's own subscription. Purpose: Batch 0 transport, coaching-quality, and take-comparison evaluation only. No video frames/container upload, no score PDF, no other source files, no other purpose or paid API. Further source files require separate named consent. D04 remains unapproved. Historical consent-record update performed no media work; subsequent approved pilot extraction and failed transport check are documented below.
- **Pre-test labels, verbatim as supplied by the user:**
  - Piece: Handel Passacaglia
  - Length: [3:08]
  - Notes and rhythm: I believe the performance was accurate, with no deliberate errors and no wrong notes that I remember.
  - Musicality and dynamics: I’m not fully happy with these. At some points the dynamics or phrasing are weaker, but I don’t remember exactly where.
  - Limitations: Labels are from memory. No timestamps for the weak spots unless listed above. I’m the sole validator.
- **Label interpretation:** User recollection, not verified note/rhythm accuracy. Duration is user-reported, not measured. No predetermined timestamped weak passages or known comparison direction are supplied. Do not score an unexpected critique as fabricated solely because the user does not remember it, or accept a matching critique as verified solely because it agrees with these labels. User is sole validator/rater; lack of independent validation, expectation bias and limited generalizability remain report limitations.
- **Remaining blocker:** B0.2 explicitly requires representative score/audio, clean/altered, unusable and comparison cases with predetermined labels; B0.4 requires native PDF/audio checks; B0.5 expects approximately 12–20 excerpts with selected repeats. One no-score recording with memory labels does not satisfy these gates. Do not silently waive requirements, invent labels, or count excerpts from one take as independent performances.
- **Approved pilot amendment (2026-11-10):** Permit a preliminary audio-only pilot before full B0.2 completion: locally inspect the named source, extract audio without video or embedded source metadata, record identity/hash and media properties outside committed private assets, and attempt supported T3 authentication/transport to the confirmed route. At most three model runs using that same extracted audio: one transport/listening check and two identical coaching requests for a repeatability check. Keep pre-test labels out of model prompts. Record technical delivery evidence, elapsed time, failures and user ratings. No transformed comparison take, other file, score, paid API or alternate route. If supported transport is unavailable, stop without substitution. No pass/fail musical-quality percentage can be established from these labels; comparison and PDF capability remain untested. This explicitly permits limited pilot work ahead of the original full-corpus prerequisite; it does not complete B0.2–B0.5, approve D04, close Batch 0, or authorize Batch 1. User approval recorded below authorizes this limited pilot.
- **Exact pilot approval:** “Yes, I approve the audio-only pilot amendment. Scope: extraction, one transport check, and two repeat coaching runs on the audio from test.mp4, through Gemini via Antigravity on T3. Full B0.2 and Batch 0 qualification remain pending, and no other uploads are authorized.” Date: 2026-11-10, current conversation; no durable message permalink or exact timestamp available.
- **Pilot status:** blocked. Extraction and full local decode verified. One transport check used; delegate reported native view_file access denied by its workspace hook before reading audio. Coaching runs 0/2. Full B0.2 remains pending. Evidence: `docs/batch-0/audio-pilot-report.md`; partial-pilot evidence work commit `6afa400f687be91c1564d85d1ffbc4b2f77578b8`. No task completion claimed.
- **Pilot verification record (2026-11-10):** ffprobe inspection, FFmpeg extraction and full decode, SHA-256 comparison and Python single-audio-stream/no-tags assertions passed; commands/results in the report. Reviewed completed delegate with `t3_thread_read` activity: Gemini 4 Argon via Antigravity, 1 run, reported pre-tool path denial; native ingestion not verified. Reviewed staged report/roadmap, `git diff --cached --check` and `git diff --exit-code` passed. `git show --stat 6afa400f687be91c1564d85d1ffbc4b2f77578b8` and ancestor check confirmed evidence commit. No media/credentials staged. No scope deviations beyond the recorded approved pilot; full task remains blocked.
- **Recovery authorization (2026-11-10):** User replied “yeah go ahead” to the immediately preceding concrete request: “Approve staging the same WAV in T3’s allowed attachment directory and one additional transport check?” Current conversation, no durable permalink/exact timestamp supplied. Authorizes that staging and one additional transport check only; original two coaching runs remain conditional on verified delivery. No hook bypass/expansion, other source, video, score, paid API or alternate provider.
- **Recovery preparation:** Original extracted WAV hash matched the private manifest. Copied exact bytes with Python shutil to a unique mode-700 directory under `/home/omar/.t3/userdata/attachments/`; staged WAV mode 600 and SHA-256 match verified. Private `recovery-staging.json` records its exact path, size and hash outside Git. No musical alteration. Recovery transport check next; previous 1 check failed, original coaching runs remain 0/2.
- **Recovery reconciliation:** Read roadmap, inspected clean main at `7d9c7a9caea8f016c8ccf5e7c1a7ae02fc464330`, diffs/log and evidence report/record commit; `6afa400f687be91c1564d85d1ffbc4b2f77578b8` ancestor check passed. No discrepancy. Reviewed roadmap-only authorization/preparation update; `git diff --cached --check` passed before commit.
- **Recovery result (2026-11-10):** Single authorized recovery run finished. `t3_thread_read` activity exposes a completed Read event for staged WAV, resolving prior path denial, but no raw native MIME/byte payload proof. Delegate claims native audio and describes events through 3:21 despite ffprobe duration 3:08.517958. Rechecked staged hash/size/duration: unchanged. This is an objective timestamp discrepancy; do not accept listening as verified or infer that no audio was delivered. Updated evidence in `docs/batch-0/audio-pilot-report.md`, partial recovery evidence work commit `634952af7627ede75f56e461855fa88c222a4e96`. Total transport runs 2; coaching 0/2. Stop per user discrepancy rule. No full task completion claimed.
- **Recovery evidence verification:** On 2026-11-10, read completed recovery activity including successful Read event; reran the report's ffprobe/hash commands and confirmed unchanged 188.517958-second audio. Reviewed staged report/roadmap for unrelated/private content; `git diff --cached --check` and unstaged `git diff --exit-code` passed. `git show --stat 634952af7627ede75f56e461855fa88c222a4e96` and reachability check passed. Recovery evidence recorded without marking B0.2 complete.
- **Offline inspection authorization (2026-11-10):** Exact user instruction: “Approved: offline inspection of the existing tool-result artifact only, no upload and no new model run. Record the outcome in any of the three branches, including ‘artifact unavailable’. Before any follow-up listening test, show me the excerpt, the expected events and the pass criteria, and wait for my approval.” Current conversation; no durable permalink/exact timestamp supplied. Only offline artifact inspection authorized now.
- **Offline inspection result:** Original WAV found in existing recovery conversation database, gen_metadata row idx=1. RIFF/WAVE payload is byte-for-byte identical to the prepared extract, 36,195,492 bytes, stereo 48 kHz, 188.517958 seconds. Selected nearby media markers include audio/wav. Direct local artifact evidence resolves prior absence of payload visibility; does not prove server-side decoding or correct listening. Wrong/stretched/truncated recorded payload is not supported. Beyond-EOF timestamp discrepancy remains. Full procedure/results in `docs/batch-0/audio-pilot-report.md`; inspection evidence commit `bf9145d4371d017f0849469231162a7189e84c1e`.
- **Offline inspection verification (2026-11-10):** Read-only SQLite inspection, complete RIFF slice checks, byte equality, hash and wave frame/duration checks passed; procedure and selected evidence in the report. Reviewed repository continuity and changed documentation against actual inspection outputs; staged whitespace check and empty unstaged diff passed. Evidence commit content and history reachability verified with `git show --stat bf9145d4371d017f0849469231162a7189e84c1e` and ancestor check. Inspection complete; B0.2 remains blocked, not marked complete.
- **Follow-up proposal preparation (2026-11-10):** User requested a proposal only, with no upload/test run. Prepared a private 0.000–12.000-second excerpt from existing audio, measured exactly 576,000 frames/48 kHz; ffprobe confirms 12 seconds. Local RMS analysis supplies candidate attack landmarks, not independently heard semantic labels. User listening confirmation remains necessary. Proposal, exact neutral prompt, pre-test tolerances and optional separate-consent synthetic control recorded in `docs/batch-0/listening-test-proposal.md`; proposal work commit `d586d44199a144cc1f43987dbb2d3deb5460b240`. Verification: Python wave frame count/RMS analysis and independent ffprobe duration check passed; reviewed proposal against user requirements, staged whitespace check and unstaged diff check passed; commit content/reachability verified. This completes proposal preparation only, not B0.2. No provider request or upload; full B0.2 and D04 remain pending.
- **Current experiment boundary:** No new upload/model run. Before any follow-up listening or coaching test, present actual excerpt, independently established expected events and pass criteria, then wait for user approval. No follow-up excerpt created in offline inspection. Counts remain transport 2, coaching 0/2; D04 unapproved.
- **Scope restriction:** Stop here as requested on blockers; B0.3–B0.V remain pending. Do not skip ahead or activate any paid service.

All tasks after B0.2 remain `pending`, work commit `—`.

The initial roadmap save was documentation-only setup outside the development batches. Its expected untracked state was verified before Batch 0; it is preserved and first committed with the B0.1 work and authorization record.

### Architectural decision history

D01–D08 remain technical candidates, not validated selections. The subsequent user delegation authorizes the agent to select and revise technical details with recorded reasoning, without user technical sign-off. Historical records describing these candidates as unapproved are preserved as records of their earlier state; they do not create a continuing technical-approval requirement. Explicit experiment, upload, cost, and batch restrictions remain binding.

### Current handoff

- **Standing working preference:** Every agent applies Section 2 automatically: decide technical details and complete authorized tasks without repeated questions; normally request Go only at the next batch boundary. Reuse verified authorization across threads unless the user explicitly changes it.

- **Technical decision authority:** Agents own technical choices and document their rationale under Section 2; no user technical sign-off is required. Product/consent boundaries and the recorded B0.2 blocker remain unchanged.

- **Active batch:** Batch 0, authorized and active.
- **Current task:** B0.2 — blocked; B0.1 completed. Batch 0 remains active and authorized within its original scope.
- **Permitted next:** Record/report offline artifact outcome. Any follow-up listening test requires review of excerpt, expected events and pass criteria, then explicit approval. Full qualification pending.
- **Not authorized:** Later batches, application initialization, legacy changes, archival operations, paid APIs, uploads before the B0.2 consent/destination gates are resolved, or pushing.
- **Continuity verification (2026-11-10):** Read entire roadmap; inspected `git status --short --branch`, `git log -10 --format=fuller`, `git show HEAD -- docs/DEPLOY-STEPS.md`, staged and unstaged diffs, tracked-file inventory, legacy README and package manifests. HEAD is the recorded baseline on main. Only the expected untracked roadmap was present; both tracked diffs were empty. No completed task SHAs require reconciliation. Legacy commit/task labels do not represent rebuild progress. No discrepancy found.
- **Latest continuity check (2026-11-10):** Working tree clean at `e6edf451c6b02cb8d713f358804d7823a5cab58e` before this consent update. Inspected roadmap, Git status/log/diffs, B0.1 work content and record/blocker commits; `git merge-base --is-ancestor a4deae7784457467ea0dae2592bb398846edd028 HEAD` passed. No discrepancy. Reviewed this roadmap-only update against the exact consent wording; `git diff --cached --check` passed before commit.
- **Latest reconciliation:** On 2026-11-10, read roadmap, inspected clean main at `046eec3b10ec66ffd519e6e3608a2a0c436bb589`, Git log/diffs and relevant work/record content; B0.1 work SHA reachability passed. No repository discrepancy. Reviewed this update against the exact clarification/labels and original B0 gates; `git diff --cached --check` passed before commit.
- **Next action:** Present playable excerpt and proposal; await user listening confirmation of landmarks and explicit approval before any follow-up upload/listening run. No experiment authorized by proposal preparation.
