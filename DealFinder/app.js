/* DealFinder live app v1.0.0 — real flyer prices from Supabase (dealfinder schema).
   Reads only, with the public anon key. No account, no tracking: the list and
   tracked items live in this browser (localStorage). Prices are weekly flyer
   prices — an item appears only when it is on sale in a flyer. */
(function () {
  "use strict";

  var CFG = window.DEALFINDER_CONFIG || {};
  var SB_URL = CFG.SUPABASE_URL || "";
  var SB_KEY = CFG.SUPABASE_ANON_KEY || "";
  var TZ = "America/New_York";
  var DEFAULT_ZIP = "08520";
  var LS_ZIP = "dealfinder.zip.v1";
  var LS_LIST = "dealfinder.list.v1";
  var LS_TRACKED = "dealfinder.tracked.v1";
  var PAGE_SIZE = 30;

  var state = {
    zip: DEFAULT_ZIP, items: [], byId: {}, merchants: [], flyers: [],
    checkedAt: null, loading: false, error: null, showAll: false,
    historyCache: {}, scanStream: null, scanRaf: 0
  };
  var list = readJSON(LS_LIST, {});
  var tracked = readJSON(LS_TRACKED, {});

  /* ---------- utils ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v && typeof v === "object" ? v : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ } }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function fmtDate(iso) {
    if (!iso) return "";
    var only = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (only) {
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[Number(only[2]) - 1] + " " + Number(only[3]);
    }
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ }); }
    catch (e) { return String(iso).slice(0, 10); }
  }
  function fmtDateLong(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ }); }
    catch (e) { return String(iso).slice(0, 10); }
  }
  function weekday(iso) {
    try { return new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }); }
    catch (e) { return ""; }
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- Supabase (PostgREST, anon key, dealfinder schema) ---------- */
  function sbGet(path) {
    if (!SB_URL || !SB_KEY) return Promise.reject(new Error("Price service is not configured."));
    return fetch(SB_URL + "/rest/v1/" + path, {
      headers: { apikey: SB_KEY, "Accept-Profile": "dealfinder" }
    }).then(function (res) {
      if (!res.ok) throw new Error("Prices request failed (" + res.status + ").");
      return res.json();
    });
  }

  /* ---------- price rules ----------
     A row is "limit-style" when its condition requires buying several items
     or spending a minimum — that price is never crowned the best price.
     Card / coupon prices CAN be crowned (free card, clip-able coupon) but
     are flagged with their condition. Pure unit suffixes ("ea.", "/LB")
     are not conditions at all and are never shown. */
  var LIMIT_RE = /limit|when you buy|buy \d+\s*or more|buy \d+|must buy|min\.?\s*purchase|when you spend|spend \$|buy \d+\s*,?\s*get/i;
  var CONDITION_RE = /with card|card only|loyalty|digital savings|coupon|ecoupon|points|club price|member/i;
  function isLimitRow(row) {
    var t = (row.loyalty_condition || "") + " " + (row.sale_story || "");
    return LIMIT_RE.test(t);
  }
  function hasCardCondition(row) {
    var t = (row.loyalty_condition || "") + " " + (row.sale_story || "");
    return CONDITION_RE.test(t);
  }
  function meaningfulCondition(text) {
    if (!text) return null;
    var s = String(text).trim();
    if (!s) return null;
    if (/^(ea\.?|\/ea\.?|\/lb\.?|lb\.?|\*|1 doz \/ pkg|per (ea|lb)\.?)$/i.test(s)) return null;
    if (s.length <= 2) return null;
    return s;
  }
  function rowCondition(row) {
    return meaningfulCondition(row.loyalty_condition) || meaningfulCondition(row.sale_story);
  }
  /* Cheapest row that is not a limit deal; if every row is a limit deal,
     crown the cheapest anyway and flag it. */
  function crowned(item) {
    var rows = item.rows;
    for (var i = 0; i < rows.length; i++) if (!isLimitRow(rows[i])) return { row: rows[i], limited: false };
    return rows.length ? { row: rows[0], limited: true } : null;
  }
  function nextBest(item, crown) {
    for (var i = 0; i < item.rows.length; i++) {
      var r = item.rows[i];
      if (r !== crown.row && !isLimitRow(r)) return r;
    }
    return null;
  }
  function priceAt(item, store) {
    var best = null;
    item.rows.forEach(function (r) { if (r.merchant === store && (best == null || r.price < best)) best = r.price; });
    return best;
  }
  function discountPct(row) {
    if (row.regular_price == null || row.regular_price <= row.price) return 0;
    return (row.regular_price - row.price) / row.regular_price * 100;
  }
  function emojiFor(item) {
    var n = (item.name || "").toLowerCase();
    if (n.indexOf("egg") !== -1) return "🥚";
    if (n.indexOf("cheese") !== -1) return "🧀";
    if (n.indexOf("milk") !== -1) return "🥛";
    if (n.indexOf("coffee") !== -1) return "☕";
    if (n.indexOf("bread") !== -1) return "🍞";
    if (n.indexOf("yogurt") !== -1) return "🍦";
    if (n.indexOf("banana") !== -1) return "🍌";
    if (n.indexOf("chicken") !== -1) return "🍗";
    if (n.indexOf("juice") !== -1) return "🧃";
    return { dairy: "🥛", beverages: "🧃", bakery: "🍞", produce: "🍌", meat: "🍗" }[item.category] || "🛒";
  }
  function unitLabel(row) {
    if (row.unit_price == null || !row.unit) return null;
    return money(row.unit_price) + " per " + row.unit;
  }

  /* ---------- load ---------- */
  function loadZip(zip) {
    state.zip = zip;
    state.loading = true;
    state.error = null;
    state.showAll = false;
    state.historyCache = {};
    renderLoading();
    var today = new Date().toISOString().slice(0, 10);
    var pricesQ = "prices?select=price,regular_price,unit_price,unit,sale_story,loyalty_condition,valid_from,valid_to,fetched_at,flyer_item_id,item_id,store_id,items(id,name,brand,size_text,size_unit,category,upc),stores(id,merchant)"
      + "&zip=eq." + encodeURIComponent(zip) + "&order=price.asc&limit=1000";
    var flyersQ = "flyers?select=merchant,name,valid_from,valid_to&zip=eq." + encodeURIComponent(zip)
      + "&valid_to=gte." + today + "&order=valid_from.asc&limit=1000";
    return Promise.all([sbGet(pricesQ), sbGet(flyersQ)]).then(function (res) {
      var rows = res[0], flyers = res[1];
      var byId = {}, items = [];
      rows.forEach(function (p) {
        var it = p.items, st = p.stores;
        if (!it || !st) return;
        var item = byId[it.id];
        if (!item) {
          item = { id: it.id, name: it.name, brand: it.brand, category: it.category, size_text: it.size_text, size_unit: it.size_unit, upc: it.upc, rows: [] };
          byId[it.id] = item;
          items.push(item);
        }
        item.rows.push({
          price: p.price, regular_price: p.regular_price, unit_price: p.unit_price, unit: p.unit,
          sale_story: p.sale_story, loyalty_condition: p.loyalty_condition,
          valid_from: p.valid_from, valid_to: p.valid_to, fetched_at: p.fetched_at,
          flyer_item_id: p.flyer_item_id, merchant: st.merchant
        });
      });
      items.forEach(function (item) { item.rows.sort(function (a, b) { return a.price - b.price; }); });
      items.sort(function (a, b) { return a.name.localeCompare(b.name); });
      var merchants = [];
      items.forEach(function (item) { item.rows.forEach(function (r) { if (merchants.indexOf(r.merchant) === -1) merchants.push(r.merchant); }); });
      merchants.sort();
      var checked = null;
      rows.forEach(function (p) { if (!checked || p.fetched_at > checked) checked = p.fetched_at; });
      state.items = items;
      state.byId = byId;
      state.merchants = merchants;
      state.flyers = flyers;
      state.checkedAt = checked;
      state.loading = false;
      writeJSON(LS_ZIP, zip);
      renderAll();
      return true;
    }).catch(function (err) {
      state.loading = false;
      state.error = err.message || "Could not load prices.";
      renderAll();
      return false;
    });
  }

  /* ---------- 30-day history (real: from the prices table) ----------
     One snapshot exists so far, so every item reads "building history"
     until the next weekly check adds a second point. Never invented. */
  function loadHistory(itemId) {
    if (state.historyCache[itemId]) return Promise.resolve(state.historyCache[itemId]);
    var url = "prices?select=price,fetched_at&item_id=eq." + encodeURIComponent(itemId) + "&order=fetched_at.asc&limit=1000";
    return sbGet(url).then(function (rows) {
      var byDay = {};
      rows.forEach(function (r) {
        var d = String(r.fetched_at).slice(0, 10);
        if (byDay[d] == null || r.price < byDay[d]) byDay[d] = r.price;
      });
      var days = Object.keys(byDay).sort();
      var cutoff = Date.now() - 30 * 86400000;
      var inWindow = days.filter(function (d) { return Date.parse(d + "T00:00:00Z") >= cutoff; });
      var vals = inWindow.map(function (d) { return byDay[d]; });
      var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
      var h = { days: days.length, snapshots: rows.length, avg: avg, first: days[0] || null,
        points: inWindow.map(function (d) { return { day: d, best: byDay[d] }; }) };
      state.historyCache[itemId] = h;
      return h;
    });
  }
  function sparkSVG(points, isDeal) {
    if (points.length < 2) return "";
    var vals = points.map(function (p) { return p.best; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), rng = (max - min) || 1;
    var pts = points.map(function (p, i) {
      return (i / (points.length - 1) * 220).toFixed(1) + "," + (30 - ((p.best - min) / rng) * 26 - 2).toFixed(1);
    }).join(" ");
    return '<svg width="220" height="34" viewBox="0 0 220 34" role="img" aria-label="30-day price trend" style="max-width:100%"><polyline points="' + pts + '" fill="none" stroke="' + (isDeal ? "var(--green)" : "var(--ink-3)") + '" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  }
  function historyHTML(item, hist) {
    if (!hist || hist.days < 2) {
      var n = hist ? hist.days : 1;
      return '<div class="hist-box"><div class="hist-head"><span><b>Last 30 days</b> · best price each day</span></div>'
        + '<div class="hist-verdict flat">Building history — ' + n + ' price check' + (n === 1 ? '' : 's') + ' so far'
        + (hist && hist.first ? ' (first ' + fmtDate(hist.first) + ')' : '')
        + '. The 30-day average appears after the next weekly check.</div></div>';
    }
    var crown = crowned(item);
    var pct = ((hist.avg - crown.row.price) / hist.avg) * 100;
    var isDeal = crown.row.price < hist.avg;
    return '<div class="hist-box"><div class="hist-head"><span><b>Last 30 days</b> · best price each day</span><span>30-day avg <b>' + money(hist.avg) + '</b></span></div>'
      + sparkSVG(hist.points, isDeal)
      + '<div class="hist-verdict ' + (isDeal ? 'good' : 'flat') + '">'
      + (isDeal ? '🔔 Deal alert: today ' + money(crown.row.price) + ' is ' + pct.toFixed(1) + '% below the 30-day average (' + money(hist.avg) + ').'
        : 'Today ' + money(crown.row.price) + ' is at / above the 30-day average (' + money(hist.avg) + ') — no alert.')
      + '</div></div>';
  }
  function fillHistory(item) {
    var box = document.querySelector('[data-hist="' + item.id + '"]');
    if (!box) return;
    loadHistory(item.id).then(function (hist) { box.outerHTML = historyHTML(item, hist); })
      .catch(function () { box.outerHTML = historyHTML(item, null); });
  }

  /* ---------- product card ---------- */
  function cardHTML(item) {
    var crown = crowned(item);
    if (!crown) return "";
    var best = crown.row, second = nextBest(item, crown);
    var save = second ? second.price - best.price : 0;
    var inList = !!list[item.id];
    var isW = !!tracked[item.id];
    var dealPct = discountPct(best);
    var cond = rowCondition(best);
    var tags = '<span class="tag tag-best">Best price</span>';
    if (crown.limited) tags += '<span class="tag tag-save">Limit deal — see terms below</span>';
    else if (cond && hasCardCondition(best)) tags += '<span class="tag tag-loyal">' + esc(cond) + '</span>';
    if (dealPct > 0) tags += '<span class="tag tag-save">' + dealPct.toFixed(0) + '% off this week</span>';
    if (save > 0) tags += '<span class="tag tag-save">Save ' + money(save) + ' vs ' + esc(second.merchant) + '</span>';
    var unit = unitLabel(best);
    var rows = item.rows.map(function (row, i) {
      var c = rowCondition(row);
      var lim = isLimitRow(row);
      return '<tr class="' + (row === best ? 'win' : '') + '"><td>' + esc(row.merchant) + (row === best ? ' · best' : '')
        + (lim ? ' <span class="fresh">(limit deal — not counted as best)</span>' : '')
        + (c ? '<br><span class="fresh">' + esc(c) + '</span>' : '') + '</td>'
        + '<td class="r"><span class="p">' + money(row.price) + '</span>'
        + (row.regular_price != null && row.regular_price > row.price ? '<br><span class="u">was ' + money(row.regular_price) + '</span>' : '') + '</td>'
        + '<td class="r"><span class="u">' + (unitLabel(row) || '—') + '</span></td>'
        + '<td class="r fresh">ends ' + fmtDate(row.valid_to) + '</td></tr>';
    }).join("");
    var meta = (item.size_text ? esc(item.size_text) : "Size not listed")
      + (item.brand ? " · " + esc(item.brand) : "")
      + (item.upc ? " · UPC " + esc(item.upc) : " · no barcode — by name");
    return '<article class="card best" data-card="' + item.id + '">'
      + '<button class="card-top" data-expand="' + item.id + '" aria-expanded="false" aria-label="Compare prices for ' + esc(item.name) + '">'
      + '<span class="thumb" aria-hidden="true">' + emojiFor(item) + '</span>'
      + '<span class="card-main"><span class="card-name">' + esc(item.name) + '</span>'
      + '<span class="card-meta" style="display:block">' + meta + '</span></span>'
      + '<span class="price-block"><span class="price-big">' + money(best.price) + '</span>'
      + '<span class="price-store" style="display:block">at ' + esc(best.merchant) + '</span>'
      + (unit ? '<span class="price-unit">' + esc(unit) + '</span>' : '') + '</span>'
      + '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
      + '</button>'
      + '<div class="tagrow">' + tags + '</div>'
      + (second ? '<p class="gap-line">Next cheapest: <b>' + money(second.price) + ' at ' + esc(second.merchant) + '</b> — you save <b>' + money(save) + '</b> at ' + esc(best.merchant) + '.</p>' : '')
      + '<div class="card-actions">'
      + '<button class="btn-add' + (inList ? ' added' : '') + '" data-add="' + item.id + '">' + (inList ? '✓ On your list' : '+ Add to list') + '</button>'
      + '<button class="btn-watch' + (isW ? ' on' : '') + '" data-watch="' + item.id + '" aria-pressed="' + (isW ? 'true' : 'false') + '">' + (isW ? '🔔 Tracking' : '🔔 Track price') + '</button>'
      + '<button class="btn-ghost" data-expand="' + item.id + '">Compare</button>'
      + '</div>'
      + '<div class="compare"><table><thead><tr><th>Store</th><th class="r">Price</th><th class="r">Per unit</th><th class="r">Freshness</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="fresh-note" style="margin-top:8px">Checked ' + fmtDateLong(state.checkedAt) + ' · prices are this week\'s flyer prices.</p>'
      + '<div data-hist="' + item.id + '">' + historyHTML(item, null) + '</div>'
      + '</div></article>';
  }

  function renderLoading() {
    $("results").innerHTML = '<div class="empty"><b>Checking this week\'s flyers…</b>Loading real prices for ZIP ' + esc(state.zip) + '.</div>';
    $("resultsTitle").textContent = "Best prices near you";
    $("resultsCount").textContent = "";
  }
  function renderResults(items, label) {
    var el = $("results");
    $("resultsTitle").textContent = label;
    if (state.error) {
      $("resultsCount").textContent = "";
      el.innerHTML = '<div class="empty"><b>Couldn\'t load prices</b>' + esc(state.error)
        + '<br><br><button class="btn-add" data-retry="1">Try again</button></div>';
      return;
    }
    if (!state.items.length && !state.loading) {
      $("resultsCount").textContent = "";
      el.innerHTML = '<div class="empty"><b>No prices for ZIP ' + esc(state.zip) + ' yet</b>The weekly check covers 08520 (East Windsor, NJ) so far. Try 08520, or check back after Friday\'s refresh.</div>';
      return;
    }
    $("resultsCount").textContent = state.items.length + " item" + (state.items.length === 1 ? "" : "s")
      + (state.checkedAt ? " · checked " + fmtDate(state.checkedAt) : "");
    if (!items.length) {
      el.innerHTML = '<div class="empty"><b>No match in this week\'s flyers</b>Try “milk”, “eggs”, “juice”, “cheese” — or scan the barcode. An item only appears when it is on sale in a flyer, so everyday prices that aren\'t on sale this week won\'t show up.</div>';
      return;
    }
    var shown = state.showAll ? items : items.slice(0, PAGE_SIZE);
    el.innerHTML = shown.map(cardHTML).join("")
      + (items.length > shown.length
        ? '<button class="btn-ghost" data-showall="1" style="width:100%;justify-content:center">Show all ' + items.length + ' items</button>'
        : '');
  }

  /* ---------- basket totals ---------- */
  function listEntries() {
    return Object.keys(list).map(function (id) { return { item: state.byId[id], qty: list[id] }; })
      .filter(function (e) { return e.item; });
  }
  function basketTotals(entries) {
    return state.merchants.map(function (store) {
      var total = 0, missing = [];
      entries.forEach(function (e) {
        var p = priceAt(e.item, store);
        if (p == null) missing.push(e.item.name); else total += p * e.qty;
      });
      return { store: store, total: total, missing: missing };
    }).sort(function (a, b) {
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      return a.total - b.total;
    });
  }
  function renderBasket() {
    var strip = $("basketStrip"), note = $("basketNote");
    var entries = listEntries();
    if (!entries.length) {
      strip.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Your list is empty</b>Add items from the results above and this strip prices the whole basket at each store.</div>';
      note.textContent = "";
      return;
    }
    var totals = basketTotals(entries);
    var complete = totals.filter(function (t) { return t.missing.length === 0; });
    var bestSingle = complete.length ? complete[0] : totals[0];
    var splitTotal = entries.reduce(function (sum, e) { var c = crowned(e.item); return sum + (c ? c.row.price : 0) * e.qty; }, 0);
    strip.innerHTML = totals.slice(0, 3).map(function (t) {
      var win = complete.length && t.store === bestSingle.store;
      return '<div class="basket-card' + (win ? ' win' : '') + '"><div class="store">' + esc(t.store) + (win ? '<span class="tag tag-best">Cheapest basket</span>' : '') + '</div>'
        + '<div class="total">' + money(t.total) + '</div>'
        + '<div class="note">' + entries.length + ' item' + (entries.length === 1 ? '' : 's') + ' · one trip' + (t.missing.length ? '' : ' · complete') + '</div>'
        + (t.missing.length ? '<div class="miss">Not priced here: ' + esc(t.missing.join(", ")) + '</div>' : '') + '</div>';
    }).join("");
    note.innerHTML = complete.length
      ? 'Cheapest single store: <b>' + esc(bestSingle.store) + ' at ' + money(bestSingle.total) + '</b>. Splitting the list — buying each item at its best store — totals <b>' + money(splitTotal) + '</b>' + (splitTotal < bestSingle.total ? ', saving <b>' + money(bestSingle.total - splitTotal) + '</b> for the extra trips.' : '.')
      : 'No single store prices the whole list this week — splitting across stores totals <b>' + money(splitTotal) + '</b>.';
  }

  /* ---------- deals (real was-prices only) ---------- */
  function dealItems() {
    return state.items.map(function (item) {
      var bestDeal = null;
      item.rows.forEach(function (r) {
        var pct = discountPct(r);
        if (pct > 0 && (!bestDeal || pct > bestDeal.pct)) bestDeal = { row: r, pct: pct };
      });
      return bestDeal ? { item: item, row: bestDeal.row, pct: bestDeal.pct } : null;
    }).filter(Boolean).sort(function (a, b) { return b.pct - a.pct; });
  }
  function renderDeals() {
    var deals = dealItems();
    var grid = $("dealGrid");
    if (!deals.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>No was-price deals this week</b>Only items with a real was-price are shown here — this week\'s flyers list a sale price with no was-price for most items.</div>';
    } else {
      grid.innerHTML = deals.map(function (d) {
        var item = d.item, inList = !!list[item.id];
        var unit = unitLabel(d.row);
        return '<div class="deal-card"><span class="thumb" aria-hidden="true">' + emojiFor(item) + '</span>'
          + '<div style="min-width:0"><span class="deal-off">' + d.pct.toFixed(0) + '% off</span>'
          + '<div class="deal-name">' + esc(item.name) + (item.size_text ? ' · ' + esc(item.size_text) : '') + '</div>'
          + '<div class="deal-prices"><span class="deal-now">' + money(d.row.price) + '</span><span class="deal-was">' + money(d.row.regular_price) + '</span></div>'
          + '<div class="deal-meta">Best at ' + esc(d.row.merchant) + (unit ? ' · ' + esc(unit) : '') + ' · ends ' + fmtDate(d.row.valid_to) + '</div></div>'
          + '<button class="btn-add' + (inList ? ' added' : '') + '" data-add="' + item.id + '">' + (inList ? '✓ Listed' : '+ Add') + '</button></div>';
      }).join("");
    }
    var rail = $("railDeals");
    rail.innerHTML = deals.slice(0, 3).map(function (d) {
      return '<div class="rail-deal"><div><div class="nm">' + esc(d.item.name) + '</div><div class="st">' + esc(d.row.merchant) + '</div></div><div class="pr">' + money(d.row.price) + '</div></div>';
    }).join("") || '<p class="sub">No was-price deals this week.</p>';
  }

  /* ---------- list ---------- */
  function renderList() {
    var stack = $("listStack"), totalsEl = $("listTotals");
    var entries = listEntries();
    var count = entries.reduce(function (s, e) { return s + e.qty; }, 0);
    ["railListCount", "tabListBadge"].forEach(function (id) {
      var b = $(id);
      b.hidden = count === 0; b.textContent = count;
    });
    if (!entries.length) {
      stack.innerHTML = '<div class="empty"><b>Nothing on your list yet</b>Search or scan an item and tap “Add to list”. The list lives in this browser only — no account, no sign-up, nothing personal stored.</div>';
      totalsEl.innerHTML = "";
      return;
    }
    stack.innerHTML = entries.map(function (e) {
      var crown = crowned(e.item), isW = !!tracked[e.item.id];
      var unit = unitLabel(crown.row);
      return '<div class="list-row"><span class="thumb" aria-hidden="true">' + emojiFor(e.item) + '</span>'
        + '<div style="min-width:0"><div class="nm">' + esc(e.item.name) + '</div><div class="bs">Best: ' + esc(crown.row.merchant) + (unit ? ' · ' + esc(unit) : '') + '</div>'
        + '<div class="watch-line"><span class="watch-dot' + (isW ? ' on' : '') + '"></span>'
        + (isW ? 'Tracking · history building — alerts start after the next weekly check' : 'Not tracked')
        + ' <button class="btn-watch' + (isW ? ' on' : '') + '" style="min-height:34px;padding:5px 10px;font-size:12.5px" data-watch="' + e.item.id + '">' + (isW ? '🔔 Tracking' : '🔔 Track') + '</button></div></div>'
        + '<div class="qty"><button data-qty="' + e.item.id + '|-1" aria-label="One less ' + esc(e.item.name) + '">−</button><span class="n">' + e.qty + '</span><button data-qty="' + e.item.id + '|1" aria-label="One more ' + esc(e.item.name) + '">+</button></div>'
        + '<div class="bp"><div class="p">' + money(crown.row.price * e.qty) + '</div><div class="s">at ' + esc(crown.row.merchant) + '</div></div>'
        + '<button class="btn-remove" data-remove="' + e.item.id + '">Remove</button></div>';
    }).join("");
    var totals = basketTotals(entries);
    var complete = totals.filter(function (t) { return t.missing.length === 0; });
    var bestSingle = complete.length ? complete[0] : null;
    var splitTotal = entries.reduce(function (sum, e) { var c = crowned(e.item); return sum + (c ? c.row.price : 0) * e.qty; }, 0);
    var cards = totals.map(function (t) {
      var win = bestSingle && t.store === bestSingle.store;
      return '<div class="basket-card' + (win ? ' win' : '') + '"><div class="store">' + esc(t.store) + (win ? '<span class="tag tag-best">Cheapest basket</span>' : '') + '</div><div class="total">' + money(t.total) + '</div>'
        + '<div class="note">Whole list, one trip</div>' + (t.missing.length ? '<div class="miss">Not priced here: ' + esc(t.missing.join(", ")) + '</div>' : '') + '</div>';
    }).join("");
    totalsEl.innerHTML = '<div class="sec-head"><h2>What the list costs</h2><span class="hint">By store</span></div>'
      + '<div class="basket-strip">' + cards + '</div>'
      + (bestSingle && splitTotal < bestSingle.total
        ? '<div class="split-banner"><h3>Split the list and save</h3><div class="t">' + money(splitTotal) + '</div><p>Buying each item at its cheapest store totals ' + money(splitTotal) + ' vs ' + money(bestSingle.total) + ' all at ' + esc(bestSingle.store) + ' — you save ' + money(bestSingle.total - splitTotal) + ', at the cost of extra trips.</p></div>'
        : '');
  }

  /* ---------- alerts / tracked history ---------- */
  function renderAlerts() {
    var trackedItems = Object.keys(tracked).map(function (id) { return state.byId[id]; }).filter(Boolean);
    var strip = $("alertStrip"), listEl = $("listAlerts");
    var note = trackedItems.length
      ? '<div class="plain-note" style="margin:0 0 10px">🔔 Tracking ' + trackedItems.length + ' item' + (trackedItems.length === 1 ? '' : 's') + ' — history is still building (one price check so far), so no alert can fire yet. Alerts start after the next weekly check, when a 30-day average exists.</div>'
      : '';
    strip.innerHTML = note;
    listEl.innerHTML = note || '<div class="plain-note" style="margin:0 0 10px">No price-drop alerts right now — nothing is tracked yet. Tap “🔔 Track price” on an item and an alert appears here the moment it drops below its 30-day average.</div>';
    var th = $("trackedHistory");
    if (th) {
      if (!trackedItems.length) {
        th.innerHTML = '<div class="empty"><b>Nothing tracked yet</b>Tap “Track price” on any item in Search.</div>';
      } else {
        th.innerHTML = '<div class="sec-head" style="margin-top:14px"><h2 style="font-size:18px">Tracked items — 30 days</h2></div>'
          + trackedItems.map(function (item) {
            return '<div class="fact" style="padding:14px"><h3 style="font-size:15px">' + emojiFor(item) + ' ' + esc(item.name) + (item.size_text ? ' · ' + esc(item.size_text) : '') + '</h3><div data-hist="' + item.id + '">' + historyHTML(item, null) + '</div></div>';
          }).join("");
        trackedItems.forEach(function (item) { fillHistory(item); });
      }
    }
  }

  /* ---------- schedule strip + stores ---------- */
  function renderSchedule() {
    var byMerchant = {};
    state.flyers.forEach(function (f) {
      if (state.merchants.indexOf(f.merchant) === -1) return;
      if (!byMerchant[f.merchant] || f.valid_from < byMerchant[f.merchant].valid_from) byMerchant[f.merchant] = f;
    });
    $("schedPills").innerHTML = Object.keys(byMerchant).sort().map(function (m) {
      var f = byMerchant[m];
      return '<span class="sched-pill">' + esc(m) + ' · new flyer <em>' + weekday(f.valid_from) + '</em></span>';
    }).join(" ");
    var rail = $("railStores");
    rail.innerHTML = state.merchants.map(function (m) {
      var n = 0;
      state.items.forEach(function (item) { if (item.rows.some(function (r) { return r.merchant === m; })) n++; });
      return '<div class="rail-store"><span>' + esc(m) + '</span><span class="d">' + n + ' item' + (n === 1 ? '' : 's') + '</span></div>';
    }).join("");
    $("storeList").innerHTML = state.merchants.map(function (m) {
      var n = 0, latest = null;
      state.items.forEach(function (item) {
        item.rows.forEach(function (r) {
          if (r.merchant === m) { n++; if (!latest || r.valid_to > latest) latest = r.valid_to; }
        });
      });
      return '<div class="store-row"><div><div class="nm">' + esc(m) + '</div><div class="meta">' + n + ' price' + (n === 1 ? '' : 's') + ' this week · flyer good through ' + fmtDate(latest) + '</div></div><span class="dist">' + n + ' items</span></div>';
    }).join("") || '<div class="empty"><b>No stores yet</b>Set a ZIP to load this week\'s flyers.</div>';
  }

  /* ---------- navigation ---------- */
  var VIEWS = ["search", "deals", "scan", "list", "stores", "saved", "why", "more"];
  function go(view) {
    if (VIEWS.indexOf(view) === -1) view = "search";
    VIEWS.forEach(function (v) { $("view-" + v).classList.toggle("active", v === view); });
    document.querySelectorAll(".tab").forEach(function (t) {
      if (t.getAttribute("data-go") === view) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    document.querySelectorAll(".rail-nav-btn").forEach(function (t) {
      if (t.getAttribute("data-go") === view) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    if (view === "saved") renderAlerts();
    window.scrollTo(0, 0);
  }

  /* ---------- search ---------- */
  function doSearch(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) { renderResults(state.items, "Best prices near you"); return; }
    var terms = q.split(/\s+/);
    var hits = state.items.filter(function (item) {
      var hay = (item.name + " " + (item.brand || "") + " " + item.category + " " + (item.upc || "")).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    renderResults(hits, 'Results for “' + q + '”');
  }

  /* ---------- scan (UPC lookup + camera) ---------- */
  function showScanResult(item) {
    $("scanResult").innerHTML =
      '<div class="sec-head" style="margin-top:4px"><h2>Found: ' + esc(item.name) + '</h2><span class="hint">UPC ' + esc(item.upc || "") + '</span></div>' + cardHTML(item);
  }
  function scanNotFound(code) {
    $("scanResult").innerHTML = '<div class="empty"><b>No barcode match in this week\'s flyers</b>UPC ' + esc(code) + ' isn\'t on sale in any flyer this week. Try searching by item name instead — loose produce and deli items have no barcode at all.</div>';
  }
  function lookupUpc(code) {
    var hit = null;
    state.items.forEach(function (item) { if (item.upc && item.upc === code) hit = item; });
    if (hit) showScanResult(hit); else scanNotFound(code);
  }
  function stopCamera() {
    if (state.scanStream) { state.scanStream.getTracks().forEach(function (t) { t.stop(); }); state.scanStream = null; }
    if (state.scanRaf) { cancelAnimationFrame(state.scanRaf); state.scanRaf = 0; }
    var v = $("scanVideo");
    v.hidden = true; v.srcObject = null;
    $("btnCameraScan").textContent = "Scan with camera";
  }
  function startCamera() {
    var msg = $("scanMsg");
    if (!("BarcodeDetector" in window)) {
      msg.textContent = "Camera scan isn't supported in this browser — type the UPC number below instead.";
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg.textContent = "This browser won't open the camera here — type the UPC number below instead.";
      return;
    }
    msg.textContent = "Opening camera… point it at the barcode.";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (stream) {
      state.scanStream = stream;
      var v = $("scanVideo");
      v.hidden = false; v.srcObject = stream; v.play();
      $("btnCameraScan").textContent = "Stop camera";
      msg.textContent = "Scanning… hold the barcode steady in frame.";
      var detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      var lastTry = 0;
      var loop = function () {
        if (!state.scanStream) return;
        var now = Date.now();
        if (now - lastTry > 500) {
          lastTry = now;
          detector.detect(v).then(function (codes) {
            if (codes && codes.length) {
              var code = String(codes[0].rawValue || "").replace(/\D/g, "");
              stopCamera();
              msg.textContent = "Scanned UPC " + code + ".";
              lookupUpc(code);
              toast("Scanned — comparing at every store");
            }
          }).catch(function () { /* frame not readable yet */ });
        }
        if (state.scanStream) state.scanRaf = requestAnimationFrame(loop);
      };
      state.scanRaf = requestAnimationFrame(loop);
    }).catch(function () {
      msg.textContent = "Camera didn't open (permission or no camera) — type the UPC number below instead.";
    });
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (ev) {
    var retry = ev.target.closest("[data-retry]");
    if (retry) { loadZip(state.zip); return; }
    var showAll = ev.target.closest("[data-showall]");
    if (showAll) { state.showAll = true; doSearch($("q").value); return; }
    var goBtn = ev.target.closest("[data-go]");
    if (goBtn) { go(goBtn.getAttribute("data-go")); return; }
    var chip = ev.target.closest("[data-chip]");
    if (chip) {
      $("q").value = chip.getAttribute("data-chip");
      state.showAll = false;
      doSearch(chip.getAttribute("data-chip"));
      return;
    }
    var exp = ev.target.closest("[data-expand]");
    if (exp) {
      var card = document.querySelector('[data-card="' + exp.getAttribute("data-expand") + '"]');
      if (card) {
        var open = card.classList.toggle("open");
        var top = card.querySelector(".card-top");
        if (top) top.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) { var item = state.byId[exp.getAttribute("data-expand")]; if (item) fillHistory(item); }
      }
      return;
    }
    var add = ev.target.closest("[data-add]");
    if (add) {
      var id = add.getAttribute("data-add");
      if (list[id]) { toast(state.byId[id].name + " is already on your list"); }
      else { list[id] = 1; writeJSON(LS_LIST, list); toast("Added " + state.byId[id].name + " to your list"); }
      renderAll();
      return;
    }
    var qty = ev.target.closest("[data-qty]");
    if (qty) {
      var parts = qty.getAttribute("data-qty").split("|");
      list[parts[0]] = Math.max(0, (list[parts[0]] || 0) + parseInt(parts[1], 10));
      if (list[parts[0]] === 0) delete list[parts[0]];
      writeJSON(LS_LIST, list);
      renderAll();
      return;
    }
    var rem = ev.target.closest("[data-remove]");
    if (rem) { delete list[rem.getAttribute("data-remove")]; writeJSON(LS_LIST, list); renderAll(); return; }
    var wat = ev.target.closest("[data-watch]");
    if (wat) {
      var wid = wat.getAttribute("data-watch");
      if (tracked[wid]) { delete tracked[wid]; writeJSON(LS_TRACKED, tracked); toast("Stopped tracking " + state.byId[wid].name); }
      else {
        tracked[wid] = true; writeJSON(LS_TRACKED, tracked);
        toast("Tracking " + state.byId[wid].name + " — alert when it drops below its 30-day avg");
        if (!list[wid]) { list[wid] = 1; writeJSON(LS_LIST, list); }
      }
      renderAll();
    }
  });

  $("searchForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
  $("q").addEventListener("input", function (ev) { state.showAll = false; doSearch(ev.target.value); });
  $("upcForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = $("upcInput").value.replace(/\D/g, "");
    if (!v) { toast("Type the UPC number first"); return; }
    lookupUpc(v);
  });
  $("btnCameraScan").addEventListener("click", function () {
    if (state.scanStream) stopCamera(); else startCamera();
  });
  $("btnLocToggle").addEventListener("click", function () {
    var p = $("locPanel");
    var open = p.classList.toggle("open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) $("zipInput").focus();
  });
  $("locForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var zip = $("zipInput").value.trim();
    if (!/^\d{5}(-\d{4})?$/.test(zip)) { toast("Enter a 5-digit ZIP to load prices near you"); return; }
    zip = zip.slice(0, 5);
    $("locLabel").textContent = "Prices near " + zip;
    $("locSub").textContent = "Deals change by ZIP — flyers, stores & prices near you only.";
    $("btnLocToggle").textContent = "Change";
    $("locPanel").classList.remove("open");
    loadZip(zip);
    toast("Area set to " + zip + " — loading prices for stores there");
  });

  function renderAll() {
    doSearch($("q").value);
    renderDeals();
    renderBasket();
    renderList();
    renderSchedule();
    renderAlerts();
    if (state.checkedAt) {
      $("noticeShort").textContent = "From this week's flyers · " + state.items.length + " items · " + state.merchants.length + " stores · checked " + fmtDate(state.checkedAt) + ".";
    }
  }

  /* ---------- boot ---------- */
  var savedZip = null;
  try { savedZip = localStorage.getItem(LS_ZIP); } catch (e) { /* ignore */ }
  if (savedZip && /^\d{5}$/.test(savedZip)) state.zip = savedZip;
  $("locLabel").textContent = "Prices near " + state.zip;
  $("zipInput").value = state.zip;
  loadZip(state.zip);
  window.__dealfinder = { version: "1.0.0", state: state };
})();
