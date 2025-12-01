#!/bin/bash
# Deploy PDF-grid development branch to nearlyfreespeech.net
# Deploys index.html and demo/ folder to /home/public/pdf-dev/

set -e  # Exit on error

REMOTE_HOST="ssh.nyc1.nearlyfreespeech.net"
REMOTE_USER="jessehiemstra_jessehiemstra"
REMOTE_DIR="/home/public/pdf-dev"
LOCAL_FILE="index.html"
LOCAL_DEMO_DIR="demo"

echo "Deploying PDF-grid (development) to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
echo "----------------------------------------"

# Check if local files exist
if [ ! -f "$LOCAL_FILE" ]; then
    echo "ERROR: $LOCAL_FILE not found!"
    exit 1
fi

if [ ! -d "$LOCAL_DEMO_DIR" ]; then
    echo "ERROR: $LOCAL_DEMO_DIR directory not found!"
    exit 1
fi

# Ensure remote directory structure exists
echo "Creating remote directory structure..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}/demo"

# Deploy index.html
echo "Deploying index.html..."
scp "$LOCAL_FILE" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

# Deploy demo folder contents (files under 15MB only)
echo "Deploying demo folder (files under 15MB)..."
find "${LOCAL_DEMO_DIR}" -type f -size -15M -exec scp {} "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/demo/" \;

echo "----------------------------------------"
echo "Deployment complete!"
echo "Files deployed:"
echo "  - $LOCAL_FILE"
echo "  - $LOCAL_DEMO_DIR/ (files under 15MB)"
echo "Remote location: ${REMOTE_DIR}/"
echo "Live at: https://www.jessehiemstra.com/pdf-dev/"
