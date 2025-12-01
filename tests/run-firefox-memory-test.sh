#!/bin/bash
# run-firefox-memory-test.sh - Monitor memory during Firefox PDF load
# Only tracks and kills processes spawned by THIS test (not system-wide Firefox)
# WILL AUTO-KILL spawned processes if memory exceeds 6GB

set -euo pipefail

OUTPUT_DIR="test-results"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
MEMORY_LOG="$OUTPUT_DIR/firefox-memory-${TIMESTAMP}.txt"
KILL_THRESHOLD=6000  # 6GB - auto-kill if exceeded
TRACKED_PIDS_FILE=$(mktemp)

echo "=== Firefox Memory Test ===" | tee "$MEMORY_LOG"
echo "PDF: demo/natgeo-1969-05.pdf (13 MB)" | tee -a "$MEMORY_LOG"
echo "Started: $(date)" | tee -a "$MEMORY_LOG"
echo "Kill threshold: ${KILL_THRESHOLD} MB" | tee -a "$MEMORY_LOG"
echo "PID tracking file: ${TRACKED_PIDS_FILE}" | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

# Capture existing Firefox/Playwright PIDs before test starts
capture_existing_pids() {
    pgrep -f "firefox|Web Content|playwright" 2>/dev/null | sort -n > "${TRACKED_PIDS_FILE}.baseline" || true
}

# Get PIDs spawned after the test started (new PIDs not in baseline)
get_spawned_pids() {
    local current_pids
    current_pids=$(pgrep -f "firefox|Web Content|playwright" 2>/dev/null | sort -n || true)

    if [ -f "${TRACKED_PIDS_FILE}.baseline" ]; then
        # Return only PIDs that weren't in the baseline
        comm -13 "${TRACKED_PIDS_FILE}.baseline" <(echo "$current_pids") 2>/dev/null || echo "$current_pids"
    else
        echo "$current_pids"
    fi
}

# Get total memory of only the spawned processes (in MB)
get_spawned_memory_mb() {
    local spawned_pids
    spawned_pids=$(get_spawned_pids)

    if [ -z "$spawned_pids" ]; then
        echo "0"
        return
    fi

    local total_kb=0
    for pid in $spawned_pids; do
        if [ -f "/proc/$pid/status" ]; then
            local rss_kb
            rss_kb=$(grep -i "^VmRSS:" "/proc/$pid/status" 2>/dev/null | awk '{print $2}' || echo "0")
            total_kb=$((total_kb + rss_kb))
        fi
    done

    # Convert KB to MB
    echo "scale=1; $total_kb / 1024" | bc -l
}

# Count spawned processes
get_spawned_count() {
    local spawned_pids
    spawned_pids=$(get_spawned_pids)
    if [ -z "$spawned_pids" ]; then
        echo "0"
    else
        echo "$spawned_pids" | wc -w
    fi
}

# Function to kill ONLY the spawned processes
kill_spawned_processes() {
    local spawned_pids
    spawned_pids=$(get_spawned_pids)

    echo "" | tee -a "$MEMORY_LOG"
    echo "!!! KILLING SPAWNED PROCESSES - MEMORY EXCEEDED ${KILL_THRESHOLD} MB !!!" | tee -a "$MEMORY_LOG"

    if [ -n "$spawned_pids" ]; then
        echo "Killing PIDs: $spawned_pids" | tee -a "$MEMORY_LOG"
        for pid in $spawned_pids; do
            kill -9 "$pid" 2>/dev/null || true
        done
    fi

    cleanup
    exit 1
}

# Cleanup temp files
cleanup() {
    rm -f "${TRACKED_PIDS_FILE}" "${TRACKED_PIDS_FILE}.baseline" 2>/dev/null || true
}
trap cleanup EXIT

# Start memory monitoring in background
monitor_memory() {
    echo "Time(s) | Spawned RSS (MB) | Spawned Procs" | tee -a "$MEMORY_LOG"
    echo "--------|------------------|---------------" | tee -a "$MEMORY_LOG"

    local sample=0

    while true; do
        local current_mem
        current_mem=$(get_spawned_memory_mb)

        local proc_count
        proc_count=$(get_spawned_count)

        printf "%7d | %16.1f | %13d\n" $((sample * 5)) "$current_mem" "$proc_count" | tee -a "$MEMORY_LOG"

        # Check if we need to kill
        if (( $(echo "$current_mem > $KILL_THRESHOLD" | bc -l) )); then
            kill_spawned_processes
        fi

        sample=$((sample + 1))
        sleep 5
    done
}

# Capture baseline PIDs BEFORE launching test
echo "Capturing baseline PIDs..." | tee -a "$MEMORY_LOG"
capture_existing_pids
BASELINE_COUNT=$(wc -l < "${TRACKED_PIDS_FILE}.baseline" 2>/dev/null || echo "0")
echo "Found $BASELINE_COUNT existing Firefox/Playwright processes" | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

# Start monitoring BEFORE launching test
monitor_memory &
MONITOR_PID=$!

# Give monitor time to start
sleep 2

# Run the Playwright test with Firefox
echo "" | tee -a "$MEMORY_LOG"
echo "Starting Playwright test with Firefox..." | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

npx playwright test tests/firefox-memory-test.spec.js --project=firefox 2>&1 | tee -a "$MEMORY_LOG" &
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
    echo "Initial memory (spawned): ${INITIAL} MB" | tee -a "$MEMORY_LOG"
    echo "Peak memory (spawned): ${PEAK} MB" | tee -a "$MEMORY_LOG"
    INCREASE=$(echo "$PEAK - $INITIAL" | bc -l)
    echo "Memory increase: ${INCREASE} MB" | tee -a "$MEMORY_LOG"
fi

echo ""
echo "Results saved to: $MEMORY_LOG"
