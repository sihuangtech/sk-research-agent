# Second Moon

<p align="center">
  <img src="frontend/public/brand/second-moon.png" alt="Second Moon icon" width="96" />
</p>

Your personal research agent.

Work from a paper or an idea to analysis scripts, experiments and research outputs in the same project. Second Moon reads and edits real files, runs local tools and saves results in your project folder, turning conversations into work you can inspect and reuse.

[中文说明](README.zh.md) · [Get started](#get-started) · [Run from source](#run-from-source) · [Data and background work](#data-and-background-work)

## What you can do

- **Understand a research project**: review documentation, code and materials, identify research goals and decide what to test next. Keep separate conversations for different projects and reopen past sessions to continue working.
- **Read papers and explore literature**: extract PDF text with page references and find publication titles, authors, DOIs and source links to support your notes and evidence review.
- **Analyze data and run experiments**: inspect data, write or revise scripts, execute local commands and save results and charts in the project. Project environments such as Python, R and Julia must be installed separately.
- **Collaborate during execution**: follow streaming answers and tool results, steer an active task, queue a follow-up or stop the current turn. Run lengthy commands as independent jobs, inspect their status and recent logs, and cancel them separately.
- **Inspect and edit outputs**: browse files, edit text and code, and preview PDFs and images. Responses support Markdown, tables and mathematical notation. The editor detects changes made by other programs before saving.
- **Keep research context**: save personal preferences and project memory for future turns, then edit or delete them whenever needed.
- **Build a research history**: save questions, hypotheses, evidence, experiments, decisions and next steps, and retrieve them across sessions. Each turn leaves an explicitly unreviewed Agent handoff.
- **Inspect sources and execution**: fingerprint local sources and artifacts with SHA-256, match PDF excerpts against a specific page, and detect file changes. Keep research notes separate from app-recorded tool and background-command events, and export the full history as JSON.
- **Schedule ongoing research**: set up recurring tasks, such as finding new papers and updating literature notes. Every run creates a conversation so you can inspect its process and results.

## Get started

1. Open the app, choose **Open project**, and select an existing research folder.
2. Open **Settings → Accounts & models**, choose a provider, then use its account sign-in or API-key option. For plan keys, choose the matching plan and region. Connect, select a model and test the saved configuration.
3. Create a research session, select a model and describe your task. Press `⌘ / Ctrl + Enter` to send.
4. Use **Files**, **Research**, **Jobs**, **Memory** and **Automations** to inspect outputs and manage ongoing work.

In **Research**, add entries with sources and links to earlier work, or add a revision while preserving the original. Open local source files, check whether their fingerprints have changed, and export entries, revisions and execution events. The Agent can save and search entries through research tools; new turns receive relevant entries and recent project progress. Records are isolated by project.

Try a task such as:

> Read the project documentation and existing scripts. Summarize completed work and identify the questions that still need to be tested.

> Inspect the CSV files in data, report missing values and outliers, write a reproducible analysis script, save charts to figures, and record the commands you actually run.

> Read the methods section of this PDF. Include page references and list the data, parameters and steps needed to reproduce the experiment. Separate anything the paper does not establish.

The agent can change files and execute local commands. Start with a separate project to become familiar with its behavior, and keep backups of important materials.

## Accounts and models

Connections are grouped by provider: OpenAI offers ChatGPT sign-in and an API key; Kimi groups account login, Coding Plan keys and Moonshot API access. A Coding Plan is a billing arrangement, not a separate authentication method. Providers with a single connection option open directly.

- **Account sign-in**: ChatGPT, GitHub Copilot and Kimi Code, using your system browser. Keep separate connections, reconnect or sign out without copying another tool's login files.
- **Coding Plans**: configured plan endpoints for Z.AI/GLM, Kimi Code, MiniMax, Alibaba/Qwen and Xiaomi MiMo. Use the dedicated key for the selected plan and region; connections never silently switch to ordinary API billing.
- **API access**: OpenAI, Anthropic, Google Gemini, DeepSeek, xAI, OpenRouter, Mistral, Groq, Moonshot, Alibaba, Z.AI, MiniMax, SiliconFlow, Volcengine and MiMo, plus custom compatible endpoints.
- **Local servers**: Ollama, LM Studio and custom endpoints. Start the model server yourself before connecting.

ChatGPT uses [OpenAI's subscription authorization for local open-source apps](https://developers.openai.com/siwc/token-sharing-open-source), with account-specific model discovery after sign-in. Eligibility and shared limits are controlled by the authorization screen and [ChatGPT usage settings](https://chatgpt.com/settings/usage). Access is not unlimited and never falls back to a paid API key. Not every consumer subscription permits third-party access: this version does not offer Claude/Gemini subscription login or label their API connections as subscription usage.

A plan's credential may still be called an API key even when usage is covered by a subscription. It must match the selected endpoint. As a conservative product policy, subscription and Coding Plan connections are interactive-only; choose an API or local model for scheduled work. Connection tests consume some quota. Catalogs and capabilities come from the installed SDK/configuration, not live verification of every paid provider account.

**General** contains language and the default connection for new conversations. **Privacy & execution** explains data sharing and local permissions. ChatGPT sign-out attempts remote revocation, clears local tokens even if revocation fails, and reports that distinction. Other providers' sign-out removes this app's local credentials only.

## Languages

Choose from Simplified Chinese, Traditional Chinese, English, Japanese, Korean, French, German, Spanish, Brazilian Portuguese and Russian in the sidebar. Your choice is saved locally; the first launch follows your system or browser language preferences.

Interface labels, dates, service messages and tray menus update together without clearing your draft. New turns and newly scheduled tasks default to the selected language; you can request another response language in the task. Existing files, user content and past responses retain their original text.

The editor's internal menu language is selected when it first loads. Restart the app to fully update those menus after switching languages. Its current official Brazilian Portuguese pack has no translated strings, so those internal menus remain in English; the app's own Portuguese interface and messages are translated.

## Data and background work

Source materials and generated outputs stay in your chosen project folder. Conversations, memories, job records and model configurations are stored in the local application data directory. API keys, OAuth access/refresh tokens and account registrations are kept separately in the operating system's credential store, without plaintext storage in project files or the configuration database. Settings expose account labels, never tokens.

Online model requests send the relevant prompts, file contents, memories and tool results to your configured provider, which handles model billing. Literature search requires an internet connection. Local models can support offline tasks that do not need external information. There is currently no cloud account service, device synchronization or team collaboration backend.

Closing the window leaves the app running in the system tray. Quitting stops local execution. Stopping a conversation turn does not cancel independently submitted command jobs; cancel those in **Jobs**.

Scheduled work requires the app to be running. Nothing executes while the computer sleeps, is shut down or the app has quit. On restart, an overdue schedule runs once rather than replaying every missed interval. Conversation history can be restored, but interrupted processes and experiments are not automatically restarted.

## Run from source

Install Node.js 24 or later. Desktop development and packaging also require Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). From the repository root:

```bash
npm ci
npm run desktop:dev
```

Build a desktop package for your machine:

```bash
npm run desktop:build
```

Packages are written to `src-tauri/target/release/bundle/`. Packaged apps include the required Node.js runtime; users do not need to install Node.js separately. Research scripts still require their own project environments. Build natively for each target operating system and architecture. Current macOS builds use local ad-hoc signing; public notarization and signing for other platforms are not configured.

For browser development, run `npm run dev` and open `http://127.0.0.1:5173`. Development data is stored in `.research-data/`. This development interface connects to a service on your machine.

## Current limits

- Scientific claims in notes still need review. Excerpt matching checks text, fingerprints describe capture-time file state, and URLs are not fetched or verified automatically. Each source file is limited to 50 MB.
- Execution events come from actual tool and background-command activity. Write/edit targets can receive fingerprints; arbitrary shell outputs need explicit registration. Records do not capture complete Python/R environments, provide OS-level tamper resistance, or perform automatic statistical review.
- PDF reading extracts text layers, without OCR. Check complex formulas, tables and figures against the original document.
- Literature search provides publication metadata and source links, not a substitute for reading papers and verifying scientific claims.
- Files and commands run with your user permissions. The project folder is not an operating-system sandbox; per-command approval and container isolation are not implemented.
- The workbench provides code editing and command logs, without an interactive terminal, managed notebook kernels, remote cluster execution or a full IDE debugger.

## License

[GPL-3.0-only](LICENSE). Third-party dependencies retain their respective licenses.

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=sihuangtech/sk-research-agent&type=Date)](https://star-history.com/#sihuangtech/sk-research-agent&Date)
