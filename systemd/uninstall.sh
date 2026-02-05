#!/bin/bash
#
# Claude Relay systemd service uninstaller
#
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "Claude Relay - systemd Service Uninstaller"
echo "==========================================="
echo

CURRENT_USER=$(whoami)
SERVICE_NAME="claude-relay@${CURRENT_USER}.service"

echo "Stopping and disabling service..."
sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true

echo "Removing service file..."
sudo rm -f /etc/systemd/system/claude-relay@.service
sudo systemctl daemon-reload

echo
echo -e "${GREEN}Service uninstalled successfully.${NC}"
