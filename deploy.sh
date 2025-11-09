#!/bin/bash
# Deploy PDF-grid to nearlyfreespeech.net
# Deploys index.html to /home/public/pdf/

set -e  # Exit on error

REMOTE_HOST="ssh.nyc1.nearlyfreespeech.net"
REMOTE_USER="jessehiemstra_jessehiemstra"
REMOTE_DIR="/home/public/pdf"
LOCAL_FILE="index.html"

echo "Deploying PDF-grid to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
echo "----------------------------------------"

# Check if local file exists
if [ ! -f "$LOCAL_FILE" ]; then
    echo "ERROR: $LOCAL_FILE not found!"
    exit 1
fi

# Deploy via SCP
scp "$LOCAL_FILE" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "----------------------------------------"
echo "Deployment complete!"
echo "File deployed: $LOCAL_FILE"
echo "Remote location: ${REMOTE_DIR}/"
