<div align="center">

# 📱 Claude Relay

**Control Claude Code from your phone via WhatsApp**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)

*Start tasks on your computer. Approve, monitor, and steer from your pocket.*

</div>

---

```
┌─────────────────┐              ┌──────────────────────────────────┐
│   📱 Phone      │              │   💻 Your Machine                │
│                 │   WhatsApp   │                                  │
│  "fix auth bug" │ ──────────►  │  whatsapp.js ──► bridge.py       │
│                 │              │                      │           │
│  Claude:        │  ◄────────── │                      ▼           │
│  "Fixed! The    │              │                ┌──────────┐      │
│   issue was..." │              │                │  tmux    │      │
│                 │              │                │  claude  │      │
└─────────────────┘              │                └──────────┘      │
                                 └──────────────────────────────────┘
```

## Why?

Running Claude Code from a phone terminal is painful — tiny screen, no code review, awkward keyboard. Claude Relay lets you use WhatsApp's native chat interface instead: type prompts, get responses, approve actions, all with push notifications.

**Ideal for:** babysitting long-running tasks, quick approvals, simple prompts, monitoring progress while away from your desk.

## Features

- 💬 **WhatsApp native** — Chat keyboard, voice-to-text, push notifications
- 🤖 **Claude Code integration** — Full CLI access through tmux
- 🧠 **Direct API mode** — Quick questions via `/ask` (no CLI needed)
- 🔒 **Phone whitelist** — Only your number(s) can interact
- 🔄 **Session persistence** — Claude keeps working when you disconnect
- ⚡ **Quick approvals** — Just send `1` or `2`

## Quick Start

### Prerequisites

| Tool | Install |
|------|---------|
| Node.js 18+ | `sudo apt install nodejs npm` |
| Python 3.8+ | `sudo apt install python3` |
| tmux | `sudo apt install tmux` |
| Claude Code | `npm install -g @anthropic-ai/claude-code` |

### Install & Run

```bash
git clone https://github.com/YOUR_USERNAME/claude-relay.git
cd claude-relay
cp .env.example .env
nano .env   # Set ALLOWED_NUMBERS at minimum
./start.sh
```

On first run, scan the QR code with WhatsApp (**Linked Devices → Link a Device**).

Then send `/help` to yourself on WhatsApp.

## Usage

### Commands

| Send | Does |
|------|------|
| `fix the login bug` | → Claude Code |
| `/cc refactor auth module` | → Claude Code (explicit) |
| `/ask explain OAuth2 in 3 sentences` | → Direct API (Sonnet) |
| `/status` | Show session info |
| `/stop` | Send Ctrl+C to Claude |
| `1` / `yes` / `approve` | Approve pending action |
| `2` / `no` / `reject` | Reject pending action |
| `continue` | Continue current task |
| `/help` | Show commands |

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

## Configuration

Copy `.env.example` to `.env`:

```bash
# Required — your phone number (country code + number, no + or spaces)
ALLOWED_NUMBERS=1234567890

# Optional — for /ask command (direct API queries)
ANTHROPIC_API_KEY=sk-ant-...

# Optional — defaults shown
CLAUDE_MODEL=claude-sonnet-4-20250514
TMUX_SESSION=claude-relay
CLAUDE_WORKSPACE=~/claude-workspace
READ_TIMEOUT=30
MAX_OUTPUT=3000
```

## Running in Background

### With tmux (simple)

```bash
tmux new -d -s relay './start.sh'

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
| Unauthorized access | Phone number whitelist (`ALLOWED_NUMBERS`) |
| WhatsApp session tokens | `.wwebjs_auth/` in `.gitignore`, `chmod 700` |
| API keys | `.env` in `.gitignore`, never committed |
| tmux session access | Runs as your user, standard Linux permissions |

### Recommended Additions

- **Tailscale** — Private network, no port forwarding
- **SSH hardening** — Key-only auth, fail2ban
- **Firewall** — UFW rules for minimal exposure

## Architecture

```
src/
├── whatsapp.js   # WhatsApp Web client (whatsapp-web.js + Puppeteer)
│                 # Handles: auth, QR code, message parsing, routing
│
└── bridge.py     # Python bridge
                  # Handles: tmux session management, Claude Code CLI,
                  #          Anthropic API calls, response extraction
```

**Message flow:**
1. WhatsApp message → `whatsapp.js` parses command
2. Spawns `bridge.py` with JSON on stdin
3. Bridge routes to Claude Code (tmux) or Anthropic API
4. Response JSON on stdout → WhatsApp reply

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code not showing | Delete `.wwebjs_auth/` and restart |
| "No active session" | tmux died — restart with `./start.sh` |
| WhatsApp disconnects | Re-scan QR (sessions expire periodically) |
| Responses truncated | Increase `MAX_OUTPUT` in `.env` |
| Claude Code not found | `npm install -g @anthropic-ai/claude-code` |

## Roadmap

- [ ] Voice message transcription (Whisper)
- [ ] File/image sharing
- [ ] Multiple conversation threads
- [ ] Rate limiting
- [ ] Telegram adapter
- [ ] Web dashboard for logs

## Contributing

Contributions welcome! This started as a personal tool — if you find it useful, PRs are appreciated.

## License

[MIT](LICENSE)
