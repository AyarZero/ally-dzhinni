**Languages:** [Русский](../../README.md) · **English** · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · [Bahasa Indonesia](./README.id.md)

> 📖 **Interactive Guide App (16 languages, PDF layout & version history):** `AllY-Guide.exe` · [../index.html?lang=en](../index.html?lang=en)

# AllY · Genie (v0.1)

A local desktop shell for Windows that brings multiple AI models into one window with shared conversation history, local on-disk memory, a task queue, and usage tracking.

*AllY · Genie's birthday is November 23, 2026. License: MIT.*

---

## What this app is and what problem it solves

When you work with AI regularly, tasks quickly spread across browser tabs, terminal windows, and separate API keys. When one model hits its five-hour limit, you have to open another and explain the project context all over again.

**AllY · Genie** addresses four practical needs:

- **Shared context across models.** Conversation history and your rule base are stored locally in Markdown files (`pamyat/`). Switch the AI engine, model, or reasoning depth directly in the input field so the next model can pick up where the previous one left off.
- **Visibility into CLI agents.** In a regular terminal, it is hard to spot an agent's current step in time and intervene as it works. AllY shows a status sphere and a live activity feed on the left, separated by a smooth, adjustable vertical divider from the conversation and task queue on the right, with support for on-the-fly clarification (`live-steer`), queue editing, and prioritizing an important message.
- **Usage limits and context window tracking.** The **Resources** widget shows the lead AI engine, context usage (with a `350k` threshold), and five-hour and weekly subscription quotas, while the **Assistants** tab brings together balances for the other connections. Metrics are read locally without paid background calls.
- **Data control and direct connections.** Conversations, `pamyat/` notes, `.claude/skills/` skills, and `.ally-data/` local settings stay on your computer. You use your own subscriptions and keys directly with your chosen providers.

---

## Who this app is for

- **Developers and vibe coders** who work on projects through Claude Code, Codex, Antigravity, or DeepSeek and want agent steps, the queue, and context usage in one manageable window.
- **Writers, entrepreneurs, and professionals** who need unified local memory for their projects on their own PC.
- **Windows 10/11 users** who want a local tool with a customizable layout and a way to influence future releases through built-in feedback.

---

## What actually works in version 0.1

### 1. Connections and Auto mode
Connect at least one option to get started. In **Auto** mode, the system selects an available agent automatically:

| Connection | How it works | Capabilities in v0.1 |
|---|---|---|
| **Claude Code** | Official CLI with an Anthropic Pro / Max subscription | Complex tasks, code, writing, planning, and automatic context compaction |
| **Codex** | Official CLI with a ChatGPT Plus / Pro subscription | Repository work and clarification while a response is in progress (`live-steer`) |
| **Antigravity** | Official Google AI CLI | Large-context analysis (`350k` window threshold) and quota tracking |
| **DeepSeek Harness** | Local headless `dsh` profile using your DeepSeek balance | A backup, low-cost agent, with balance checks in the Assistants tab |
| **API aggregator (OpenRouter)** | Any Anthropic-compatible gateway using a Base URL and key | External models through a local Claude Code CLI process (without an Anthropic subscription) |
| **Qoder CLI** | Local CLI (discovery and sign-in) | Detected by the connection wizard (including in-window sign-in); support as the lead chat agent is coming in the next update |

### 2. Workspace and interface
- **Start screen:** **Conversation** is on the left with a clean status sphere, live activity rail, and smooth parallax divider; on the right sit resizable **Resources / Assistants** (top) and **Laptop** monitor (bottom).
- **Top bar (right to left):** clock on the right, wide **feedback drawer (bug icon)** for messages and attachments, **brush** (drag widgets, tabs, and icons; resize blocks horizontally or vertically; reset layout), **themes** (**Graphite** by default, plus Turquoise, Midnight, Dark, and Light), **book icon** (built-in Guide & Version History right inside the app), and a highlighted **lightning bolt** (3-step wizard with full-width **Reading mode**).
- **Local storage:** `pamyat/` (local Markdown memory), `.claude/skills/` (local skills), `.ally-data/` (keys and window layout, excluded from Git).

## Installation and launch (Windows 10/11)

**Before installing, make sure the following are already installed and available in `PATH`:**
1. **Node.js 24+** (with support for the built-in `node:sqlite` module)
2. **Python 3**
3. **Git**
4. Internet access for the initial build (`npm ci` and the Electron download), plus at least one connected AI engine or key.

Choose any of these three installation methods:

### Method 1 — ZIP archive and a familiar `.exe`
1. Download the repository ZIP archive and extract it to a short path without Cyrillic characters, such as `C:\AllY`.
2. Double-click **`AllY.exe`**—on first launch it checks for `node` 24+, `python`, and `git`, installs dependencies, downloads Electron, builds the **`programma\Dzhinni.exe`** executable, creates an **`AllY`** desktop shortcut, and opens the app window.
  *If Windows SmartScreen warns about a new unsigned `.exe`, click **More info → Run anyway** (full launcher source code is in `docs/launchers/`, or run `.\ustanovka.ps1` directly).*
3. Next time, launch the app by double-clicking **`AllY.exe`**, the **`AllY`** desktop shortcut, or **`programma\Dzhinni.exe`** directly. To open the interactive guide and version history in a separate app window, run **`AllY-Guide.exe`**.
4. On first launch, a three-step setup wizard opens—connect your preferred AI engine and send your first message.

### Method 2 — terminal commands (PowerShell / cmd)
Open PowerShell and run these commands in order:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

To check build readiness later, run:

```powershell
.\AllY.exe -Proverka
```

Launch from the terminal:

```powershell
.\AllY.exe
```

### Method 3 — ready-to-use prompt for your local AI assistant
If Claude Code, Codex, Antigravity, or another AI assistant is already running on your computer, copy this entire prompt and send it:

```text
Install and prepare the local AllY · Genie (v0.1) desktop app for launch on this Windows PC from the repository https://github.com/AyarZero/ally-dzhinni:
1. Check in the terminal that `git`, `python` (Python 3), and `node` are available (Node.js 24+ is required, with a successful `node -e "require('node:sqlite')"` check). If anything is missing or the Node version is below 24, tell me and help install it before building.
2. Clone the repository to a short path without Cyrillic characters or spaces, such as `C:\AllY`, and change to that folder.
3. Run the installation: `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` and wait for `programma\Dzhinni.exe` to finish building.
4. Verify the build with `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Check which CLI engines (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) or OpenRouter keys are already available on the system, and briefly tell me what is ready.
6. Launch `programma\Dzhinni.exe` (or `.\AllY.exe`) and tell me I can open the AllY window and start working.
```

*Note: connected CLI agents work directly with files in the open working folder without asking permission for each read or edit—keep important projects under Git version control.*

---

## Feedback and contributing

On the right side of the header (to the left of the clock), the **bug icon opens Feedback**. From there, you can:

- report a bug, a broken interface, or a startup problem;
- attach up to **3 supporting files**: text logs `.txt` / `.md` (up to `2 MB`), screenshots `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (up to `10 MB`), or short videos `.mp4` / `.webm` / `.mov` (up to `25 MB`, with a total limit of `30 MB`);
- suggest a new module, skill, or use case.

**Only the form text and the files you select** are sent—conversations, personal notes, and keys stay local. Developer replies arrive in the app's conversation view. The project is open source under the MIT license: you can create your own skills in `.claude/skills/` and contribute to the core.

---

## Known v0.1 issues and limitations we are working on

Here is an honest account of what is still limited or being refined:

1. **Environment dependencies must be installed beforehand:** installing `v0.1` requires `Node.js 24+`, `Python 3`, and `Git` to be installed already—a single standalone `.exe` installer without manual software setup is still in progress.
2. **Voice input and speech output are hidden in the v0.1 client build:** microphone and voice buttons have been temporarily removed while local speech recognition (`GigaAM`) and its installer are being refined.
3. **The Diary ("Honest Conversation") is hidden in client build v0.1:** multi-engine support and a dedicated flow are being finalized; the tab will open in an upcoming update.
4. **Delayed shutdown of the background bridge after closing the window:** the local bridge server may take until its idle timeout (up to ~9 minutes) to shut down after the window closes if another instance is reopened immediately.
5. **Qoder integration is in progress:** the connection wizard detects the local Qoder CLI and sign-in status, but using Qoder as the lead conversation agent remains disabled until the next release.
6. **Server-side rollout for large feedback attachments:** if the feedback server returns a size or file-rejection error when you send a screenshot or video before the backend update is complete, you can immediately submit the form as text only without losing your draft.
7. **Platform:** tested and built only for **Windows 10/11**.

---

## Roadmap and approximate timeframes

Dates are approximate—near-term releases are planned by week, while later releases use broader timeframes and may shift based on actual user feedback:

| Approximate timeframe | Planned release |
|---|---|
| **Late November — early December 2026** *(1–2 weeks)* | Fixes based on initial in-app feedback, full server-side support for photo/video feedback attachments, immediate background bridge shutdown when the window closes |
| **Second half of December 2026** | Built-in **Tasks and Projects** tracker (daily focus, board, calendar, cards) and support for any selected engine in the **Diary** tab |
| **January 2027** | Return of **local voice mode** (offline dictation without cloud services + spoken responses) and a simplified installer without manual `Node.js` and `Git` installation |
| **February — March 2027** | **Learning** section (an in-window lesson library and a free introductory course on AllY and release preparation), a custom widget builder, and review/content modules |
| **April — May 2027** | Interactive workspace **knowledge graph**, a **Project Health** panel (link coverage and outdated nodes), and full Qoder support as a code-reading assistant |
| **June — July 2027** | **Android client** beta with a secure connection to your home PC and no second database + desktop adaptation for macOS and Linux |
| **August 2027 onward** | Stable `v1.0` release, a shared community skills catalog, and workspace synchronization across multiple user devices |
