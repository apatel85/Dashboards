#!/usr/bin/env bash
# Runs inside the emulator (CI). Drives the REAL keyboard: Kotlin IME -> headless Flutter engine ->
# real Whisper -> formatter -> InputConnection -> a native EditText. The emulator mic is silent,
# so the test feeds a fixture WAV through the same dictate() path the microphone uses.
set -u
PKG=dev.voiceflow.voiceflow_app
ROOT=${ROOT:-.}
APK=$ROOT/VoiceFlowAI/app/build/app/outputs/flutter-apk/app-e2e-release.apk
PASS=0; FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

adb install -r "$APK" >/dev/null || { echo "FAIL install"; exit 1; }
adb logcat -c
adb shell appops set $PKG MANAGE_EXTERNAL_STORAGE allow
adb shell pm grant $PKG android.permission.RECORD_AUDIO
adb shell ime enable $PKG/.VoiceFlowIME >/dev/null
adb shell ime set $PKG/.VoiceFlowIME >/dev/null
adb shell am start -n $PKG/.TestActivity >/dev/null
sleep 4

# --- model: pushed by CI, installed by the e2e seam (real download path is covered on Windows CI)
MD=/sdcard/Download/vf-model
adb shell mkdir -p $MD
for f in base.en-encoder.int8.onnx base.en-decoder.int8.onnx base.en-tokens.txt; do
  adb push "$ROOT/sherpa-onnx-whisper-base.en/$f" $MD/ >/dev/null || echo "push failed $f"
done
adb push "$ROOT/VoiceFlowAI/test_fixtures/audio/scarlet_0.wav" /sdcard/Download/scarlet_0.wav >/dev/null
SHA=$(grep -o '"sha256": *"[0-9a-f]*"' "$ROOT/VoiceFlowAI/app/assets/models.json" | head -1 | grep -o '[0-9a-f]\{64\}')
ID=$(grep -o '"id": *"[^"]*"' "$ROOT/VoiceFlowAI/app/assets/models.json" | head -1 | sed 's/.*: *"//;s/"//')
adb shell "am broadcast -a dev.voiceflow.E2E_INSTALL_MODEL -p $PKG --es src $MD --es id $ID --es sha $SHA" >/dev/null

# bounds centre of a view by content-desc, from uiautomator
center() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml | python3 -c "
import re,sys
x=sys.stdin.read()
m=re.search(r'content-desc=\"($1)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',x)
print(str((int(m[2])+int(m[4]))//2)+' '+str((int(m[3])+int(m[5]))//2)) if m else print('')"
}
# exit 0 if the current screen dump matches this regex
has() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml | PAT="$1" python3 -c "
import os,re,sys
sys.exit(0 if re.search(os.environ['PAT'],sys.stdin.read()) else 1)"
}
chip_desc() { adb shell cat /sdcard/ui.xml | grep -o 'content-desc="Style: [^"]*"' | head -1; }
tap() { local c; c=$(center "$1"); [ -n "$c" ] && adb shell input tap $c; sleep 1; }
field_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml | python3 -c "
import re,sys
x=sys.stdin.read()
m=re.search(r'<node[^>]*content-desc=\"$1\"[^>]*>',x)
t=re.search(r' text=\"([^\"]*)\"',m[0]) if m else None
print(t[1] if t else '')"
}
focus() { local c; c=$(center "$1"); [ -n "$c" ] && adb shell input tap $c; sleep 2; }
dictate() { # $1 = number of RESULT lines expected so far
  adb shell "am broadcast -a dev.voiceflow.E2E_DICTATE_WAV -p $PKG --es wav /sdcard/Download/scarlet_0.wav" >/dev/null
  for i in $(seq 1 90); do
    [ "$(adb logcat -d E2E:I '*:S' | grep -c 'RESULT')" -ge "$1" ] && break
    sleep 2
  done
  sleep 1
}

adb logcat -d E2E:I '*:S' | grep -q MODEL_INSTALLED && ok "model installed" || bad "model install"

echo "== text field: real Whisper in the IME commits formatted text"
focus t_text; dictate 1
T=$(field_text t_text); echo "t_text='$T'"
echo "$T" | grep -qi "squalid quarter of the brothels" && ok "text committed to plain field" || bad "plain field text"

echo "== email field: literal, no spaces, no capitals"
focus t_email; dictate 2
E=$(field_text t_email); echo "t_email='$E'"
{ echo "$E" | grep -q "squalidquarterofthebrothels" && ! echo "$E" | grep -q " "; } && ok "email field formatted literally" || bad "email field"

echo "== password field: refused, nothing typed"
focus t_password; dictate 3
adb logcat -d E2E:I '*:S' | grep RESULT | tail -1 | grep -q "status=passwordField" && ok "password refused" || bad "password status"
[ -z "$(field_text t_password | tr -d '•')" ] && ok "password field untouched" || bad "password field got text"


echo "== keyboard UI (real views, driven through uiautomator)"
focus t_password; focus t_text; sleep 3
has 'content-desc="Dictate"' && ok "keyboard shows the mic" || bad "mic not visible"
tap ","; [ "$(field_text t_text | tail -c 2)" = "," ] && ok "punctuation key types" || bad "punctuation key"
tap "Delete"; [ "$(field_text t_text | tail -c 2)" != "," ] && ok "backspace deletes" || bad "backspace"
has 'Style: '; P1=$(chip_desc)
tap "Style: .*"
has 'Style: '; P2=$(chip_desc)
echo "chip: $P1 -> $P2"
[ -n "$P1" ] && [ "$P1" != "$P2" ] && ok "profile chip cycles" || bad "profile chip"
tap "Dictate"; sleep 1
has 'text="Listening' && ok "tap mic -> listening" || bad "listening state"
tap "Stop dictation"
DONE=0
for i in $(seq 1 30); do
  if has "text=\"(Inserted|Didn.t catch that)"; then DONE=1; break; fi
  sleep 2
done
[ $DONE -eq 1 ] && ok "tap again -> processed to a result (silent emulator mic)" || bad "processing never finished"
focus t_password; sleep 2
has 'text="Dictation is off in password fields"' && ok "password field: mic locked with notice" || bad "password notice"

echo "== diagnostics"
adb logcat -d | tr -d '\r' | grep -E "AndroidRuntime|FATAL|E2E|VoiceFlow" | tail -30
adb shell dumpsys meminfo $PKG | grep -E "TOTAL PSS" | head -1
echo "RESULT pass=$PASS fail=$FAIL"
[ $FAIL -eq 0 ] && [ $PASS -ge 12 ]
