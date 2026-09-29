# Security model and release checklist

## Trust boundaries

The local UI is trusted application code. A PAR response is remote content and must be treated as untrusted, even though its URL carries access authority.

The application keeps desktop privileges in the Electron main process. The renderer talks to it through the narrow `window.parBrowser` bridge rather than receiving Node.js or Electron access directly.

## Current controls

- `nodeIntegration: false` for local and remote renderers.
- `contextIsolation: true` and `sandbox: true` for local and remote renderers.
- HTTPS is required.
- OCI Object Storage host validation is enabled by default.
- New windows are denied; external links are delegated to the system browser.
- File access occurs only after a user action in the native file picker or a deliberate drag/drop action.

## Before adopting for broader use

- [ ] Restrict remote redirects and navigation to an OCI host allowlist.
- [ ] Add an Electron session permission-request handler that denies permissions by default.
- [ ] Validate the sender and argument shapes for every IPC handler.
- [ ] Add automated tests for URL validation, object URL derivation, and authorization-error handling.
- [ ] Run `npm audit` and software-composition analysis in CI on every release.
- [ ] Pin and regularly update Electron and build dependencies.
- [ ] Do not persist PAR URLs by default in high-sensitivity environments, or protect local history through an OS-backed secure store.
- [ ] Code-sign Windows installers with an organizational Authenticode identity.
- [ ] Sign and notarize macOS releases using an Apple Developer ID.
- [ ] Publish checksums and release provenance for every installer.

## Operational guidance

PAR URLs are credentials. Revoke a PAR in OCI if it is exposed, and use short expirations plus narrowly scoped access types. The app cannot infer a PAR's access type from the URL; it only records outcome-based write status from OCI responses.
