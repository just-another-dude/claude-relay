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

## Features

- **WhatsApp native** — Chat keyboard, voice-to-text, push notifications
- **Claude Code integration** — Full CLI access through tmux
- **Direct API mode** — Quick questions via `/ask` (no CLI needed)
- **Voice messages** — Speak your prompts, they get transcribed and sent to Claude
- **Secure by default** — Group + sender whitelist authorization
- **Session persistence** — Claude keeps working when you disconnect
- **Quick approvals** — Just send `1` or `2`

## Quick Start

### Prerequisites

| Tool | Install |
|------|---------|
| Node.js 18+ | `sudo apt install nodejs npm` |
| Python 3.9+ | `sudo apt install python3` |
| tmux | `sudo apt install tmux` |
| Claude Code | `npm install -g @anthropic-ai/claude-code` |

### Install & Run

```bash
git clone https://github.com/just-another-dude/claude-relay.git
cd claude-relay
npm install
cp .env.example .env
nano .env   # Configure authorization (see below)
npm start
```

On first run, scan the QR code with WhatsApp (**Linked Devices → Link a Device**).

Then send `/help` to get started.

## Usage

### Commands

| Send | Does |
|------|------|
| `fix the login bug` | → Claude Code |
| `/cc refactor auth module` | → Claude Code (explicit) |
| `/ask explain OAuth2 in 3 sentences` | → Direct API (Sonnet) |
| `/status` | Show session info |
| `/stop` | Send Ctrl+C to Claude |
| `/groupid` | Show current chat ID |
| `1` / `yes` / `approve` | Approve pending action |
| `2` / `no` / `reject` | Reject pending action |
| `continue` | Continue current task |
| `/help` | Show commands |
| [Voice note] | Transcribe → Claude Code |

Messages without a prefix go to Claude Code by default.

### Workflow Example

```
You:     refactor the database connection pool
Claude:  ⚙️ Sending to Claude Code...
Claude:  I'll refactor the connection pool. I want to modify
         db/pool.py and db/config.py. [1] Approve [2] Reject

You:     1

Claude:  ✅ Done. Refactored connection pool to use async context
         managers. Added connection health checks and auto-retry...
```

### Voice Messages

Send a voice note and it will be:
1. Transcribed using your configured engine (Google, Whisper, or Vosk)
2. Sent to Claude Code as a text prompt
3. Response delivered back to WhatsApp

Requires [audio-transcriber](https://github.com/just-another-dude/audio-transcriber) to be set up (see Configuration).

## Configuration

Copy `.env.example` to `.env`:

```bash
# Authorization Mode 1: Group + Sender (recommended)
# Only accept messages from a specific group AND specific number
ALLOWED_GROUP_ID=123456789012345678@g.us
ALLOWED_NUMBER=1234567890

# Authorization Mode 2: Direct Messages (leave GROUP_ID empty)
# Only accepts messages you send to yourself
ALLOWED_GROUP_ID=
ALLOWED_NUMBER=

# To find your group ID, start the relay and send /groupid in the group
```

### Additional Options

```bash
# For /ask command (direct API queries)
ANTHROPIC_API_KEY=sk-ant-...

# Claude Code settings
CLAUDE_MODEL=claude-sonnet-4-20250514
TMUX_SESSION=claude-relay
CLAUDE_WORKSPACE=~/claude-workspace
READ_TIMEOUT=30
MAX_OUTPUT=3000

# Voice transcription (requires audio-transcriber)
TRANSCRIBER_PATH=~/git/audio-transcriber
TRANSCRIBER_ENGINE=google  # google, whisper, or vosk
```

## Running in Background

### With tmux (simple)

```bash
tmux new -d -s relay 'npm start'

# Check logs
tmux attach -t relay
# Detach: Ctrl+B then D
```

### With systemd (production)

```bash
sudo tee /etc/systemd/system/claude-relay.service << 'EOF'
[Unit]
Description=Claude Relay
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/claude-relay
ExecStart=/usr/bin/node src/whatsapp.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now claude-relay
sudo journalctl -u claude-relay -f
```

## Security

| Concern | Mitigation |
|---------|------------|
| Unauthorized access | Group ID + phone number whitelist |
| WhatsApp session tokens | `.wwebjs_auth/` in `.gitignore`, `chmod 700` |
| API keys | `.env` in `.gitignore`, never committed |
| tmux session access | Runs as your user, standard Linux permissions |

### Authorization Model

The relay uses a two-layer authorization:

1. **Group filter** — Only messages from the configured `ALLOWED_GROUP_ID` are processed
2. **Sender filter** — Only messages from `ALLOWED_NUMBER` within that group are acted on

If no group is configured, it falls back to "message yourself" mode (only your own direct messages work).

### Recommended Additions

- **Tailscale** — Private network, no port forwarding
- **SSH hardening** — Key-only auth, fail2ban
- **Firewall** — UFW rules for minimal exposure

## Architecture

```
src/
├── whatsapp.js   # WhatsApp Web client (whatsapp-web.js + Puppeteer)
│                 # Handles: auth, QR code, message parsing, routing,
│                 #          voice message handling, authorization
│
└── bridge.py     # Python bridge
                  # Handles: tmux session management, Claude Code CLI,
                  #          Anthropic API calls, audio transcription
```

**Message flow:**
1. WhatsApp message → `whatsapp.js` checks authorization & parses command
2. Spawns `bridge.py` with JSON on stdin
3. Bridge routes to Claude Code (tmux), Anthropic API, or transcriber
4. Response JSON on stdout → WhatsApp reply

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

## Roadmap

- [x] Voice message transcription
- [ ] File/image sharing
- [ ] Multiple conversation threads
- [ ] Rate limiting
- [ ] Telegram adapter
- [ ] Web dashboard for logs

## Development

```bash
# Run tests
npm test              # JavaScript tests
npm run test:py       # Python tests
npm run test:all      # All tests

# Linting
npm run lint:py       # Ruff check
npm run lint:fix      # Auto-fix lint issues
```

## Contributing

Contributions welcome! This started as a personal tool — if you find it useful, PRs are appreciated.

## License

[GPL-3.0](LICENSE)
