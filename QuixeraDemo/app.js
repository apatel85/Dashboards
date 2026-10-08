// Quixera UX demo — sample data only, nothing is saved or sent anywhere.

document.querySelectorAll('.persona-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.persona-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.persona).classList.add('active');
    window.scrollTo({top: 0});
  });
});

// ---- Guardian: week strip ----
const weekData = [
  {d:'M', n:6, sessions:1}, {d:'T', n:7, sessions:0}, {d:'W', n:8, sessions:1},
  {d:'T', n:9, sessions:0, today:true}, {d:'F', n:10, sessions:1},
  {d:'S', n:11, sessions:2}, {d:'S', n:12, sessions:0}
];
const strip = document.getElementById('weekStrip');
weekData.forEach(w => {
  const el = document.createElement('div');
  el.className = 'day' + (w.today ? ' today' : '');
  let dots = '';
  for (let i = 0; i < w.sessions; i++) dots += '<i></i>';
  el.innerHTML = `<div class="d">${w.d}</div><div class="n">${w.n}</div><div class="dots">${dots}</div>`;
  strip.appendChild(el);
});

// ---- Guardian: child chips (demo swap of the headline name) ----
const kidData = {
  aarav: { name: 'Aarav', tag: 'U12', greet: 'Priya Sharma' },
  diya:  { name: 'Diya',  tag: 'U8',  greet: 'Priya Sharma' }
};
document.querySelectorAll('.child-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ---- Coach: attendance flow ----
const rosterNames = [
  ['Aarav S.', 'U12 · Bowler'], ['Vihaan M.', 'U12 · Batter'], ['Kabir R.', 'U12 · All-rounder'],
  ['Arjun P.', 'U12 · Batter'], ['Reyansh K.', 'U12 · Bowler'], ['Ishaan D.', 'U12 · Wicket-keeper'],
  ['Ayaan T.', 'U12 · Batter'], ['Krishna V.', 'U12 · Bowler'], ['Aditya N.', 'U12 · All-rounder'],
  ['Sai R.', 'U12 · Batter'], ['Dev P.', 'U12 · Bowler'], ['Yash J.', 'U12 · Fielder'],
  ['Om S.', 'U12 · Batter'], ['Rudra M.', 'U12 · Bowler'], ['Atharv K.', 'U12 · Batter'],
  ['Dhruv L.', 'U12 · All-rounder'], ['Nikhil B.', 'U12 · Wicket-keeper'], ['Farhan Q.', 'U12 · Bowler']
];
const status = new Array(rosterNames.length).fill(null);
const rosterEl = document.getElementById('roster');
const presentCount = document.getElementById('presentCount');

function renderRoster() {
  rosterEl.innerHTML = '';
  rosterNames.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'athlete-row';
    row.innerHTML = `<div class="nm">${r[0]}<small>${r[1]}</small></div>
      <div class="seg">
        <button data-i="${i}" data-v="present" class="${status[i]==='present'?'on-present':''}">Here</button>
        <button data-i="${i}" data-v="absent" class="${status[i]==='absent'?'on-absent':''}">Away</button>
      </div>`;
    rosterEl.appendChild(row);
  });
  const here = status.filter(s => s === 'present').length;
  presentCount.textContent = `${here}/${rosterNames.length}`;
}
rosterEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const i = +b.dataset.i;
  status[i] = (status[i] === b.dataset.v) ? null : b.dataset.v; // tap again to clear
  renderRoster();
});
document.getElementById('markAllBtn').addEventListener('click', () => {
  status.fill('present');
  renderRoster();
});
document.getElementById('startSessionBtn').addEventListener('click', () => {
  document.getElementById('attendanceFlow').hidden = false;
  document.getElementById('startSessionBtn').textContent = 'Session in progress…';
  document.getElementById('startSessionBtn').disabled = true;
  renderRoster();
  document.getElementById('attendanceFlow').scrollIntoView({behavior:'smooth'});
});
document.getElementById('finishAttendanceBtn').addEventListener('click', () => {
  // Build quick-note rows only for present athletes (demo keeps it short: first 6)
  const notesEl = document.getElementById('notesRoster');
  notesEl.innerHTML = '';
  rosterNames.forEach((r, i) => {
    if (status[i] !== 'present') return;
    const row = document.createElement('div');
    row.className = 'athlete-row';
    row.style.display = 'block';
    row.innerHTML = `<div class="nm">${r[0]}<small>${r[1]}</small></div>
      <textarea class="note-input" rows="2" placeholder="Note for parents (optional)…"></textarea>`;
    notesEl.appendChild(row);
  });
  document.getElementById('notesStep').hidden = false;
  document.getElementById('notesStep').scrollIntoView({behavior:'smooth'});
});
document.getElementById('wrapUpBtn').addEventListener('click', () => {
  document.getElementById('doneStep').hidden = false;
  document.getElementById('doneStep').scrollIntoView({behavior:'smooth'});
});
renderRoster();
