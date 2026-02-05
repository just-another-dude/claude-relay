# CLAUDE.md - Claude Relay Project Context

## Project Overview
WhatsApp → Claude bridge for mobile control of Claude Code. Single-user, self-hosted.

## Architecture
```
WhatsApp (phone) → whatsapp-web.js (Node) → bridge.py (Python) → Claude Code CLI / Anthropic API
                                                    ↓
                                               tmux session
```

## Key Files
- `src/whatsapp.js` - WhatsApp Web client, message routing
- `src/bridge.py` - Claude Code/API interface, tmux management
- `.env` - Configuration (phone whitelist, API key)

## Commands
| WhatsApp Message | Action |
|-----------------|--------|
| `/cc <prompt>` | Send to Claude Code |
| `/ask <prompt>` | Direct API call |
| `/status` | Get session status |
| `/stop` | Send Ctrl+C |
| `1` or `yes` | Approve |
| `2` or `no` | Reject |
| `continue` | Continue task |

## Tech Stack
- Node.js + whatsapp-web.js (WhatsApp connection)
- Python 3 (Claude bridge)
- tmux (session persistence)
- Anthropic SDK (direct API)

## Development Guidelines

### Adding New Commands
1. Add case in `parseCommand()` in whatsapp.js
2. Add handler in switch statement in message handler
3. Add corresponding function in bridge.py if needed

### Testing Changes
1. Stop current instance (Ctrl+C)
2. Make changes
3. Run `./start.sh`
4. Test via WhatsApp

### Common Issues
- **QR code not showing**: Delete `.wwebjs_auth/` and restart
- **"No session" errors**: tmux session died, restart
- **Truncated responses**: Increase MAX_OUTPUT in .env

## Security Considerations
- ALLOWED_NUMBERS whitelist is critical
- WhatsApp session stored in `.wwebjs_auth/` - keep secure
- API key in `.env` - never commit
- tmux session has full shell access

## Future Improvements
- [ ] Voice message transcription
- [ ] File sharing support
- [ ] Multiple conversation threads
- [ ] Rate limiting
- [ ] Better response extraction from tmux
- [ ] Systemd service for auto-start
