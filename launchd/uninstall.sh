#!/bin/bash
#
# Claude Relay launchd service uninstaller (macOS)
#
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Claude Relay - macOS launchd Service Uninstaller"
echo "================================================="
echo

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: This script is for macOS only.${NC}"
    exit 1
fi

PLIST_PATH="$HOME/Library/LaunchAgents/com.claude-relay.plist"

if [[ ! -f "$PLIST_PATH" ]]; then
    echo -e "${YELLOW}Service not installed.${NC}"
    exit 0
fi

echo "Stopping and unloading service..."

# Stop the service
launchctl stop com.claude-relay 2>/dev/null || true

# Unload the service
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Remove the plist
rm -f "$PLIST_PATH"

echo
echo -e "${GREEN}Service uninstalled successfully!${NC}"
echo
echo "Note: Log files in logs/ directory were not removed."
