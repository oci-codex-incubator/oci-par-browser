# Productionization TODO

## Status and scope

OCI PAR Browser is a **first-pass development version**. It is not approved for production deployment, broad organizational distribution, or handling sensitive PARs until the applicable work below is complete and reviewed.

The existing Electron desktop client remains a direct-to-Object-Storage PAR client. A future container service must be a separately justified component; it must not become a proxy for PAR URLs or a store for bearer credentials.

## 0. Transfer and secret hygiene

- [ ] Revoke the PAR previously present in repository documentation, confirm it has no active replacement in Git history, and rotate any related access paths.
- [ ] Initialize or recover the Git repository before transfer; review all history, tags, releases, issues, and Actions artifacts for PARs, private keys, OCI configuration, tokens, and personally identifying data.
- [ ] Add automated secret scanning, push protection, dependency review, and branch protection in the shared GitHub organization.
- [ ] Add a `SECURITY.md` vulnerability-reporting contact and a responsible-disclosure process.

## 1. Electron and application security

- [ ] Upgrade Electron and its transitive dependencies to a currently supported, vulnerability-free release; rerun `npm audit` and record the result in CI.
- [ ] Validate the IPC sender and the complete type, size, and value range of every IPC argument in the main process. Reject calls from any unexpected frame or origin.
- [ ] Install permission request and permission check handlers that deny by default for both the local window and remote viewer.
- [ ] Enforce navigation and redirect policies: permit only the validated OCI Object Storage origin for normal mode, explicitly define the custom-host allowlist policy, and never pass unvalidated URLs to `shell.openExternal`.
- [ ] Use a dedicated, nonpersistent Electron session for remote PAR content; prevent remote content from sharing cookies, permissions, storage, or preload capabilities with the local UI.
- [ ] Define restrictive CSP and security headers for the local renderer; keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false` as tested invariants.
- [ ] Put upload limits, object-name validation, download destination behavior, error redaction, and logging rules under automated tests. Do not log complete PAR URLs or object names when sensitive.
- [ ] Replace plaintext recent-PAR history with an opt-in, encrypted OS-backed store, or disable persistence by default. Define retention, clear-data behavior, and support-diagnostics redaction.
- [ ] Add unit and integration tests for URL validation, redirects, object URL derivation, write authorization responses, IPC authorization, and malicious remote-content behavior.

## 2. Repository and engineering baseline

- [ ] Adopt the OCI Node project contract: add `.oci-project.yml`, `AGENTS.md`, `run/`, `docs/architecture.md`, `docs/requirements.md`, `test/`, and `scripts/check-project.mjs`.
- [ ] Document the temporary JavaScript/CommonJS exception in the manifest and architecture decision record, then plan an incremental TypeScript/ESM migration without breaking the desktop interface.
- [ ] Add `test`, `build`, and cross-platform `clean` scripts alongside `check`; run all four plus `node scripts/check-project.mjs .` in CI using `npm ci`.
- [ ] Add formatting, static analysis, test coverage thresholds, dependency updates, SBOM generation, license review, and signed CI provenance.
- [ ] Add CI matrix coverage for supported macOS and Windows architectures, including package smoke tests and installer verification on their target platforms.

## 3. OCI container service and existing Load Balancer

- [ ] Write an architecture decision explaining the server-side use case, users, data classification, authentication, and why it cannot remain desktop-only. Do not deploy a container merely because the Electron client exists.
- [ ] If justified, create a separate TypeScript Fastify service with a narrow API and health endpoint. It must never accept, log, persist, or proxy PAR bearer URLs; its API authentication and authorization model must be defined before implementation.
- [ ] Select and record the OCI region, compartment, Artifact Registry repository, existing VCN/subnet, network security groups, existing Load Balancer, listener, backend set, health check, TLS certificate ownership, DNS name, exposure model, observability destination, and rollback owner.
- [ ] Add a production Dockerfile, `.dockerignore`, `run/container.env.example`, `run/build-container.sh`, and idempotent `run/deploy-oci-container-lb.sh`. Scripts must validate prerequisites, use named pre-existing network and Load Balancer resources only, converge safely, and never create IAM, networking, or load-balancing resources implicitly.
- [ ] Configure Container Instance readiness/liveness behavior, resource limits, private networking, TLS termination, Load Balancer health checks, backend registration, logs/metrics/alarms, backup/recovery expectations, and a tested rollback procedure.
- [ ] Document deployment inputs and commands in `run/README.md`, including build, scan, push, deploy, health verification, and rollback. Keep environment examples credential- and OCID-free.

## 4. OCI IAM and supply-chain controls

- [ ] Separate principals: human administrators, CI/CD deployer, Container Instance workload identity, and read-only auditors. Do not reuse a developer's OCI user/API key for automation.
- [ ] Apply least privilege by compartment and resource. The CI/CD deployer should receive only the Artifact Registry, Container Instance, and explicitly named existing Load Balancer/backend operations it needs; it should not receive tenancy-wide `manage` permissions.
- [ ] Give the Container Instance workload no OCI permissions unless a documented service operation requires them. If it does, use a dynamic group/resource principal with the smallest service-specific policy, never a long-lived user key.
- [ ] Keep secrets in OCI Vault or the CI secret store, inject them at runtime, rotate them, and ensure values, OCIDs, certificates, and private keys never enter source, images, logs, test fixtures, or documentation.
- [ ] Have an OCI IAM administrator validate every policy's exact resource type, verb, compartment scope, conditions, dynamic-group rule, and effective access in a non-production compartment before promotion.
- [ ] Enable Cloud Guard, Audit log retention, vulnerability scanning for images, and alerts for unexpected IAM, registry, Container Instance, and Load Balancer changes.

## 5. Release readiness

- [ ] Code-sign Windows installers with the organizational Authenticode certificate and sign/notarize macOS packages with an Apple Developer ID.
- [ ] Publish checksums, SBOM, signed provenance, release notes, supported-platform policy, update mechanism, and rollback/revocation instructions for every installer.
- [ ] Define a tested incident process for leaked PARs, compromised signing credentials, vulnerable dependencies, and unintended Object Storage writes.
- [ ] Complete security, privacy, OCI architecture, and operational-readiness reviews; record approvals and remaining accepted risks before changing this project's status from first-pass development.
