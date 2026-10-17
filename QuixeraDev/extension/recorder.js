/* QA Capture v3 — tab clip recorder (tabCapture + MediaRecorder) */
(function () {
  const SRC = Number(new URLSearchParams(location.search).get("src"));
  const MAX_SECS = 60;
  const video = document.getElementById("pv");
  const btnStart = document.getElementById("start"), btnStop = document.getElementById("stop");
  const btnAttach = document.getElementById("attach"), btnCancel = document.getElementById("cancel");
  const timerEl = document.getElementById("timer"), metaEl = document.getElementById("meta");
  let stream = null, rec = null, chunks = [], t0 = 0, tick = null, blobUrl = null;

  btnCancel.addEventListener("click", () => window.close());

  chrome.tabCapture.getMediaStreamId({ targetTabId: SRC }, async (streamId) => {
    if (chrome.runtime.lastError || !streamId) {
      metaEl.textContent = "Could not capture that tab: " + (chrome.runtime.lastError || {}).message;
      btnStart.disabled = true;
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }
      });
      video.srcObject = stream;
    } catch (e) {
      metaEl.textContent = "Capture failed: " + e.message;
      btnStart.disabled = true;
    }
  });

  function fmt(s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }

  btnStart.addEventListener("click", () => {
    chunks = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(tick);
      timerEl.classList.remove("live");
      const blob = new Blob(chunks, { type: "video/webm" });
      const secs = Math.round((Date.now() - t0) / 1000);
      blobUrl = URL.createObjectURL(blob);
      video.srcObject = null; video.src = blobUrl; video.muted = false; video.controls = true;
      metaEl.textContent = `${secs}s · ${(blob.size / 1048576).toFixed(1)} MB`;
      btnAttach.disabled = false;
      btnAttach.dataset.secs = secs;
      stream.getTracks().forEach(t => t.stop());
    };
    rec.start(500);
    t0 = Date.now();
    timerEl.classList.add("live");
    tick = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      timerEl.textContent = fmt(s);
      if (s >= MAX_SECS) btnStop.click();
    }, 250);
    btnStart.disabled = true; btnStop.disabled = false;
  });

  btnStop.addEventListener("click", () => {
    if (rec && rec.state !== "inactive") rec.stop();
    btnStop.disabled = true;
  });

  btnAttach.addEventListener("click", () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const rd = new FileReader();
    rd.onload = () => {
      chrome.runtime.sendMessage({
        type: "clipDone", tabId: SRC,
        dataUrl: rd.result, secs: Number(btnAttach.dataset.secs || 0)
      }, () => window.close());
    };
    rd.readAsDataURL(blob);
  });
})();
