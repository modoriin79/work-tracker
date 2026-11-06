/* Work Tracker — 순수 JS, 데이터는 localStorage (+ 선택적으로 GitHub Gist 동기화) */
(() => {
  "use strict";

  const KEY = "work-tracker:v1";
  const TOKEN_KEY = "work-tracker:token";
  const TIMER_KEY = "work-tracker:timer";
  const UI_KEY = "work-tracker:ui";
  const GIST_FILE = "work-tracker.json";
  const COLORS = ["#171512", "#b3261e", "#c2601a", "#8b6a1f", "#3d6b4f", "#2f5d7c", "#5b4a8a", "#8a4a6b", "#6b6459"];
  const STATUS_LABEL = { todo: "할 일", doing: "진행 중", done: "완료" };
  const PRI_LABEL = { 1: "높음", 2: "보통", 3: "낮음" };
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];

  // ---------- utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);
  const md = (s) => { if (!s) return ""; const d = parseYmd(s); return `${d.getMonth() + 1}.${d.getDate()}`; };
  const fmtMin = (m) => { m = Math.round(m || 0); if (m < 60) return `${m}분`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}시간 ${r}분` : `${h}시간`; };
  const fmtH = (m) => (m / 60).toFixed(m >= 600 ? 0 : 1) + "h";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const weekStart = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = (x.getDay() + 6) % 7; return addDays(x, -w); };
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- state ----------
  function seed() {
    const p = (name, start, due, color) => ({ id: uid(), name, start, due, color, link: "", archived: false, createdAt: Date.now() });
    const projects = [
      p("토익 900+ (100만원)", "2026-11-02", "2026-11-30", "#2f5d7c"),
      p("신호및시스템 발표", "2026-11-03", "2026-12-08", "#b3261e"),
      p("연구실 인턴 - 로켓", "2026-11-06", "2026-11-13", "#3d6b4f"),
      p("AI-X 아이디어 공모전", "2026-11-06", "2026-11-23", "#5b4a8a"),
      p("생활 · 기타", "", "", "#6b6459"),
    ];
    const [toeic, sig, lab, aix, life] = projects;
    const t = (projectId, title, extra = {}) => ({
      id: uid(), projectId, title, status: "todo", priority: 2, due: "", est: 0, spent: 0,
      subtasks: [], note: "", pinned: "", createdAt: Date.now(), doneAt: null, ...extra,
    });
    const tasks = [
      t(toeic.id, "LC 파트 2 오답 정리", { priority: 2, est: 50 }),
      t(toeic.id, "RC 실전 모의고사 1회", { priority: 1, est: 75 }),
      t(sig.id, "발표 자료 제출", { priority: 1, due: "2026-11-30", subtasks: [
        { id: uid(), text: "목차 구성", done: false }, { id: uid(), text: "슬라이드 초안", done: false }, { id: uid(), text: "팀원 리뷰", done: false } ] }),
      t(sig.id, "발표 리허설", { due: "2026-12-08" }),
      t(lab.id, "로켓 프로젝트 자료 읽기", { status: "doing", priority: 1, due: "2026-11-13", est: 90 }),
      t(aix.id, "아이디어 3개 브레인스토밍", { priority: 2, due: "2026-11-15" }),
      t(aix.id, "공모전 신청서 작성", { priority: 1, due: "2026-11-23" }),
      t(life.id, "옷 사기", { priority: 3, due: "2026-11-30" }),
      t(life.id, "올리브영 5000원 이상", { priority: 3, due: "2026-11-30" }),
    ];
    return { version: 1, updatedAt: Date.now(), name: "RIN", projects, tasks, sessions: [], notes: {}, gistId: "", autoSync: false };
  }

  let state;
  try { state = JSON.parse(storage.get(KEY)) || seed(); } catch { state = seed(); }
  state.notes ||= {}; state.sessions ||= []; state.projects ||= []; state.tasks ||= [];

  let ui = { view: "today", boardFilter: "all", showArchived: false, weekOffset: 0 };
  try { Object.assign(ui, JSON.parse(storage.get(UI_KEY)) || {}); } catch { /* ignore */ }
  ui.weekOffset = 0;
  const MINI_MODE = new URLSearchParams(location.search).has("mini");
  const baseTitle = () => (MINI_MODE ? "Work Tracker Mini" : `${state.name || "나"}의 작업실 · Work Tracker`);
  const saveUi = () => storage.set(UI_KEY, JSON.stringify({ view: ui.view, boardFilter: ui.boardFilter, showArchived: ui.showArchived }));

  function save({ silent = false, sync = true } = {}) {
    state.updatedAt = Date.now();
    storage.set(KEY, JSON.stringify(state));
    if (sync) scheduleSync();
    if (!silent) render();
  }

  const proj = (id) => state.projects.find((p) => p.id === id);
  const task = (id) => state.tasks.find((t) => t.id === id);
  const activeProjects = () => state.projects.filter((p) => !p.archived);

  // ---------- task helpers ----------
  function isToday(t) {
    const today = ymd();
    if (t.status === "done") return false;
    if (t.pinned === today) return true;
    if (t.status === "doing") return true;
    if (t.due && t.due <= today) return true;
    return false;
  }
  const sortTasks = (a, b) =>
    (a.status === "doing" ? 0 : 1) - (b.status === "doing" ? 0 : 1) ||
    a.priority - b.priority ||
    (a.due || "9999") .localeCompare(b.due || "9999") ||
    a.createdAt - b.createdAt;

  function setStatus(t, status) {
    t.status = status;
    t.doneAt = status === "done" ? Date.now() : null;
    // 타이머가 돌던 작업을 완료하면 시간 기록 후 타이머 종료
    if (status === "done" && timer.taskId === t.id) {
      const min = logSession(); resetTimer();
      if (min) setTimeout(() => toast(`${fmtMin(min)} 기록하고 완료했어요`), 300);
    }
  }

  function dueBadge(due, status) {
    if (!due) return "";
    const d = diffDays(due, ymd());
    let cls = "due", txt;
    if (status !== "done" && d < 0) { cls += " over"; txt = `${-d}일 지남`; }
    else if (d === 0) { cls += " soon"; txt = "오늘 마감"; }
    else if (d === 1) { cls += " soon"; txt = "내일 마감"; }
    else txt = `~${md(due)} (D-${d})`;
    return `<span class="${cls}">${txt}</span>`;
  }

  function taskRow(t) {
    const p = proj(t.projectId);
    const subsDone = t.subtasks.filter((s) => s.done).length;
    const subs = t.subtasks.length ? `<span>☰ ${subsDone}/${t.subtasks.length}</span>` : "";
    const time = t.spent || t.est ? `<span>⏱ ${fmtMin(t.spent)}${t.est ? " / " + fmtMin(t.est) : ""}</span>` : "";
    const pri = t.priority < 3 && t.status !== "done" ? `<span class="pri p${t.priority}">${t.priority === 1 ? "!!" : "!"}</span>` : "";
    const bar = t.est && t.status !== "done" ? `<div class="mini-bar"><i style="width:${Math.min(100, (t.spent / t.est) * 100)}%"></i></div>` : "";
    return `<li class="task ${t.status}" data-id="${t.id}">
      <button class="cb" data-act="toggle" aria-label="완료 전환"></button>
      <div>
        <div class="t-title">${pri} ${esc(t.title)}</div>
        <div class="meta">
          ${p ? `<span class="proj"><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</span>` : ""}
          ${t.status === "doing" ? "<span>진행 중</span>" : ""}
          ${dueBadge(t.due, t.status)} ${subs} ${time}
        </div>${bar}
      </div>
      <div class="side-actions">
        ${t.status !== "done" ? `<button class="icon-btn" data-act="focus" title="집중 시작">▶</button>` : ""}
        ${t.status !== "done" ? `<button class="icon-btn" data-act="pin" title="오늘로 고정/해제">${t.pinned === ymd() ? "★" : "☆"}</button>` : ""}
      </div>
    </li>`;
  }

  // ---------- render ----------
  function render() {
    document.title = baseTitle();
    $("#ownerName").textContent = state.name || "나";
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === ui.view));
    $$(".view").forEach((v) => (v.hidden = v.id !== `view-${ui.view}`));
    fillProjectSelects();
    ({ today: renderToday, board: renderBoard, projects: renderProjects, stats: renderStats })[ui.view]();
    renderMini();
    renderTimer();
  }

  function fillProjectSelects() {
    const opts = activeProjects().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const qa = $("#qaProject"), cur = qa.value;
    qa.innerHTML = `<option value="">프로젝트 없음</option>` + opts;
    if ([...qa.options].some((o) => o.value === cur)) qa.value = cur;
    const bf = $("#boardFilter");
    bf.innerHTML = `<option value="all">전체 프로젝트</option>` + opts;
    bf.value = [...bf.options].some((o) => o.value === ui.boardFilter) ? ui.boardFilter : "all";
  }

  function renderToday() {
    const today = ymd();
    const d = new Date();
    $("#todayLabel").textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${DOW[d.getDay()]}요일`;

    const list = state.tasks.filter(isToday).sort(sortTasks);
    const ids = new Set(list.map((t) => t.id));
    const upcoming = state.tasks
      .filter((t) => t.status !== "done" && !ids.has(t.id) && t.due && diffDays(t.due, today) <= 7)
      .sort((a, b) => a.due.localeCompare(b.due));
    const done = state.tasks.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === today).sort((a, b) => b.doneAt - a.doneAt);

    $("#todayList").innerHTML = list.map(taskRow).join("") || `<li class="empty">오늘 할 일이 비어 있어요. 위에서 추가하거나 ☆로 고정하세요.</li>`;
    $("#upcomingList").innerHTML = upcoming.map(taskRow).join("") || `<li class="empty">7일 안에 마감인 일이 없어요.</li>`;
    $("#doneList").innerHTML = done.map(taskRow).join("") || `<li class="empty">아직 완료한 일이 없어요.</li>`;
    $("#todoCount").textContent = list.length;
    $("#doneCount").textContent = done.length;

    const focusMin = state.sessions.filter((s) => s.date === today).reduce((a, s) => a + s.min, 0);
    $("#todayStats").innerHTML = `
      <div><b>${done.length}/${done.length + list.length}</b><span>완료</span></div>
      <div><b>${fmtH(focusMin)}</b><span>오늘 집중</span></div>`;

    const note = $("#dailyNote");
    if (document.activeElement !== note) note.value = state.notes[today] || "";
  }

  function renderBoard() {
    const f = ui.boardFilter;
    const tasks = state.tasks.filter((t) => f === "all" || t.projectId === f);
    $$("#board .col").forEach((col) => {
      const st = col.dataset.status;
      let items = tasks.filter((t) => t.status === st);
      items = st === "done" ? items.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 30) : items.sort(sortTasks);
      col.querySelector(".count").textContent = tasks.filter((t) => t.status === st).length;
      col.querySelector("ul").innerHTML = items.map((t) => {
        const p = proj(t.projectId);
        const subsDone = t.subtasks.filter((s) => s.done).length;
        return `<li class="card" draggable="true" data-id="${t.id}" style="--c:${p ? p.color : "var(--line)"}">
          <div class="t-title">${t.priority < 3 && st !== "done" ? `<span class="pri p${t.priority}">${t.priority === 1 ? "!!" : "!"}</span> ` : ""}${esc(t.title)}</div>
          <div class="meta">${p ? `<span>${esc(p.name)}</span>` : ""}${dueBadge(t.due, t.status)}${t.subtasks.length ? `<span>☰ ${subsDone}/${t.subtasks.length}</span>` : ""}${t.spent ? `<span>⏱ ${fmtMin(t.spent)}</span>` : ""}</div>
        </li>`;
      }).join("");
    });
  }

  function projectStats(p) {
    const ts = state.tasks.filter((t) => t.projectId === p.id);
    const done = ts.filter((t) => t.status === "done").length;
    const min = state.sessions.filter((s) => s.projectId === p.id).reduce((a, s) => a + s.min, 0);
    return { ts, done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, min };
  }

  function ddayHtml(p) {
    if (!p.due) return "";
    const d = diffDays(p.due, ymd());
    const cls = d < 0 ? "over" : d <= 3 ? "urgent" : "";
    return `<span class="dday ${cls}">${d < 0 ? `D+${-d}` : d === 0 ? "D-DAY" : `D-${d}`}</span>`;
  }

  function renderProjects() {
    $("#showArchived").checked = ui.showArchived;
    const list = state.projects.filter((p) => ui.showArchived || !p.archived);

    // timeline: this month ±
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0); // end of next month
    const span = (to - from) / 86400000 + 1;
    const pos = (s) => Math.max(0, Math.min(100, ((parseYmd(s) - from) / 86400000 / span) * 100));
    const dated = list.filter((p) => p.due && !p.archived);
    const ticks = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      if (d.getDate() === 1 || d.getDate() === 15) ticks.push(`<span style="left:${pos(ymd(d))}%">${d.getMonth() + 1}/${d.getDate()}</span>`);
    }
    const todayPos = pos(ymd());
    ticks.push(`<span class="today-tick" style="left:${todayPos}%">오늘</span>`);
    $("#timeline").innerHTML = dated.length ? `
      <div class="tl-head"><b>타임라인</b><span class="muted small">${from.getMonth() + 1}월 – ${to.getMonth() + 1}월 · 진한 부분 = 완료율</span></div>
      <div class="tl-scale">${ticks.join("")}</div>
      <div class="tl-body">${dated.sort((a, b) => a.due.localeCompare(b.due)).map((p) => {
        const s = p.start || ymd(new Date(p.createdAt));
        const l = pos(s), r = pos(p.due), w = Math.max(0.8, r - l);
        const st = projectStats(p);
        return `<div class="tl-row"><span class="nm" data-pid="${p.id}">${esc(p.name)}</span>
          <div class="tl-track"><div class="tl-bar" style="left:${l}%;width:${w}%;--c:${p.color}" title="${md(s)} – ${md(p.due)} · ${st.pct}%"><span class="fill" style="width:${st.pct}%"></span></div>
          <div class="tl-today" style="left:${todayPos}%"></div></div></div>`;
      }).join("")}</div>` : `<div class="muted small">마감일이 있는 프로젝트가 생기면 여기에 타임라인이 표시됩니다.</div>`;

    $("#projectGrid").innerHTML = list.map((p) => {
      const st = projectStats(p);
      const open = st.ts.filter((t) => t.status !== "done").sort(sortTasks);
      const recentDone = st.ts.filter((t) => t.status === "done").sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 2);
      return `<article class="pcard ${p.archived ? "archived" : ""}" style="--c:${p.color}" data-pid="${p.id}">
        <div class="pcard-head"><h3 data-act="edit-project">${esc(p.name)}</h3>${ddayHtml(p)}</div>
        <div class="range">${p.start || p.due ? `${md(p.start) || "?"} – ${md(p.due) || "?"}` : "기간 없음"}${p.archived ? " · 보관됨" : ""}</div>
        <div class="progress"><i style="width:${st.pct}%"></i></div>
        <div class="pstats"><span>${st.done}/${st.total} 완료 · ${st.pct}%</span><span>집중 ${fmtMin(st.min)}</span></div>
        <ul class="ptasks">${[...open.slice(0, 6), ...recentDone].map((t) => `<li class="${t.status}" data-id="${t.id}"><span>${esc(t.title)}</span></li>`).join("")}
          ${open.length > 6 ? `<li class="muted" data-act="board-filter">+ ${open.length - 6}개 더 보기</li>` : ""}</ul>
        <form class="padd" data-act="padd"><input placeholder="이 프로젝트에 할 일 추가" /><button class="btn">+</button></form>
        <div class="plinks">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">링크 열기 ↗</a>` : ""}<button class="link" data-act="board-filter">보드에서 보기</button></div>
      </article>`;
    }).join("") || `<p class="muted">프로젝트가 없어요. ‘+ 프로젝트’로 시작하세요.</p>`;
  }

  function renderStats() {
    const ws = addDays(weekStart(new Date()), ui.weekOffset * 7);
    const days = [...Array(7)].map((_, i) => ymd(addDays(ws, i)));
    $("#weekLabel").textContent = `${days[0].replace(/-/g, ".")} — ${md(days[6])}`;
    const inWeek = state.sessions.filter((s) => s.date >= days[0] && s.date <= days[6]);
    const total = inWeek.reduce((a, s) => a + s.min, 0);
    const doneWeek = state.tasks.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) >= days[0] && ymd(new Date(t.doneAt)) <= days[6]).length;

    // streak: consecutive days with focus ≥ 1 min ending today/yesterday
    const daysWith = new Set(state.sessions.map((s) => s.date));
    let streak = 0, cur = new Date();
    if (!daysWith.has(ymd(cur))) cur = addDays(cur, -1);
    while (daysWith.has(ymd(cur))) { streak++; cur = addDays(cur, -1); }

    $("#kpis").innerHTML = `
      <div><b>${fmtH(total)}</b><span>이번 주 집중</span></div>
      <div><b>${doneWeek}</b><span>완료한 할 일</span></div>
      <div><b>${inWeek.length}</b><span>집중 세션</span></div>
      <div><b>${streak}일</b><span>연속 집중</span></div>`;

    const perDay = days.map((d) => inWeek.filter((s) => s.date === d).reduce((a, s) => a + s.min, 0));
    const max = Math.max(60, ...perDay);
    const today = ymd();
    $("#dayBars").innerHTML = perDay.map((m, i) => `<div class="bar ${days[i] === today ? "today" : ""}"><span class="v">${m ? fmtH(m) : ""}</span><i style="height:${(m / max) * 100}%"></i></div>`).join("") ;
    let lbl = $("#dayBars").nextElementSibling;
    if (!lbl || !lbl.classList.contains("bar-labels")) { lbl = document.createElement("div"); lbl.className = "bar-labels"; $("#dayBars").after(lbl); }
    lbl.innerHTML = days.map((d) => { const x = parseYmd(d); return `<span>${DOW[x.getDay()]} ${x.getMonth() + 1}.${x.getDate()}</span>`; }).join("");

    const byProj = {};
    inWeek.forEach((s) => (byProj[s.projectId || ""] = (byProj[s.projectId || ""] || 0) + s.min));
    const rows = Object.entries(byProj).sort((a, b) => b[1] - a[1]);
    const pmax = Math.max(1, ...rows.map((r) => r[1]));
    $("#projBars").innerHTML = rows.map(([pid, m]) => {
      const p = proj(pid);
      return `<div class="hbar" style="--c:${p ? p.color : "var(--muted)"}"><span class="nm"><i class="dot" style="background:${p ? p.color : "var(--muted)"}"></i>${esc(p ? p.name : "프로젝트 없음")}</span><span class="track"><i style="width:${(m / pmax) * 100}%"></i></span><span class="v">${fmtH(m)}</span></div>`;
    }).join("") || `<p class="muted small">이 주에는 집중 기록이 없어요. 할 일 옆 ▶ 버튼으로 타이머를 시작해 보세요.</p>`;

    $("#sessionLog").innerHTML = inWeek.slice().sort((a, b) => b.start - a.start).map((s) => {
      const t = task(s.taskId), p = proj(s.projectId);
      const st = new Date(s.start);
      return `<li data-sid="${s.id}"><span class="when">${DOW[st.getDay()]} ${md(s.date)} ${pad(st.getHours())}:${pad(st.getMinutes())}</span>
        <span>${esc(t ? t.title : s.title || "(삭제된 작업)")}${p ? ` <span class="muted">· ${esc(p.name)}</span>` : ""}</span>
        <span class="v">${fmtMin(s.min)}</span><button class="icon-btn" data-act="del-session" title="기록 삭제">×</button></li>`;
    }).join("") || `<li class="empty">기록 없음</li>`;
  }

  // ---------- quick add ----------
  function parseQuick(raw) {
    let title = raw, projectId = null, priority = 2, due = "", est = 0;
    title = title.replace(/(^|\s)#(\S+)/, (_, s, name) => {
      const q = name.toLowerCase();
      const p = activeProjects().find((p) => p.name.toLowerCase().includes(q));
      if (p) { projectId = p.id; return s; }
      return _;
    });
    title = title.replace(/(^|\s)!([123])(?=\s|$)/, (_, s, n) => { priority = +n; return s; });
    title = title.replace(/(^|\s)@(\d+)(?=\s|$)/, (_, s, n) => { est = +n; return s; });
    title = title.replace(/(^|\s)~(\d{1,2})[\/.-](\d{1,2})(?=\s|$)/, (_, s, m, d) => {
      const now = new Date(); let y = now.getFullYear();
      const cand = new Date(y, +m - 1, +d);
      if (cand < addDays(now, -60)) y++;
      due = ymd(new Date(y, +m - 1, +d)); return s;
    });
    title = title.replace(/(^|\s)~(오늘|내일)(?=\s|$)/, (_, s, w) => { due = ymd(addDays(new Date(), w === "내일" ? 1 : 0)); return s; });
    return { title: title.replace(/\s+/g, " ").trim(), projectId, priority, due, est };
  }

  function addTask(fields) {
    const t = {
      id: uid(), projectId: fields.projectId || "", title: fields.title, status: "todo",
      priority: fields.priority || 2, due: fields.due || "", est: fields.est || 0, spent: 0,
      subtasks: [], note: "", pinned: fields.pinned || "", createdAt: Date.now(), doneAt: null,
    };
    state.tasks.push(t);
    save();
    return t;
  }

  $("#quickAdd").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = $("#qaTitle").value.trim();
    if (!raw) return;
    const f = parseQuick(raw);
    if (!f.title) return;
    addTask({ ...f, projectId: f.projectId || $("#qaProject").value, pinned: ymd() });
    $("#qaTitle").value = "";
    toast("추가했어요");
  });

  // ---------- list interactions (delegated) ----------
  document.addEventListener("click", (e) => {
    const actEl = e.target.closest("[data-act]");
    const row = e.target.closest(".task, .card, .ptasks li[data-id]");
    const act = actEl?.dataset.act;

    if (act === "del-session") {
      const sid = actEl.closest("li").dataset.sid;
      const s = state.sessions.find((x) => x.id === sid);
      if (s && confirm("이 집중 기록을 삭제할까요?")) {
        const t = task(s.taskId); if (t) t.spent = Math.max(0, t.spent - s.min);
        state.sessions = state.sessions.filter((x) => x.id !== sid); save();
      }
      return;
    }
    if (act === "edit-project") return openProject(actEl.closest(".pcard").dataset.pid);
    if (act === "board-filter") { ui.boardFilter = actEl.closest(".pcard").dataset.pid; ui.view = "board"; saveUi(); return render(); }
    if (e.target.closest(".tl-row .nm")) return openProject(e.target.closest(".nm").dataset.pid);

    if (!row) return;
    const t = task(row.dataset.id);
    if (!t) return;
    if (act === "toggle") { setStatus(t, t.status === "done" ? "todo" : "done"); save(); if (t.status === "done") toast("완료! 🎉"); return; }
    if (act === "pin") { t.pinned = t.pinned === ymd() ? "" : ymd(); save(); return; }
    if (act === "focus") { startTimerFor(t); return; }
    openTask(t.id);
  });

  document.addEventListener("submit", (e) => {
    const f = e.target.closest('[data-act="padd"]');
    if (!f) return;
    e.preventDefault();
    const input = f.querySelector("input");
    const raw = input.value.trim(); if (!raw) return;
    const q = parseQuick(raw);
    addTask({ ...q, projectId: f.closest(".pcard").dataset.pid });
  });

  // drag & drop on board
  let dragId = null;
  $("#board").addEventListener("dragstart", (e) => { const c = e.target.closest(".card"); if (!c) return; dragId = c.dataset.id; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
  $("#board").addEventListener("dragend", (e) => { e.target.closest(".card")?.classList.remove("dragging"); $$(".col").forEach((c) => c.classList.remove("drag-over")); });
  $$("#board .col").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over"); });
    col.addEventListener("drop", (e) => {
      e.preventDefault(); col.classList.remove("drag-over");
      const t = task(dragId); if (!t) return;
      if (t.status !== col.dataset.status) { setStatus(t, col.dataset.status); save(); }
    });
  });
  $("#boardFilter").addEventListener("change", (e) => { ui.boardFilter = e.target.value; saveUi(); render(); });

  // daily note
  let noteTimer;
  $("#dailyNote").addEventListener("input", (e) => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      const v = e.target.value; const k = ymd();
      if (v.trim()) state.notes[k] = v; else delete state.notes[k];
      save({ silent: true });
    }, 500);
  });

  // ---------- task modal ----------
  let editing = null; // working copy
  const tm = $("#taskModal");
  function openTask(id) {
    const t = task(id); if (!t) return;
    editing = JSON.parse(JSON.stringify(t));
    $("#tTitle").value = editing.title;
    $("#tProject").innerHTML = `<option value="">프로젝트 없음</option>` + state.projects.filter((p) => !p.archived || p.id === editing.projectId).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("#tProject").value = editing.projectId || "";
    $("#tStatus").value = editing.status;
    $("#tPriority").value = String(editing.priority);
    $("#tDue").value = editing.due || "";
    $("#tEst").value = editing.est || "";
    $("#tToday").checked = editing.pinned === ymd();
    $("#tNote").value = editing.note || "";
    $("#tSpent").textContent = editing.spent ? `누적 집중 ${fmtMin(editing.spent)}` : "";
    $("#tFocus").hidden = editing.status === "done";
    renderSubs();
    tm.showModal();
    setTimeout(() => $("#tTitle").focus(), 30);
  }
  function renderSubs() {
    $("#tSubs").innerHTML = editing.subtasks.map((s) => `<li class="${s.done ? "done" : ""}" data-sid="${s.id}">
      <input type="checkbox" ${s.done ? "checked" : ""} /><span>${esc(s.text)}</span><button type="button" class="icon-btn" data-sub-del>×</button></li>`).join("");
  }
  $("#tSubs").addEventListener("click", (e) => {
    const li = e.target.closest("li"); if (!li) return;
    const s = editing.subtasks.find((x) => x.id === li.dataset.sid);
    if (e.target.matches("[data-sub-del]")) editing.subtasks = editing.subtasks.filter((x) => x !== s);
    else if (e.target.matches("input")) s.done = e.target.checked;
    else return;
    renderSubs();
  });
  $("#tSubInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const v = e.target.value.trim(); if (!v) return;
    editing.subtasks.push({ id: uid(), text: v, done: false });
    e.target.value = ""; renderSubs();
  });
  function collectTask() {
    const t = task(editing.id); if (!t) return null;
    const newStatus = $("#tStatus").value;
    Object.assign(t, {
      title: $("#tTitle").value.trim() || t.title,
      projectId: $("#tProject").value,
      priority: +$("#tPriority").value,
      due: $("#tDue").value,
      est: +$("#tEst").value || 0,
      note: $("#tNote").value,
      subtasks: editing.subtasks,
      pinned: $("#tToday").checked ? ymd() : (t.pinned === ymd() ? "" : t.pinned),
    });
    if (newStatus !== t.status) setStatus(t, newStatus);
    return t;
  }
  tm.addEventListener("close", () => {
    if (tm.returnValue === "save" && editing) { collectTask(); save(); }
    editing = null; tm.returnValue = "";
  });
  $("#tDelete").addEventListener("click", () => {
    if (!confirm("이 할 일을 삭제할까요?")) return;
    state.tasks = state.tasks.filter((t) => t.id !== editing.id);
    if (timer.taskId === editing.id) resetTimer();
    editing = null; tm.close(); save();
  });
  $("#tFocus").addEventListener("click", () => {
    const t = collectTask(); editing = null; tm.close(); save();
    if (t) startTimerFor(t);
  });

  // ---------- project modal ----------
  const pm = $("#projectModal");
  let editingP = null, pColor = COLORS[0];
  function openProject(id) {
    const p = id ? proj(id) : null;
    editingP = p ? p.id : null;
    $("#pName").value = p ? p.name : "";
    $("#pStart").value = p ? p.start : ymd();
    $("#pDue").value = p ? p.due : "";
    $("#pLink").value = p ? p.link : "";
    pColor = p ? p.color : COLORS[state.projects.length % COLORS.length];
    $("#pColors").innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === pColor ? "sel" : ""}" aria-label="${c}"></button>`).join("");
    $("#pDelete").hidden = !p; $("#pArchive").hidden = !p;
    $("#pArchive").textContent = p && p.archived ? "보관 해제" : "보관";
    pm.showModal();
  }
  $("#pColors").addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]"); if (!b) return;
    pColor = b.dataset.c; $$("#pColors button").forEach((x) => x.classList.toggle("sel", x === b));
  });
  pm.addEventListener("close", () => {
    if (pm.returnValue === "save") {
      const data = { name: $("#pName").value.trim(), start: $("#pStart").value, due: $("#pDue").value, link: $("#pLink").value.trim(), color: pColor };
      if (data.name) {
        if (editingP) Object.assign(proj(editingP), data);
        else state.projects.push({ id: uid(), archived: false, createdAt: Date.now(), ...data });
        save();
      }
    }
    pm.returnValue = "";
  });
  $("#pDelete").addEventListener("click", () => {
    const p = proj(editingP); if (!p) return;
    const n = state.tasks.filter((t) => t.projectId === p.id).length;
    if (!confirm(`‘${p.name}’ 프로젝트를 삭제할까요?${n ? `\n할 일 ${n}개는 ‘프로젝트 없음’으로 옮겨집니다.` : ""}`)) return;
    state.tasks.forEach((t) => { if (t.projectId === p.id) t.projectId = ""; });
    state.projects = state.projects.filter((x) => x.id !== p.id);
    pm.close(); save();
  });
  $("#pArchive").addEventListener("click", () => { const p = proj(editingP); p.archived = !p.archived; pm.close(); save(); });
  $("#addProject").addEventListener("click", () => openProject(null));
  $("#showArchived").addEventListener("change", (e) => { ui.showArchived = e.target.checked; saveUi(); render(); });

  // ---------- timer ----------
  const MODES = { pomo: 25, long: 50, free: 0 };
  let timer = { mode: "pomo", taskId: null, running: false, startedAt: 0, elapsed: 0 }; // elapsed ms before current run
  try { Object.assign(timer, JSON.parse(storage.get(TIMER_KEY)) || {}); } catch { /* ignore */ }
  const saveTimer = () => storage.set(TIMER_KEY, JSON.stringify(timer));
  const elapsedMs = () => timer.elapsed + (timer.running ? Date.now() - timer.startedAt : 0);
  let tick = null, notified = false;

  function startTimerFor(t) {
    if (timer.taskId && timer.taskId !== t.id && elapsedMs() > 60000) logSession();
    if (timer.taskId !== t.id) { timer.elapsed = 0; notified = false; }
    timer.taskId = t.id; timer.running = true; timer.startedAt = Date.now();
    if (t.status === "todo") { setStatus(t, "doing"); save({ silent: true }); }
    saveTimer(); ensureTick(); render();
    toast(`‘${t.title}’ 집중 시작`);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }
  function toggleTimer() {
    if (!timer.taskId) { toast("할 일 옆 ▶ 버튼으로 작업을 골라주세요"); return; }
    if (timer.running) { timer.elapsed = elapsedMs(); timer.running = false; }
    else { timer.running = true; timer.startedAt = Date.now(); }
    saveTimer(); ensureTick(); renderTimer();
  }
  function logSession() {
    const min = Math.round(elapsedMs() / 60000);
    const t = task(timer.taskId);
    if (min >= 1 && t) {
      const start = Date.now() - elapsedMs();
      state.sessions.push({ id: uid(), taskId: t.id, projectId: t.projectId, title: t.title, start, date: ymd(new Date(start)), min });
      t.spent = (t.spent || 0) + min;
      return min;
    }
    return 0;
  }
  function resetTimer() { timer = { mode: timer.mode, taskId: null, running: false, startedAt: 0, elapsed: 0 }; notified = false; saveTimer(); renderTimer(); }
  function stopTimer() {
    if (!timer.taskId) return;
    const min = logSession();
    resetTimer(); save();
    toast(min ? `${fmtMin(min)} 기록했어요` : "1분 미만이라 기록하지 않았어요");
  }
  function ensureTick() {
    clearInterval(tick);
    if (timer.running) tick = setInterval(renderTimer, 1000);
  }
  function renderTimer() {
    const el = $("#timer");
    const t = task(timer.taskId);
    if (timer.taskId && !t) { resetTimer(); return; }
    const ms = elapsedMs();
    const goal = MODES[timer.mode] * 60000;
    let shown = goal ? goal - ms : ms;
    const over = goal && shown < 0;
    shown = Math.abs(shown);
    const s = Math.floor(shown / 1000), h = Math.floor(s / 3600);
    const clock = (h ? `${h}:${pad(Math.floor(s / 60) % 60)}` : pad(Math.floor(s / 60))) + ":" + pad(s % 60);
    $("#timerClock").textContent = (over ? "+" : "") + clock;
    $("#timerTask").textContent = t ? t.title : "할 일 옆 ▶ 를 눌러 시작";
    $("#timerToggle").textContent = timer.running ? "일시정지" : ms ? "계속" : "시작";
    el.classList.toggle("running", timer.running);
    $$("#timerModes button").forEach((b) => b.classList.toggle("active", b.dataset.mode === timer.mode));
    document.title = timer.running && t ? `${(over ? "+" : "") + clock} · ${MINI_MODE ? baseTitle() : t.title}` : baseTitle();
    // mini widget timer
    miniEl("clock").textContent = (over ? "+" : "") + clock;
    miniEl("ttask").textContent = t ? `▶ ${t.title}` : "할 일 옆 ▶ 로 집중 시작";
    miniEl("tbtn").textContent = timer.running ? "일시정지" : ms ? "계속" : "시작";
    miniRoot.classList.toggle("running", timer.running);
    if (over && timer.running && !notified) {
      notified = true;
      toast("목표 시간 완료! 기록 후 종료를 눌러 저장하세요");
      try { if (Notification.permission === "granted") new Notification("집중 시간 완료", { body: t ? t.title : "" }); } catch { /* ignore */ }
    }
  }
  $("#timerToggle").addEventListener("click", toggleTimer);
  $("#timerStop").addEventListener("click", stopTimer);
  $("#timerModes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    timer.mode = b.dataset.mode; notified = false; saveTimer(); renderTimer();
  });

  // ---------- nav & keys ----------
  $("#nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    ui.view = b.dataset.view; ui.weekOffset = 0; saveUi(); render();
  });
  $("#weekPrev").addEventListener("click", () => { ui.weekOffset--; render(); });
  $("#weekNext").addEventListener("click", () => { ui.weekOffset++; render(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select") || document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
    const views = { 1: "today", 2: "board", 3: "projects", 4: "stats" };
    if (views[e.key]) { ui.view = views[e.key]; saveUi(); render(); }
    else if (e.key === "n") { e.preventDefault(); ui.view = "today"; render(); $("#qaTitle").focus(); }
    else if (e.key === " " && timer.taskId) { e.preventDefault(); toggleTimer(); }
  });

  // ---------- settings & sync ----------
  const sm = $("#settingsModal");
  $("#openSettings").addEventListener("click", () => {
    $("#sName").value = state.name || "";
    $("#sToken").value = storage.get(TOKEN_KEY) || "";
    $("#sGist").value = state.gistId || "";
    $("#sAuto").checked = !!state.autoSync;
    sm.showModal();
  });
  function applySettings() {
    state.name = $("#sName").value.trim() || state.name;
    const tok = $("#sToken").value.trim();
    tok ? storage.set(TOKEN_KEY, tok) : storage.del(TOKEN_KEY);
    state.gistId = $("#sGist").value.trim();
    state.autoSync = $("#sAuto").checked;
  }
  sm.addEventListener("close", () => { if (sm.returnValue === "save") { applySettings(); save({ sync: false }); updateSyncStatus(); } sm.returnValue = ""; });
  $("#sPush").addEventListener("click", async () => { applySettings(); save({ silent: true, sync: false }); await pushGist(true); $("#sGist").value = state.gistId || ""; });
  $("#sPull").addEventListener("click", async () => { applySettings(); save({ silent: true, sync: false }); await pullGist({ force: true }); sm.close(); });

  $("#sExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `work-tracker-${ymd()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#sImport").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.tasks) || !Array.isArray(data.projects)) throw new Error("형식이 올바르지 않아요");
      if (!confirm("현재 데이터를 가져온 파일로 바꿀까요?")) return;
      const keep = { gistId: state.gistId, autoSync: state.autoSync };
      state = { ...data, ...keep, notes: data.notes || {}, sessions: data.sessions || [] };
      save(); sm.close(); toast("가져오기 완료");
    } catch (err) { alert("가져오기 실패: " + err.message); }
    e.target.value = "";
  });

  function setSync(text, cls = "") { const s = $("#syncStatus"); s.textContent = text; s.className = "sync-status " + cls; }
  function updateSyncStatus() {
    if (storage.get(TOKEN_KEY) && state.gistId) setSync(state.autoSync ? "Gist 자동 동기화" : "Gist 연결됨", "ok");
    else setSync("이 브라우저에 저장");
  }
  async function gh(path, opts = {}) {
    const token = storage.get(TOKEN_KEY);
    if (!token) throw new Error("GitHub 토큰이 없어요");
    const res = await fetch("https://api.github.com" + path, {
      ...opts,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json().catch(() => ({}))).message || res.statusText}`);
    return res.json();
  }
  async function pushGist(manual = false) {
    try {
      setSync("업로드 중…");
      const body = { description: "Work Tracker data", files: { [GIST_FILE]: { content: JSON.stringify(state) } } };
      if (state.gistId) await gh(`/gists/${state.gistId}`, { method: "PATCH", body: JSON.stringify(body) });
      else {
        const g = await gh("/gists", { method: "POST", body: JSON.stringify({ ...body, public: false }) });
        state.gistId = g.id; storage.set(KEY, JSON.stringify(state));
      }
      setSync(`동기화됨 ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`, "ok");
      if (manual) toast("Gist에 업로드했어요");
    } catch (err) { setSync("동기화 실패", "err"); if (manual) alert(err.message); else console.warn(err); }
  }
  async function pullGist({ force = false } = {}) {
    if (!state.gistId) { if (force) alert("Gist ID를 입력하세요"); return; }
    try {
      setSync("불러오는 중…");
      const g = await gh(`/gists/${state.gistId}`);
      const file = g.files[GIST_FILE];
      if (!file) throw new Error(`Gist에 ${GIST_FILE} 파일이 없어요`);
      const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
      const remote = JSON.parse(content);
      if (!force && (remote.updatedAt || 0) <= (state.updatedAt || 0)) { updateSyncStatus(); return; }
      if (force && !confirm("Gist의 데이터로 이 브라우저의 데이터를 덮어쓸까요?")) { updateSyncStatus(); return; }
      const keep = { gistId: state.gistId, autoSync: state.autoSync };
      state = { ...remote, ...keep };
      storage.set(KEY, JSON.stringify(state));
      render();
      setSync("최신 데이터 불러옴", "ok");
      if (force) toast("Gist에서 불러왔어요");
    } catch (err) { setSync("동기화 실패", "err"); if (force) alert(err.message); else console.warn(err); }
  }
  let syncT;
  function scheduleSync() {
    if (!state.autoSync || !state.gistId || !storage.get(TOKEN_KEY)) return;
    clearTimeout(syncT); syncT = setTimeout(() => pushGist(false), 2500);
  }

  // ---------- mini widget ----------
  const miniRoot = $("#mini");
  const miniEl = (k) => miniRoot.querySelector(`[data-m="${k}"]`);
  let pipWin = null;

  function renderMini() {
    if (miniRoot.hidden) return;
    const today = ymd(), d = new Date();
    const list = state.tasks.filter(isToday).sort(sortTasks);
    const done = state.tasks.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === today).sort((a, b) => b.doneAt - a.doneAt);
    const focusMin = state.sessions.filter((s) => s.date === today).reduce((a, s) => a + s.min, 0);
    miniEl("date").textContent = `${d.getMonth() + 1}.${d.getDate()} ${DOW[d.getDay()]} · TODAY`;
    miniEl("summary").textContent = `완료 ${done.length}/${done.length + list.length} · 집중 ${fmtH(focusMin)}`;
    const item = (t) => {
      const p = proj(t.projectId);
      return `<li class="${t.status} ${timer.taskId === t.id ? "active" : ""}" data-id="${t.id}">
        <button class="cb" data-mact="toggle" aria-label="완료 전환"></button>
        <div><div class="t">${t.priority === 1 && t.status !== "done" ? '<span class="pri p1">!!</span> ' : ""}${esc(t.title)}</div>
          <div class="m">${p ? `<i class="dot" style="background:${p.color}"></i>${esc(p.name)}` : ""} ${t.status !== "done" ? dueBadge(t.due, t.status) : ""}</div></div>
        ${t.status !== "done" ? `<button class="play" data-mact="focus" title="집중 시작">▶</button>` : "<span></span>"}
      </li>`;
    };
    miniEl("list").innerHTML =
      (list.map(item).join("") || `<li class="empty muted">오늘 할 일이 없어요 🎉</li>`) +
      (done.length ? `<li class="sep">오늘 끝낸 일</li>` + done.slice(0, 8).map(item).join("") : "");
  }

  miniRoot.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mact]"); if (!b) return;
    const act = b.dataset.mact;
    if (act === "pip") return openPip();
    if (act === "full") { window.open(location.pathname, "_blank"); return; }
    if (act === "ttoggle") return toggleTimer();
    if (act === "tstop") return stopTimer();
    const t = task(b.closest("li")?.dataset.id); if (!t) return;
    if (act === "toggle") { setStatus(t, t.status === "done" ? "todo" : "done"); save(); }
    if (act === "focus") startTimerFor(t);
  });
  miniRoot.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.querySelector("input");
    const raw = input.value.trim(); if (!raw) return;
    const f = parseQuick(raw); if (!f.title) return;
    addTask({ ...f, pinned: ymd() });
    input.value = "";
  });

  // 📌 항상 위 창: Document Picture-in-Picture (Edge/Chrome 116+)
  async function openPip() {
    if (pipWin) { pipWin.focus(); return; }
    if (!("documentPictureInPicture" in window)) {
      window.open(location.pathname + "?mini", "wt-mini", "width=360,height=640");
      toast("이 브라우저는 '항상 위'를 지원하지 않아 작은 창으로 열었어요");
      return;
    }
    try {
      pipWin = await documentPictureInPicture.requestWindow({ width: 340, height: 560 });
    } catch (err) { toast("작은 창을 열 수 없어요: " + err.message); return; }
    const pdoc = pipWin.document;
    $$('link[rel="stylesheet"]').forEach((l) => { const n = pdoc.createElement("link"); n.rel = "stylesheet"; n.href = l.href; pdoc.head.append(n); });
    const theme = document.documentElement.getAttribute("data-theme"); if (theme) pdoc.documentElement.setAttribute("data-theme", theme);
    pdoc.title = "Work Tracker Mini";
    pdoc.body.className = "mini-mode pip";
    miniRoot.hidden = false;
    pdoc.body.append(miniRoot);
    render();
    pipWin.addEventListener("pagehide", () => {
      document.body.append(miniRoot);
      miniRoot.hidden = !MINI_MODE;
      pipWin = null;
    });
  }
  $("#openMini").addEventListener("click", openPip);

  // ---------- 여러 창/탭 사이 실시간 반영 ----------
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) {
      try { state = JSON.parse(e.newValue); render(); } catch { /* ignore */ }
    } else if (e.key === TIMER_KEY && e.newValue) {
      try { timer = JSON.parse(e.newValue); notified = false; ensureTick(); render(); } catch { /* ignore */ }
    }
  });
  // 다시 화면으로 돌아오면 Gist에서 최신 데이터 받기 (30초에 한 번까지)
  let lastPull = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !state.autoSync || Date.now() - lastPull < 30000) return;
    lastPull = Date.now(); pullGist();
  });

  if (MINI_MODE) { document.body.classList.add("mini-mode"); miniRoot.hidden = false; }

  // ---------- boot ----------
  storage.set(KEY, JSON.stringify(state));
  render(); ensureTick(); updateSyncStatus();
  if (state.autoSync) pullGist();
  // 날짜가 바뀌면 다시 그리기
  let lastDay = ymd();
  setInterval(() => { if (ymd() !== lastDay) { lastDay = ymd(); render(); } }, 60000);
})();
