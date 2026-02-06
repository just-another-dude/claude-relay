#!/bin/bash
#
# Claude Relay - One-command installer
# Works on Linux and macOS
#
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo
echo -e "${BOLD}Claude Relay Installer${NC}"
echo "======================="
echo

# Detect OS
OS="unknown"
IS_WSL=false
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    # Detect WSL (Windows Subsystem for Linux)
    if [[ -f /proc/version ]] && grep -qi "microsoft\|WSL" /proc/version 2>/dev/null; then
        IS_WSL=true
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    echo -e "${RED}Unsupported OS: $OSTYPE${NC}"
    echo "Claude Relay supports Linux, macOS, and Windows (via WSL2)."
    exit 1
fi

if [[ "$IS_WSL" == true ]]; then
    echo -e "Detected OS: ${GREEN}linux (WSL)${NC}"
else
    echo -e "Detected OS: ${GREEN}$OS${NC}"
fi

# Check prerequisites
echo
echo -e "${BOLD}Checking prerequisites...${NC}"
MISSING=""

check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "  $1: ${GREEN}OK${NC}"
        return 0
    else
        echo -e "  $1: ${RED}MISSING${NC}"
        MISSING="$MISSING $1"
        return 1
    fi
}

check_command node
check_command python3
check_command tmux

# Check Claude Code
if command -v claude &> /dev/null; then
    echo -e "  claude: ${GREEN}OK${NC}"
else
    echo -e "  claude: ${RED}MISSING${NC}"
    MISSING="$MISSING claude"
fi

if [[ -n "$MISSING" ]]; then
    echo
    echo -e "${YELLOW}Missing dependencies:${BOLD}$MISSING${NC}"
    echo
    if [[ "$OS" == "linux" ]]; then
        echo "Install with:"
        echo "  sudo apt update && sudo apt install -y nodejs npm python3 tmux"
        echo "  npm install -g @anthropic-ai/claude-code"
    else
        echo "Install with:"
        echo "  brew install node python tmux"
        echo "  npm install -g @anthropic-ai/claude-code"
    fi
    echo
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install npm dependencies
echo
echo -e "${BOLD}Installing npm dependencies...${NC}"
npm install

# Setup .env file
if [[ ! -f .env ]]; then
    echo
    echo -e "${BOLD}Setting up configuration...${NC}"
    cp .env.example .env

    echo
    echo -e "${BLUE}Configuration options:${NC}"
    echo "1. Group mode (recommended) - Control from a WhatsApp group"
    echo "2. Self-chat mode - Control by messaging yourself"
    echo
    read -p "Choose mode (1/2): " -n 1 -r MODE
    echo

    if [[ "$MODE" == "1" ]]; then
        echo
        echo "To find your Group ID:"
        echo "  1. Start the relay: npm start"
        echo "  2. Send /groupid in your WhatsApp group"
        echo "  3. Copy the ID (looks like: 120363424984613855@g.us)"
        echo
        read -p "Enter Group ID (or press Enter to set later): " GROUP_ID
        read -p "Enter your phone number (no + or spaces, e.g., 1234567890): " PHONE

        if [[ -n "$GROUP_ID" ]]; then
            sed -i.bak "s/^ALLOWED_GROUP_ID=.*/ALLOWED_GROUP_ID=$GROUP_ID/" .env
        fi
        if [[ -n "$PHONE" ]]; then
            sed -i.bak "s/^ALLOWED_NUMBER=.*/ALLOWED_NUMBER=$PHONE/" .env
        fi
        rm -f .env.bak
    fi

    echo
    read -p "Enter Anthropic API key (for /ask and supervisor mode, or Enter to skip): " API_KEY
    if [[ -n "$API_KEY" ]]; then
        sed -i.bak "s/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$API_KEY/" .env
        # Enable supervisor mode by default if API key provided
        sed -i.bak "s/^SUPERVISOR_ENABLED=.*/SUPERVISOR_ENABLED=true/" .env
        rm -f .env.bak
    fi

    echo
    echo -e "${GREEN}Configuration saved to .env${NC}"
    echo "You can edit it later: nano .env"
else
    echo
    echo -e "${YELLOW}.env already exists, skipping configuration${NC}"
fi

# Offer to install as service
echo
echo -e "${BOLD}Background service (optional)${NC}"
if [[ "$OS" == "linux" ]]; then
    read -p "Install systemd service? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./systemd/install.sh
    fi
else
    read -p "Install launchd service? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./launchd/install.sh
    fi
fi

# WSL-specific tips
if [[ "$IS_WSL" == true ]]; then
    echo
    echo -e "${BOLD}WSL Tips${NC}"
    echo "  - Your Windows files are at /mnt/c/Users/<YourName>/"
    echo "  - Set CLAUDE_WORKSPACE to a WSL path (not /mnt/c/) for best performance"
    echo "  - The QR code will display in your WSL terminal (Windows Terminal recommended)"
    echo "  - Keep this WSL window open while the relay is running"
fi

# Done!
echo
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo
echo "Next steps:"
echo -e "  1. Run: ${BOLD}npm start${NC}"
echo "  2. Scan the QR code with WhatsApp (Linked Devices → Link a Device)"
echo "  3. Send /help in WhatsApp to get started"
echo
if [[ ! -f .env ]] || grep -q "^ALLOWED_GROUP_ID=$" .env; then
    echo -e "${YELLOW}Don't forget to configure your Group ID:${NC}"
    echo "  1. Send /groupid in your WhatsApp group"
    echo "  2. Add it to .env: nano .env"
    echo
fi
