#!/bin/bash
# run-natgeo-memory-test.sh - Monitor memory during natgeo PDF load
# WILL AUTO-KILL if memory exceeds 6GB

set -euo pipefail

OUTPUT_DIR="test-results"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
MEMORY_LOG="$OUTPUT_DIR/natgeo-memory-${TIMESTAMP}.txt"
KILL_THRESHOLD=6000  # 6GB - auto-kill if exceeded

echo "=== NatGeo Memory Test ===" | tee "$MEMORY_LOG"
echo "PDF: demo/natgeo-1969-05.pdf (13 MB)" | tee -a "$MEMORY_LOG"
echo "Started: $(date)" | tee -a "$MEMORY_LOG"
echo "Kill threshold: ${KILL_THRESHOLD} MB" | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

# Function to get total memory of all playwright-related processes (in MB)
get_playwright_memory_mb() {
    local mem
    mem=$(ps aux | awk '
        /playwright|chromium|chrome-linux|isolated.*web/ && !/awk/ {
            sum += $6
        }
        END {
            if (NR > 0) print sum/1024
            else print 0
        }
    ')
    echo "$mem"
}

# Function to kill all playwright processes
kill_playwright() {
    echo ""
    echo "!!! KILLING PLAYWRIGHT PROCESSES - MEMORY EXCEEDED ${KILL_THRESHOLD} MB !!!" | tee -a "$MEMORY_LOG"
    pkill -f "playwright|chromium|chrome-linux" || true
    exit 1
}

# Start memory monitoring in background
monitor_memory() {
    echo "Time(s) | Total RSS (MB) | Processes" | tee -a "$MEMORY_LOG"
    echo "--------|----------------|------------" | tee -a "$MEMORY_LOG"

    local sample=0

    while true; do
        local current_mem
        current_mem=$(get_playwright_memory_mb)

        # Count number of playwright-related processes
        local proc_count
        proc_count=$(ps aux | grep -E "playwright|chromium|chrome-linux|isolated.*web" | grep -v grep | wc -l)

        printf "%7d | %14.1f | %10d\n" $((sample * 5)) "$current_mem" "$proc_count" | tee -a "$MEMORY_LOG"

        # Check if we need to kill
        if (( $(echo "$current_mem > $KILL_THRESHOLD" | bc -l) )); then
            kill_playwright
        fi

        sample=$((sample + 1))
        sleep 5
    done
}

# Start monitoring BEFORE launching test
monitor_memory &
MONITOR_PID=$!

# Give monitor time to start
sleep 2

# Run the Playwright test
echo "" | tee -a "$MEMORY_LOG"
echo "Starting Playwright test with natgeo-1969-05.pdf..." | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

npx playwright test tests/natgeo-memory-test.spec.js --project=chromium 2>&1 | tee -a "$MEMORY_LOG" &
TEST_PID=$!

# Wait for test to complete
wait $TEST_PID || true

# Continue monitoring for 15 more seconds after test completes
echo "" | tee -a "$MEMORY_LOG"
echo "Test complete. Monitoring 15 more seconds..." | tee -a "$MEMORY_LOG"
sleep 15

# Stop monitoring
kill $MONITOR_PID 2>/dev/null || true
wait $MONITOR_PID 2>/dev/null || true

# Analyze results
echo "" | tee -a "$MEMORY_LOG"
echo "=== Results ===" | tee -a "$MEMORY_LOG"

PEAK=$(grep -E "^\s*[0-9]+\s+\|" "$MEMORY_LOG" | awk '{print $3}' | sort -n | tail -1)
INITIAL=$(grep -E "^\s*0\s+\|" "$MEMORY_LOG" | head -1 | awk '{print $3}')

if [ -n "$PEAK" ] && [ -n "$INITIAL" ]; then
    echo "Initial memory: ${INITIAL} MB" | tee -a "$MEMORY_LOG"
    echo "Peak memory: ${PEAK} MB" | tee -a "$MEMORY_LOG"
    INCREASE=$(echo "$PEAK - $INITIAL" | bc -l)
    echo "Memory increase: ${INCREASE} MB" | tee -a "$MEMORY_LOG"
fi

echo ""
echo "Results saved to: $MEMORY_LOG"
