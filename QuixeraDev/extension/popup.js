/* popup logic */
const $ = (id) => document.getElementById(id);

async function refresh() {
  const s = await chrome.storage.local.get(['qa_recording', 'qa_trail', 'qa_pat', 'qa_repo', 'qa_branch']);
  const rec = s.qa_recording !== false;
  const n = (s.qa_trail || []).length;
  $('status').innerHTML = `Recording: <b>${rec ? 'ON 🟢' : 'PAUSED ⏸'}</b> · <b>${n}</b> steps captured` +
    (s.qa_pat ? ' · <b>token saved ✓</b>' : ' · <b style="color:#b91c1c">no token yet</b>');
  $('toggle').textContent = rec ? 'Pause' : 'Resume';
  if (s.qa_repo) $('repo').value = s.qa_repo;
  if (s.qa_branch) $('branch').value = s.qa_branch;
}
$('toggle').onclick = async () => {
  const s = await chrome.storage.local.get('qa_recording');
  const rec = s.qa_recording !== false;
  await chrome.storage.local.set({ qa_recording: !rec });
  refresh();
};
$('clear').onclick = async () => { await chrome.storage.local.set({ qa_trail: [] }); refresh(); };
$('save').onclick = async () => {
  await chrome.storage.local.set({
    qa_pat: $('pat').value.trim(),
    qa_repo: $('repo').value.trim() || 'apatel85/Dashboards',
    qa_branch: $('branch').value.trim() || 'main',
    qa_env: 'dev',
  });
  $('msg').textContent = 'Saved ✓'; $('msg').style.color = '#15803d';
  $('pat').value = '';
  refresh();
};
refresh();
