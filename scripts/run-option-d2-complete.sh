#!/bin/bash
# Complete option (d2) workflow: wait for exams to finish, then compute metrics

set -e

cd /Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web

echo "Option (d2): No-repair control evaluation"
echo "========================================="
echo ""

# Check if exams have finished
if ! grep -q "TOTAL ESTIMATED SPEND THIS RUN" /tmp/exam-norepair.log 2>/dev/null; then
    echo "EXAMS STILL RUNNING. Current progress:"
    echo "  Completed prompts (Gemini): $(grep -c '^  ok ' /tmp/exam-norepair.log)"
    echo ""
    echo "Waiting for exams to complete..."
    until grep -q "TOTAL ESTIMATED SPEND THIS RUN" /tmp/exam-norepair.log 2>/dev/null; do
        sleep 5
    done
    echo "Exams complete!"
fi

echo ""
echo "Exam results:"
tail -100 /tmp/exam-norepair.log | head -50

echo ""
echo "Computing metrics and bootstrap comparisons..."
npx tsx --env-file=.env.local scripts/compute-norepair-control.ts
