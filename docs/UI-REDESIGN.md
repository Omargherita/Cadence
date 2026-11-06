# Cadence UI redesign

Implemented the approved sidebar and document-canvas direction using the existing React, Tailwind, Lucide and Dexie stack. No packages were added. Backend domain logic, media processing, assessment generation, and the synchronization engine were not changed.

## Screens

- **Dashboard / Today:** persistent 224px desktop sidebar, 48px context bar, restrained wordmark, pinned challenge pieces, day structure and practice progress. Tablet and mobile use a navigation drawer with keyboard focus containment.
- **Organizer:** Today, Weekly, Unscheduled, Logbook and All tasks share the same task row. Quick entry uses compact category, priority, recurrence and date controls. Weekly uses a day-by-day agenda. Empty and validation states use plain language.
- **Repertoire:** grouped musical lists replace the three equal Kanban containers. Composer, goals and recorded practice time are secondary to the piece title. Piece rows are keyboard-accessible buttons.
- **Piece details / progress:** document-style title and goals, compact score toolbar, and technical focus rows with mastery rings and explicit text. Editing is contextual to pieces, focus areas, session history and takes.
- **Practice:** session logging precedes take uploads and can collapse once sessions exist. Existing duration presets, reflections, history, take selection, audio/video playback, timestamp seeking and assessment content remain. Feedback uses prose and structural dividers instead of nested decorative cards.
- **Other existing surfaces:** add-piece, take-upload and record-edit dialogs share surface, radius, focus and control rules. Escape, backdrop dismissal and focus restoration are centralized. The desktop PDF viewer docks beside the workspace; smaller screens use a full-width reader. Backup, connection and queued synchronization controls live in the sidebar.

## Shared patterns

- Theme variables for canvas, sidebar, surface, elevated surface, hairlines, text and accent colors.
- Shared page headers, quiet buttons, section headings, list rows and form styling.
- `StatusGlyph` for labeled circular progress marks.
- `useModalFocus` for focus containment, Escape and restoration.
- Existing `RecordEditor` reused contextually, with a portal to avoid placing dialogs inside inline or clickable content.
- Hash navigation supports direct entry and history without a routing dependency.

## Decisions

- Today is the dashboard; no new dashboard with duplicated information was added.
- Backup and synchronization are system controls rather than a new empty Settings page.
- Weekly remains an agenda at all widths for consistent row actions and reading order.
- Practice progress uses the lower bound of an archetype's textual target where it specifies a range.
- Existing file upload remains the take-entry workflow. Live recording would add behavior beyond this visual redesign.
- PDF rendering remains the browser's native viewer, including its own toolbar and zoom controls.

## Verification

- Production build: `npm run build --prefix src/web-client` passes.
- Full test suite: `dotnet test Cadence.sln --nologo -v q` passes, 25 tests.
- Rendered browser inspection at 390px, 820px and 1440px: organizer, weekly agenda, repertoire, piece details, session logging, add-piece dialog, take-upload dialog, record editor and PDF reader.
- Checked empty states, populated tasks and repertoire, real local assessment content, a two-second audio upload, native audio readiness, a real PDF, dialog focus wrapping and Escape, mobile navigation, task creation/completion/Logbook, and server validation errors.
- Temporary test data and media were created in an isolated storage root under `/tmp/cadence-redesign`; the existing personal database was not used.

## Limits

Browser inspection used desktop Chromium at responsive viewport sizes, not physical iOS/Android devices. Live Gemini calls, extended offline/retry scenarios, every possible assessment combination and video playback were not exercised in this pass. Existing Google Fonts loading and system fallbacks remain; no font package was introduced. Backend tests do not replace browser interaction testing.
