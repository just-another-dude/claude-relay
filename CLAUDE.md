# CLAUDE.md - Claude Relay Project Context

## Project Overview
WhatsApp to Claude Code bridge for mobile control. Single-user, self-hosted.

## Architecture
```
WhatsApp (phone) → whatsapp-web.js (Node) → bridge.py (Python) → Claude Code CLI / Anthropic API
                                                    ↓
                                               tmux session
                                                    ↓
                                          audio-transcriber (voice messages)
```

## Key Files
- `src/whatsapp.js` - WhatsApp Web client, message routing, authorization, voice handling
- `src/bridge.py` - Claude Code/API interface, tmux management, audio transcription
- `.env` - Configuration (group whitelist, sender whitelist, API key)
- `tests/test_whatsapp.js` - JavaScript unit tests (22 tests)
- `tests/test_bridge.py` - Python unit tests (33 tests)

## Commands
| WhatsApp Message | Action |
|-----------------|--------|
| `/cc <prompt>` | Send to Claude Code |
| `/ask <prompt>` | Direct API call |
| `/status` | Get session status |
| `/stop` | Send Ctrl+C |
| `/groupid` | Show current chat ID |
| `1` or `yes` | Approve |
| `2` or `no` | Reject |
| `continue` | Continue task |
| [Voice note] | Transcribe → Claude Code |

## Authorization Model
Two-layer security:
1. **Group filter** - `ALLOWED_GROUP_ID` restricts to specific WhatsApp group
2. **Sender filter** - `ALLOWED_NUMBER` restricts to specific phone number

If no group configured, falls back to "message yourself" mode.

## Tech Stack
- Node.js + whatsapp-web.js (WhatsApp connection)
- Python 3.9+ (Claude bridge)
- tmux (session persistence)
- Anthropic SDK (direct API)
- audio-transcriber (voice message transcription)

## Development

### Running Tests
```bash
npm test              # JavaScript tests
npm run test:py       # Python tests
npm run test:all      # All tests
```

### Linting
```bash
npm run lint:py       # Ruff check
npm run lint:fix      # Auto-fix
```

### Adding New Commands
1. Add case in `parseCommand()` in whatsapp.js
2. Add handler in switch statement in message handler
3. Add corresponding function in bridge.py if needed
4. Add unit tests for the new command

### Testing Changes
1. Stop current instance (Ctrl+C)
2. Make changes
3. Run tests: `npm run test:all`
4. Run `npm start`
5. Test via WhatsApp

### Common Issues
- **QR code not showing**: Delete `.wwebjs_auth/` and restart
- **"No session" errors**: tmux session died, restart
- **Truncated responses**: Increase MAX_OUTPUT in .env
- **Messages ignored**: Check ALLOWED_GROUP_ID and ALLOWED_NUMBER

## Security Considerations
- Group + sender whitelist is critical security layer
- WhatsApp session stored in `.wwebjs_auth/` - keep secure
- API key in `.env` - never commit
- tmux session has full shell access

## CI/CD
GitHub Actions workflow runs:
- JavaScript tests
- Python tests with coverage
- Ruff linting
- Bandit security scanning
