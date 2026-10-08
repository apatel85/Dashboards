// Quixera UX demo — replica + proposed redesign. Sample data only; nothing is saved or sent.

/* ---------- persona + mode switching ---------- */
document.querySelectorAll('.persona-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.persona-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#view-guardian, #view-coach, #view-admin').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.persona).classList.add('active');
    window.scrollTo({top: 0});
  });
});
const modeCaption = document.getElementById('modeCaption');
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const proposed = btn.dataset.mode === 'proposed';
    document.getElementById('academy-current').hidden = proposed;
    document.getElementById('academy-proposed').hidden = !proposed;
    modeCaption.textContent = proposed
      ? 'The same academy, redesigned: one attention queue, plain words, everything still one search away.'
      : 'Faithful replica of the live app as reviewed — this is how it looks today.';
    window.scrollTo({top: 0});
  });
});

/* ---------- guardian: week strip ---------- */
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
document.querySelectorAll('.child-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

/* ---------- coach: attendance flow ---------- */
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
  presentCount.textContent = `${status.filter(s => s === 'present').length}/${rosterNames.length}`;
}
rosterEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const i = +b.dataset.i;
  status[i] = (status[i] === b.dataset.v) ? null : b.dataset.v;
  renderRoster();
});
document.getElementById('markAllBtn').addEventListener('click', () => { status.fill('present'); renderRoster(); });
document.getElementById('startSessionBtn').addEventListener('click', () => {
  document.getElementById('attendanceFlow').hidden = false;
  const s = document.getElementById('startSessionBtn');
  s.textContent = 'Session in progress…'; s.disabled = true;
  renderRoster();
  document.getElementById('attendanceFlow').scrollIntoView({behavior:'smooth'});
});
document.getElementById('finishAttendanceBtn').addEventListener('click', () => {
  const notesEl = document.getElementById('notesRoster');
  notesEl.innerHTML = '';
  rosterNames.forEach((r, i) => {
    if (status[i] !== 'present') return;
    const row = document.createElement('div');
    row.className = 'athlete-row'; row.style.display = 'block';
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

/* ================= ACADEMY REPLICA DATA ================= */
const NAV = [
  {sec:'dashboard', label:'🏠 Dashboard'},
  {group:'People'},
  {sec:'athletes', label:'Athletes', badge:'247'},
  {sec:'coaches', label:'Coaches'},
  {sec:'customers', label:'Customers'},
  {sec:'schedule', label:'📅 Schedule', badge:'105', badgeRed:true},
  {group:'Academy'},
  {sec:'programs', label:'Programs'},
  {sec:'programs2', label:'Programs v2'},
  {sec:'waitlist', label:'Waitlist'},
  {sec:'inquiries', label:'Inquiries'},
  {sec:'memberships', label:'Memberships'},
  {sec:'plans', label:'Plans & Packages'},
  {sec:'events', label:'Events'},
  {sec:'facilities', label:'Facilities'},
  {sec:'bookings', label:'Bookings'},
  {group:'Inbox', badge:'9+', badgeRed:true},
  {sec:'notifications', label:'Notifications'},
  {sec:'messages', label:'Messages'},
  {sec:'announcements', label:'Announcements'},
  {sec:'approvals', label:'Approvals'},
  {group:'Finance'},
  {sec:'billing', label:'Billing'},
  {sec:'payments', label:'Payments'},
  {sec:'settlements', label:'Settlements'},
  {group:'Insights'},
  {sec:'reports', label:'Reports'},
  {sec:'analytics', label:'Analytics'},
  {sec:'ai', label:'AI Insights'},
  {sec:'settings', label:'⚙️ Settings'},
  {sec:'legal', label:'❓ Help & Legal'},
];
const GENERIC = {
  coaches:{t:'Coaches', s:'The people who run your sessions', tiles:[['Coaches','14'],['Active','12'],['Avg utilization','81%'],['Avg rating','4.7 ★']], body:'<p class="card-sub">Coach cards show photo, specialty, assigned programs, utilization %, hours and star rating. Same table pattern as Athletes: search, filters, status tabs, sortable columns.</p>'},
  customers:{t:'Customers', s:'Guardians, teams and billing contacts', tiles:[['Individuals','8'],['Teams','10'],['Active','7'],['Pending verification','0']], body:'<p class="card-sub">People list with tag chips (Guardian, VIP, Adult, Newsletter, Corporate), last activity and status. Overlaps with Athletes, Memberships and Inquiries — four "people" lists.</p>'},
  programs:{t:'Programs', s:'Class schedules and templates', tiles:[['Live offerings','11 of 18'],['Athletes enrolled','183'],["Today's sessions",'5'],['Pending review','2']], body:'<p class="card-sub">Tabs: Class Schedules 18 / Templates 8. Sortable table: Program, Seats, Next Session, Coach, Status (Active, Scheduled, Completed, Waitlist, Draft, Archived). Sports: cricket, tennis, baseball, football.</p>'},
  programs2:{t:'Programs v2', s:'Experimental program builder', tiles:[['Published','3'],['Classes running','6'],['Seats filled','23 of 44'],['Sessions generated','103']], body:'<p class="card-sub">"Construct v2 — a program is the definition; classes are its runs." A second, parallel builder alongside Programs. Two live builders doing the same job is the #1 "which one do I use?" confusion.</p>'},
  waitlist:{t:'Waitlist', s:'Who is waiting for a spot', tiles:[['Waiting','17'],['Programs at capacity','4'],['Offers outstanding','3'],['Expiring in 24h','2']], body:'<p class="card-sub">Expandable program rows: Capacity (e.g. 20/20), Waiting, Oldest wait (38d), Offers out. Promote action per row.</p>'},
  inquiries:{t:'Inquiries', s:'Lead pipeline', tiles:[['New','6'],['In motion','9'],['Enrolled this month','4'],['Stale > 1 day','12']], body:'<p class="card-sub">Pipeline tabs: All 24 / New 6 / Contacted 7 / Visit scheduled 3 / Trial 3 / Awaiting payment 3 / Enrolled 2 / Lost 2 / Stale 12. List/kanban toggle, bulk-edit.</p>'},
  memberships:{t:'Memberships', s:'Recurring plans per athlete', tiles:[['Active members','11'],['Monthly recurring','$1,103'],['Renewing in 14 days','9'],['Past due','1']], body:'<p class="card-sub">Member, Plan, Status, Next renewal, MRR, auto-renew switches. Status tabs: Renewing soon, Grace, Past due, Suspended, Frozen, Cancelled, Expired.</p>'},
  plans:{t:'Plans & Packages', s:'Catalog & pricing — four flavours', tiles:[['Active plans','10'],['Counted plans','8'],['Windowed passes','3'],['Avg price','$115.55']], body:'<p class="card-sub">Flavours: Unlimited 3 / Session Pack 6 / Single-Program 1 / Free Trial 1. Example: 10-Session Pack $79 · Academy Membership Monthly $49.</p>'},
  events:{t:'Events', s:'Tournaments, showcases and open days', tiles:[['Upcoming','6'],['Active','1'],['Completed','2'],['Cancelled','0']], body:'<p class="card-sub">Open Day, U14 Tournament, Skills Showcase, Parent Orientation, Batting Masterclass 3-Day Intensive, Annual Awards Night…</p>'},
  facilities:{t:'Facilities', s:'Where sessions happen', tiles:[['Total','9'],['Active','5'],['In maintenance','2'],['Inactive','1']], body:'<p class="card-sub">Home Location, South Windsor, Cromwell, Boston Indoor Centre, Toronto Tennis Club, Edison, Stamford Baseball Park, New Haven Gym, Springfield Indoor.</p>'},
  bookings:{t:'Bookings', s:'One-off space reservations', tiles:[['Total','13'],['Confirmed','9'],['Revenue','$967'],['Pending','1']], body:'<p class="card-sub">Note: this screen is mid-migration — "Bookings is moving. The List view in the Schedule screen shows bookings alongside programs and events."</p>'},
  messages:{t:'Messages', s:'Conversations with families', tiles:[['Unread','2'],['Sent this week','12'],['Open rate','87%'],['Avg response','2.4h']], body:'<p class="card-sub">Tabs: All 7 / Incoming 3 / Announcements 2 / Internal 2. Compose button. Table: From, Subject, Type, Status, Time.</p>'},
  announcements:{t:'Announcements', s:'Broadcasts to families', tiles:[['Sent','7'],['People reached','64'],['Read rate','24%'],['Not delivered','102']], body:'<p class="card-sub">Table: Announcement, Author, Audience, Recipients, Sent to, Read, Not delivered, Status. Drafts / Sending / Sent tabs.</p>'},
  approvals:{t:'Approvals', s:'Coach content queue', tiles:[['Pending','4'],['Approved','2'],['Rejected','1'],['Skills / Drills','3 / 2']], body:'<p class="card-sub">Coach-submitted skills ("Reverse sweep"), drills ("Inswinging yorker drill", "Power-hitting tee work") and programs awaiting review. Unique coaching taxonomy.</p>'},
  payments:{t:'Payments', s:'Every receipt, succeeded or failed', tiles:[['Succeeded','23'],['Pending','3'],['Failed','2'],['Voided','1']], body:'<p class="card-sub">29 receipts, 11 columns: Receipt, Payer, Invoice, Received, Method (Stripe card / Cash / Cheque / Bank transfer), Status, Refunded, Amount, Unapplied, Reference, Tags.</p>'},
  settlements:{t:'Settlements', s:"What you've collected, and what we've paid you", tiles:[['Total revenue','$1,410'],['Quixera commission','10%'],['Your share','$1,269'],['Next settlement','$747 · Nov 3']], body:'<p class="card-sub">Payouts 4 / Transactions 20 / Adjustments 2. Rows show gross, fee, adjustments, net with Pending / Failed / On hold / Paid statuses.</p>'},
  reports:{t:'Reports', s:'Run a template, get the numbers', tiles:[['Templates','9'],['Saved','2'],['Scheduled','1'],['History','0']], body:'<p class="card-sub">Revenue summary by stream · Outstanding/AR aging · Payments & refunds · Discounts & promos · Tax summary · Enrolment & capacity · Space & lane utilisation · Membership growth & churn · Attendance.</p>'},
  analytics:{t:'Analytics', s:'Trends across the academy', tiles:[['Active athletes','251'],['MRR','$45.8K'],['Attendance rate','91%'],['Lead → enrolled','3.2%']], body:'<p class="card-sub">Sub-tabs: Overview / Capacity / Revenue / Athletes / Bookings / Coaches / Memberships. 12-month revenue vs prior-year chart, "Needs attention" card, Top movers.</p>'},
  ai:{t:'AI Insights', s:'Ask Quixera AI about your academy', tiles:[['Past chats','7'],['Suggestions','8'],['Workspace','—'],['Data','Simulated demo']], body:'<p class="card-sub">Chat with suggestion chips: "What\'s on my plate today?", "Who owes us money?", "Which athletes are at risk?", "Is Lane 3 free at 4pm today?" Attach and voice coming soon.</p>'},
  settings:{t:'Settings', s:'Configure the academy', tiles:[['Users','17'],['Sub-sections','15'],['Roles','5'],['—','']], body:'<p class="card-sub">15 pill tabs: Users, Services, Pricing Rules, Taxes, Promos, Equipment, Amenities, Tags, Customers, Waivers, Scheduling, Inquiries, Skill Library, Alerts, Data Import.</p>'},
  legal:{t:'Help & Legal', s:'Policies and support', tiles:[['Privacy Policy','v3.1'],['Terms','v2.4'],['Support','Coming soon'],['—','']], body:'<p class="card-sub">Privacy Policy v3.1 and Terms & Conditions v2.4 (updated 12 August 2026). Support is coming soon — contact your academy in the meantime.</p>'},
};

function buildNav(elId, proposed) {
  const nav = document.getElementById(elId);
  nav.innerHTML = '';
  NAV.forEach(n => {
    if (n.group) {
      const g = document.createElement('div');
      g.className = 'nav-group';
      g.innerHTML = n.label || n.group;
      if (n.badge) g.innerHTML += ` <span class="bdg${n.badgeRed?' red':''}" style="margin-left:6px">${n.badge}</span>`;
      nav.appendChild(g);
      return;
    }
    const b = document.createElement('button');
    b.className = 'nav-link' + (n.sec === 'dashboard' && !proposed ? ' active' : '');
    b.dataset.sec = n.sec;
    b.innerHTML = `${n.label}${n.badge ? `<span class="bdg${n.badgeRed?' red':''}">${n.badge}</span>` : ''}`;
    b.addEventListener('click', () => {
      nav.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      showSection(n.sec);
    });
    nav.appendChild(b);
  });
}
function showSection(sec) {
  const real = ['dashboard','athletes','schedule','billing','notifications'];
  document.querySelectorAll('#academy-current .app-section').forEach(s => s.classList.remove('active'));
  if (real.includes(sec)) {
    document.querySelector(`#academy-current .app-section[data-section="${sec}"]`).classList.add('active');
    document.getElementById('topbarTitle').textContent = NAV.find(n => n.sec === sec).label.replace(/^[^\s]+\s/, '');
  } else {
    const g = GENERIC[sec] || {t:sec, s:'', tiles:[], body:''};
    document.getElementById('genericTitle').textContent = g.t;
    document.getElementById('genericSub').textContent = g.s;
    document.getElementById('genericTiles').innerHTML = g.tiles.map(t =>
      `<button class="tile"><div class="tk">${t[0].toUpperCase()}</div><div class="tv">${t[1]}</div></button>`).join('');
    document.getElementById('genericBody').innerHTML = g.body;
    document.querySelector('#academy-current .app-section[data-section="generic"]').classList.add('active');
    document.getElementById('topbarTitle').textContent = g.t;
  }
  document.querySelector('#academy-current .app-main').scrollTop = 0;
  window.scrollTo({top:0});
}
buildNav('sideNav', false);
buildNav('sideNavProposed', true);

/* ---------- dashboard: RIGHT NOW tiles ---------- */
const tiles = [
  {k:'MEMBERSHIPS', v:'14', s:'$2,450 MRR', cls:''},
  {k:'OUTSTANDING', v:'$1,915', s:'5 overdue · oldest 221d', cls:'alert'},
  {k:'NEW INQUIRIES', v:'6', s:'12 stale', cls:'warnb'},
  {k:"TODAY'S SESSIONS", v:'5', s:'2 done · 3 ahead', cls:''},
  {k:'ACTION ITEMS', v:'22', s:'9 errors · 13 warnings', cls:'alert'},
];
document.getElementById('rightNowTiles').innerHTML = tiles.map(t =>
  `<button class="tile ${t.cls}"><div class="tk">${t.k}</div><div class="tv">${t.v}</div><div class="ts">${t.s}</div></button>`).join('');

/* ---------- today's schedule ---------- */
const sessions = [
  ['9:00 AM','U10 Spin Bowling','Lanes 1–4','Coach Daniel','Completed','green'],
  ['11:00 AM','Tennis Beginners','Court 2','Coach Maria','Completed','green'],
  ['2:00 PM','U14 Batting','Ground A','Coach Rahul','In Session','blue'],
  ['4:30 PM','U12 Nets','Turf 2','Coach Rahul','Upcoming','gray'],
  ['6:30 PM','U14 Match Prep','Main Ground','Coach Vikram','Upcoming','gray'],
];
document.getElementById('todaySchedule').innerHTML = sessions.map(s =>
  `<div class="sess-row"><div><strong>${s[1]}</strong><br><span style="color:var(--muted);font-size:12px">${s[0]} · ${s[2]} · ${s[3]}</span></div><span class="pillx ${s[5]}">${s[4]}</span></div>`).join('');

/* ---------- capacity bars ---------- */
const caps = [['U12 Advanced',93],['U10 Beginners',100],['U14 Elite',88]];
document.getElementById('capacityBars').innerHTML = caps.map(c =>
  `<div class="cap-row"><div class="cap-top"><span>${c[0]}</span><strong>${c[1]}%</strong></div>
   <div class="meter sm"><div class="meter-fill" style="width:${c[1]}%;${c[1]>=100?'background:linear-gradient(90deg,#d64545,#e07878)':c[1]>=90?'background:linear-gradient(90deg,#c77f1a,#e0a83c)':''}"></div></div></div>`).join('') +
  `<button class="btn ghost sm full" style="margin-top:6px">Promote 5 from waitlist</button>`;

/* ---------- revenue bars + streams ---------- */
document.getElementById('revBars').innerHTML =
  [['Apr',55],['May',72],['Jun',100]].map(b => `<div class="bar-col"><i style="height:${b[1]}%"></i><span>${b[0]}</span></div>`).join('');
document.getElementById('revStreams').innerHTML =
  [['Memberships','$18,240'],['Programs','$9,410'],['Bookings','$4,060'],['Events','$2,570']].map(s =>
  `<div class="num-row"><span>${s[0]}</span><strong>${s[1]}</strong></div>`).join('');

/* ---------- inquiries pipeline ---------- */
document.getElementById('inquiryPipe').innerHTML =
  [['NEW','6'],['TOURS','3'],['TRIALS','3'],['AWAIT PAY','3'],['ENROLLED','0']].map(p =>
  `<div><strong>${p[1]}</strong><span>${p[0]}</span></div>`).join('');
document.getElementById('inqBars').innerHTML =
  [30,45,38,52,60,48,66].map(h => `<div class="bar-col"><i style="height:${h}%"></i></div>`).join('');

/* ---------- coach cards ---------- */
const coaches = [
  ['RK','Rahul K.','Cricket · Bowling','92%','28h','★★★★★'],
  ['DO','Daniel O.','Cricket · Batting','87%','24h','★★★★★'],
  ['MS','Maria S.','Tennis','78%','20h','★★★★☆'],
  ['VP','Vikram P.','Cricket · All-round','95%','30h','★★★★★'],
  ['JL','James L.','Baseball','64%','16h','★★★★☆'],
  ['NR','Nina R.','Swimming','71%','18h','★★★★☆'],
];
document.getElementById('coachCards').innerHTML = coaches.map(c =>
  `<div class="coach-card"><div class="avatar">${c[0]}</div><strong>${c[1]}</strong>${c[2]}<br>${c[3]} · ${c[4]}<br><span class="stars">${c[5]}</span></div>`).join('');

/* ---------- insights ---------- */
document.getElementById('insightCards').innerHTML = [
  ['Attendance drops 18% on Fridays for U10 — consider moving to Saturday.'],
  ['3 athletes near coach capacity in U14 — rebalancing suggested.'],
].map(i => `<div class="qitem"><div class="qt">${i[0]}</div><button class="link-btn">View</button></div>`).join('');

/* ---------- action queue (22) ---------- */
const QUEUE = [
  ['billing','Payment failed — Sharma family','$120 · card declined','2h ago','Resolve'],
  ['billing','Invoice #INV-2041 overdue','Mehta family · $240 · 221 days late','3h ago','Remind'],
  ['billing','Invoice #INV-2098 overdue','Iyer family · $180 · 45 days late','3h ago','Remind'],
  ['billing','Invoice #INV-2110 overdue','Khan family · $95 · 21 days late','5h ago','Remind'],
  ['billing','Invoice #INV-2115 overdue','D\'Souza family · $300 · 12 days late','5h ago','Remind'],
  ['billing','Invoice #INV-2120 overdue','Nair family · $150 · 6 days late','6h ago','Remind'],
  ['billing','Unapplied payment $200','Needs an invoice assigned','7h ago','Assign'],
  ['billing','Refund requested','Patel family · $79 · duplicate charge','8h ago','Review'],
  ['billing','Settlement on hold','$747 payout · verification needed','9h ago','View'],
  ['billing','Dunning: 1 past-due membership','Auto-retry in 2 days','10h ago','View'],
  ['billing','Failed payout','Bank details rejected · $522.50','11h ago','Fix'],
  ['people','Waiver expiring — Aarav S.','Fall waiver expires in 3 days','1h ago','Nudge'],
  ['people','Consent pending — 2 athletes','Cannot train until signed','2h ago','Nudge'],
  ['people','Attendance dropping — Vihaan M.','Missed 3 of last 4 sessions','4h ago','Message'],
  ['people','Coach unconfirmed — Saturday','Vikram P. hasn\'t confirmed','5h ago','Nudge'],
  ['people','Trial follow-up — 3 families','Trial was 5 days ago','6h ago','Message'],
  ['people','Membership frozen — 1 athlete','Frozen 30 days, check in','7h ago','Review'],
  ['people','New inquiry — 6 waiting','Oldest waiting 2 days','8h ago','Assign'],
  ['people','Stale inquiries — 12','No contact in 24h+','9h ago','Assign'],
  ['people','Athlete inactive — 1','No sessions in 21 days','10h ago','Message'],
  ['people','Co-guardian request','Needs admin approval','12h ago','Review'],
  ['schedule','Lane conflict — Sat 10 AM','U12 and U14 both on Lane 3','30m ago','Resolve'],
];
function renderQueue(filter) {
  const list = QUEUE.filter(q => filter === 'all' || q[0] === filter);
  document.getElementById('actionQueue').innerHTML = list.map((q, i) =>
    `<div class="qitem"><span class="qbadge ${q[0]}">${q[0].toUpperCase()}</span>
     <div class="qt">${q[1]}<small>${q[2]} · ${q[3]}</small></div>
     <div class="qact"><button class="link-btn" data-d="${i}">Dismiss</button><button class="link-btn">${q[4]}</button></div></div>`).join('');
}
renderQueue('all');
document.getElementById('queueTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#queueTabs button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); renderQueue(b.dataset.q);
});
document.getElementById('actionQueue').addEventListener('click', e => {
  const d = e.target.closest('[data-d]'); if (!d) return;
  d.closest('.qitem').style.opacity = '.35';
});

/* ---------- athletes table ---------- */
const ATHLETES = [
  ['AS','Aarav S.','11','ATH-1042','U12 Advanced','Active','8','Active','green',''],
  ['VM','Vihaan M.','12','ATH-0987','U12 Advanced','Active','3','Active','green','Attendance'],
  ['KR','Kabir R.','10','ATH-1105','U10 Beginners','Active','10','Active','green',''],
  ['AP','Arjun P.','13','ATH-0871','U14 Elite','Unlimited','—','Active','green','Overdue'],
  ['RK','Reyansh K.','9','ATH-1156','U10 Beginners','Active','6','Pending Consent','yellow','Waiver'],
  ['ID','Ishaan D.','12','ATH-0930','U12 Advanced','Frozen','0','Frozen','gray',''],
  ['AT','Ayaan T.','8','ATH-1188','U8 Starters','Active','12','On Waitlist','blue',''],
  ['KV','Krishna V.','14','ATH-0764','U14 Elite','Active','5','Active','green',''],
  ['AN','Aditya N.','11','ATH-1019','U12 Intermediate','Active','7','Active','green','Attendance'],
  ['SR','Sai R.','10','ATH-1073','U10 Beginners','Active','9','Inactive','gray',''],
];
document.getElementById('athleteTable').innerHTML =
  `<tr><th>Athlete</th><th>Program</th><th>Membership</th><th>Credits</th><th>Status</th><th>Joined</th><th></th></tr>` +
  ATHLETES.map(a => `<tr>
    <td><div class="ath-cell"><div class="avatar">${a[0]}</div><div><strong>${a[1]}</strong><small>${a[2]} yrs · ${a[3]}</small></div>${a[9] ? `<span class="pillx orange">${a[9]}</span>` : ''}</div></td>
    <td>${a[4]}</td><td>${a[5]}</td><td>${a[6]}</td>
    <td><span class="pillx ${a[8]}">${a[7]}</span></td><td style="color:var(--muted)">Mar 2026</td>
    <td><button class="link-btn">⋯</button></td></tr>`).join('');

/* ---------- schedule grid ---------- */
(function buildCal() {
  const grid = document.getElementById('calGrid');
  const days = ['Mon 8','Tue 9','Wed 10','Thu 11','Fri 12','Sat 13','Sun 14'];
  const hours = []; for (let h = 8; h <= 20; h++) hours.push(h);
  let html = '<div></div>' + days.map(d => `<div class="cal-hd">${d}</div>`).join('');
  const blocks = [ // [dayIdx, startH, durH, label, type]
    [0,9,1.5,'U10 Spin Bowling · L1-4','prog'], [0,16.5,1.5,'U12 Nets · Turf 2','prog'],
    [1,9,1.5,'U10 Spin Bowling · L1-4','prog'], [1,18,1,'Raj Sharma (private)','priv'],
    [2,11,1,'Tennis Beginners · Ct 2','prog'], [2,16.5,1.5,'U12 Nets · Turf 2','prog'],
    [3,9,1.5,'U10 Spin Bowling · L1-4','prog'], [3,14,2,'U14 Batting · Ground A','prog'],
    [4,11,1,'Tennis Beginners · Ct 2','prog'], [4,19,1,'Sunita Reddy (private)','priv'],
    [5,10,1.5,'U14 Match Prep','prog'], [5,10,1.5,'U12 Friendly','prog'],
    [6,15,2,'Weekend Camp','prog'],
  ];
  hours.forEach(h => {
    const lbl = h <= 12 ? `${h} AM` : `${h-12} PM`;
    html += `<div class="cal-hour">${lbl}</div>`;
    days.forEach((_, di) => {
      let inner = '';
      blocks.filter(b => b[0] === di && b[1] === h).forEach(b => {
        const top = 2, height = Math.min(b[2] * 34 - 6, 34 * (21 - h) - 6);
        inner += `<div class="cal-block ${b[3]==='priv'?'priv':'prog'}" style="top:${top}px;height:${Math.max(height,20)}px">${b[3]}</div>`;
      });
      if (di === 3 && h === 15) inner += '<div class="now-line" style="top:20px"></div>';
      html += `<div class="cal-day">${inner}</div>`;
    });
  });
  grid.innerHTML = html;
})();

/* ---------- billing ---------- */
const BTILES = [
  ['THIS MONTH','$535','2 invoices',''], ['OUTSTANDING','$1,915','5 overdue','alert'],
  ['COLLECTION RATE','56%','Avg 1.4 days to pay',''], ['YTD REVENUE','$2,390','',''],
];
document.getElementById('billingTiles').innerHTML = BTILES.map(t =>
  `<button class="tile ${t[3]}"><div class="tk">${t[0]}</div><div class="tv">${t[1]}</div><div class="ts">${t[2]}</div></button>`).join('');
const BILLS = [
  ['Sharma family','October tuition — Aarav','$120','Overdue','red','12 days late','Oct 1'],
  ['Mehta family','U14 Elite — quarterly','$240','Overdue','red','221 days late','Mar 2'],
  ['Iyer family','10-Session Pack','$180','Overdue','red','45 days late','Aug 24'],
  ['Khan family','U10 Beginners — monthly','$95','Overdue','red','21 days late','Sep 17'],
  ['Patel family','October tuition — Diya','$120','Paid','green','','Oct 3'],
  ['Nair family','Batting Masterclass','$150','Paid','green','','Oct 5'],
  ['Reddy family','Open Play credits','$60','Refunded','gray','','Sep 28'],
  ['Gupta family','U12 Intermediate — monthly','$110','Paid','green','','Oct 2'],
];
document.getElementById('billingTable').innerHTML =
  `<tr><th>Athlete / Family</th><th>Item</th><th>Amount</th><th>Status</th><th>Due</th><th></th></tr>` +
  BILLS.map(b => `<tr><td><strong>${b[0]}</strong></td><td>${b[1]}</td><td><strong>${b[2]}</strong></td>
    <td><span class="pillx ${b[4]}">${b[3]}</span>${b[5] ? `<br><small style="color:var(--muted)">${b[5]}</small>` : ''}</td>
    <td style="color:var(--muted)">${b[6]}</td><td><button class="link-btn">⋯</button></td></tr>`).join('');

/* ---------- notifications ---------- */
const NOTIFS = [
  ['TODAY',[
    ['urgent','Payment failed — Sharma family','$120 card declined · retry scheduled','2h'],
    ['urgent','2 sessions missing attendance','Yesterday\'s U10 and U14 sessions','4h'],
    ['warning','Waiver expiring — 14 athletes','Fall waivers expire within 7 days','5h'],
    ['warning','Coach unconfirmed Saturday','Vikram P. hasn\'t confirmed','6h'],
    ['info','New inquiry — web form','U8 Starters · from Google search','7h'],
  ]],
  ['YESTERDAY',[
    ['urgent','Settlement payout failed','$522.50 · bank details rejected','1d'],
    ['warning','Attendance dropping — U10','Down 18% on Fridays','1d'],
    ['warning','Membership renewing — 9','Renew in the next 14 days','1d'],
    ['info','Announcement read rate 24%','41 of 172 deliveries read','1d'],
  ]],
  ['OLDER',[
    ['info','Weekly report ready','Sep 28 – Oct 4 summary','3d'],
    ['info','New coach application','Tennis · 6 yrs experience','4d'],
  ]],
];
document.getElementById('notifFeed').innerHTML = NOTIFS.map(g =>
  `<div class="notif-group">${g[0]}</div>` + g[1].map(n =>
  `<div class="notif-card"><span class="sev ${n[0]}"></span><div class="qt">${n[1]}<small>${n[2]} · ${n[3]} ago</small></div>
   <button class="link-btn dim">Snooze</button><button class="link-btn">Done</button></div>`).join('')).join('');

/* ================= PROPOSED REDESIGN ================= */
const TRIAGE = [
  ['red','1','$1,915 owed by 5 families','Oldest is 221 days late. One tap reminds all 5.','Send reminders'],
  ['amber','2','12 inquiries going stale','No contact in 24h+. Fast replies convert 2× better.','Follow up'],
  ['amber','3','2 athletes can\'t train','Consent waivers unsigned. Parents were notified Monday.','Nudge parents'],
  ['blue','4','U10 Beginners is full — 5 waiting','Promote from the waitlist in one tap.','Promote'],
  ['blue','5','Coach Vikram near capacity','95% utilized · 30h this week. Rebalance U14 groups.','Rebalance'],
];
document.getElementById('proposedTriage').innerHTML = TRIAGE.map(t =>
  `<article class="triage-item ${t[0]}"><span class="triage-num">${t[1]}</span>
   <div><h3>${t[2]}</h3><p>${t[3]}</p></div>
   <button class="btn primary sm">${t[4]}</button></article>`).join('');
document.getElementById('proposedSessions').innerHTML = sessions.map(s =>
  `<div class="sess-row"><div><strong>${s[1]}</strong><br><span style="color:var(--muted);font-size:12px">${s[0]} · ${s[2]} · ${s[3]}</span></div><span class="pillx ${s[5]}">${s[4]}</span></div>`).join('');
