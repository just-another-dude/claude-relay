#!/bin/bash
#
# Claude Relay systemd service installer
#
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Claude Relay - systemd Service Installer"
echo "========================================="
echo

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${RED}Error: Don't run this script as root.${NC}"
    echo "Run as your normal user - it will use sudo when needed."
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

# Get current user
CURRENT_USER=$(whoami)
SERVICE_NAME="claude-relay@${CURRENT_USER}.service"

echo "Configuration:"
echo "  User: $CURRENT_USER"
echo "  Project directory: $PROJECT_DIR"
echo "  Service name: $SERVICE_NAME"
echo

# Create service file with correct paths
SERVICE_FILE="/tmp/claude-relay@.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claude Relay - WhatsApp to Claude Code Bridge
Documentation=https://github.com/just-another-dude/claude-relay
After=network.target

[Service]
Type=simple
User=%i
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/node src/whatsapp.js
Restart=on-failure
RestartSec=10

# Environment
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=claude-relay

[Install]
WantedBy=multi-user.target
EOF

echo "Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/claude-relay@.service
sudo systemctl daemon-reload

echo
echo -e "${GREEN}Service installed successfully!${NC}"
echo
echo "Commands:"
echo "  Start:   sudo systemctl start $SERVICE_NAME"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    journalctl -u $SERVICE_NAME -f"
echo "  Enable:  sudo systemctl enable $SERVICE_NAME  (start on boot)"
echo
echo -e "${YELLOW}Note: On first run, you need to scan the QR code.${NC}"
echo "Run manually first: npm start"
echo "After authenticating, you can use the systemd service."
