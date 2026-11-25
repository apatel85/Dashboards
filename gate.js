/* Dashboards shared PIN gate.
 *
 * Client-side curtain, not a lock. It keeps casual visitors out of the
 * static apps. The PIN is stored only as a SHA-256 hash; a 6-digit PIN
 * hash is brute-forceable, so this must never guard sensitive data.
 * Apps with real user data use Supabase Auth instead (TradeDesk,
 * PLDashboard, CricMaxConnect, WagWise).
 *
 * Entered once per tab session: sessionStorage is shared across all
 * pages on apatel85.github.io, so one unlock opens every gated app.
 */
(function () {
  'use strict';
  if (window.__dashboardsGateLoaded) return;
  window.__dashboardsGateLoaded = true;

  var KEY = 'dashboards-gate';
  var PIN_HASH = 'c3740d10d50d0c49275caa0404c74eed44c858729a6760acfd2f18e878e6a4e3';

  var unlocked = false;
  try { unlocked = sessionStorage.getItem(KEY) === 'unlocked'; } catch (e) {}
  if (unlocked) return;

  /* Hide page content immediately so nothing flashes before the prompt. */
  var hideStyle = document.createElement('style');
  hideStyle.id = 'dashboards-gate-hide';
  hideStyle.textContent = 'body{visibility:hidden !important}';
  (document.head || document.documentElement).appendChild(hideStyle);

  function sha256Hex(str) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle || !subtle.digest) return Promise.reject(new Error('crypto.subtle unavailable'));
    return subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function buildOverlay() {
    var style = document.createElement('style');
    style.textContent = [
      '#dashboards-gate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#111827;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}',
      '#dashboards-gate .dg-card{background:#ffffff;color:#111827;border-radius:12px;padding:32px 28px;width:100%;max-width:340px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45);box-sizing:border-box;}',
      '#dashboards-gate h1{font-size:20px;margin:0 0 8px;font-weight:700;}',
      '#dashboards-gate p{font-size:14px;color:#4b5563;margin:0 0 20px;line-height:1.5;}',
      '#dashboards-gate input{width:100%;box-sizing:border-box;font-size:24px;letter-spacing:8px;text-align:center;padding:12px;border:1px solid #d1d5db;border-radius:8px;outline:none;}',
      '#dashboards-gate input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.25);}',
      '#dashboards-gate button{width:100%;margin-top:16px;padding:12px;font-size:16px;font-weight:600;color:#ffffff;background:#2563eb;border:0;border-radius:8px;cursor:pointer;}',
      '#dashboards-gate button:active{background:#1d4ed8;}',
      '#dashboards-gate .dg-error{display:none;color:#dc2626;font-size:13px;margin:12px 0 0;}',
      '#dashboards-gate .dg-error.show{display:block;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'dashboards-gate';
    overlay.innerHTML =
      '<div class="dg-card">' +
        '<h1>Enter PIN</h1>' +
        '<p>This app is protected. Enter the 6-digit PIN to continue.</p>' +
        '<form id="dg-form" autocomplete="off">' +
          '<input id="dg-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" aria-label="6-digit PIN" />' +
          '<p class="dg-error" id="dg-error" role="alert"></p>' +
          '<button type="submit">Unlock</button>' +
        '</form>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    var form = document.getElementById('dg-form');
    var input = document.getElementById('dg-pin');
    var error = document.getElementById('dg-error');

    function fail(message) {
      error.textContent = message;
      error.classList.add('show');
      input.value = '';
      input.focus();
    }

    function submit() {
      var value = input.value.trim();
      if (!/^\d{6}$/.test(value)) {
        fail('Enter the 6-digit PIN.');
        return;
      }
      sha256Hex(value).then(function (hex) {
        if (hex === PIN_HASH) {
          try { sessionStorage.setItem(KEY, 'unlocked'); } catch (e) {}
          overlay.remove();
          hideStyle.remove();
        } else {
          fail('Incorrect PIN \u2014 try again.');
        }
      }).catch(function () {
        fail('This page needs a secure connection to unlock.');
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submit();
    });
    input.addEventListener('input', function () {
      error.classList.remove('show');
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      if (input.value.length === 6) submit();
    });
    input.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildOverlay);
  } else {
    buildOverlay();
  }
})();
