#!/bin/bash

# measure-browser-memory.sh - Monitor browser process memory usage
# Usage: ./measure-browser-memory.sh <process_name> <duration_seconds> <sample_interval_seconds>
# Example: ./measure-browser-memory.sh chromium 60 5

set -euo pipefail

PROCESS_NAME="${1:-chromium}"
DURATION="${2:-60}"
INTERVAL="${3:-5}"
OUTPUT_FILE="test-results/browser-memory-$(date +%Y%m%d-%H%M%S).txt"

echo "=== Browser Memory Monitor ===" | tee "$OUTPUT_FILE"
echo "Process: $PROCESS_NAME" | tee -a "$OUTPUT_FILE"
echo "Duration: ${DURATION}s, Interval: ${INTERVAL}s" | tee -a "$OUTPUT_FILE"
echo "Output: $OUTPUT_FILE" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# Find all PIDs matching the process name
MAIN_PID=$(pgrep -o "$PROCESS_NAME" || true)

if [ -z "$MAIN_PID" ]; then
    echo "ERROR: No process found matching '$PROCESS_NAME'" | tee -a "$OUTPUT_FILE"
    exit 1
fi

echo "Main PID: $MAIN_PID" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# Function to get memory for a single PID (RSS in MB)
get_memory_mb() {
    local pid=$1
    # Get RSS in KB, convert to MB
    ps -p "$pid" -o rss= 2>/dev/null | awk '{print $1/1024}' || echo "0"
}

# Function to get all related PIDs (parent + children)
get_all_pids() {
    local main_pid=$1
    # Get main process + all children
    {
        echo "$main_pid"
        pgrep -P "$main_pid" 2>/dev/null || true
    } | sort -u
}

# Function to get total memory for all related processes
get_total_memory() {
    local main_pid=$1
    local total=0
    local count=0

    while read -r pid; do
        if [ -n "$pid" ]; then
            local mem=$(get_memory_mb "$pid")
            total=$(echo "$total + $mem" | bc)
            count=$((count + 1))
        fi
    done < <(get_all_pids "$main_pid")

    echo "$total $count"
}

# Initial measurement
read INITIAL_MEM INITIAL_PROCS < <(get_total_memory "$MAIN_PID")
INITIAL_TIME=$(date +%s)

echo "Initial memory: ${INITIAL_MEM} MB ($INITIAL_PROCS processes)" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"
echo "Time(s) | Total MB | Processes | Delta MB" | tee -a "$OUTPUT_FILE"
echo "--------|----------|-----------|----------" | tee -a "$OUTPUT_FILE"

MAX_MEM="$INITIAL_MEM"
SAMPLES=0
END_TIME=$((INITIAL_TIME + DURATION))

# Sample memory at intervals
while [ "$(date +%s)" -lt "$END_TIME" ]; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - INITIAL_TIME))

    read CURRENT_MEM CURRENT_PROCS < <(get_total_memory "$MAIN_PID")
    DELTA=$(echo "$CURRENT_MEM - $INITIAL_MEM" | bc)

    # Update max
    if (( $(echo "$CURRENT_MEM > $MAX_MEM" | bc -l) )); then
        MAX_MEM="$CURRENT_MEM"
    fi

    printf "%7d | %8.1f | %9d | %+8.1f\n" \
        "$ELAPSED" "$CURRENT_MEM" "$CURRENT_PROCS" "$DELTA" | tee -a "$OUTPUT_FILE"

    SAMPLES=$((SAMPLES + 1))

    # Sleep for interval (unless we're at the end)
    if [ "$ELAPSED" -lt "$DURATION" ]; then
        sleep "$INTERVAL"
    fi
done

# Final statistics
FINAL_MEM="$CURRENT_MEM"
FINAL_DELTA=$(echo "$FINAL_MEM - $INITIAL_MEM" | bc)
MAX_DELTA=$(echo "$MAX_MEM - $INITIAL_MEM" | bc)

echo "" | tee -a "$OUTPUT_FILE"
echo "=== Summary ===" | tee -a "$OUTPUT_FILE"
echo "Initial memory: ${INITIAL_MEM} MB" | tee -a "$OUTPUT_FILE"
echo "Final memory:   ${FINAL_MEM} MB" | tee -a "$OUTPUT_FILE"
echo "Peak memory:    ${MAX_MEM} MB" | tee -a "$OUTPUT_FILE"
echo "Final delta:    ${FINAL_DELTA} MB" | tee -a "$OUTPUT_FILE"
echo "Peak delta:     ${MAX_DELTA} MB" | tee -a "$OUTPUT_FILE"
echo "Samples taken:  ${SAMPLES}" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# Pass/fail thresholds
THRESHOLD_PEAK=1000  # MB
THRESHOLD_DELTA=800  # MB

echo "=== Verification ===" | tee -a "$OUTPUT_FILE"

if (( $(echo "$MAX_MEM < $THRESHOLD_PEAK" | bc -l) )); then
    echo "✓ PASS: Peak memory ${MAX_MEM} MB < ${THRESHOLD_PEAK} MB" | tee -a "$OUTPUT_FILE"
else
    echo "✗ FAIL: Peak memory ${MAX_MEM} MB >= ${THRESHOLD_PEAK} MB" | tee -a "$OUTPUT_FILE"
fi

if (( $(echo "$MAX_DELTA < $THRESHOLD_DELTA" | bc -l) )); then
    echo "✓ PASS: Peak delta ${MAX_DELTA} MB < ${THRESHOLD_DELTA} MB" | tee -a "$OUTPUT_FILE"
else
    echo "✗ FAIL: Peak delta ${MAX_DELTA} MB >= ${THRESHOLD_DELTA} MB" | tee -a "$OUTPUT_FILE"
fi

echo "" | tee -a "$OUTPUT_FILE"
echo "Results saved to: $OUTPUT_FILE"
