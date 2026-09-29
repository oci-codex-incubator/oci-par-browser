# Architecture

## Overview

OCI PAR Browser is an Electron application. Electron packages Chromium, Node.js, and a native application shell, so the same JavaScript code runs on macOS and Windows.

```text
Local UI (renderer) ── approved IPC calls ──> Main process ── HTTPS ──> OCI PAR URL
       │                                              │
       └── JSON inspector / upload drop zone          ├── native file picker
                                                      ├── local recent-link storage
                                                      └── isolated remote BrowserView
```

## Components

| Component | File | Responsibility |
| --- | --- | --- |
| Main process | `src/main.js` | Owns windows, validates URLs, loads remote content, persists history, selects files, and issues OCI `PUT` requests. |
| Preload bridge | `src/preload.js` | Publishes a small, named `window.parBrowser` API to the local UI. |
| Renderer | `src/renderer.js` | Renders controls, parses a JSON response on request, and presents object links/upload controls. |
| Remote viewer | `BrowserView` | Displays PAR content separately from the local UI. It has no Node.js integration. |

## OCI request flow

1. The user pastes a PAR URL.
2. The main process requires HTTPS and an OCI Object Storage host unless the user explicitly permits a custom host.
3. The remote content loads in the sandboxed viewer.
4. The inspector reads the displayed JSON only when requested. For an OCI `objects` list, it creates object URLs from the original PAR root.
5. Uploads use `PUT` directly to the derived PAR object URL. A successful 2xx response marks the session writable; 401/403 marks it read-only or unavailable.

## Platform support

- **macOS:** Electron app bundled in a DMG; build Apple Silicon and Intel variants separately.
- **Windows:** Electron app bundled in an NSIS installer for x64.
- **No OCI SDK:** PARs are bearer URLs, so the app uses standard HTTPS rather than local OCI profiles, API keys, or OAuth tokens.
