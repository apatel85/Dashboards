/* QA Capture v3.4 — offscreen recorder.
   The service worker shows the tab picker (reliable context) and hands the
   stream id here; this document only does getUserMedia + MediaRecorder, so
   recording survives service-worker sleeps. */
(function () {
  const MAX_SECS = 60;
  let rec = null, chunks = [], stream = null, t0 = 0, maxTimer = null, tabId = null;

  function cleanup() {
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    rec = null; chunks = []; tabId = null;
  }

  async function start(targetTabId, streamId) {
    if (rec && rec.state !== "inactive") return; // already recording
    if (!streamId) {
      chrome.runtime.sendMessage({ type: "offscreenClipError", tabId: targetTabId, error: "No capture stream." });
      return;
    }
    tabId = targetTabId;
    chunks = [];
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
  }

  function stop() {
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    if (rec && rec.state !== "inactive") rec.stop();
    else cleanup();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.target !== "offscreen") return;
    if (msg.type === "offscreenStart") {
      // Ack FIRST so the service worker's retry handshake settles,
      // then start recording.
      chrome.runtime.sendMessage({ type: "offscreenAck", reqId: msg.reqId });
      start(msg.tabId, msg.streamId);
    }
    else if (msg.type === "offscreenStop") stop();
  });
})();
