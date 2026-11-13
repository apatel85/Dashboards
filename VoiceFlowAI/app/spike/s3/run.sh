#!/usr/bin/env bash
# Runs inside the emulator. Spike S3: Kotlin IME -> headless FlutterEngine -> Dart RuleFormatter.
set -u
PKG=dev.voiceflow.voiceflow_app
adb install -r VoiceFlowAI/app/build/app/outputs/flutter-apk/app-release.apk >/dev/null || { echo "S3_FAIL install"; exit 1; }
adb logcat -c
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell ime enable $PKG/.VoiceFlowIME
adb shell ime set $PKG/.VoiceFlowIME
adb shell am start -n $PKG/.TestActivity >/dev/null
sleep 4
adb shell input tap 300 300      # focus the EditText so the IME gets an InputConnection
sleep 3
echo "---- focus/IME state"
adb shell dumpsys window | grep -E "mCurrentFocus" | head -2
adb shell dumpsys input_method | grep -E "mCurMethodId|mCurClient|mInputShown|mCurFocusedWindow|mBoundToMethod|mServiceConnection" | head -8
echo "current_ime=$(adb shell settings get secure default_input_method | tr -d '\r')"
# Quote for the DEVICE shell (adb strips host-side quotes; unquoted, text became just "um").
adb shell "am broadcast -a dev.voiceflow.S3_FORMAT -p $PKG --es text 'um we shipped twelve features'" >/dev/null
for i in $(seq 1 20); do
  adb logcat -d S3:I '*:S' | grep -q "committed2=" && break
  sleep 1
done
sleep 1
echo "---- EditText content seen from the app side (uiautomator)"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
UI=$(adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep 's3_target' | tr -d '\r')
echo "$UI"
echo "---- S3 log"; adb logcat -d S3:I '*:S' | tr -d '\r'
echo "---- diagnostics (crashes / flutter / our package)"
adb logcat -d | tr -d '\r' | grep -E "AndroidRuntime|FATAL|flutter|FlutterEngine|VoiceFlowIME|ImeEngine|dev.voiceflow|InputMethodManager" | tail -40
echo "---- idle 30 s, then memory"
sleep 30
adb shell dumpsys meminfo $PKG | grep -E "TOTAL PSS|TOTAL:|Native Heap|Java Heap" | head -4
S3_OK=0
echo "$UI" | grep -q 'text="We shipped 12 features."' && { echo "S3_PASS"; S3_OK=1; } || echo "S3_FAIL text"

echo "==== S1-Android: Whisper base.en int8 inside the IME engine"
MD=/sdcard/Android/data/$PKG/files/model
adb shell mkdir -p $MD
for f in base.en-encoder.int8.onnx base.en-decoder.int8.onnx base.en-tokens.txt; do
  adb push "sherpa-onnx-whisper-base.en/$f" $MD/ >/dev/null || echo "push failed $f"
done
adb push sherpa-onnx-whisper-base.en/test_wavs/0.wav $MD/ >/dev/null
adb logcat -c
adb shell "am broadcast -a dev.voiceflow.S1A_TRANSCRIBE -p $PKG --es dir $MD --es wav $MD/0.wav" >/dev/null
for i in $(seq 1 90); do
  adb logcat -d S3:I '*:S' | grep -qE "S1A_RESULT|S1A_ERROR" && break
  sleep 2
done
S1A=$(adb logcat -d S3:I '*:S' | tr -d '\r' | grep -E "S1A_")
echo "$S1A"
adb shell dumpsys meminfo $PKG | grep -E "TOTAL PSS|TOTAL RSS" | head -2
S1A_OK=0
echo "$S1A" | grep -qi "squalid quarter of the brothels" && { echo "S1A_PASS"; S1A_OK=1; } || echo "S1A_FAIL"
[ $S3_OK -eq 1 ] && [ $S1A_OK -eq 1 ]
