#!/usr/bin/env bash
# Runs inside the emulator. Spike S3: Kotlin IME -> headless FlutterEngine -> Dart RuleFormatter.
set -u
PKG=dev.voiceflow.voiceflow_app
adb install -r VoiceFlowAI/app/build/app/outputs/flutter-apk/app-release.apk >/dev/null || { echo "S3_FAIL install"; exit 1; }
adb logcat -c
adb shell ime enable $PKG/.VoiceFlowIME
adb shell ime set $PKG/.VoiceFlowIME
adb shell am start -n $PKG/.TestActivity >/dev/null
sleep 4
adb shell input tap 300 300      # focus the EditText so the IME gets an InputConnection
sleep 3
echo "current_ime=$(adb shell settings get secure default_input_method | tr -d '\r')"
adb shell am broadcast -a dev.voiceflow.S3_FORMAT -p $PKG --es text "um we shipped twelve features" >/dev/null
for i in $(seq 1 20); do
  adb logcat -d -s S3:I | grep -q "committed=" && break
  sleep 1
done
echo "---- S3 log"; adb logcat -d -s S3:I S3:E | tr -d '\r'
echo "---- idle 30 s, then memory"
sleep 30
adb shell dumpsys meminfo $PKG | grep -E "TOTAL PSS|TOTAL:|Native Heap|Java Heap" | head -4
LOG=$(adb logcat -d -s S3:I | tr -d '\r')
echo "$LOG" | grep -q "committed='We shipped 12 features.'" && echo "S3_PASS" || { echo "S3_FAIL text"; exit 1; }
