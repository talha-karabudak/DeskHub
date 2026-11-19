# Unified DeskHub and Race Companion

Run `scripts/start-deskhub.cmd` for the combined Pixoo and iPad application.
The launcher derives the project location from its own folder; it does not depend
on a Windows username or a Desktop path. Existing `start-race-companion.cmd`
remains available as the old iPad-only launcher. Stop that application before
starting the combined app: both use port 8787.

The launcher defaults to `127.0.0.1`, so other computers on the network cannot
access its dashboard. On your home network, stop the app and run
`scripts/start-deskhub-ipad.cmd` to enable iPad access on `0.0.0.0`.
Use the iPad launcher on your home network. Restart the app when switching
network modes; reopening a launcher in the same mode reuses the existing server.

Create a Windows desktop shortcut to either launcher if you want one-click access.
The launcher opens Race Companion in the PC's browser and leaves the DeskHub
console running. Press Ctrl+C in that console to stop DeskHub.

Open **Pixoo Settings** below the Race Companion dashboard to change individual
iRacing items. **Use iPad preset** enables personal best, last lap, finish, and
fuel shortfall. The display rests on a black frame between those events.
Settings are shared between browsers and saved in `data/pixoo-settings.json`.

The new launcher starts the optional Python bridge in the background and then
`npm.cmd run deskhub`. A missing Python installation, missing `config.json`, or
an unavailable Pixoo must not stop the iPad server. Python logs are in
`data/bridge.log` and `data/bridge-error.log`. The bridge remains idle in the
background after the Node console is closed, ready for the next launch.

## Data and display behavior

One SDK telemetry stream updates `RaceStateProjector` and the Pixoo mode manager.
The iPad receives `/api/race/state` as before; the web interface is unchanged.
Pixoo's mode priority remains `IRACING > FACEIT > NORMAL` and does not change
the iPad into a FACEIT or clock screen.

The iPad server starts before contacting the optional display. Display health
is checked every three seconds, with a one-second HTTP timeout. Spotter writes
are detached from telemetry sampling so a slow or failed Bluetooth write does
not delay dashboard snapshots. Failed FACEIT display delivery is not marked as
success; the existing persistent outbox/poller can retry it after reconnection.
On reconnection, the current Pixoo view is refreshed.

Set `DESKHUB_DISPLAY=none` before launching to disable Pixoo intentionally.
With `pixoo` (the default), it is safe to leave Pixoo switched off and turn it
on later. A serial handle being open does not prove that a powered-off device
is physically reachable: failed writes invalidate it and trigger recovery.

## Moving to a different Windows computer

1. Pair the same Pixoo with Windows Bluetooth settings. Windows must expose its
   outgoing Bluetooth SPP/COM port. The app cannot create this OS pairing.
2. Install Node.js and the app's npm dependencies. Install Python dependencies
   with `python -m pip install -r requirements.txt` (or use the local `.venv`).
3. Keep a local, gitignored `config.json` containing the Pixoo Bluetooth address
   and `"serial_port": "auto"`. This private config is not fetched from GitHub.
4. Keep the local `.env` if FACEIT integration is wanted; it is also gitignored.
5. Run the new launcher. The same device address is used to rediscover its COM
   port on every reconnect attempt, even if Windows changes the port number.

For a different physical Pixoo, change `device_address` and restart the bridge.
A different computer does not change the original Pixoo's Bluetooth address.
After explicitly enabling home LAN access, use `http://COMPUTER-LAN-IP:8787/race`;
allow the server through Windows Firewall for the intended private network.
The Python bridge stays on loopback port 8765 and is not exposed to the iPad.

## Verification

Run `npm.cmd test` in `deskhub`, and `python -m unittest discover -v` in the root.
New tests cover offline display delivery, reconnect recovery, telemetry advancing
during blocked spotter writes, SDK-independent dashboard state, and COM changes.
Physical Bluetooth, iPad Wi-Fi access, and Windows launcher UI need testing on
the actual setup. Automated localhost tests may fail with EACCES in a restricted
execution environment; file tests need a writable TEMP/TMP directory.
