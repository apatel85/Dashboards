#!/bin/bash
# Run all v9 test suites. Each suite extracts the CURRENT code from
# ../index.html at runtime, so tests always run against the real build.
cd "$(dirname "$0")"
pass=0; fail=0
for t in v9_auth.test.js v9_sheetdb.test.js v9_merge.test.js v9_sync_integration.test.js v9_billing.test.js v9_onboarding.test.js; do
  out=$(node "$t" 2>&1)
  code=$?
  echo "--- $t: $(echo "$out" | tail -1)"
  if [ $code -ne 0 ]; then fail=$((fail+1)); echo "$out" | grep -A2 FAIL | head -12; else pass=$((pass+1)); fi
done
echo ""
echo "$pass suites passed, $fail failed"
exit $fail
