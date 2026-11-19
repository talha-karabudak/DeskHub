# DeskHub core

The TypeScript layer owns application state, modes, business events, and the
priority queue. It talks to the local Python Pixoo adapter over HTTP; it never
imports Bluetooth or protocol code.

## Unified DeskHub

The combined Pixoo + iPad launcher is `scripts/start-deskhub.cmd` (from the
repository root). Pixoo is optional and may be switched on later. See
`docs/unified-runtime.md` for pairing, private configuration, and reconnect details.

Start the bridge from the repository root, then run the single application:

```powershell
.\.venv\Scripts\python.exe bridge.py
cd .\deskhub
npm.cmd run deskhub
```

One mode manager owns the queue and physical display. Mode priority is
`IRACING > FACEIT > NORMAL`; active iRacing means connected, usable on-track
telemetry, not merely a running process. FACEIT results discovered during a
race remain pending and are displayed once after the session ends. Set
`IRACING_ENABLED=true` to enable the native telemetry source. The separate
`faceit`, `iracing`, `iracing:check`, and `iracing:inspect` commands remain for
debugging and should not run beside the unified app.

```powershell
# Python bridge, from the repository root
.\.venv\Scripts\python.exe bridge.py

# TypeScript -> Python -> Pixoo smoke test
node --experimental-strip-types .\deskhub\src\milestone2.ts

# Priority queue hardware demo
node --experimental-strip-types .\deskhub\src\milestone3.ts

# Normal clock -> event -> normal clock state restoration
node --experimental-strip-types .\deskhub\src\milestone4.ts

# Simulated FACEIT result -> event -> normal clock
node --experimental-strip-types .\deskhub\src\milestone5.ts

# TypeScript core tests
node --experimental-strip-types --test .\deskhub\tests\*.test.ts
```

The milestone 3 demo queues `PersonalBest`, `FaceitMatchWon`, and `YellowFlag`
together. They render by priority as `YELLOW -> WIN +24 -> PB`, then the core
returns to the normal `RDY` screen. Equal priorities preserve FIFO order.

## Real FACEIT integration

The adapter uses the official FACEIT Data API. The first completed CS2 match is
stored as a baseline and is not replayed. Later match IDs emit one event. Since
ELO can settle shortly after a match, the adapter rereads it with bounded
retries and can render `WIN` or `LOSS` without a delta if it is still unchanged.
The API key is never printed.

Copy the root `.env.example` to `.env`, set `FACEIT_API_KEY` and
`FACEIT_NICKNAME`, start the Python bridge, then run:

```powershell
npm --prefix .\deskhub run faceit
```

Polling defaults to 60 seconds and cannot be configured below 30 seconds.
`FACEIT_POLL_INTERVAL_MS` and `FACEIT_REQUEST_TIMEOUT_MS` are optional. HTTP
429, server errors, and network failures receive bounded retries;
authentication and not-found errors stop immediately with a clear message.

FACEIT progress is persisted in `data/faceit-state.json` using a temporary file
and atomic rename. It stores the last ELO, match ID, player identity, and up to
30 processed match IDs. A restart therefore does not replay the same match. If
more than one match was missed while DeskHub was offline, it safely re-baselines
instead of inventing per-match ELO changes. Known results render as a short
`WIN`/`LOSS` screen followed by the real delta; unknown deltas render only the
result.

Polling is adaptive: when FACEIT/CS2 process activity is present it defaults to
60 seconds; otherwise a five-minute reconciliation poll remains active. Process
state is only a scheduling hint and the FACEIT API remains the source of truth.
Unchanged match history does not trigger another player/ELO request.

The public player response does not document a reliable standard-CS2 placement
flag or progress count. DeskHub therefore never infers placement from a null,
zero, hidden, or changed ELO. When placement is independently known, set
`FACEIT_PHASE=placement` and `FACEIT_PLACEMENT_PLAYED`; placement results show
progress without a fabricated delta. Return `FACEIT_PHASE` to `ranked` after
placements to establish the new ELO baseline without displaying the season
reset as a match delta. `auto` preserves the persisted phase and makes no
unsupported placement claim.
