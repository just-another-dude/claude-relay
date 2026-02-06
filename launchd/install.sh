#!/bin/bash
#
# Claude Relay launchd service installer (macOS)
#
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Claude Relay - macOS launchd Service Installer"
echo "==============================================="
echo

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: This script is for macOS only.${NC}"
    echo "For Linux, use the systemd installer: ./systemd/install.sh"
    exit 1
fi

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${RED}Error: Don't run this script as root.${NC}"
    echo "Run as your normal user."
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Verify we're in the right place
if [[ ! -f "$PROJECT_DIR/src/whatsapp.js" ]]; then
    echo -e "${RED}Error: Cannot find src/whatsapp.js${NC}"
    echo "Run this script from the claude-relay directory."
    exit 1
fi

# Check for .env file
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
    echo -e "${YELLOW}Warning: No .env file found.${NC}"
    echo "Make sure to create one before starting the service."
    echo
fi

# Check for node_modules
if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
    echo -e "${YELLOW}Warning: node_modules not found.${NC}"
    echo "Run 'npm install' before starting the service."
    echo
fi

# Find node path
NODE_PATH=$(which node 2>/dev/null || echo "/usr/local/bin/node")
if [[ ! -x "$NODE_PATH" ]]; then
    # Try Homebrew paths
    if [[ -x "/opt/homebrew/bin/node" ]]; then
        NODE_PATH="/opt/homebrew/bin/node"
    elif [[ -x "/usr/local/bin/node" ]]; then
        NODE_PATH="/usr/local/bin/node"
    else
        echo -e "${RED}Error: Cannot find node executable.${NC}"
        echo "Install Node.js via Homebrew: brew install node"
        exit 1
    fi
fi

echo "Configuration:"
echo "  User: $(whoami)"
echo "  Project directory: $PROJECT_DIR"
echo "  Node path: $NODE_PATH"
echo

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Create plist with correct paths
PLIST_SRC="$SCRIPT_DIR/com.claude-relay.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.claude-relay.plist"

# Ensure LaunchAgents directory exists
mkdir -p "$HOME/Library/LaunchAgents"

# Copy and customize plist
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|/usr/local/bin/node|$NODE_PATH|g" \
    "$PLIST_SRC" > "$PLIST_DEST"

echo "Installing launchd service..."

# Unload if already loaded
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Load the service
launchctl load "$PLIST_DEST"

echo
echo -e "${GREEN}Service installed successfully!${NC}"
echo
echo "Commands:"
echo "  Start:   launchctl start com.claude-relay"
echo "  Stop:    launchctl stop com.claude-relay"
echo "  Status:  launchctl list | grep claude-relay"
echo "  Logs:    tail -f $PROJECT_DIR/logs/launchd.log"
echo "  Errors:  tail -f $PROJECT_DIR/logs/launchd-error.log"
echo
echo "To start on login, edit the plist and set RunAtLoad to true:"
echo "  nano $PLIST_DEST"
echo
echo -e "${YELLOW}Note: On first run, you need to scan the QR code.${NC}"
echo "Run manually first: npm start"
echo "After authenticating, you can use the launchd service."
