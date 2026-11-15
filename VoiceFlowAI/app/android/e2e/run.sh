#!/usr/bin/env bash
# Runs inside the emulator (CI). Drives the REAL floating button: overlay service -> headless Flutter
# engine -> real Whisper -> formatter -> accessibility service -> a native EditText. The emulator mic
# is silent, so the test feeds fixture WAVs through the same streaming path the microphone uses.
set -u
PKG=dev.voiceflow.voiceflow_app
A11Y=$PKG/$PKG.VoiceFlowAccessibilityService
ROOT=${ROOT:-.}
APK=$ROOT/VoiceFlowAI/app/build/app/outputs/flutter-apk/app-e2e-release.apk
PASS=0; FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

adb install -r "$APK" >/dev/null || { echo "FAIL install"; exit 1; }
adb logcat -c
adb shell appops set $PKG MANAGE_EXTERNAL_STORAGE allow
adb shell pm grant $PKG android.permission.RECORD_AUDIO
# What the person does in Settings: allow display over other apps, switch the typing service on.
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb shell settings put secure enabled_accessibility_services "$A11Y"
adb shell settings put secure accessibility_enabled 1
adb shell am start -n $PKG/.TestActivity >/dev/null
sleep 4

# The floating button is its own window; --windows sees all of them.
dump() { adb shell uiautomator dump --windows /sdcard/ui.xml >/dev/null 2>&1 || adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; }
# bounds centre of a view by content-desc, from uiautomator
center() {
  dump
  adb shell cat /sdcard/ui.xml | python3 -c "
import re,sys
x=sys.stdin.read()
m=re.search(r'content-desc=\"($1)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',x)
print(str((int(m[2])+int(m[4]))//2)+' '+str((int(m[3])+int(m[5]))//2)) if m else print('')"
}
# exit 0 if the current screen dump matches this regex
has() {
  dump
  adb shell cat /sdcard/ui.xml | PAT="$1" python3 -c "
import os,re,sys
sys.exit(0 if re.search(os.environ['PAT'],sys.stdin.read()) else 1)"
}
tap() { local c; c=$(center "$1"); [ -n "$c" ] && adb shell input tap $c; sleep 1; }
field_text() {
  dump
  adb shell cat /sdcard/ui.xml | python3 -c "
import re,sys
x=sys.stdin.read()
m=re.search(r'<node[^>]*content-desc=\"$1\"[^>]*>',x)
t=re.search(r' text=\"([^\"]*)\"',m[0]) if m else None
print(t[1] if t else '')"
}
focus() { local c; c=$(center "$1"); [ -n "$c" ] && adb shell input tap $c; sleep 2; }
shownodes() { adb shell cat /sdcard/ui.xml | python3 -c '
import re,sys
for n in re.findall(r"<node [^>]*>",sys.stdin.read()):
  g=lambda k:(re.search(k+"=.([^\"]*).",n) or [0,""])[1]
  if g("package")=="dev.voiceflow.voiceflow_app" and (g("text") or g("content-desc")) and "EditText" not in g("class"): print("  node",repr(g("text")),repr(g("content-desc")))'; }

# --- model, the REAL way first: the app's own Download button over the network (needs INTERNET).
echo "== real model download inside the app (network, SHA-256 check, unpack)"
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 8
tap "Download"
DL=0
# Once installed, the page marks the step done ("done&#10;Download the speech model") and stops
# showing its status text, so "done" is the signal, not the status sentence.
for i in $(seq 1 100); do
  if has 'done.{1,8}Download the speech model'; then DL=1; break; fi
  if has 'did not finish|failed its safety check'; then break; fi
  sleep 4
done
if [ $DL -eq 1 ]; then ok "real in-app model download works (network + SHA-256 + unpack)"; else bad "real model download"; shownodes; adb logcat -d '*:E' | grep -iE "socket|permission|UnknownHost|dev.voiceflow" | tail -8; fi

# --- model: pushed by CI, installed by the e2e seam (only used if the real download failed)
MD=/sdcard/Download/vf-model
adb shell mkdir -p $MD
for f in base.en-encoder.int8.onnx base.en-decoder.int8.onnx base.en-tokens.txt; do
  adb push "$ROOT/sherpa-onnx-whisper-base.en/$f" $MD/ >/dev/null || echo "push failed $f"
done
adb push "$ROOT/VoiceFlowAI/test_fixtures/audio/scarlet_0.wav" /sdcard/Download/scarlet_0.wav >/dev/null
# ~60 s of speech: the same sentence six times with a pause between. Proves there is no time limit.
python3 - "$ROOT/VoiceFlowAI/test_fixtures/audio/scarlet_0.wav" /tmp/long.wav <<'PY'
import sys,wave
w=wave.open(sys.argv[1]); p=w.getparams(); d=w.readframes(w.getnframes()); w.close()
gap=b"\x00\x00"*int(p.framerate*1.2)
o=wave.open(sys.argv[2],"wb"); o.setparams(p); o.writeframes((d+gap)*6); o.close()
print("long.wav seconds=%.1f"%(6*(len(d)+len(gap))/2/p.framerate))
PY
adb push /tmp/long.wav /sdcard/Download/long.wav >/dev/null
SHA=$(grep -o '"sha256": *"[0-9a-f]*"' "$ROOT/VoiceFlowAI/app/assets/models.json" | head -1 | grep -o '[0-9a-f]\{64\}')
ID=$(grep -o '"id": *"[^"]*"' "$ROOT/VoiceFlowAI/app/assets/models.json" | head -1 | sed 's/.*: *"//;s/"//')
[ $DL -eq 1 ] || adb shell "am broadcast -a dev.voiceflow.E2E_INSTALL_MODEL -p $PKG --es src $MD --es id $ID --es sha $SHA" >/dev/null
if [ $DL -eq 1 ]; then ok "model present from the real download"; else adb logcat -d E2E:I '*:S' | grep -q MODEL_INSTALLED && ok "model installed (test seam fallback)" || bad "model install"; fi

echo "== setup page: OS-backed ticks, then the Show button starts the floating service"
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 5
has 'done.{1,8}Allow the microphone' && ok "mic step detected as done" || { bad "mic step"; shownodes; }
has 'done.{1,8}Allow the floating button' && ok "overlay permission detected as done" || { bad "overlay step"; shownodes; }
has 'done.{1,8}Turn on the typing service' && ok "accessibility service detected as enabled" || { bad "accessibility step"; shownodes; }
tap "Show button"
sleep 4
has 'done.{1,8}Show the floating button' && ok "setup page ticks the button step (service running)" || { bad "button step not ticked"; shownodes; adb logcat -d | grep -iE "FloatingService|VoiceFlow|AndroidRuntime" | tail -15; }
has 'Dictate here|You.re set|Done' && ok "all steps done: Try-it box offered" || { bad "steps not all done"; shownodes; }
[ -z "$(adb logcat -d VoiceFlow:I '*:S' | grep 'BUBBLE visible')" ] && ok "button stays hidden when no text box is in use" || bad "button showed with no text box focused"

echo "== the button follows typing: shows with a focused text box, hides when leaving"
adb shell am start -n $PKG/.TestActivity >/dev/null; sleep 4
focus t_text
BUB=""
for i in $(seq 1 15); do
  BUB=$(adb logcat -d VoiceFlow:I '*:S' | grep -o 'BUBBLE_AT [0-9]* [0-9]*' | tail -1 | cut -d' ' -f2,3)
  [ -n "$BUB" ] && break; sleep 2
done
echo "bubble at: '$BUB'"
[ -n "$BUB" ] && ok "button appears when a text box is focused" || { bad "button never appeared"; adb logcat -d | grep -iE "FloatingService|VoiceFlow|AndroidRuntime" | tail -15; }
adb logcat -c
adb shell input keyevent KEYCODE_HOME; sleep 5
adb logcat -d VoiceFlow:I '*:S' | grep -q 'BUBBLE hidden' && ok "button hides when leaving the text box" || bad "button stayed on the home screen"
adb shell am start -n $PKG/.TestActivity >/dev/null; sleep 3
focus t_text
B2=""
for i in $(seq 1 15); do
  B2=$(adb logcat -d VoiceFlow:I '*:S' | grep -o 'BUBBLE_AT [0-9]* [0-9]*' | tail -1 | cut -d' ' -f2,3)
  [ -n "$B2" ] && break; sleep 2
done
[ -n "$B2" ] && { ok "button comes back with the next text box"; BUB=$B2; } || bad "button did not come back"

adb shell am start -n $PKG/.TestActivity >/dev/null; sleep 4

dictate() { # $1 = RESULT lines expected so far, $2 = wav
  adb shell "am broadcast -a dev.voiceflow.E2E_DICTATE_WAV -p $PKG --es wav $2" >/dev/null
  for i in $(seq 1 120); do
    [ "$(adb logcat -d E2E:I '*:S' | grep -c 'RESULT')" -ge "$1" ] && break
    sleep 2
  done
  sleep 1
}
count() { printf '%s' "$1" | grep -oi "squalid quarter of the brothels" | wc -l; }

echo "== text field: real Whisper commits formatted text through the accessibility service"
focus t_text; dictate 1 /sdcard/Download/scarlet_0.wav
T=$(field_text t_text); echo "t_text='$T'"
echo "$T" | grep -qi "squalid quarter of the brothels" && ok "text committed to plain field" || bad "plain field text"

echo "== email field: literal, no spaces, no capitals"
focus t_email; dictate 2 /sdcard/Download/scarlet_0.wav
E=$(field_text t_email); echo "t_email='$E'"
{ echo "$E" | grep -q "squalidquarterofthebrothels" && ! echo "$E" | grep -q " "; } && ok "email field formatted literally" || bad "email field"

echo "== password field: refused, nothing typed"
focus t_password
adb shell "am broadcast -a dev.voiceflow.E2E_DICTATE_WAV -p $PKG --es wav /sdcard/Download/scarlet_0.wav" >/dev/null
sleep 5
adb logcat -d VoiceFlow:I '*:S' | grep -q "SAY Dictation is off in password fields" && ok "password refused with a notice" || bad "password notice"
[ -z "$(field_text t_password | tr -d '•')" ] && ok "password field untouched" || bad "password field got text"
[ "$(adb logcat -d E2E:I '*:S' | grep -c 'RESULT')" -eq 2 ] && ok "password never reached the speech pipeline" || bad "password reached the pipeline"

echo "== no time limit: about a minute of speech in one dictation"
focus t_text
BEFORE=$(count "$(field_text t_text)")
dictate 3 /sdcard/Download/long.wav
AFTERN=$(count "$(field_text t_text)")
echo "sentence count before=$BEFORE after=$AFTERN (6 were spoken)"
[ $((AFTERN-BEFORE)) -ge 5 ] && ok "long dictation fully transcribed (no cap)" || bad "long dictation truncated"

echo "== the real button: tap to listen, tap to stop (silent emulator mic)"
focus t_text
adb logcat -c
set -- $BUB
adb shell input tap $1 $2; sleep 3
adb logcat -d VoiceFlow:I '*:S' | grep -q "STATE listening" && ok "tap on the floating button -> listening" || { bad "button tap did not start listening"; adb logcat -d | grep -E "VoiceFlow|SAY" | tail -8; }
T2=$(field_text t_text)
[ -n "$T2" ] && ok "field kept focus and text while the button was tapped" || bad "field lost its text"
adb shell input tap $1 $2
DONE=0
for i in $(seq 1 30); do
  adb logcat -d E2E:I '*:S' | grep -q "RESULT status=" && { DONE=1; break; }
  sleep 2
done
[ $DONE -eq 1 ] && ok "tap again -> processed to a result" || bad "processing never finished"
adb logcat -d E2E:I '*:S' | grep RESULT | tail -1

echo "== long-press on the idle button cycles the style"
adb logcat -c
adb shell input swipe $1 $2 $1 $2 900; sleep 3
adb logcat -d VoiceFlow:I '*:S' | grep -q "STYLE " && ok "long-press changes the style" || bad "style did not change"

echo "== diagnostics"
adb logcat -d | tr -d '\r' | grep -E "VoiceFlow|E2E|dev.voiceflow|FATAL EXCEPTION" | tail -40
adb shell dumpsys meminfo $PKG | grep -E "TOTAL PSS" | head -1
echo "RESULT pass=$PASS fail=$FAIL"
[ $FAIL -eq 0 ] && [ $PASS -ge 21 ]
