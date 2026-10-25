# Changelog

All notable changes to Second Moon are documented here. Early history was reconstructed from repository commits.

Chinese changelog: [CHANGELOG.zh.md](CHANGELOG.zh.md)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## 0.4.0 (20261025) - 2026-10-25

- Replace the API-only dialog with a dark settings center covering general preferences, accounts/models and privacy/execution, with searchable providers and all 10 languages.
- Group account sign-in and API-key options under each provider, remove mixed authentication/billing tabs, and retain Pi-backed authentication and isolated credentials without adding dependencies. Reset scroll and focus when navigating settings; test grouping, aliases and SDK auth availability.
- Add official ChatGPT subscription authorization and SDK-backed GitHub Copilot/Kimi Code sign-in, isolated credentials, cancellation/timeouts, serialized refresh and sign-out. ChatGPT validates signed identity tokens, issuer/audience, state/nonce and plan scope, reuses host/client registrations and calls the public Responses endpoint.
- Add 31 connection presets separating subscriptions, Coding Plans, metered APIs and local servers; preserve native SDK model capabilities and prevent plan endpoint overrides or implicit billing fallback.
- Restrict subscription/plan connections to interactive work, disable automatic retries for those connections, and stop associated turns/schedules on sign-out while distinguishing confirmed remote revocation from local removal.
- Install openid-client and open with official npm commands; add OAuth, credential isolation, plan routing and inference request-contract tests.

- Align the available Tauri Rust/JavaScript dependency series to restore desktop packaging, and deduplicate React resolution during workspace development.
- Pin transitive DOMPurify and undici dependencies to the published 3.4.17 and 8.12.2 through npm overrides, resolving critical and high-severity advisories found by the official dependency audit.
- Add a Research panel for questions, hypotheses, evidence, experiments, decisions, next steps and session handoffs, with linked entries, preserved revisions and full JSON export.
- Add project-isolated cross-session keyword retrieval and budgeted research context; expose research tools and persist explicitly unreviewed turn handoffs.
- Add SHA-256 source/artifact fingerprints, page-specific PDF and text excerpt matching, and source-drift checks. Agents cannot supersede user entries.
- Store app-observed tool and background-command events separately, including actual exit codes, runtime platform and file snapshots. Recover interrupted event state without replaying work.
- Translate the new interface and tools into all 10 supported languages and cover sources, isolation, revisions, history recovery and actual execution in tests, retaining the 300-line source limit.

## 0.4.0 - 2026-10-24

- Introduce Second Moon branding, a moon-and-research-orbit icon, and rewritten user guides; rename the GitHub repository to sk-research-agent.
- Split frontend, backend, styles and tests by responsibility; enforce a 300-line file limit through lint, tests and CI.
- Add 10-language switching using official i18next/react-i18next and JSON catalogs, persisted preferences, regional matching, localized dates/API errors/Agent response instructions/tray labels, and matching official Monaco language packs.

- Adopt Tauri, React, TypeScript, Node.js, and the published Pi Coding Agent SDK.
- Add project conversations, tool execution, steering, follow-ups, abort, and canonical Pi history restoration.
- Add OS-keychain model settings, SQLite business storage, scoped memories, and recurring research tasks.
- Add Monaco editing, PDF.js previews, paginated PDF text extraction, Crossref search, and managed command jobs.
- Add single-instance tray operation and packaged official Node/npm runtime dependencies.
- Remove the Python/FastAPI/DBOS pipeline, PyInstaller packaging, and legacy server deployment without compatibility shims.
- Add integration tests using the real Pi SDK against a controlled model endpoint. Live-provider behavior requires configured credentials.

## 0.3.0 - 2026-08-26

### Added

- Added OpenAI Agents SDK as the shared agent runtime. OpenAI uses native Responses or Chat Completions adapters; Anthropic and Gemini use the SDK's LiteLLM adapter.
- Added DBOS durable workflows for research-direction runs, approvals, resumptions, and recovery after process restarts.
- Added an explicit cloud/desktop runtime model and a status API that reports compute and data location without exposing credentials.
- Added deterministic batch and run identifiers so recovered workflows do not duplicate completed research work.
- Added runtime tests and shared frontend types for the new execution model.
- Added a responsive GitHub repository icon linking to the project source.

### Changed

- Reworked the product into one shared research core with two delivery modes: a server-executed Web Agent and a local desktop Agent whose work stays on the user's device except for external model and literature API calls.
- Redesigned the research workspace around pending approvals, the research-stage spine, run health, and a prominent cloud/local location indicator.
- Made cloud provider and model settings read-only in the browser; desktop settings remain locally editable.
- Refined model-output recovery while retaining structured JSON validation for third-party provider compatibility.
- Updated Python, Node.js, React, Vite, Tauri, and Rust dependencies to their latest compatible stable releases.
- Standardized Python installation and execution on `uv`, and updated deployment, desktop, environment, and architecture documentation.
- Renamed the Python command to `agentic-research` and synchronized Python, npm, frontend, Cargo, and Tauri versions.

### Security

- Disabled Agents SDK tracing by default and excluded sensitive trace payloads unless tracing is explicitly enabled.
- Kept API keys out of child experiment processes and public runtime-status responses.
- Prevented ordinary cloud users from changing server-wide model credentials through the Web UI.

## 0.2.0 - 2026-07-20

### Added

- Rebuilt the early prototype as a local-first, auditable workflow covering evidence collection, falsifiable hypotheses, experiment planning, human approval, code or notebook execution, held-out validation, and report generation.
- Added FastAPI REST and SSE endpoints, a React/Vite workspace, process supervision, run artifacts, live logs, and provider configuration.
- Added generated-code policy checks, constrained subprocess execution, run locking, provider validation, and tests for the research and execution layers.
- Added the Tauri 2 desktop application with a bundled Python sidecar, local lifecycle management, generated platform icons, and desktop packaging.
- Added English and Simplified Chinese localization, persisted language and theme preferences, and localization consistency checks.
- Added Docker, Nginx, and non-container deployment materials plus research protocol, security, desktop, and Semantic Scholar documentation.
- Added retry-assisted structured JSON extraction for imperfect model responses.

### Changed

- Replaced the original `src/agents` prototype with domain, infrastructure, research, workflow, and API modules.
- Renamed the product from Papermill to Agentic Research and standardized the package name as `sk-agentic-research`.
- Migrated the frontend from JavaScript to TypeScript and improved navigation, responsive layout, themes, and settings UX.
- Updated provider defaults, environment-driven ports, dependency locks, repository metadata, and deployment guidance.

### Removed

- Removed the original monolithic FARS agents and orchestrator after the auditable workflow architecture replaced them.
- Removed automatic installation of heavyweight system dependencies from the paper-writing path.

## 0.1.0 - 2026-06-22

This version is reconstructed from the first FARS and research-workflow commits; the original repository did not create a `v0.1.0` tag.

### 2026-06-22

- Added a dedicated Simplified Chinese README and refreshed the frontend dependency set.

### 2026-03-02

- Created the initial Fully Automated Research System (FARS) prototype with ideation, planning, experiment, writing, and orchestration agents.
- Integrated early literature and repository search adapters and a unified OpenAI, Anthropic, and Google model client.
- Added experiment retries, LaTeX paper generation, plots, and the first automated PDF workflow.
- Added the first FastAPI and React/Vite Web interface, real-time monitoring, Docker, and Nginx configuration.
- Reorganized the prototype into `src/` and extracted prompts into configuration files.
