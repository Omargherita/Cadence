# First deployment after the audit — Omar's machine

**Plan for 1–2 hours, longer if your recordings take a long time to copy/verify or you encounter a problem. The app will be stopped during the backup, rehearsal, and deployment. Don't do this right before something you need the app for.** This is an estimate, not a guarantee; leave time for recovery.

This is a manual runbook, not a script to execute all at once. Run one command block at a time in Bash, read its result, and stop on an unexpected result. Commands below are for **you** to run; writing this document did not run a deployment, tests, backups, or service commands.

**REQUIRED** means do not skip it. **OPTIONAL** means the condition is stated explicitly. Keep the same terminal open so the variables survive. A second terminal is only needed if you choose to watch logs continuously. Replace every `<PLACEHOLDER>` before executing its command; do not paste angle brackets into the shell.

This deployment includes all completed audit batches together: immutable recording filenames and take-number repair, recurrence series and replay identities, verified database restore, loopback hosting and origin checks, environment-file configuration, release symlinks, and the new sync client with IndexedDB migrations. It does not complete the remaining mentoring, time-semantics, or workspace audit batches.

## 0. REQUIRED — confirm the source you intend to deploy

Go to the repository. **OK:** no error; **wrong:** directory not found.

```bash
cd /home/omar/Development/Projects/Cadence
```

Check for uncommitted changes. **OK:** no output; **wrong:** any listed file — stop and understand it before building. Do not discard changes to make this check pass.

```bash
git status --short
```

Check the branch. **OK:** exactly `main`; **wrong:** another name or no name (detached HEAD) — stop and select the intended source before continuing.

```bash
git branch --show-current
```

Read the latest commits. **OK:** the expected completed audit/runbook commits; **wrong:** an unfamiliar revision — stop and verify what you are about to deploy.

```bash
git log --oneline -3
```

Check tags on this exact commit. **OK for this runbook revision:** `deploy-steps-v2` is listed; **wrong:** no expected tag, even if an older completion tag exists somewhere in history. Later deliberate releases may have a different tag; verify that revision explicitly rather than assuming it is equivalent.

```bash
git tag --points-at HEAD
```

## 1. REQUIRED — freeze writes and make a full, verified backup

### Prepare without changing the running app

**REQUIRED origin inventory, before closing anything:** write down **EVERY URL you currently use** to open Cadence on the laptop and phone, including installed PWAs and each browser/profile. Record the scheme (`http`/`https`), exact hostname or IP, and port (HTTPS without an explicit port uses 443). Inspect the address bar; for an installed PWA, open its page in the browser to identify its URL. Examples are `http://127.0.0.1:5006`, `http://localhost:5006`, `http://<YOUR-LAPTOP-IP>:5006`, and your Tailscale HTTPS URL. Keep a separate queue-check tick beside **each origin on each device/profile**. Browser storage belongs to that exact origin; hostnames pointing at the same machine do not share it. The old direct `http://<IP>:5006` origins will stop reaching the API once the service binds to loopback. Drain their queues **now**, while the old host is still reachable; opening the new HTTPS site later will not transfer those queues.

**REQUIRED, on the laptop AND phone, in every browser/profile/origin you use:** open the old app while the old host still runs. Let it finish syncing. Confirm **zero pending tasks/operations AND zero queued recordings**, including recordings saved inside sessions. If the old UI exposes failed items, resolve/export those too. Write down counts and the names of a few familiar pieces, sessions, takes, and tasks. Then close all Cadence tabs and the installed PWA on both devices. Do not reopen the production app until section 5. The server backup below does **not** contain browser IndexedDB queues or unsent recording blobs.

If the old queue will not drain, stop the deployment here. Preserve/export that browser's work first. Do not clear site data or uninstall the PWA to make the pending count disappear.

Set the known repository path and the repository's service name. **OK:** no output; if your installed service has a different name, change `CADENCE_UNIT` after the next command.

```bash
export CADENCE_REPO=/home/omar/Development/Projects/Cadence CADENCE_UNIT=cadence.service
```

Discover installed Cadence units. **OK:** `cadence.service` and, if installed, `cadence-backup.service` / `cadence-backup.timer`; **wrong:** no app unit, or a different app unit you have not accounted for. For another name, use that exact name in `CADENCE_UNIT` and stop any other Cadence host before proceeding.

```bash
systemctl --user list-unit-files 'cadence*'
```

Record how the old service starts, without printing its environment or API key. **OK:** an existing unit file and a recognizable old executable/working directory; **wrong:** unit not found or an unexpected second installation. Keep this output privately for rollback.

```bash
systemctl --user show "$CADENCE_UNIT" -p FragmentPath -p ExecStart -p WorkingDirectory
```

Set your **actual existing storage root**. The example is the code's default. If you previously configured another root, replace this path. Privately check your existing settings if unsure; the normal secret file path is `~/.config/cadence/cadence.env`. Never paste that file's contents into chat or logs. **OK:** variable set; **wrong:** uncertainty about which database the old app uses — stop and establish that before continuing.

```bash
export CADENCE_REAL_ROOT=/home/omar/.local/share/cadence
```

Check for the database and media at that root. **OK:** both paths listed; **wrong:** missing path. The backup script recognizes an older `cadence.db`, but the new API uses `db/app.db`; if your existing database is only `cadence.db`, stop here and reconcile the layout before following this runbook.

```bash
ls -ld "$CADENCE_REAL_ROOT/db/app.db" "$CADENCE_REAL_ROOT/media"
```

Check the required programs, without installing/upgrading anything. **OK:** every name resolves; **wrong:** any missing name — arrange its installation separately before proceeding (do not rely only on the command's final exit status). The app needs .NET 10, Node 20+, Python, SQLite CLI, FFmpeg, and the existing DSP environment. Tailscale is needed for phone access.

```bash
command -v dotnet node npm python3 sqlite3 ffmpeg ffprobe tailscale rsync
```

Check installed .NET SDK versions. **OK:** a `10.0...` SDK is listed; **wrong:** only older SDKs or a runtime without an SDK — the release build will not work.

```bash
dotnet --list-sdks
```

Check Node's version. **OK:** v20 or newer; **wrong:** an older/missing Node installation.

```bash
node --version
```

Check the existing DSP interpreter. **OK:** `DSP interpreter exists`; **wrong:** absent/broken environment — stop and arrange setup separately. The release commands below deliberately skip the script's pip-install step; they do not silently install or upgrade dependencies.

```bash
test -x "$CADENCE_REPO/tools/audio_analyzer/.venv/bin/python" && echo 'DSP interpreter exists'
```

### REQUIRED — check disk space before stopping services or making the snapshot

Measure the current media and database directories. **OK:** sensible sizes with no read errors; **wrong:** missing/unreadable paths. Call the media size **M** and the database-directory size **D** (including WAL) when budgeting space below.

```bash
du -sh "$CADENCE_REAL_ROOT/media" "$CADENCE_REAL_ROOT/db"
```

Check free space at the snapshot's parent directory. **OK:** sufficient `Avail` space for the budget below; **wrong:** insufficient space or an unexpected filesystem.

```bash
df -h /home/omar
```

Check free space at the dry-run's parent directory. **OK:** sufficient `Avail` space; **wrong:** insufficient space. On this machine `$HOME` is `/home/omar`, so this will normally show the **same** filesystem as the snapshot check; do not count its available space twice.

```bash
df -h "$HOME"
```

Check the real storage and build/release locations too. **OK:** room for database migration, new releases, and normal writes; **wrong:** a nearly full filesystem, even if another disk has space.

```bash
df -h "$CADENCE_REAL_ROOT" "$CADENCE_REPO"
```

Check the home filesystem type. **OK:** a persistent disk-backed filesystem; **wrong:** `tmpfs`/RAM-backed storage — stop and choose an actual disk location consistently throughout this runbook.

```bash
df -hT "$HOME"
```

**Space you need:** the media is copied **twice in addition to the existing live copy**: one snapshot plus one dry run. At rehearsal peak you therefore have about **3 × M total media**, with **2 × M additional free space required**. Budget at least **2 × (M + D) additional free space** for both copied data trees, **plus** the temporary and real release builds/build caches and migration working space. Leave additional headroom (at least 20% above that budget is prudent); do not aim to fill a filesystem. For example, 20 GiB of media and 1 GiB of database data need at least 42 GiB **free**, plus build/migration space and headroom, on the disks receiving the copies. The live copy already occupies its own space. If locations share a filesystem, add their requirements together and compare against its one `Avail` value; if they differ, budget each separately. A rollback rescue copy needs another copy of the then-current data; deleting the stopped dry run first normally frees its allocation, but recheck space before recovery.

**Do not put the dry run in `/tmp`.** On Arch, `/tmp` is usually RAM-backed `tmpfs`; copying all recordings there can fill memory. Section 2 creates a uniquely named directory on your home disk instead. If space is insufficient, stop here and arrange a disk-backed destination before copying anything.

### Stop the writer and preserve a matched snapshot

Stop the automatic backup timer **if it is installed**. **OK:** no error; **wrong:** an error other than unit-not-found. Unit-not-found is acceptable only when you confirmed no timer was installed.

```bash
systemctl --user stop cadence-backup.timer
```

Stop any already-running scheduled backup **if that unit is installed**. **OK:** command completes; **wrong:** an unexpected error. Do not take the snapshot while another backup is still copying media.

```bash
systemctl --user stop cadence-backup.service
```

Stop the old app. **OK:** no error; **wrong:** stop failed. This begins downtime; keep all production browser clients closed.

```bash
systemctl --user stop "$CADENCE_UNIT"
```

Confirm it stopped. **OK:** `inactive` (this command normally returns a nonzero exit status for inactive); **wrong:** `active`, `activating`, or a repeatedly restarting process. Also stop any manually launched Cadence process you know about; a user service check cannot detect every possible manual launch.

```bash
systemctl --user is-active "$CADENCE_UNIT"
```

Create a unique private snapshot folder outside the live storage root. **OK:** a new path printed; **wrong:** failure or no space. Save this exact path somewhere durable: it is your rollback backup, not a disposable folder.

```bash
umask 077; export CADENCE_SNAPSHOT="$(mktemp -d /home/omar/cadence-predeploy.XXXXXXXX)"; printf '%s\n' "$CADENCE_SNAPSHOT"
```

Back up SQLite with its backup API, which includes committed WAL data. **OK:** no error and a new `app.db` in the snapshot; **wrong:** any SQLite error. Never substitute an ordinary copy of a live `app.db` without its WAL.

```bash
sqlite3 "$CADENCE_REAL_ROOT/db/app.db" ".backup '$CADENCE_SNAPSHOT/app.db'"
```

Copy the entire media tree while the app is stopped. **OK:** no error; **wrong:** permission, disk-space, or copy errors. `cp -a` makes a real copy, not hard links into the live tree.

```bash
cp -a "$CADENCE_REAL_ROOT/media" "$CADENCE_SNAPSHOT/media"
```

Save the existing private environment file, if it exists, without displaying it. **OK:** no output; **wrong:** a copy error. This snapshot contains secrets if the file exists; keep the folder private and do not upload it.

```bash
if test -f /home/omar/.config/cadence/cadence.env; then cp -p /home/omar/.config/cadence/cadence.env "$CADENCE_SNAPSHOT/cadence.env.before"; fi
```

Save the existing app unit, timer, and backup unit, if they exist in the usual user-unit directory. **OK:** no error; **wrong:** a copy error. If `FragmentPath` above was elsewhere, privately copy that app unit to `units/<your-unit-name>` in this snapshot too before proceeding.

```bash
mkdir "$CADENCE_SNAPSHOT/units" && for unit in "$CADENCE_UNIT" cadence-backup.service cadence-backup.timer; do if test -f "$HOME/.config/systemd/user/$unit"; then cp -p "$HOME/.config/systemd/user/$unit" "$CADENCE_SNAPSHOT/units/$unit"; fi; done
```

Check database integrity. **OK:** exactly `ok`; **wrong:** anything else. Do not deploy or restore a damaged snapshot.

```bash
sqlite3 -readonly "$CADENCE_SNAPSHOT/app.db" 'PRAGMA integrity_check;'
```

Check relational consistency. **OK:** no output; **wrong:** any returned rows/errors. The restore script will reject such a backup, so investigate before proceeding.

```bash
sqlite3 -readonly "$CADENCE_SNAPSHOT/app.db" 'PRAGMA foreign_key_check;'
```

Count files in the original and copied media trees. **OK:** the two numbers match; **wrong:** a mismatch or a suspicious zero when you have recordings/PDFs.

```bash
printf 'Live media: '; find "$CADENCE_REAL_ROOT/media" -type f -printf '.\n' | wc -l; printf 'Snapshot media: '; find "$CADENCE_SNAPSHOT/media" -type f -printf '.\n' | wc -l
```

Compare every copied media file's contents, not just its count. **OK:** no output and exit status 0; **wrong:** differences or read errors. This may take a while for large recordings.

```bash
diff -qr "$CADENCE_REAL_ROOT/media" "$CADENCE_SNAPSHOT/media"
```

Look for media symlinks. **OK:** no output; **wrong:** any listed link — stop and investigate. The dry-run tree must not contain links to live media, and the new media boundary rejects symlinks inside media storage.

```bash
find "$CADENCE_SNAPSHOT/media" -type l -print
```

Record baseline row counts. **OK:** four sensible counts saved and printed; **wrong:** missing tables or obviously wrong data. These counts must survive startup migrations unchanged.

```bash
sqlite3 -readonly "$CADENCE_SNAPSHOT/app.db" "SELECT 'Pieces',count(*) FROM Pieces UNION ALL SELECT 'PracticeSessions',count(*) FROM PracticeSessions UNION ALL SELECT 'PracticeTakes',count(*) FROM PracticeTakes UNION ALL SELECT 'Tasks',count(*) FROM Tasks;" | tee "$CADENCE_SNAPSHOT/row-counts.before.txt"
```

**REQUIRED:** keep this snapshot through deployment and smoke tests. A second copy on another disk is strongly recommended; a same-disk snapshot does not protect against disk failure. Keep the production host stopped during the rehearsal so this snapshot stays the exact rollback point.

The repository's normal scheduled backup is `deploy/backup-db.sh` (SQLite backup plus an **additive**, shared `backups/media/` copy). That media directory is not a versioned snapshot paired to each database file. The separate frozen copy above is intentional for this first migration. The HTTP `POST /api/system/backup` endpoint backs up the database only.

## 2. REQUIRED — rehearse with a copy on port 5007

### Restore into a fresh, disposable root

Create a unique dry-run root **on your home disk** and record it. **OK:** a new `/home/omar/cadence-dryrun.XXXXXXXX`-style path; **wrong:** creation fails or the path is on RAM-backed storage. A unique folder avoids deleting/reusing another rehearsal's data.

```bash
export CADENCE_DRYRUN="$(mktemp -d "$HOME/cadence-dryrun.XXXXXXXX")"; printf '%s\n' "$CADENCE_DRYRUN"
```

Guard the selected paths. **OK:** `Dry-run paths are separate`; **wrong:** no success message. Do not continue unless the paths are separate real directories, not symlinks.

```bash
case "$CADENCE_DRYRUN" in "$HOME"/cadence-dryrun.[[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]]) test -d "$CADENCE_DRYRUN" && test ! -L "$CADENCE_DRYRUN" && test "$(realpath "$CADENCE_DRYRUN")" != "$(realpath "$CADENCE_REAL_ROOT")" && test "$(realpath "$CADENCE_DRYRUN")" != "$(realpath "$CADENCE_SNAPSHOT")" && echo 'Dry-run paths are separate' ;; *) printf 'REFUSING: unexpected dry-run path\n' ;; esac
```

Restore **only into the copy**, explicitly supplying both root variables. **OK:** `Database successfully restored and verified at /home/omar/cadence-dryrun.../db/app.db`; **wrong:** an error or any destination outside that disposable root. Do not bypass the service-active check.

```bash
CADENCE_STORAGE_ROOT="$CADENCE_DRYRUN" Cadence__StorageRoot="$CADENCE_DRYRUN" CADENCE_SERVICE_UNIT="$CADENCE_UNIT" bash "$CADENCE_REPO/deploy/restore-db.sh" "$CADENCE_SNAPSHOT/app.db"
```

Copy the backed-up media into the temporary root. **OK:** no error; **wrong:** copy failure. Do not symlink or hard-link media from the real root.

```bash
cp -a "$CADENCE_SNAPSHOT/media" "$CADENCE_DRYRUN/media"
```

Check the dry-run media copy. **OK:** no output; **wrong:** differences or any listed symlinks. All media URLs resolve under the configured media root; paths stored in the database are relative. No database path rewriting is needed.

```bash
diff -qr "$CADENCE_SNAPSHOT/media" "$CADENCE_DRYRUN/media" && find "$CADENCE_DRYRUN/media" -type l -print
```

### Build without activating the production symlink

Build a release in the disposable deploy directory, skipping dependency installation. **OK:** `Cadence production release activated!` with **Active under `/home/omar/cadence-dryrun.../deploy/current`**; **wrong:** failed build or a production `deploy/current` target. Despite the message, this only activates the disposable directory. It builds frontend assets in the repo and publishes into the disposable release directory; it does not start an API or migrate the real database.

```bash
CADENCE_DEPLOY_DIR="$CADENCE_DRYRUN/deploy" CADENCE_SKIP_VENV_SETUP=1 bash "$CADENCE_REPO/deploy/build-release.sh"
```

Write a **new, non-secret dry-run env file**, not a copy of your real env file. **OK:** no error; **wrong:** write failure. Both storage variables point only to the copy. This newly created file deliberately contains a blank key to override any inherited key; it does not alter or delete your real key. The explicit DSP paths avoid falling back to any interpreter in your real storage root. **Audit B08 is not fixed:** missing/failed Gemini can produce fabricated fallback assessments that change weakness tracking. Browse existing data without reanalysis; use only the synthetic test piece for any test uploads and delete that piece after the tests.

```bash
cat > "$CADENCE_DRYRUN/dryrun.env" <<EOF
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5007
CADENCE_STORAGE_ROOT=$CADENCE_DRYRUN
Cadence__StorageRoot=$CADENCE_DRYRUN
Cadence__EnableOriginCheck=true
Cadence__AllowedOrigins=http://127.0.0.1:5007,http://localhost:5007
Cadence__TimeZone=Asia/Amman
GEMINI_API_KEY=
CADENCE_DSP_SCRIPT=$CADENCE_DRYRUN/deploy/current/tools/audio_analyzer/analyze.py
CADENCE_DSP_PYTHON=$CADENCE_REPO/tools/audio_analyzer/.venv/bin/python
EOF
```

Make the temporary env file private. **OK:** no output; **wrong:** permission error.

```bash
chmod 600 "$CADENCE_DRYRUN/dryrun.env"
```

Start a separate transient user service. **OK:** a unit-start message for `cadence-dryrun.service`; **wrong:** already-existing unit, occupied port, or startup failure. Do not change the production unit to point at the copy. The env file is loaded by systemd, not automatically by the API.

```bash
systemd-run --user --unit=cadence-dryrun --collect --property="WorkingDirectory=$CADENCE_DRYRUN/deploy/current" --property="EnvironmentFile=$CADENCE_DRYRUN/dryrun.env" "$CADENCE_DRYRUN/deploy/current/Cadence.Api" --urls http://127.0.0.1:5007 --Cadence:StorageRoot="$CADENCE_DRYRUN" --Cadence:EnableOriginCheck=true
```

Read startup logs. **OK:** listening on `http://127.0.0.1:5007`, no migration exception; **wrong:** SQLite constraints, missing runtime, paths to the live database, or bind failures. The command-line root override is an additional safeguard against inherited configuration.

```bash
journalctl --user -u cadence-dryrun.service -n 80 --no-pager
```

Check the copy's health endpoint. **OK:** JSON containing `"status":"online"`; **wrong:** connection error, non-2xx response, or HTML.

```bash
curl --fail --show-error http://127.0.0.1:5007/api/health
```

### Verify the migrations and old data before making any test changes

Read migration versions. **OK:** rows `1`, `2`, `3`; **wrong:** missing versions or a missing table. Startup runs these transactionally, before the API begins serving requests; a successful build alone does not run them.

```bash
sqlite3 -readonly "$CADENCE_DRYRUN/db/app.db" 'SELECT Version FROM CadenceSchemaVersions ORDER BY Version;'
```

Record post-migration counts. **OK:** four counts; **wrong:** query error.

```bash
sqlite3 -readonly "$CADENCE_DRYRUN/db/app.db" "SELECT 'Pieces',count(*) FROM Pieces UNION ALL SELECT 'PracticeSessions',count(*) FROM PracticeSessions UNION ALL SELECT 'PracticeTakes',count(*) FROM PracticeTakes UNION ALL SELECT 'Tasks',count(*) FROM Tasks;" > "$CADENCE_DRYRUN/row-counts.after.txt"
```

Compare counts with the pre-deployment backup. **OK:** no output; **wrong:** any difference. Do this before adding smoke-test rows.

```bash
diff -u "$CADENCE_SNAPSHOT/row-counts.before.txt" "$CADENCE_DRYRUN/row-counts.after.txt"
```

Check migrated database integrity and relationships. **OK:** `ok` and nothing else; **wrong:** additional rows/errors.

```bash
sqlite3 -readonly "$CADENCE_DRYRUN/db/app.db" 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Check take numbering and recurring-series assignment. **OK:** three zeroes; **wrong:** any nonzero result. Existing duplicate/nonpositive take numbers are repaired within each affected session; recording files and take IDs stay intact. Historical recurring tasks become independent series rather than guessing ancestry from matching titles/dates. Existing open tasks are preserved, so old apparent duplicates are not automatically deleted.

```bash
sqlite3 -readonly "$CADENCE_DRYRUN/db/app.db" "SELECT count(*) FROM (SELECT PracticeSessionId,TakeNumber FROM PracticeTakes GROUP BY PracticeSessionId,TakeNumber HAVING count(*)>1); SELECT count(*) FROM PracticeTakes WHERE TakeNumber<=0; SELECT count(*) FROM Tasks WHERE Recurrence<>0 AND (SeriesId IS NULL OR OccurrenceDate IS NULL);"
```

Check the two uniqueness indexes. **OK:** both named index definitions appear with `CREATE UNIQUE INDEX`; **wrong:** one missing or a query error.

```bash
sqlite3 -readonly "$CADENCE_DRYRUN/db/app.db" "SELECT sql FROM sqlite_master WHERE type='index' AND name IN ('IX_PracticeTakes_PracticeSessionId_TakeNumber','IX_Tasks_SeriesId_OccurrenceDate');"
```

**REQUIRED browser check:** open `http://127.0.0.1:5007/` in a fresh private laptop window. This is a different origin with its own empty browser database: it does not reuse the production offline queue. Confirm familiar pieces, tasks, sessions, scores, and takes appear; play at least two old recordings and open a score if you have one. Check sessions through the piece detail view; the piece-list summary still returns only ten recent sessions. Compare with the baseline notes and SQL counts rather than interpreting a summary limit as data loss. Do not upload or analyze real recordings during this check. Rehearse the synthetic tests in section 6 here if desired before production.

### Stop and remove the rehearsal

Stop the temporary API. **OK:** no error; **wrong:** failure to stop.

```bash
systemctl --user stop cadence-dryrun.service
```

Confirm the temporary host is gone. **OK:** `inactive` or unit-not-found (because `--collect` removes it); **wrong:** active. Close the private dry-run browser window too.

```bash
systemctl --user is-active cadence-dryrun.service
```

Delete **only** the uniquely named disposable root, after verifying its parent, eight-character suffix, and separation from the saved/live roots. **OK:** no error; **wrong:** refusal, failed guard, or unexpected path. This deletes its copied database/media and release, never the saved snapshot or production root. Do not change `$HOME` or replace the variable with the real storage root.

```bash
case "$CADENCE_DRYRUN" in "$HOME"/cadence-dryrun.[[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]]) test -d "$CADENCE_DRYRUN" && test ! -L "$CADENCE_DRYRUN" && test "$(realpath "$CADENCE_DRYRUN")" != "$(realpath "$CADENCE_REAL_ROOT")" && test "$(realpath "$CADENCE_DRYRUN")" != "$(realpath "$CADENCE_SNAPSHOT")" && rm -rf -- "$CADENCE_DRYRUN" ;; *) printf 'REFUSING: unexpected dry-run path\n' ;; esac
```

> **ABORT BEFORE SECTION 3:** if anything fails in sections 0–2, stop. No production release, unit/env configuration, database, or media has been changed by these steps; the only production operational changes are that services/timer were stopped. Snapshot files and disposable rehearsal/build artifacts may have been created. If the dry-run service started, stop it with the section 2 command; leave its folder for diagnosis if needed. Do **not** run the real deploy or restore a backup just to resume the old app. Use the two commands below to resume the old service and its existing backup timer. If you have not stopped them yet, no recovery start is needed.

Start the unchanged old app using its recorded unit name (`CADENCE_UNIT` from section 1). **OK:** start succeeds and the old service is active; **wrong:** start failure — inspect its existing logs, do not proceed to deployment. If this is a new terminal, set `CADENCE_UNIT` to the unit name you recorded first.

```bash
systemctl --user start "$CADENCE_UNIT"
```

Restart the old backup timer **if it was installed and running before this attempt**. **OK:** timer starts; **wrong:** unexpected error. Do not install a new timer as part of aborting. Reopen the old app only after its host is running.

```bash
systemctl --user start cadence-backup.timer
```

## 3. REQUIRED — configure and deploy the real release

**Do not proceed unless the rehearsal passed.** The production service is still stopped and production clients are still closed. The snapshot remains untouched. The expected service name below is `cadence.service`, as shipped in the repo. If your old unit had another name, keep it stopped/disabled and use the newly installed `cadence.service` from now on; never run both against the same database.

Create the private config directory. **OK:** no error; **wrong:** permission error.

```bash
mkdir -p -m 700 /home/omar/.config/cadence
```

Create the env file from the tracked example **only if it does not exist**. **OK:** no error and an existing file is preserved; **wrong:** copy failure. Never overwrite an existing secret file with the example.

```bash
if test ! -e /home/omar/.config/cadence/cadence.env; then cp "$CADENCE_REPO/.env.example" /home/omar/.config/cadence/cadence.env; fi
```

Make it private. **OK:** no error; **wrong:** chmod failure.

```bash
chmod 600 /home/omar/.config/cadence/cadence.env
```

Edit it locally. **OK:** editor opens and saves; **wrong:** cannot save. Do not paste its contents into chat. If `nano` is absent, use your normal local editor.

```bash
nano /home/omar/.config/cadence/cadence.env
```

In that file, set the following **non-secret settings**, replacing the storage path if yours differs. Keep only one effective definition per key. The file uses literal absolute paths, not `$HOME`, shell `export`, or shell substitutions:

```ini
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5006
CADENCE_STORAGE_ROOT=/home/omar/.local/share/cadence
Cadence__StorageRoot=/home/omar/.local/share/cadence
Cadence__EnableOriginCheck=true
Cadence__AllowedOrigins=http://127.0.0.1:5006,http://localhost:5006
Cadence__TimeZone=Asia/Amman
CADENCE_DSP_SCRIPT=/home/omar/Development/Projects/Cadence/deploy/current/tools/audio_analyzer/analyze.py
CADENCE_DSP_PYTHON=/home/omar/Development/Projects/Cadence/tools/audio_analyzer/.venv/bin/python
```

**REQUIRED for the no-external-media smoke tests:** **comment out** your existing `GEMINI_API_KEY` line by adding a leading `#`; do not delete the line or erase the key. Also comment out any old `Cadence__GeminiApiKey` line if present, and make sure you have not separately configured a key in the user service/manager. Keep its value private. Section 1's snapshot already holds the original env-file copy. The next service restart applies these edits. After all synthetic tests and cleanup, if you choose to resume external analysis, reopen this same file, remove the leading `#` from the intended key line, save, and restart `cadence.service` using the command below. There is no need to retype or print the secret.

**WARNING — audit B08 is NOT fixed yet:** whenever Gemini is missing **or a Gemini call fails**, the mentoring fallback can fabricate an assessment and change weakness tracking. A displayed assessment is not proof that Gemini succeeded. Use **only the synthetic `DEPLOY TEST piece`** for upload/analysis smoke tests; never reanalyze a real piece to test deployment. **Delete the synthetic piece after checking/exporting the test results and draining its queue**, so fabricated test assessments/weaknesses do not remain. Re-enabling the key does not fix fallback behavior on future Gemini failures.

If you already know the Tailscale HTTPS origin, add it to the comma-separated allow-list now. Otherwise section 4 explains how to find it. Do not disable the origin check to solve configuration errors.

Build and activate the real release. **OK:** successful frontend build/publish and `Active: .../deploy/current -> .../deploy/releases/release-...`; **wrong:** any failure. **This command itself switches `current` and `publish`; there is no separate activation command.** It does not restart the service or run database migrations. On first use it moves a real legacy `deploy/publish` directory into `deploy/releases/release-legacy-...` and records it as `previous`. Later deployments preserve the old `current` as `previous`. Keep the skip-venv flag to avoid dependency installation.

```bash
CADENCE_DEPLOY_DIR="$CADENCE_REPO/deploy" CADENCE_SKIP_VENV_SETUP=1 bash "$CADENCE_REPO/deploy/build-release.sh"
```

Record release targets for rollback. **OK:** `current` exists and `previous` identifies the old release when one existed. **Wrong:** a broken link, or no previous release when you expected a legacy deployment. If there was never a published release, there may be no `previous`; preserve your old launch method/unit instead of assuming release rollback is available.

```bash
ls -ld "$CADENCE_REPO/deploy/current" "$CADENCE_REPO/deploy/publish" "$CADENCE_REPO/deploy/previous"
```

Save the resolved targets. **OK:** the current path and, when available, previous path are printed and saved; **wrong:** current cannot be resolved. A missing previous is acceptable only for the no-prior-release case just described.

```bash
{ readlink -f "$CADENCE_REPO/deploy/current"; readlink -f "$CADENCE_REPO/deploy/previous"; } | tee "$CADENCE_SNAPSHOT/release-targets.after.txt"
```

Render the new systemd units without starting anything. **OK:** `Rendered units ... (--render-only)`; **wrong:** error. This updates the installed unit to the new `deploy/current` layout. `CADENCE_INSTALL_ROOT` is the repository root, not the storage root. The env file path in the shipped units is fixed at `%h/.config/cadence/cadence.env`; `CADENCE_ENV_FILE` does not rewrite that directive.

```bash
CADENCE_INSTALL_ROOT="$CADENCE_REPO" bash "$CADENCE_REPO/deploy/install-systemd.sh" --render-only
```

Reload the installed unit definitions. **OK:** no error; **wrong:** reload failure.

```bash
systemctl --user daemon-reload
```

**ONLY if the old installed app unit had a different name:** disable its automatic startup so it cannot later run alongside `cadence.service`. **OK:** disabled or no change for the standard name; **wrong:** disable fails. The old unit was already stopped in section 1, and its original launch details were saved for recovery.

```bash
if test "$CADENCE_UNIT" != cadence.service; then systemctl --user disable "$CADENCE_UNIT"; fi
```

Enable the app for your user manager's future starts. **OK:** enabled or symlink-created message; **wrong:** unit missing. This does not start it yet.

```bash
systemctl --user enable cadence.service
```

Start/restart the app. **OK:** no immediate error, then the checks below pass; **wrong:** failure. **The first startup now migrates the real database**, including take-number repair and recurrence-series assignment, using the same code rehearsed above.

```bash
systemctl --user restart cadence.service
```

Check the service status. **OK:** `active (running)`; **wrong:** `failed`, restart loop, or inactive.

```bash
systemctl --user status cadence.service --no-pager
```

Read recent logs. **OK:** startup/listening message, no exceptions; **wrong:** SQLite migration/constraint errors, missing runtime, DSP path errors, or port conflict. Stop here on an error; do not repeatedly upload or complete tasks while diagnosing startup.

```bash
journalctl --user -u cadence.service -n 80 --no-pager
```

Check API health. **OK:** JSON with `"status":"online"`; **wrong:** connection error/non-2xx/HTML.

```bash
curl --fail --show-error http://127.0.0.1:5006/api/health
```

Verify loopback binding. **OK:** port 5006 is on `127.0.0.1` only; **wrong:** `0.0.0.0:5006`, `*:5006`, or a LAN address. Do not expose the unauthenticated API directly to the LAN.

```bash
ss -ltnp 'sport = :5006'
```

Confirm production migration state and consistency. **OK:** `1`, `2`, `3`, followed by `ok`, with no foreign-key rows; **wrong:** anything else.

```bash
sqlite3 -readonly "$CADENCE_REAL_ROOT/db/app.db" 'SELECT Version FROM CadenceSchemaVersions ORDER BY Version; PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Compare production row counts with the snapshot before reopening clients. **OK:** no differences; **wrong:** any difference. Do not do this comparison after adding smoke-test data.

```bash
diff -u "$CADENCE_SNAPSHOT/row-counts.before.txt" <(sqlite3 -readonly "$CADENCE_REAL_ROOT/db/app.db" "SELECT 'Pieces',count(*) FROM Pieces UNION ALL SELECT 'PracticeSessions',count(*) FROM PracticeSessions UNION ALL SELECT 'PracticeTakes',count(*) FROM PracticeTakes UNION ALL SELECT 'Tasks',count(*) FROM Tasks;")
```

Re-enable the backup timer after the app is healthy. **OK:** enabled/started without error; **wrong:** timer failure. Its shipped schedule is 03:30 with up to five minutes' random delay, and `Persistent=true` catches missed runs when the user manager next runs.

```bash
systemctl --user enable --now cadence-backup.timer
```

Check the timer. **OK:** a next trigger for `cadence-backup.timer`; **wrong:** no scheduled timer.

```bash
systemctl --user list-timers cadence-backup.timer --no-pager
```

**OPTIONAL, only if you want the user service to run before login/after logout:** check user lingering. **OK:** `Linger=yes`; `no` means the user manager may depend on a login session, not that deployment failed.

```bash
loginctl show-user omar -p Linger
```

**OPTIONAL, only for that unattended behavior:** enable lingering. **OK:** no error; **wrong:** permission/policy failure — arrange local administrator help rather than changing the service layout.

```bash
loginctl enable-linger omar
```

## 4. REQUIRED for phone access — localhost and Tailscale Serve

On the laptop, open `http://127.0.0.1:5006/`. For an existing production client follow section 5 before making changes. That URL and `http://localhost:5006/` have separate browser storage; use the same origin you used before when checking your old queue.

Check the machine's Tailscale connection. **OK:** this laptop and your phone are in the expected tailnet; **wrong:** logged out/offline. The repo cannot tell us your actual hostname: use **`<YOUR-TAILSCALE-HOSTNAME>`** from this command/Serve status, not an invented hostname.

```bash
tailscale status
```

Expose port 5006 over tailnet HTTPS. **OK:** a `https://<YOUR-TAILSCALE-HOSTNAME>` Serve URL proxying to loopback 5006; **wrong:** permission error, HTTPS setup required, or another port. Follow Tailscale's local setup prompt if shown; stop if you are unsure about replacing an existing Serve mapping. This is **Serve**, not public Funnel.

```bash
tailscale serve --bg http://127.0.0.1:5006
```

Inspect the actual mapping. **OK:** HTTPS URL and target `http://127.0.0.1:5006`; **wrong:** target/hostname differs from what you intend.

```bash
tailscale serve status
```

**REQUIRED:** in your private env editor, append that exact HTTPS **origin** (scheme + hostname, no URL path) to `Cadence__AllowedOrigins`, preserving the localhost entries. Use the edit command in section 3, save, then the restart command there. If forwarded Host headers already match it might work without the entry, but an explicit entry makes the intended origin clear. Keep `Cadence__EnableOriginCheck=true`.

On the phone, connect Tailscale to the same tailnet, then open the exact HTTPS URL from Serve status in Chrome. `localhost` on the phone means the phone, not this laptop. Use HTTPS: the new outbox requires Web Locks in a secure context.

**REQUIRED when moving from the old `http://<IP>:5006` phone URL to Tailscale HTTPS:** this is a **NEW origin with an empty local IndexedDB database**, not an in-place migration of the old origin's cache or queue. The server still has your verified pieces, sessions, takes, and tasks; the new client downloads those into its new local cache. It cannot see or transfer unsent work stored under the old URL. This switch is safe **only because every old-origin queue was verified empty in section 1**. The old direct-IP URL will stop working when the host binds only to loopback, even over Tailscale IP access; adding that URL to the origin allow-list does not restore the old network listener.

After confirming server data in the new HTTPS page, choose Chrome's **Install app / Add to Home screen** to install a **fresh PWA for the HTTPS origin**. Use that new installation, not the old HTTP shortcut/PWA. Keep the old origin's storage/installation untouched until you have confirmed its queue was empty and the new app has all server data. If the inventory shows you already used this exact HTTPS origin, this is an existing-origin update instead; follow section 5 without creating or clearing a database. The same origin distinction applies to laptop URLs from your inventory.

## 5. REQUIRED — update the PWA without deleting its offline queue

**Before the first production update:** you already checked the old client on **each** device/profile/origin for zero pending operations and zero queued recordings in section 1. A server backup cannot recover unsent browser work. If you missed that step and the old client remains open, inspect/drain it before reloading. Do not use Clear storage, Clear site data, delete IndexedDB, reset the browser, or uninstall the PWA as an update mechanism.

The PWA uses `vite-plugin-pwa` with `registerType: autoUpdate`. Closing and reopening with network access normally updates it, but a service worker can keep an old client alive. Update **all** tabs; mixing old clients with the new server is unsafe because the old `/toggle` endpoint no longer accepts completion mutations. The worker-update and in-place Dexie instructions below apply to an **unchanged origin**. A move from the old phone HTTP URL to HTTPS instead follows section 4's fresh-install path; there is no old Dexie queue to migrate at the new origin.

### Laptop Chrome/Chromium

1. Close other Cadence tabs and standalone PWA windows.
2. Open the same production origin online. Open Developer Tools → Application → Service Workers. Select Cadence's worker and click **Update**. If a waiting worker appears, click **skipWaiting** if offered, then reload.
3. Use Ctrl+Shift+R. If it is still stale, **Unregister only the service worker** in that panel, close all Cadence windows, and reopen the same URL online. Do **not** click Clear site data or delete IndexedDB. Unregistering the worker alone does not delete the Dexie database.
4. Application → IndexedDB should show `CadenceLocalDb`; let other tabs close if an IndexedDB upgrade is blocked.

### Android Chrome / installed PWA

1. Close the installed Cadence window and every Chrome Cadence tab. Keep phone network and Tailscale online.
2. If your previous origin was already this exact HTTPS URL, open it in Chrome; reload and wait for the worker update. Close it, then reopen its installed PWA. If you are moving from HTTP to HTTPS, follow section 4 and install the new HTTPS PWA instead of reopening the old HTTP installation.
3. If it stays stale, inspect that phone tab from laptop Chrome via `chrome://inspect/#devices` (USB debugging must be enabled/authorized on the phone), then use Application → Service Workers → **Update**, or **Unregister only**, followed by reopening online. This is preferable to clearing Android app/browser storage.
4. If remote inspection is unavailable and the UI is still old, stop and get help with the worker update. Do not sacrifice an unknown queue to force it.

### Prove which client is running

There is **no in-app build/version badge** in this release. Health JSON confirms the server is alive, not which client bundle the browser runs.

Read the production build's JavaScript bundle filename. **OK:** an `index-<hash>.js` asset path; **wrong:** no entry script or a missing frontend file. Keep this filename for comparison.

```bash
grep -E -o '/assets/[^" ]+\.js' "$CADENCE_REPO/deploy/current/wwwroot/index.html"
```

In laptop DevTools Network (or the phone's remote DevTools), reload and compare the loaded entry bundle URL with that filename. They must match. In the new UI, **Inspect sync work** must open the panel; recording entries have separate **Export details (JSON)** and **Download recording** buttons. An empty panel naturally has no recording buttons. Do not use that absence alone as a version test.

### What happens to existing Dexie data

The new client upgrades `CadenceLocalDb` in place, through schema version **7**. Cached rows and retained blobs are not intentionally wiped. Closing other tabs permits IndexedDB to finish its version change. It is per browser/profile/origin, so upgrading the laptop does not migrate the phone's database.

- **Legacy toggles:** ambiguous recurring history or a missing cached task is moved to **Needs review / parked**, with original operations retained for JSON export. Choose Open or Completed explicitly before Retry. Unambiguous saved desired states are converted safely and can sync normally; it would be inaccurate to say every old toggle is parked.
- **Legacy queued recordings:** all recordings present during the v4 upgrade are parked, **never automatically sent**, because the old upload may already have reached the server with another ID. Their bytes and metadata stay in this browser. **Open session**, compare with server takes, export JSON and download the recording separately, then explicitly Retry upload or Mark resolved / discard. Do not retry an already-present recording blindly.
- **Delete wins:** if a legacy task has a queued delete, obsolete toggles are dropped, including matching parked toggles; the delete is retained.
- New sessions use independent session resource keys even for old already-queued operations. Parent acknowledgements still gate sessions/recordings. Discarded parents or resource-specific server 404s park their queued children with an explanation, keeping data available for export/discard.
- Queued, failed, and parked work protects optimistic data from being overwritten by a refresh. A 409 is a visible conflict, not permission to clear the queue. 403/network failures remain queued with retry status/backoff.

**REQUIRED after updating each device:** inspect both **Pending / waiting** and **Needs review / parked**, and check sessions for queued recordings. If the pre-update queues were truly empty, migration should not invent legacy recording review entries. If anything is unexpectedly missing, stop and preserve that browser profile; do not clear storage or repeatedly retry.

## 6. REQUIRED — smoke tests with expected results

Use conspicuously named synthetic items such as `DEPLOY TEST task`, a new `DEPLOY TEST piece`, and a new test session. Never delete or overwrite a real take for a smoke test. Keep external analysis disabled as described above. Rehearsing these on the copy is useful, but also verify production after its client update.

| Test | Actions | Expected result / stop condition |
| --- | --- | --- |
| Task create and complete | Add one nonrecurring `DEPLOY TEST task`, wait for sync, complete it, then refresh. | Exactly one task exists, completed, with no queued/error item. A temporary optimistic row is normal; a second row is not. |
| Recurrence | Add a **new**, dated Daily task, complete it once, wait for sync, then inspect the next day/week view and refresh. Optionally reopen/complete its predecessor again. | Exactly one canonical next occurrence for that series/date; repeating completion does not add another. Old legacy tasks can be independent series; use a new task for this test. A previously deleted successor intentionally does not resurrect. |
| Take upload | In the synthetic piece/session, upload one short synthetic WAV, wait for completion, refresh. | Exactly one take; playback works. Retrying the same queued request must not create a second take. Do not manually initiate a new upload of the file and call that a retry: that is a new take. |
| Offline replay | Load the app online first. **Laptop on `127.0.0.1`:** open DevTools → Network and choose **Offline** in the throttling dropdown, then add one uniquely named task. Restore **No throttling** (or the prior online setting) and wait. **Phone:** turn off Wi-Fi/mobile data or disconnect Tailscale so the host is unreachable, add a uniquely named task, then restore connectivity and Tailscale and wait. | Turning off laptop Wi-Fi alone does **not** disconnect its loopback API; use DevTools Offline for this test. Expect one pending operation while offline; exactly one server task after reconnect and refresh, pending returns to zero. If creation hangs because a view awaits a stalled refresh, record that limitation; cached-read blocking is an unfinished audit batch. |
| Two tabs | Open two updated tabs on the **same origin**, make one uniquely named task in one tab, wait/refresh both. | One task on the server, no duplicate recording/task sends and no persistent “lock busy” error. Two deliberate Add clicks are two user operations, not this test. |
| Delete/re-upload | Upload test takes A and B in the synthetic session. Play B. Delete **A only**, then upload a different synthetic C. Play B again and C after refresh. | B retains its original bytes/playback, C appears once, A stays deleted. Take numbering need not reuse the gap; filenames are based on take identity so C cannot overwrite B. |
| Phone sync-panel export | Prepare a queued synthetic recording on the phone: open a test session first, turn its network off, queue a small synthetic recording, then open **Inspect sync work**. Tap **Export details (JSON)** once and **Download recording** once. | Two deliberate taps each download one file; JSON has metadata and the recording opens with expected bytes/size. No single tap triggers two downloads. If Android blocks a download, grant its download permission and repeat that button only. Reconnect, let this test recording sync exactly once, and confirm the queue returns to zero. |

**OPTIONAL synthetic WAV generator**, if you do not already have a safe test clip: create a one-second tone in `/tmp`. **OK:** `/tmp/cadence-deploy-test.wav` is created; **wrong:** Python error. This contains no real practice media. Transfer that synthetic file to your phone if needed.

```bash
python3 - <<'PY'
import math, struct, wave
with wave.open('/tmp/cadence-deploy-test.wav', 'wb') as output:
    output.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
    output.writeframes(b''.join(struct.pack('<h', int(3000 * math.sin(2 * math.pi * 440 * n / 16000))) for n in range(16000)))
PY
```

**REQUIRED:** record pass/fail on both devices, inspect the sync panel after tests, and preserve any unexpected work before cleanup. Restore laptop DevTools Network to **No throttling** and restore the phone's network/Tailscale. Once the synthetic queue is drained and test results are checked/exported, **delete the entire synthetic `DEPLOY TEST piece`**, including its test sessions/takes and any fallback-generated weaknesses, plus the clearly identified synthetic tasks. Do not delete real pieces or recordings. Audit B08 remains unfixed: missing/failed Gemini can fabricate assessments and alter weakness tracking; these tests establish deployment behavior, not mentoring quality. If you choose to re-enable Gemini, un-comment the preserved key line and restart as described in section 3.

## 7. IF NEEDED — resolve 403 origin failures without discarding work

Read rejected-origin log messages. **OK:** a message such as `Rejected cross-origin POST ... from Origin 'https://...'`; **wrong:** no matching message means this may be another failure, not an origin-guard error. Logs include the request Origin, Host, and X-Forwarded-Host, not your secret env file.

```bash
journalctl --user -u cadence.service -n 200 --no-pager | grep -E 'Rejected cross-origin|Origin'
```

Open the private env file locally. **OK:** editor opens/saves; **wrong:** permission or file error. Add the exact **trusted** rejected Origin to `Cadence__AllowedOrigins`, comma-separated, retaining existing entries. Include the scheme and port when present; do not add the API path, a wildcard, or an unfamiliar origin. Keep `Cadence__EnableOriginCheck=true`.

```bash
nano /home/omar/.config/cadence/cadence.env
```

Restart to load the changed env file. **OK:** restart succeeds; **wrong:** failure. Merely editing the file does not update the running process.

```bash
systemctl --user restart cadence.service
```

Recheck status/logs using section 3. In the client, allow the saved request's backoff to expire or use its explicit Retry control when appropriate. **Expected:** the existing queued operation succeeds once, rather than creating a fresh copy. Do not discard protected work to cure 403.

## 8. IF NEEDED — rollback code, data, or both

### Decide first

- **Code-only rollback:** appropriate when the release itself is broken but data is intact **and** the old binary is compatible with the migrated schema/data. Changing symlinks does not undo SQLite migrations or Dexie upgrades. For this first deployment, compatibility must not be assumed: old take allocation/filenames and old toggle semantics are precisely what changed.
- **Full return to the pre-deploy state:** use the old release **plus the paired database and media snapshot** when migration/data changes must be undone or compatibility is uncertain. You lose server changes since that snapshot. Keep a rescue snapshot of the failed state first; do not silently throw away new recordings/tasks.
- **Data-only restore with the new release:** appropriate if code is fine but you intentionally need the old data. The new release will run migrations on the restored DB again. Restoring `app.db` does not restore media, browser queues, or service configuration.

**REQUIRED before any rollback:** close all Cadence tabs/PWAs on laptop and phone. Export any pending/parked browser work if possible. A new Dexie v7 database cannot safely be downgraded by loading an old client; the old client can raise `VersionError`. Browser queues also retain server acknowledgements and work that may refer to rows absent from a restored server backup. Do not allow automatic replay into a restored server until these are reconciled.

If you opened the new client, use a **separate clean browser profile** to inspect an old release after rollback; preserve the upgraded profile intact for export/recovery. Do not clear its data. Old-server/new-client combinations may not support the same endpoints. If there is unsent work or new data you must keep, stop and reconcile it rather than doing a blind full rollback.

### Stop everything and preserve the failed state

Stop the backup timer. **OK:** stopped; **wrong:** unexpected error.

```bash
systemctl --user stop cadence-backup.timer
```

Stop the backup job if running. **OK:** stopped; **wrong:** unexpected error.

```bash
systemctl --user stop cadence-backup.service
```

Stop the app. **OK:** stopped; **wrong:** stop failure. Do not restore while another manual Cadence process is running against the same root.

```bash
systemctl --user stop cadence.service
```

Verify it is stopped. **OK:** `inactive` (nonzero command exit is expected); **wrong:** still active.

```bash
systemctl --user is-active cadence.service
```

Recover the recorded snapshot variable **only if you opened a new terminal**. Replace the placeholder with the exact path saved in section 1. **OK:** variable points at that existing snapshot; **wrong:** uncertain path — do not guess the newest backup.

```bash
export CADENCE_SNAPSHOT='<YOUR-SAVED-/home/omar/cadence-predeploy.XXXXXXXX-PATH>'
```

Re-establish the repository and actual storage paths **only if the terminal lost them**. Replace the root if yours differs. **OK:** correct paths assigned; **wrong:** wrong storage root means restoring the wrong installation.

```bash
export CADENCE_REPO=/home/omar/Development/Projects/Cadence CADENCE_REAL_ROOT=/home/omar/.local/share/cadence
```

Check the saved backup before using it. **OK:** `ok`, no foreign-key rows, and the saved media directory listed; **wrong:** missing/damaged backup.

```bash
sqlite3 -readonly "$CADENCE_SNAPSHOT/app.db" 'PRAGMA integrity_check; PRAGMA foreign_key_check;' && ls -ld "$CADENCE_SNAPSHOT/media"
```

Create a private rescue folder for the current failed state. **OK:** its unique path printed; **wrong:** creation fails. Keep this too; it may contain changes made after the original backup.

```bash
export CADENCE_RESCUE="$(mktemp -d /home/omar/cadence-failed-deploy.XXXXXXXX)"; printf '%s\n' "$CADENCE_RESCUE"
```

Save the current stopped database. **OK:** no SQLite error; **wrong:** corruption/backup failure — stop and preserve the original files for diagnosis before overwriting anything.

```bash
sqlite3 "$CADENCE_REAL_ROOT/db/app.db" ".backup '$CADENCE_RESCUE/app.db'"
```

Save current media. **OK:** no error; **wrong:** copy failure or insufficient disk space — do not continue with destructive recovery until new recordings are secured.

```bash
cp -a "$CADENCE_REAL_ROOT/media" "$CADENCE_RESCUE/media"
```

### A. Switch to the previous release — code rollback

Run the repository's rollback script once. **OK:** `current` points to the previous release and `publish` follows it; **wrong:** no previous symlink or invalid target — stop. The script swaps `previous` to the release you just left; running it a second time toggles back. It does not restore a database or restart a service. For a known target recorded in `release-targets.after.txt`, the script also accepts that absolute release directory as its argument.

```bash
CADENCE_DEPLOY_DIR="$CADENCE_REPO/deploy" bash "$CADENCE_REPO/deploy/rollback-release.sh"
```

**If you chose code-only rollback and have established schema compatibility:** skip B, restart/check using C. If no previous published release ever existed, this script cannot manufacture one. Restore your saved old unit/launch method privately from the snapshot and establish an actual executable before restarting; do not build guessed old source against the live database to improvise recovery.

### B. Restore the paired snapshot — ONLY for a full/data rollback

Restore the database with the real script and explicit root. **OK:** verified restore to the intended `.../db/app.db`; **wrong:** service-active refusal, failed integrity/FK checks, or wrong path. The script saves existing `app.db` and WAL/SHM files under `backups/pre-restore/`, removes stale sidecars, and installs the verified DB. It does **not** restore media.

```bash
CADENCE_STORAGE_ROOT="$CADENCE_REAL_ROOT" Cadence__StorageRoot="$CADENCE_REAL_ROOT" CADENCE_SERVICE_UNIT=cadence.service bash "$CADENCE_REPO/deploy/restore-db.sh" "$CADENCE_SNAPSHOT/app.db"
```

Restore the exact paired media tree. **OK:** rsync completes without error; **wrong:** wrong source/destination, copy errors, or unexpected permissions. **This command deletes media files not in the old snapshot** from the live tree; that is why the rescue copy above is required. The trailing slashes are intentional. Do not run this for a code-only rollback.

```bash
rsync -a --delete "$CADENCE_SNAPSHOT/media/" "$CADENCE_REAL_ROOT/media/"
```

Verify restored media bytes and counts. **OK:** no diff output and matching counts; **wrong:** any differences.

```bash
diff -qr "$CADENCE_SNAPSHOT/media" "$CADENCE_REAL_ROOT/media"
```

Count files in both trees. **OK:** matching numbers; **wrong:** mismatch or unexpected zero. Run this only after the content comparison above passes.

```bash
printf 'Snapshot files: '; find "$CADENCE_SNAPSHOT/media" -type f -printf '.\n' | wc -l; printf 'Restored files: '; find "$CADENCE_REAL_ROOT/media" -type f -printf '.\n' | wc -l
```

### C. Start and verify the chosen configuration

**OPTIONAL, only if you also need the pre-deploy env configuration:** restore its saved private file, if one existed. **OK:** restored without printing it; **wrong:** missing saved file — do not replace it with a blank example. Restoring this file can re-enable the prior external-analysis key or old network settings: review privately before opening clients.

```bash
test -f "$CADENCE_SNAPSHOT/cadence.env.before" && cp -p "$CADENCE_SNAPSHOT/cadence.env.before" /home/omar/.config/cadence/cadence.env
```

The newly rendered unit can run an old published app through `deploy/current`; normally keep that layout. **OPTIONAL, only if reverting the unit configuration itself:** copy the saved app unit back to its original `FragmentPath` and reload systemd. For the standard unit location/name the command is below. **OK:** copy succeeds; **wrong:** missing backup or a different original location/name — use the recorded path rather than guessing.

```bash
cp -p "$CADENCE_SNAPSHOT/units/cadence.service" /home/omar/.config/systemd/user/cadence.service
```

Reload unit definitions after any unit-file restoration. **OK:** no error; **wrong:** reload failure. Env-only edits need a restart, not a daemon reload.

```bash
systemctl --user daemon-reload
```

Start the selected release. **OK:** no immediate error; **wrong:** start fails. If you kept the new release for a data-only restore, expect it to apply the migrations again.

```bash
systemctl --user start cadence.service
```

Check status. **OK:** active/running; **wrong:** failed/restarting.

```bash
systemctl --user status cadence.service --no-pager
```

Read startup logs. **OK:** clean startup; **wrong:** SQLite errors, missing paths, unsupported schema, or bind failure. Keep clients closed until this is understood.

```bash
journalctl --user -u cadence.service -n 80 --no-pager
```

Check server health. **OK:** online JSON; **wrong:** non-2xx or connection error.

```bash
curl --fail --show-error http://127.0.0.1:5006/api/health
```

Re-enable the backup timer once recovery is verified. **OK:** starts without error; **wrong:** timer failure.

```bash
systemctl --user enable --now cadence-backup.timer
```

Inspect recovered data from a compatible, clean browser profile first. Reapply section 5's service-worker update steps when returning to the new release. Preserve the original upgraded profiles until all pending work and server acknowledgements are reconciled; a server restore does not reset them. Retain both the original snapshot and failed-state rescue copy until you have confirmed pieces, sessions, recordings, tasks, and playback on laptop and phone.
