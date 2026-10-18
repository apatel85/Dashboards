/* QA Capture v3 — screenshot annotation editor.
   Drawings are stored in DISPLAY coordinates; export scales them to full res. */
(function () {
  const q = new URLSearchParams(location.search);
  const T = q.get("t"), I = q.get("i"), KEY = `edit_${T}_${I}`;
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  let img = null;
  let tool = "rect", color = "#e11d48";
  let drawings = [], current = null;

  chrome.storage.session.get([KEY]).then(r => {
    if (!r[KEY]) { document.body.innerHTML = "<p style='padding:20px'>Screenshot not found.</p>"; return; }
    img = new Image();
    img.onload = () => {
      const maxW = Math.min(1600, window.innerWidth - 40);
      const s = Math.min(1, maxW / img.width);
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      redraw();
    };
    img.src = r[KEY];
  });

  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-tool]").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); tool = b.dataset.tool;
  }));
  document.querySelectorAll(".sw").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".sw").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); color = b.dataset.c;
  }));
  document.getElementById("undo").addEventListener("click", () => { drawings.pop(); redraw(); });
  document.getElementById("clear").addEventListener("click", () => { drawings = []; redraw(); });
  document.getElementById("cancel").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "editorCancel", t: T });
  });
  document.getElementById("done").addEventListener("click", async () => {
    const out = document.createElement("canvas");
    out.width = img.width; out.height = img.height;
    const g = out.getContext("2d");
    g.drawImage(img, 0, 0);
    paint(g, img.width / cv.width);   // scale display coords -> full res
    await chrome.storage.session.set({ [KEY]: out.toDataURL("image/jpeg", 0.85) });
    // v3.4: the background closes this tab and returns focus to the tested tab
    chrome.runtime.sendMessage({ type: "editorDone", t: T, i: I });
  });

  function pos(e) {
    const r = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  cv.addEventListener("mousedown", start); cv.addEventListener("touchstart", start, { passive: false });
  cv.addEventListener("mousemove", move); cv.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", end); cv.addEventListener("touchend", end);

  function start(e) {
    e.preventDefault();
    const p = pos(e);
    if (tool === "text") {
      const t = prompt("Label text:");
      if (t) { drawings.push({ k: "text", x: p.x, y: p.y, t, c: color }); redraw(); }
      return;
    }
    current = { k: tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y, c: color, pts: [{ x: p.x, y: p.y }] };
  }
  function move(e) {
    if (!current) return;
    e.preventDefault();
    const p = pos(e);
    current.x1 = p.x; current.y1 = p.y;
    if (current.k === "pen") current.pts.push({ x: p.x, y: p.y });
    redraw();
  }
  function end() { if (current) { drawings.push(current); current = null; redraw(); } }

  function redraw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    paint(ctx, 1);
  }

  function paint(g, f) {
    const all = current ? drawings.concat([current]) : drawings;
    const X = v => v * f;
    for (const d of all) {
      g.strokeStyle = d.c; g.fillStyle = d.c; g.lineCap = "round";
      if (d.k === "rect") {
        g.lineWidth = 4 * f;
        g.strokeRect(X(d.x0), X(d.y0), X(d.x1) - X(d.x0), X(d.y1) - X(d.y0));
      } else if (d.k === "arrow") {
        g.lineWidth = 4 * f;
        const x0 = X(d.x0), y0 = X(d.y0), x1 = X(d.x1), y1 = X(d.y1);
        const ang = Math.atan2(y1 - y0, x1 - x0), hs = 16 * f;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.beginPath(); g.moveTo(x1, y1);
        g.lineTo(x1 - hs * Math.cos(ang - Math.PI / 6), y1 - hs * Math.sin(ang - Math.PI / 6));
        g.lineTo(x1 - hs * Math.cos(ang + Math.PI / 6), y1 - hs * Math.sin(ang + Math.PI / 6));
        g.closePath(); g.fill();
      } else if (d.k === "pen") {
        g.globalAlpha = 0.45; g.lineWidth = 14 * f;
        g.beginPath(); g.moveTo(X(d.pts[0].x), X(d.pts[0].y));
        for (const p of d.pts) g.lineTo(X(p.x), X(p.y));
        g.stroke(); g.globalAlpha = 1;
      } else if (d.k === "text") {
        g.font = `bold ${Math.round(28 * f)}px system-ui,sans-serif`;
        const w = g.measureText(d.t).width;
        g.globalAlpha = 0.85;
        g.fillRect(X(d.x) - 6 * f, X(d.y) - 30 * f, w + 12 * f, 40 * f);
        g.globalAlpha = 1; g.fillStyle = "#111";
        g.fillText(d.t, X(d.x), X(d.y));
      }
    }
  }
})();
