# Changelog

Chinese changelog: [CHANGELOG.zh.md](CHANGELOG.zh.md)

This log follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning and historical reconstruction

- Historical batches are grouped by Git committer calendar date in Asia/Shanghai. All commits on one date form one batch; dates are not appended to version numbers.
- The historical numbers below were reconstructed before the first GitHub Release. They are documentation labels, not claims that matching packages or tags were published. Existing Git commits are unchanged.
- The project remains in initial development (`0.y.z`): features and incompatible rewrites increment MINOR and reset PATCH; compatible fixes, documentation, dependency-only and CI maintenance increment PATCH.
- This pre-1.0 policy is a project convention; SemVer permits an unstable public API during initial development. At `1.0.0`, the public contract will be declared stable: incompatible changes increment MAJOR, compatible features MINOR, and fixes PATCH.
- Changelog entries record versioned change batches; GitHub Release publication is a separate action requiring approval. Published versions and tags must never be silently reassigned.

## 0.9.0 - 2026-10-25

### Added

- Add a Research panel for questions, hypotheses, evidence, experiments, decisions, next steps and session handoffs, with linked entries, preserved revisions and full JSON export.
- Add project-isolated cross-session keyword retrieval, budgeted research context and Agent research tools; mark generated handoffs as unreviewed.
- Add SHA-256 source/artifact fingerprints, page-specific PDF/text excerpt matching and source-drift checks; preserve user revision ownership.
- Record app-observed tool and background-command events separately, including exit codes, platform and file snapshots. Recover interrupted state without replaying work.
- Add ChatGPT subscription authorization and Pi-backed GitHub Copilot/Kimi Code sign-in, with isolated keychain credentials, cancellation, timeouts and serialized refresh.
- Validate ChatGPT signed identity tokens, issuer/audience, state/nonce and subscription scope; reuse host/client registrations and use the public Responses endpoint.
- Add 31 connection presets for subscriptions, Coding Plans, metered APIs and local servers, with native SDK model capabilities.

### Changed

- Replace the API-only dialog with a dark settings center for preferences, accounts/models and privacy/execution.
- Group account and API-key options by provider, with alias search and all 10 languages. Coding Plan describes billing, not another authentication method.
- Keep subscription/plan connections interactive-only as a product policy, disable automatic retries, and stop associated turns/schedules on sign-out. Never fall back silently to another billing method.
- Install openid-client and open through npm; retain existing Pi authentication interfaces and account isolation.
- Synchronize package, frontend, service and desktop versions, and test their consistency.
- Use Second Moon for desktop bundle and installer filenames while keeping the in-app language selection and existing application identifier/data location.

### Fixed

- Restore compatible Tauri Rust/JavaScript dependency series and deduplicate React resolution.
- Reset scroll position and focus when navigating settings.

### Security

- Pin DOMPurify and undici overrides to address audited critical/high advisories.
- Distinguish confirmed remote revocation from local credential removal; never expose raw OAuth tokens/errors to the renderer.

### Verification

- Add research provenance/history, provider grouping/search, OAuth isolation, cancellation, refresh and request-contract tests.
- Local tests and macOS UI checks are not proof of live subscription eligibility or provider quota use.

## 0.8.0 - 2026-10-24

Incompatible runtime replacement during initial development.

### Added

- Adopt Tauri, React, TypeScript, Node.js and the published Pi Coding Agent SDK.
- Add project conversations, tool execution, steering, follow-ups, abort and canonical Pi history restoration.
- Add OS-keychain settings, SQLite business records, scoped memories and recurring research tasks.
- Add Monaco editing, PDF.js previews, paginated PDF text extraction, Crossref search and managed command jobs.
- Add single-instance tray operation and packaged official Node/npm runtime dependencies.
- Add 10-language localization and enforce a 300-line source-file limit in lint, tests and CI.

### Changed

- Introduce Second Moon branding and the research-orbit icon, rename the GitHub repository, and rewrite user guides.
- Center the README logo and add star-history charts.
- Merge the existing Trustabl workflow; its original addition is recorded on 2026-09-30.

### Removed

- Remove the Python/FastAPI/DBOS pipeline, PyInstaller packaging and legacy server deployment without compatibility shims.
- Stop tracking private documentation, competition materials and local legacy assets; retain their local files.

## 0.7.1 - 2026-09-30

CI/security maintenance, without a new product feature.

### Security

- Add the Trustabl GitHub Actions security-scanning workflow; merge into main follows on 2026-10-24.

## 0.7.0 - 2026-09-15

Removal of previous runtime modules during initial development.

### Removed

- Remove previous infrastructure, execution/process helpers, configuration/storage modules, research modules, API routes and workflow initialization.
- This records the deletion itself, not a claim that the intermediate checkout was a complete working release.

## 0.6.0 - 2026-08-27

New interface features plus startup fixes.

### Added

- Add responsive GitHub repository links to the sidebar/mobile footer and Bilibili/Xiaohongshu footer links.

### Fixed

- Allow desktop startup before model configuration is complete.

### Changed

- Add the earlier reconstructed changelog and adjust Markdown lint rules.

## 0.5.0 - 2026-08-26

Incompatible agent/workflow redesign during initial development.

### Added

- Introduce a shared OpenAI Agents SDK runtime and DBOS durable workflows with approvals, resumption and restart recovery.
- Add cloud/desktop execution-location reporting, deterministic run identifiers and runtime tests.

### Changed

- Separate server-executed Web and local desktop behavior, redesign the research workbench, and make cloud model settings read-only.
- Preserve structured-response recovery, update compatible dependencies and standardize Python operations on uv.

### Security

- Disable SDK tracing by default, exclude sensitive payloads unless enabled, and isolate provider secrets from experiment processes and public status.

## 0.4.0 - 2026-07-20

Provider/configuration features.

### Added

- Add environment-driven backend ports, provider configuration and validation improvements, and retry-assisted JSON extraction with tests.

### Changed

- Standardize the package name as sk-agentic-research and update deployment documentation.

## 0.3.0 - 2026-07-19

Desktop and interface features.

### Added

- Add the Tauri desktop shell, packaged Python sidecar, platform icons and English/Simplified Chinese interfaces.
- Add theme switching, desktop navigation and responsive interface improvements.

### Changed

- Rename Papermill to Agentic Research, migrate frontend source to TypeScript, and update dependencies/repository metadata.

## 0.2.0 - 2026-07-18

Incompatible research-workflow rewrite during initial development.

### Added

- Rebuild research work around evidence, falsifiable hypotheses, plans, approval, execution, held-out validation and reports.
- Add FastAPI REST/SSE, modular React pages, run artifacts/logs, process supervision, policy checks, locks and automated tests.
- Add project/deployment configuration and update provider defaults.

### Removed

- Replace the original monolithic agents/orchestrator with domain, infrastructure, research, workflow and API modules.
- Remove automatic heavyweight dependency installation from paper-writing execution.

## 0.1.1 - 2026-06-22

Documentation/dependency maintenance.

### Changed

- Add a dedicated Simplified Chinese README, refresh frontend dependencies and refine ignore rules.

## 0.1.0 - 2026-03-02

Initial prototype baseline.

### Added

- Create the initial FARS ideation, planning, experiment, writing and orchestration agents.
- Add literature/repository search adapters and a unified OpenAI/Anthropic/Google model client.
- Add experiment retries, LaTeX/PDF generation and plots.
- Add the first FastAPI and React/Vite Web interface, live monitoring, Docker and Nginx configuration.

### Changed

- Reorganize source into src/, extract prompt configuration, and introduce ESLint/Tailwind and improved API data handling.
