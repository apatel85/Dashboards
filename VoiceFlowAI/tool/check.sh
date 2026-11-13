#!/usr/bin/env bash
# Prints only failures. Run from VoiceFlowAI/.
set -u
cd "$(dirname "$0")/../packages/core"
fail=0
run() { local name=$1; shift; local out; if ! out=$("$@" 2>&1); then echo "FAIL: $name"; echo "$out" | tail -n 40; fail=1; fi; }
run "pub get" dart pub get
run "format" dart format --output=none --set-exit-if-changed lib test
run "analyze" dart analyze --fatal-infos
run "tests" dart test -r failures-only
run "license audit" dart run ../../tool/license_audit.dart
[ $fail -eq 0 ] && echo "check: OK"
exit $fail
