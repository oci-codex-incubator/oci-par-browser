# OCI PAR Browser

OCI PAR Browser is a cross-platform desktop client for Oracle Cloud Infrastructure Object Storage pre-authenticated requests (PARs). It runs on macOS and Windows from one Electron codebase.

It opens HTTPS OCI PAR URLs in an isolated viewer, turns OCI JSON object listings into clickable object links, and supports upload and folder-marker creation when the PAR permits writes.

> **Development status — first pass.** This is an early development implementation, not a production-ready or security-approved release. See [TODO.md](TODO.md) for the hardening, testing, OCI service, IAM, and release work required before organizational transfer or production use.

## What it does

- Opens standard OCI Object Storage PAR URLs without OCI credentials or an SDK.
- Provides a readable JSON inspector for bucket/object-list responses.
- Makes object entries clickable from an object-list PAR.
- Uploads through the PAR with a file picker or drag and drop.
- Creates an Object Storage folder marker (a zero-byte object ending in `/`).
- Learns and displays write access from OCI's actual response: **unknown**, **writable**, or **read-only**.
- Stores recent links locally and lets the user clear them.

## Requirements

- Node.js 20–26
- macOS or Windows for the native app
- An OCI Object Storage PAR URL

## Windows installation

The Windows installer is an all-users (per-machine) NSIS installer and requires
administrator approval. Keeping one installation scope avoids Windows having a
per-user copy under `%LOCALAPPDATA%\\Programs` alongside a machine-wide copy
under `Program Files`.

If a previous per-user build failed to uninstall, close every OCI PAR Browser
process, run its `Uninstall OCI PAR Browser.exe` from the old installation
directory, then remove that old directory only if the uninstaller leaves it
behind. The all-users installer cannot automatically remove a separately
registered per-user installation.

## Run from source

```bash
npm install
npm run dev
```

## Package installers

Build on the target platform for the smoothest release workflow:

```bash
# macOS Apple Silicon (.dmg)
npm run package:mac

# macOS Intel (.dmg)
npm run package:mac:x64

# Windows x64 NSIS installer (.exe)
npm run package:win
```

Artifacts are written to `dist/`.

## Project layout

```text
src/main.js       Privileged Electron main process and OCI HTTP operations
src/preload.js    Small, explicit IPC bridge
src/renderer.js   UI behavior and JSON object browser
src/index.html    Desktop UI structure
src/styles.css    Desktop UI styling
ARCHITECTURE.md   System and trust-boundary overview
SECURITY.md       Security model and release checklist
```

## Security notes

- A PAR is a bearer credential: anyone with the complete URL can use it within its configured scope and expiry.
- The app never sends a pasted URL to an intermediary service. Recent links stay in the local Electron user-data directory and can be cleared.
- Standard mode accepts only HTTPS OCI Object Storage hosts. The custom-host option is deliberate and should be used only for a trusted OCI-compatible endpoint.
- Do not place PAR URLs in source control, logs, tickets, or screenshots.
- The current macOS and Windows packages are **unsigned**. Before broad internal or public distribution, sign Windows releases and sign/notarize macOS releases.

See [OCI's PAR documentation](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingpreauthenticatedrequests.htm), [ARCHITECTURE.md](ARCHITECTURE.md), and [SECURITY.md](SECURITY.md).

## Example PAR

Use a PAR that you create for your own bucket. Never paste a working PAR into source control. This intentionally nonfunctional shape is safe for documentation:

```text
https://objectstorage.<region>.oraclecloud.com/p/<par-token>/n/<namespace>/b/<bucket>/o/
```
