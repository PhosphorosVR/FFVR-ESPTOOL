App2 – OpenIris Setup (Web)
================================

Purpose
-------
Web-only configuration UI that mirrors the interactive features of `openiris_setup.py` without flashing or bootloader interaction. It communicates over any available Web Serial CDC port (device does not need to be in boot mode).

Included Features
-----------------
- Connect / disconnect at selectable baud (defaults 115200)
- WiFi: scan, select, configure credentials, connect, status, auto-setup flow
- Device name (mDNS + UVC) read & update
- Device mode read & switch (wifi / uvc / setup)
- LED duty cycle + current read & update
- Log monitor (raw device log stream, filters heartbeats JSON)
- Summary aggregation (serial, name, mode, WiFi status, LED info, device info)

Not Included
------------
- Flashing/bootloader operations
- Firmware file management

Structure
---------
app2/
  index.html   – UI layout & panels
  styles.css   – Compact, standalone styling
  src/serial.ts – Minimal WebSerial wrapper & JSON framing
  src/api.ts    – Parsing helpers for nested JSON result shapes
  src/index.ts  – UI wiring and feature logic

Development Notes
-----------------
- Uses native Web Serial: tested in Chromium-based browsers.
- `scan_networks` gets extended timeout (60s) and supports direct networks JSON bursts.
- Parsing logic tolerates nested `results[0].result` JSON-string payloads (mirroring the CLI tool).

Extending
---------
Add new device commands by:
1. Creating a parse helper in `src/api.ts` (follow existing patterns).
2. Calling `runCmd('<command>', { optionalData })` from `src/index.ts` and transforming the response.

License
-------
Same license as root project.
