<div align="center">

# Claude Relay

**Control Claude Code from your phone via WhatsApp**

[![CI](https://github.com/just-another-dude/claude-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/just-another-dude/claude-relay/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.9%2B-blue.svg)](https://www.python.org/)

*Start tasks on your computer. Approve, monitor, and steer from your pocket.*

</div>

---

```
┌─────────────────┐              ┌──────────────────────────────────────┐
│   Phone         │              │   Your Machine                       │
│                 │   WhatsApp   │                                      │
│  "fix auth bug" │ ──────────►  │  whatsapp.js ──► bridge.py           │
│                 │              │                      │               │
│  Claude:        │  ◄────────── │                      ▼               │
│  "Fixed! The    │              │                ┌──────────┐          │
│   issue was..." │              │                │  tmux    │          │
│                 │              │                │  claude  │          │
│  [Voice note]   │ ──────────►  │                └──────────┘          │
│                 │   transcribe │                      │               │
│                 │  ◄────────── │   audio-transcriber ─┘               │
└─────────────────┘              └──────────────────────────────────────┘
```

## Why?

Running Claude Code from a phone terminal is painful — tiny screen, no code review, awkward keyboard. Claude Relay lets you use WhatsApp's native chat interface instead: type prompts, get responses, approve actions, all with push notifications.

**Ideal for:** babysitting long-running tasks, quick approvals, simple prompts, monitoring progress while away from your desk.

## Install

```bash
git clone https://github.com/just-another-dude/claude-relay.git
cd claude-relay
./install.sh
```

The installer checks prerequisites, installs dependencies, and launches an interactive setup wizard that walks you through configuration. It takes about 2 minutes.

> **Prerequisites:** Node.js 18+, Python 3.9+, tmux, [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview).
> Install them first if needed:
> - **Linux:** `sudo apt install nodejs npm python3 tmux`
> - **macOS:** `brew install node python tmux`
> - **Then:** `npm install -g @anthropic-ai/claude-code`

After installation, start the relay and scan the QR code with WhatsApp (**Linked Devices > Link a Device**):

```bash
npm start
```

Send `/help` in WhatsApp to verify it's working.

> To reconfigure at any time: `npm run setup`

## Supervisor Mode

Supervisor mode is the recommended way to use Claude Relay. When enabled, an AI supervisor (Opus) sits between you and Claude Code. Instead of getting raw terminal output on your phone, you get clean, intelligent responses.

### What the supervisor does

The supervisor receives every message you send and decides the best way to handle it. It has six tools at its disposal:

| Tool | What it does |
|------|-------------|
| **Claude Code** | Sends prompts to the Claude Code CLI for coding, file edits, git operations, and complex development tasks |
| **Shell commands** | Runs commands directly (ls, git status, cat, etc.) for quick operations that don't need Claude Code |
| **Change directory** | Switches projects — creates or resumes per-project tmux sessions |
| **Session status** | Checks what Claude Code is doing, whether it needs approval, recent output |
| **Send approval** | Approves or rejects pending Claude Code actions on your behalf |
| **Stop** | Sends Ctrl+C to cancel the current operation |

The supervisor chooses the right tool automatically. Ask "what branch am I on?" and it runs `git branch`. Ask "refactor the auth module" and it delegates to Claude Code. Ask "what's the capital of France?" and it just answers directly — no tools needed.

### Why supervisor mode matters on mobile

Without supervisor mode, you get raw tmux terminal output — ANSI escape codes, prompt lines, truncated text. Supervisor mode transforms that into clean, readable messages optimized for a phone screen.

It also coordinates multi-step operations. If a task requires running a command, checking the output, then making a decision, the supervisor handles that loop internally and gives you one coherent response.

### Conversation memory

The supervisor remembers your conversation across messages. You can say "fix the login bug", then follow up with "now add a test for that" and it knows what "that" refers to. History persists until you send `/clear`.

### Enable it

Supervisor mode requires an Anthropic API key. The setup wizard (`./install.sh` or `npm run setup`) configures this for you. Or edit `.env` manually:

```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPERVISOR_ENABLED=true
SUPERVISOR_MODEL=claude-opus-4-6
```

Use `claude-sonnet-4-20250514` instead of `claude-opus-4-6` for faster, cheaper responses.

## Commands

| Send in WhatsApp | What happens |
|------|------|
| `fix the login bug` | Sent to Claude Code (or supervisor) |
| `/cc refactor auth module` | Explicitly send to Claude Code |
| `/ask explain OAuth2 in 3 sentences` | Direct API call (bypasses supervisor and Claude Code) |
| `/cd ~/git/my-project` | Switch to a project directory |
| `/pwd` | Show current session and workspace |
| `/sessions` | List all active Claude Code sessions |
| `/status` | Show session status and recent output |
| `/stop` | Send Ctrl+C to Claude Code |
| `/clear` | Clear supervisor conversation history |
| `/groupid` | Show the current chat's group ID |
| `1` / `yes` / `approve` | Approve pending action |
| `2` / `no` / `reject` | Reject pending action |
| `continue` | Continue current task |
| `/help` | Show command list |
| *[Voice note]* | Transcribed and sent to Claude Code |

Messages without a `/` prefix go to Claude Code by default (or to the supervisor, if enabled).

### Example conversation

```
You:     refactor the database connection pool
Claude:  ⚙️ Sending to Claude Code...
Claude:  I'll refactor the connection pool. I want to modify
         db/pool.py and db/config.py. [1] Approve [2] Reject

You:     1

Claude:  ✅ Done. Refactored connection pool to use async context
         managers. Added connection health checks and auto-retry.
```

## Configuration

The setup wizard (`npm run setup`) handles all of this interactively. For reference, here are all the options in `.env`:

```bash
# === Authorization ===
# Group mode (recommended): restrict to a specific WhatsApp group + sender
ALLOWED_GROUP_ID=123456789012345678@g.us
ALLOWED_NUMBER=1234567890

# Self-chat mode: leave both empty, only messages to yourself work
# To find your group ID: start the relay, send /groupid in the group

# === API Key ===
# Required for /ask, supervisor mode
ANTHROPIC_API_KEY=sk-ant-...

# === Claude Code ===
CLAUDE_MODEL=claude-sonnet-4-20250514
TMUX_SESSION=claude-relay
CLAUDE_WORKSPACE=~/claude-workspace
READ_TIMEOUT=30
MAX_OUTPUT=3000

# === Voice Transcription ===
# Requires https://github.com/just-another-dude/audio-transcriber
TRANSCRIBER_PATH=~/git/audio-transcriber
TRANSCRIBER_ENGINE=google     # google (free) or openai (Whisper API)
OPENAI_API_KEY=sk-...         # required for openai engine

# === Supervisor Mode ===
SUPERVISOR_ENABLED=true
SUPERVISOR_MODEL=claude-opus-4-6

# === Audit Logging ===
AUDIT_LOG_ENABLED=true
AUDIT_LOG_PATH=./logs/audit.log
```

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| **Linux** (Ubuntu/Debian) | Fully supported | Primary development platform |
| **Linux** (Other distros) | Fully supported | Use your package manager |
| **macOS** | Supported | Install deps via Homebrew |
| **Windows (WSL)** | Supported | Run inside WSL2 ([setup guide](#windows-wsl-setup)) |
| **Windows (Native)** | Not supported | tmux not available natively |

### Windows (WSL) Setup

<details>
<summary>Click to expand WSL setup steps</summary>

#### Prerequisites

1. **Install WSL2** (run in PowerShell as Administrator):
   ```powershell
   wsl --install
   ```
   This installs Ubuntu by default. Restart your computer when prompted.

2. **Open Ubuntu** from the Start menu and complete the initial setup (username/password).

3. **Recommended:** Install [Windows Terminal](https://aka.ms/terminal) for better QR code display.

#### Install Dependencies (inside WSL)

```bash
sudo apt update && sudo apt install -y nodejs npm python3 tmux
npm install -g @anthropic-ai/claude-code
```

#### Install Claude Relay

```bash
git clone https://github.com/just-another-dude/claude-relay.git
cd claude-relay
./install.sh
```

The installer automatically detects WSL and shows relevant tips.

#### WSL-Specific Notes

- **File access:** Your Windows files are at `/mnt/c/Users/<YourName>/`, but for best performance set `CLAUDE_WORKSPACE` to a path inside WSL (e.g., `~/projects`) rather than `/mnt/c/`
- **QR code:** The QR code displays in your WSL terminal window — use Windows Terminal for best rendering
- **Keep WSL running:** The relay needs the WSL window to stay open. Use tmux inside WSL to keep it running:
  ```bash
  tmux new -d -s relay 'npm start'
  ```
- **Autostart:** WSL doesn't use systemd by default. Use tmux or [enable systemd in WSL](https://learn.microsoft.com/en-us/windows/wsl/systemd) if you want the service to start automatically

</details>

### Manual Installation

<details>
<summary>Click to expand manual steps</summary>

```bash
git clone https://github.com/just-another-dude/claude-relay.git
cd claude-relay
npm install
cp .env.example .env
nano .env   # configure authorization and API key
npm start
```

</details>

## Running in Background

### With tmux (all platforms)

```bash
tmux new -d -s relay 'npm start'

# Check logs
tmux attach -t relay
# Detach: Ctrl+B then D
```

### With systemd (Linux only)

```bash
./systemd/install.sh
sudo systemctl start claude-relay@$USER
sudo systemctl enable claude-relay@$USER    # start on boot
journalctl -u claude-relay@$USER -f         # view logs
```

To uninstall: `./systemd/uninstall.sh`

### With launchd (macOS only)

```bash
./launchd/install.sh
launchctl start com.claude-relay
tail -f logs/launchd.log                    # view logs
```

To uninstall: `./launchd/uninstall.sh`

> **Note:** Run `npm start` manually first to scan the QR code. After WhatsApp is authenticated, you can switch to background service.

## Security

| Concern | Mitigation |
|---------|------------|
| Unauthorized access | Group ID + phone number whitelist |
| WhatsApp session tokens | `.wwebjs_auth/` in `.gitignore`, `chmod 700` |
| API keys | `.env` in `.gitignore`, never committed |
| tmux session access | Runs as your user, standard Linux permissions |

### Authorization Model

Two-layer authorization:

1. **Group filter** — Only messages from the configured `ALLOWED_GROUP_ID` are processed
2. **Sender filter** — Only messages from `ALLOWED_NUMBER` within that group are acted on

If no group is configured, it falls back to "message yourself" mode (only your own direct messages work).

### Audit Logging

All commands and authorization attempts are logged to `logs/audit.log` (JSON format):

```bash
tail -f logs/audit.log | jq .              # live feed
grep AUTH_REJECT logs/audit.log | jq .     # rejected attempts
```

Log events: `SERVICE_START`, `SERVICE_STOP`, `AUTH_REJECT`, `CMD_RECEIVED`, `CMD_SUCCESS`, `CMD_ERROR`, `VOICE_RECEIVED`, `VOICE_TRANSCRIBED`, `VOICE_SUCCESS`.

## Architecture

```
src/
├── whatsapp.js   # WhatsApp Web client (whatsapp-web.js + Puppeteer)
│                 # Handles: auth, QR code, message parsing, routing,
│                 #          voice message handling, authorization
│
├── bridge.py     # Python bridge
│                 # Handles: tmux session management, Claude Code CLI,
│                 #          Anthropic API calls, supervisor, audio transcription
│
└── setup.js      # Interactive setup wizard (inquirer)
                  # Handles: configuration prompts, .env generation, validation
```

**Message flow:**
1. WhatsApp message arrives in `whatsapp.js` — authorization check, command parsing
2. Spawns `bridge.py` with JSON on stdin
3. Bridge routes to supervisor, Claude Code (tmux), Anthropic API, or transcriber
4. Response JSON on stdout back to WhatsApp

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code not showing | Delete `.wwebjs_auth/` and restart |
| "No active session" | tmux died — restart with `npm start` |
| WhatsApp disconnects | Re-scan QR (sessions expire periodically) |
| Responses truncated | Increase `MAX_OUTPUT` in `.env` |
| Claude Code not found | `npm install -g @anthropic-ai/claude-code` |
| Voice transcription fails | Check `TRANSCRIBER_PATH` and engine setup |
| Messages ignored | Check `ALLOWED_GROUP_ID` and `ALLOWED_NUMBER` |
| Supervisor errors | Check `ANTHROPIC_API_KEY` is set and valid |

## Development

```bash
npm test              # JavaScript tests (whatsapp + setup)
npm run test:py       # Python tests
npm run test:all      # All tests
npm run lint:py       # Ruff linting
npm run setup         # Re-run setup wizard
```

## Roadmap

- [x] Supervisor mode (AI orchestrates all actions)
- [x] Voice message transcription (Google, OpenAI Whisper)
- [x] Per-project persistent sessions
- [x] Audit logging
- [x] Interactive setup wizard
- [x] Systemd + launchd services
- [x] macOS and Windows (WSL) support
- [ ] File/image sharing
- [ ] Multiple conversation threads
- [ ] Rate limiting
- [ ] Telegram adapter
- [ ] Web dashboard for logs

## Contributing

Contributions welcome! This started as a personal tool — if you find it useful, PRs are appreciated.

## License

[GPL-3.0](LICENSE)
