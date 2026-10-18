/* QA Capture v3.3 — offscreen recorder.
   Records the tested tab via desktopCapture (Chrome's own tab picker is the
   consent UI, so no toolbar invocation is needed) + MediaRecorder.
   Lives in an offscreen document so recording survives service-worker sleeps. */
(function () {
  const MAX_SECS = 60;
  let rec = null, chunks = [], stream = null, t0 = 0, maxTimer = null, tabId = null;

  function cleanup() {
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    rec = null; chunks = []; tabId = null;
  }

  async function start(targetTabId) {
    if (rec && rec.state !== "inactive") return; // already recording
    tabId = targetTabId;
    chunks = [];
    chrome.desktopCapture.chooseDesktopMedia(["tab"], async (streamId) => {
      if (!streamId) {
        chrome.runtime.sendMessage({ type: "offscreenClipError", tabId, error: "Picker closed — no tab chosen." });
        cleanup();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } }
        });
      } catch (e) {
        chrome.runtime.sendMessage({ type: "offscreenClipError", tabId, error: "Capture failed: " + e.message });
        cleanup();
        return;
      }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      } catch (e) {
        chrome.runtime.sendMessage({ type: "offscreenClipError", tabId, error: "Recorder failed: " + e.message });
        cleanup();
        return;
      }
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const secs = Math.round((Date.now() - t0) / 1000);
        const blob = new Blob(chunks, { type: "video/webm" });
        const rd = new FileReader();
        rd.onload = () => {
          chrome.runtime.sendMessage({ type: "offscreenClipDone", tabId, dataUrl: rd.result, secs });
          cleanup();
        };
        rd.onerror = () => {
          chrome.runtime.sendMessage({ type: "offscreenClipError", tabId, error: "Could not read the recording." });
          cleanup();
        };
        rd.readAsDataURL(blob);
      };
      t0 = Date.now();
      rec.start(500);
      maxTimer = setTimeout(stop, MAX_SECS * 1000);
      chrome.runtime.sendMessage({ type: "offscreenRecording", tabId });
    });
  }

  function stop() {
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    if (rec && rec.state !== "inactive") rec.stop();
    else cleanup();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.target !== "offscreen") return;
    if (msg.type === "offscreenStart") start(msg.tabId);
    else if (msg.type === "offscreenStop") stop();
  });
})();
