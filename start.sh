#!/bin/bash
#===============================================================================
# Claude Relay - Startup Script
#===============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "═══════════════════════════════════════"
echo "  Claude Relay - Setup & Start"
echo "═══════════════════════════════════════"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js not found. Install with: sudo apt install nodejs npm"
fi
log "Node.js: $(node --version)"

# Check Python
if ! command -v python3 &> /dev/null; then
    error "Python3 not found. Install with: sudo apt install python3"
fi
log "Python: $(python3 --version)"

# Check tmux
if ! command -v tmux &> /dev/null; then
    error "tmux not found. Install with: sudo apt install tmux"
fi
log "tmux: $(tmux -V)"

# Check Claude Code
if ! command -v claude &> /dev/null; then
    warn "Claude Code CLI not found"
    warn "Install with: npm install -g @anthropic-ai/claude-code"
    warn "The bridge will still work but /cc commands will fail"
else
    log "Claude Code: found"
fi

# Check .env
if [[ ! -f .env ]]; then
    warn ".env file not found"
    if [[ -f .env.example ]]; then
        echo ""
        read -p "Create .env from example? [Y/n] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            cp .env.example .env
            log "Created .env - please edit it with your settings"
            echo ""
            echo "Required: Set ALLOWED_NUMBERS to your phone number"
            echo "Optional: Set ANTHROPIC_API_KEY for /ask command"
            echo ""
            read -p "Edit .env now? [Y/n] " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
                ${EDITOR:-nano} .env
            fi
        fi
    else
        error ".env.example not found"
    fi
fi

# Install Node dependencies
if [[ ! -d node_modules ]]; then
    log "Installing Node.js dependencies..."
    npm install
fi

# Install Python dependencies (optional)
if python3 -c "import anthropic" 2>/dev/null; then
    log "Anthropic Python SDK: installed"
else
    warn "Anthropic Python SDK not installed"
    echo ""
    read -p "Install it for /ask command support? [Y/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        pip3 install anthropic --break-system-packages 2>/dev/null || pip3 install anthropic
        log "Installed anthropic SDK"
    fi
fi

# Create workspace directory
WORKSPACE="${CLAUDE_WORKSPACE:-$HOME/claude-workspace}"
if [[ ! -d "$WORKSPACE" ]]; then
    mkdir -p "$WORKSPACE"
    log "Created workspace: $WORKSPACE"
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Starting Claude Relay"
echo "═══════════════════════════════════════"
echo ""
echo "First run: You'll need to scan a QR code with WhatsApp"
echo "Subsequent runs: Auto-connects using saved session"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Run
exec node src/whatsapp.js
