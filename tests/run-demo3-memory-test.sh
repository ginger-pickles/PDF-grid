#!/bin/bash
# run-demo3-memory-test.sh - Monitor Playwright browser memory during test

set -euo pipefail

OUTPUT_DIR="test-results"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
MEMORY_LOG="$OUTPUT_DIR/demo3-memory-${TIMESTAMP}.txt"

echo "=== Demo-3 Memory Test ===" | tee "$MEMORY_LOG"
echo "Started: $(date)" | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

# Function to get total memory of all playwright-related processes (in MB)
get_playwright_memory_mb() {
    # Find all processes matching playwright, chromium, npm exec, or node playwright
    # This captures: npm, node, Chrome binary, renderer processes, isolated containers
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

# Start memory monitoring in background
monitor_memory() {
    echo "Time(s) | Total RSS (MB) | Processes" | tee -a "$MEMORY_LOG"
    echo "--------|----------------|------------" | tee -a "$MEMORY_LOG"

    local sample=0
    local max_mem=0

    while true; do
        local current_mem
        current_mem=$(get_playwright_memory_mb)

        # Count number of playwright-related processes
        local proc_count
        proc_count=$(ps aux | grep -E "playwright|chromium|chrome-linux|isolated.*web" | grep -v grep | wc -l)

        # Track maximum
        if (( $(echo "$current_mem > $max_mem" | bc -l) )); then
            max_mem="$current_mem"
        fi

        printf "%7d | %14.1f | %10d\n" $((sample * 5)) "$current_mem" "$proc_count" | tee -a "$MEMORY_LOG"
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
echo "Starting Playwright test..." | tee -a "$MEMORY_LOG"
echo "" | tee -a "$MEMORY_LOG"

npx playwright test tests/demo3-load.spec.js --project=chromium 2>&1 | tee -a "$MEMORY_LOG"

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

# Extract peak memory from the log
PEAK=$(grep -E "^\s*[0-9]+\s+\|" "$MEMORY_LOG" | awk '{print $3}' | sort -n | tail -1)
INITIAL=$(grep -E "^\s*0\s+\|" "$MEMORY_LOG" | head -1 | awk '{print $3}')

if [ -n "$PEAK" ] && [ -n "$INITIAL" ]; then
    echo "Initial memory: ${INITIAL} MB" | tee -a "$MEMORY_LOG"
    echo "Peak memory: ${PEAK} MB" | tee -a "$MEMORY_LOG"
    INCREASE=$(echo "$PEAK - $INITIAL" | bc -l)
    echo "Memory increase: ${INCREASE} MB" | tee -a "$MEMORY_LOG"

    echo "" | tee -a "$MEMORY_LOG"

    # Thresholds
    if (( $(echo "$PEAK > 1000" | bc -l) )); then
        echo "❌ FAIL: Peak memory exceeded 1000 MB" | tee -a "$MEMORY_LOG"
        exit 1
    elif (( $(echo "$INCREASE > 500" | bc -l) )); then
        echo "⚠ WARNING: Memory increased by >500 MB during test" | tee -a "$MEMORY_LOG"
    else
        echo "✓ PASS: Memory under control (peak ${PEAK} MB, increase ${INCREASE} MB)" | tee -a "$MEMORY_LOG"
    fi
else
    echo "WARNING: Could not measure memory" | tee -a "$MEMORY_LOG"
fi

echo "" | tee -a "$MEMORY_LOG"
echo "Results saved to: $MEMORY_LOG"
