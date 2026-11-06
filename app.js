/* Work Tracker — 순수 JS, 데이터는 localStorage (+ 선택적으로 GitHub Gist 동기화) */
(() => {
  "use strict";

  const KEY = "work-tracker:v1";
  const TOKEN_KEY = "work-tracker:token";
  const UI_KEY = "work-tracker:ui";
  const GIST_FILE = "work-tracker.json";
  const COLORS = ["#171512", "#b3261e", "#c2601a", "#8b6a1f", "#3d6b4f", "#2f5d7c", "#5b4a8a", "#8a4a6b", "#6b6459"];
  const KINDS = ["공모전", "프로젝트", "수업·과제", "인턴·연구", "자격증·어학", "대외활동", "개인", "기타"];
  const STAGES = { active: "진행 중", idea: "시작 전", hold: "보류", done: "끝남" };
  const STAGE_ORDER = { active: 0, idea: 1, hold: 2, done: 3 };
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
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    const p = (name, kind, start, due, color, memo = "") => ({ id: uid(), name, kind, stage: "active", memo, start, due, color, link: "", archived: false, createdAt: Date.now() });
    const projects = [
      p("토익 900+ (100만원)", "자격증·어학", "2026-11-02", "2026-11-30", "#2f5d7c", "900점 넘기면 장학금 100만원"),
      p("신호및시스템 발표", "수업·과제", "2026-11-03", "2026-12-08", "#b3261e", "자료 제출 11/30, 발표 12/8"),
      p("연구실 인턴 - 로켓", "인턴·연구", "2026-11-06", "2026-11-13", "#3d6b4f"),
      p("AI-X 아이디어 공모전", "공모전", "2026-11-06", "2026-11-23", "#5b4a8a", "신청서 제출"),
      p("생활 · 기타", "개인", "", "", "#6b6459"),
    ];
    const [toeic, sig, lab, aix, life] = projects;
    const t = (projectId, title, extra = {}) => ({
      id: uid(), projectId, title, status: "todo", priority: 2, due: "",
      subtasks: [], note: "", pinned: "", createdAt: Date.now(), doneAt: null, ...extra,
    });
    const tasks = [
      t(toeic.id, "LC 파트 2 오답 정리"),
      t(toeic.id, "RC 실전 모의고사 1회", { priority: 1 }),
      t(sig.id, "발표 자료 제출", { priority: 1, due: "2026-11-30", subtasks: [
        { id: uid(), text: "목차 구성", done: false }, { id: uid(), text: "슬라이드 초안", done: false }, { id: uid(), text: "팀원 리뷰", done: false } ] }),
      t(sig.id, "발표 리허설", { due: "2026-12-08" }),
      t(lab.id, "로켓 프로젝트 자료 읽기", { status: "doing", priority: 1, due: "2026-11-13" }),
      t(aix.id, "아이디어 3개 브레인스토밍", { due: "2026-11-15" }),
      t(aix.id, "공모전 신청서 작성", { priority: 1, due: "2026-11-23" }),
      t(life.id, "옷 사기", { priority: 3, due: "2026-11-30" }),
      t(life.id, "올리브영 5000원 이상", { priority: 3, due: "2026-11-30" }),
    ];
    return { version: 2, updatedAt: Date.now(), name: "RIN", projects, tasks, notes: {}, gistId: "", autoSync: false };
  }

  // 예전 데이터에 종류/상태가 없으면 이름으로 추정해서 채움
  function guessKind(name) {
    const n = name || "";
    if (/공모전|해커톤|대회|챌린지/.test(n)) return "공모전";
    if (/인턴|연구|랩|lab/i.test(n)) return "인턴·연구";
    if (/토익|토플|오픽|자격증|기사|어학|toeic|opic/i.test(n)) return "자격증·어학";
    if (/발표|과제|수업|시험|강의|레포트|시스템/.test(n)) return "수업·과제";
    if (/동아리|서포터즈|봉사|대외/.test(n)) return "대외활동";
    if (/생활|개인|기타/.test(n)) return "개인";
    return "프로젝트";
  }
  function migrate(s) {
    s.notes ||= {}; s.projects ||= []; s.tasks ||= [];
    s.projects.forEach((p) => {
      if (!p.kind) p.kind = guessKind(p.name);
      if (!p.stage) p.stage = "active";
      if (p.memo == null) p.memo = "";
    });
    delete s.sessions;
    s.tasks.forEach((t) => { delete t.est; delete t.spent; });
    s.version = 2;
    return s;
  }

  let state;
  try { state = JSON.parse(storage.get(KEY)) || seed(); } catch { state = seed(); }
  state = migrate(state);
  storage.del("work-tracker:timer"); // 예전 집중 타이머 상태 정리

  let ui = { view: "today", boardFilter: "all", showArchived: false, kind: "all", expanded: null };
  try { Object.assign(ui, JSON.parse(storage.get(UI_KEY)) || {}); } catch { /* ignore */ }
  if (!["today", "board", "projects"].includes(ui.view)) ui.view = "today";
  const MINI_MODE = new URLSearchParams(location.search).has("mini");
  const baseTitle = () => (MINI_MODE ? "Work Tracker Mini" : `${state.name || "나"}의 작업실 · Work Tracker`);
  const saveUi = () => storage.set(UI_KEY, JSON.stringify({ view: ui.view, boardFilter: ui.boardFilter, boardShowDone: ui.boardShowDone, showArchived: ui.showArchived, kind: ui.kind, expanded: ui.expanded }));

  function save({ silent = false, sync = true } = {}) {
    state.updatedAt = Date.now();
    storage.set(KEY, JSON.stringify(state));
    if (sync) scheduleSync();
    if (!silent) render();
  }

  const proj = (id) => state.projects.find((p) => p.id === id);
  const task = (id) => state.tasks.find((t) => t.id === id);
  const activeProjects = () => state.projects.filter((p) => !p.archived);
  // 사이드바/미니에 보여줄 '벌려놓은 일' = 보관 안 됨 + 끝나지 않음
  const openCommitments = () => state.projects.filter((p) => !p.archived && p.stage !== "done").sort(sortCommit);
  function sortCommit(a, b) {
    return (STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9) ||
      (a.due || "9999").localeCompare(b.due || "9999") ||
      a.createdAt - b.createdAt;
  }

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
    (a.due || "9999").localeCompare(b.due || "9999") ||
    a.createdAt - b.createdAt;

  function setStatus(t, status) {
    t.status = status;
    t.doneAt = status === "done" ? Date.now() : null;
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

  function ddayHtml(p) {
    if (!p.due) return `<span class="dday none">기한 없음</span>`;
    const d = diffDays(p.due, ymd());
    if (p.stage === "done") return `<span class="dday none">~${md(p.due)}</span>`;
    const cls = d < 0 ? "over" : d <= 3 ? "urgent" : "";
    return `<span class="dday ${cls}">${d < 0 ? `D+${-d}` : d === 0 ? "D-DAY" : `D-${d}`}</span>`;
  }

  function projectStats(p) {
    const ts = state.tasks.filter((t) => t.projectId === p.id);
    const done = ts.filter((t) => t.status === "done").length;
    const open = ts.filter((t) => t.status !== "done").sort(sortTasks);
    return { ts, open, done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, next: open[0] };
  }

  function taskRow(t) {
    const p = proj(t.projectId);
    const subsDone = t.subtasks.filter((s) => s.done).length;
    const subs = t.subtasks.length ? `<span>☰ ${subsDone}/${t.subtasks.length}</span>` : "";
    const pri = t.priority < 3 && t.status !== "done" ? `<span class="pri p${t.priority}">${t.priority === 1 ? "!!" : "!"}</span>` : "";
    return `<li class="task ${t.status}" data-id="${t.id}">
      <button class="cb" data-act="toggle" aria-label="완료 전환"></button>
      <div>
        <div class="t-title">${pri} ${esc(t.title)}</div>
        <div class="meta">
          ${p ? `<span class="proj"><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</span>` : ""}
          ${t.status === "doing" ? "<span>진행 중</span>" : ""}
          ${dueBadge(t.due, t.status)} ${subs}
        </div>
      </div>
      <div class="side-actions">
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
    ({ today: renderToday, board: renderBoard, projects: renderCommitments })[ui.view]();
    renderSpread();
    renderMini();
  }

  function fillProjectSelects() {
    const opts = activeProjects().filter((p) => p.stage !== "done").sort(sortCommit).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    const qa = $("#qaProject"), cur = qa.value;
    qa.innerHTML = `<option value="">벌린 일 없음</option>` + opts;
    if ([...qa.options].some((o) => o.value === cur)) qa.value = cur;
    const bf = $("#boardFilter");
    bf.innerHTML = `<option value="all">전체</option>` + activeProjects().sort(sortCommit).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    bf.value = [...bf.options].some((o) => o.value === ui.boardFilter) ? ui.boardFilter : "all";
  }

  // 사이드바: 벌려놓은 일 한눈에
  function spreadItems(list) {
    return list.map((p) => {
      const st = projectStats(p);
      return `<li class="sp stage-${p.stage}" data-pid="${p.id}" style="--c:${p.color}" title="${esc(p.memo || p.name)}">
        <span class="sp-name">${esc(p.name)}</span>
        ${ddayHtml(p)}
        <span class="sp-sub">${esc(p.kind)}${p.stage !== "active" ? ` · ${STAGES[p.stage]}` : ""}${st.total ? ` · ${st.done}/${st.total}` : ""}</span>
      </li>`;
    }).join("");
  }
  function renderSpread() {
    const list = openCommitments();
    $("#spreadCount").textContent = list.length;
    $("#spreadList").innerHTML = spreadItems(list) || `<li class="empty">아직 없어요. ＋로 추가하세요.</li>`;
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

    const soon = openCommitments().filter((p) => p.due && diffDays(p.due, today) <= 7).length;
    $("#todayStats").innerHTML = `
      <div><b>${done.length}/${done.length + list.length}</b><span>오늘 완료</span></div>
      <div><b>${openCommitments().length}</b><span>벌려놓은 일</span></div>
      <div><b>${soon}</b><span>7일 내 마감</span></div>`;

    const note = $("#dailyNote");
    if (document.activeElement !== note) note.value = state.notes[today] || "";
  }

  // 메모장: 할 일 하나하나를 메모 카드로
  let noteQuery = "";
  function renderBoard() {
    const f = ui.boardFilter;
    $("#boardShowDone").checked = !!ui.boardShowDone;
    const q = noteQuery.trim().toLowerCase();
    const items = state.tasks
      .filter((t) => (f === "all" || t.projectId === f) && (ui.boardShowDone || t.status !== "done"))
      .filter((t) => !q || (t.title + "\n" + (t.note || "")).toLowerCase().includes(q))
      .sort((a, b) => (a.status === "done") - (b.status === "done") || (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    $("#board").innerHTML = items.map((t) => {
      const p = proj(t.projectId);
      const subsDone = t.subtasks.filter((s) => s.done).length;
      const done = t.status === "done";
      return `<article class="card memo ${done ? "done" : ""}" data-id="${t.id}" style="--c:${p ? p.color : "var(--line-strong)"}" tabindex="0">
        <div class="memo-top">
          <button class="memo-check" data-act="toggle" title="${done ? "다시 열기" : "끝냄으로 표시"}">${done ? "✓" : ""}</button>
          <h3>${t.priority === 1 && !done ? `<span class="pri p1">!!</span> ` : ""}${esc(t.title)}</h3>
        </div>
        ${t.note ? `<p class="memo-text">${esc(t.note)}</p>` : `<p class="memo-text empty">눌러서 내용 쓰기…</p>`}
        <div class="meta">${p ? `<span class="memo-proj">${esc(p.name)}</span>` : ""}${dueBadge(t.due, t.status)}${t.subtasks.length ? `<span>☰ ${subsDone}/${t.subtasks.length}</span>` : ""}<span class="memo-date">${md(ymd(new Date(t.updatedAt || t.createdAt)))}</span></div>
      </article>`;
    }).join("") || `<p class="muted empty-big">${q ? "검색 결과가 없어요." : "메모가 없어요. ‘+ 새 메모’로 할 일을 적어보세요."}</p>`;
  }

  // 벌려놓은 일 전체 목록
  function renderCommitments() {
    $("#showArchived").checked = ui.showArchived;
    const pool = state.projects.filter((p) => ui.showArchived || (!p.archived && p.stage !== "done"));
    const kindsPresent = KINDS.filter((k) => pool.some((p) => p.kind === k));
    if (ui.kind !== "all" && !kindsPresent.includes(ui.kind)) ui.kind = "all";
    $("#kindChips").innerHTML = [["all", `전체 ${pool.length}`], ...kindsPresent.map((k) => [k, `${k} ${pool.filter((p) => p.kind === k).length}`])]
      .map(([k, label]) => `<button class="chip ${ui.kind === k ? "on" : ""}" data-kind="${esc(k)}">${esc(label)}</button>`).join("");

    const open = openCommitments();
    const cnt = (s) => open.filter((p) => p.stage === s).length;
    $("#cStats").innerHTML = `
      <div><b>${cnt("active")}</b><span>진행 중</span></div>
      <div><b>${cnt("idea")}</b><span>시작 전</span></div>
      <div><b>${cnt("hold")}</b><span>보류</span></div>`;

    const list = pool.filter((p) => ui.kind === "all" || p.kind === ui.kind)
      .sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || sortCommit(a, b));

    $("#cList").innerHTML = list.length ? `
      <div class="c-row c-headrow"><span></span><span>이름</span><span>종류</span><span>상태</span><span>마감</span><span>진행</span><span>다음 할 일</span><span></span></div>
      ${list.map((p) => {
        const st = projectStats(p);
        const open = ui.expanded === p.id;
        const recentDone = st.ts.filter((t) => t.status === "done").sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 3);
        return `<article class="c-item stage-${p.stage} ${p.archived ? "archived" : ""} ${open ? "open" : ""}" data-pid="${p.id}" style="--c:${p.color}">
          <div class="c-row" data-act="expand">
            <span class="c-caret">${open ? "▾" : "▸"}</span>
            <div class="c-name"><b>${esc(p.name)}</b>${p.memo ? `<span class="c-memo">${esc(p.memo)}</span>` : ""}${p.archived ? `<span class="c-memo">보관됨</span>` : ""}</div>
            <span class="kind">${esc(p.kind)}</span>
            <select class="stage-sel" data-act="stage" aria-label="상태">${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${p.stage === k ? "selected" : ""}>${v}</option>`).join("")}</select>
            <div class="c-due">${ddayHtml(p)}<span class="muted small">${p.start || p.due ? `${md(p.start) || "?"}–${md(p.due) || "?"}` : ""}</span></div>
            <div class="c-prog"><div class="progress"><i style="width:${st.pct}%"></i></div><span>${st.total ? `${st.done}/${st.total}` : "할 일 없음"}</span></div>
            <div class="c-next">${st.next ? `<span class="nx" data-id="${st.next.id}">→ ${esc(st.next.title)}</span>` : `<span class="muted">—</span>`}</div>
            <div class="c-act">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener" title="링크 열기">↗</a>` : ""}<button class="icon-btn" data-act="edit-project" title="편집">✎</button></div>
          </div>
          ${open ? `<div class="c-body">
            <ul class="ptasks">${[...st.open, ...recentDone].map((t) => `<li class="${t.status}" data-id="${t.id}"><span>${esc(t.title)}</span>${t.due && t.status !== "done" ? dueBadge(t.due, t.status) : ""}</li>`).join("") || `<li class="muted none">아직 할 일이 없어요</li>`}</ul>
            <form class="padd" data-act="padd"><input placeholder="이 일에 할 일 추가 (!1 ~11/20)" /><button class="btn">+</button></form>
            <button class="link small" data-act="board-filter">메모장에서 보기</button>
          </div>` : ""}
        </article>`;
      }).join("")}` : `<p class="muted empty-big">벌려놓은 일이 없어요. ‘+ 새로 벌린 일’로 프로젝트·공모전을 적어보세요.</p>`;

    renderTimeline(openCommitments().filter((p) => p.due));
  }

  function renderTimeline(dated) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const span = (to - from) / 86400000 + 1;
    const pos = (s) => Math.max(0, Math.min(100, ((parseYmd(s) - from) / 86400000 / span) * 100));
    const ticks = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      if (d.getDate() === 1 || d.getDate() === 15) ticks.push(`<span style="left:${pos(ymd(d))}%">${d.getMonth() + 1}/${d.getDate()}</span>`);
    }
    const todayPos = pos(ymd());
    ticks.push(`<span class="today-tick" style="left:${todayPos}%">오늘</span>`);
    $("#timeline").innerHTML = dated.length ? `
      <div class="tl-head"><b>기간 한눈에</b><span class="muted small">${from.getMonth() + 1}월 – ${to.getMonth() + 1}월 · 진한 부분 = 완료율</span></div>
      <div class="tl-scale">${ticks.join("")}</div>
      <div class="tl-body">${dated.slice().sort((a, b) => a.due.localeCompare(b.due)).map((p) => {
        const s = p.start || ymd(new Date(p.createdAt));
        const l = pos(s), r = pos(p.due), w = Math.max(0.8, r - l);
        const st = projectStats(p);
        return `<div class="tl-row"><span class="nm" data-pid="${p.id}">${esc(p.name)}</span>
          <div class="tl-track"><div class="tl-bar" style="left:${l}%;width:${w}%;--c:${p.color}" title="${md(s)} – ${md(p.due)} · ${st.pct}%"><span class="fill" style="width:${st.pct}%"></span></div>
          <div class="tl-today" style="left:${todayPos}%"></div></div></div>`;
      }).join("")}</div>` : `<div class="tl-head"><b>기간 한눈에</b></div><p class="muted small tl-empty">벌린 일에 마감일을 넣으면 여기에 기간이 막대로 표시돼요.</p>`;
  }

  function goToCommitment(pid) {
    ui.view = "projects"; ui.expanded = pid;
    const p = proj(pid);
    if (p && ui.kind !== "all" && p.kind !== ui.kind) ui.kind = "all";
    if (p && (p.archived || p.stage === "done")) ui.showArchived = true;
    saveUi(); render();
    $(`.c-item[data-pid="${pid}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // ---------- quick add ----------
  function parseQuick(raw) {
    let title = raw, projectId = null, priority = 2, due = "";
    title = title.replace(/(^|\s)#(\S+)/, (_, s, name) => {
      const q = name.toLowerCase();
      const p = activeProjects().find((p) => p.name.toLowerCase().includes(q));
      if (p) { projectId = p.id; return s; }
      return _;
    });
    title = title.replace(/(^|\s)!([123])(?=\s|$)/, (_, s, n) => { priority = +n; return s; });
    title = title.replace(/(^|\s)~(\d{1,2})[\/.-](\d{1,2})(?=\s|$)/, (_, s, m, d) => {
      const now = new Date(); let y = now.getFullYear();
      if (new Date(y, +m - 1, +d) < addDays(now, -60)) y++;
      due = ymd(new Date(y, +m - 1, +d)); return s;
    });
    title = title.replace(/(^|\s)~(오늘|내일)(?=\s|$)/, (_, s, w) => { due = ymd(addDays(new Date(), w === "내일" ? 1 : 0)); return s; });
    return { title: title.replace(/\s+/g, " ").trim(), projectId, priority, due };
  }

  function addTask(fields) {
    const t = {
      id: uid(), projectId: fields.projectId || "", title: fields.title, status: "todo",
      priority: fields.priority || 2, due: fields.due || "",
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
    const act = actEl?.dataset.act;

    if (e.target.closest("[data-close]")) { e.target.closest("dialog")?.close(); return; }
    // 사이드바 벌려놓은 일
    const sp =e.target.closest(".spread-list .sp");
    if (sp) return goToCommitment(sp.dataset.pid);
    if (e.target.closest(".tl-row .nm")) return goToCommitment(e.target.closest(".nm").dataset.pid);
    const chip = e.target.closest("[data-kind]");
    if (chip) { ui.kind = chip.dataset.kind; saveUi(); return render(); }

    if (act === "edit-project") return openProject(actEl.closest("[data-pid]").dataset.pid);
    if (act === "board-filter") { ui.boardFilter = actEl.closest("[data-pid]").dataset.pid; ui.view = "board"; saveUi(); return render(); }
    const nx = e.target.closest(".c-next .nx");
    if (nx) return openTask(nx.dataset.id);
    if (act === "expand") {
      if (e.target.closest("select, a, input, button")) return;
      const pid = actEl.closest("[data-pid]").dataset.pid;
      ui.expanded = ui.expanded === pid ? null : pid; saveUi(); return render();
    }

    const row = e.target.closest(".task, .card, .ptasks li[data-id]");
    if (!row) return;
    const t = task(row.dataset.id);
    if (!t) return;
    if (act === "toggle") { setStatus(t, t.status === "done" ? "todo" : "done"); save(); if (t.status === "done") toast("완료! 🎉"); return; }
    if (act === "pin") { t.pinned = t.pinned === ymd() ? "" : ymd(); save(); return; }
    openTask(t.id);
  });

  document.addEventListener("change", (e) => {
    if (!e.target.matches(".stage-sel")) return;
    const p = proj(e.target.closest("[data-pid]").dataset.pid); if (!p) return;
    p.stage = e.target.value; save();
    toast(`‘${p.name}’ → ${STAGES[p.stage]}`);
  });

  document.addEventListener("submit", (e) => {
    const f = e.target.closest('[data-act="padd"]');
    if (!f) return;
    e.preventDefault();
    const input = f.querySelector("input");
    const raw = input.value.trim(); if (!raw) return;
    const q = parseQuick(raw);
    addTask({ ...q, projectId: f.closest("[data-pid]").dataset.pid });
    setTimeout(() => $(`.c-item[data-pid="${f.closest("[data-pid]")?.dataset.pid}"] .padd input`)?.focus(), 0);
  });

  // 메모장 controls
  $("#boardFilter").addEventListener("change", (e) => { ui.boardFilter = e.target.value; saveUi(); render(); });
  $("#boardShowDone").addEventListener("change", (e) => { ui.boardShowDone = e.target.checked; saveUi(); render(); });
  $("#noteSearch").addEventListener("input", (e) => { noteQuery = e.target.value; renderBoard(); });
  $("#newNote").addEventListener("click", () => newNote());
  $("#board").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".memo")) openTask(e.target.dataset.id);
  });

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
  function openTask(id, draft) {
    const t = draft || task(id); if (!t) return;
    editing = JSON.parse(JSON.stringify(t));
    if (draft) editing.isNew = true;
    $("#tTitle").value = editing.title;
    $("#tProject").innerHTML = `<option value="">벌린 일 없음</option>` + state.projects.filter((p) => !p.archived || p.id === editing.projectId).sort(sortCommit).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("#tProject").value = editing.projectId || "";
    $("#tDone").checked = editing.status === "done";
    $("#tPriority").value = String(editing.priority);
    $("#tDue").value = editing.due || "";
    $("#tToday").checked = editing.pinned === ymd();
    $("#tNote").value = editing.note || "";
    $("#tSubsBox").open = editing.subtasks.length > 0;
    $("#tDelete").hidden = !!draft;
    renderSubs();
    tm.showModal();
    setTimeout(() => (draft || !editing.title ? $("#tTitle") : $("#tNote")).focus(), 30);
  }
  function newNote() {
    const f = ui.view === "board" && ui.boardFilter !== "all" ? ui.boardFilter : "";
    openTask(null, {
      id: uid(), projectId: f, title: "", status: "todo", priority: 2, due: "",
      subtasks: [], note: "", pinned: "", createdAt: Date.now(), doneAt: null,
    });
  }
  function renderSubs() {
    const d = editing.subtasks.filter((s) => s.done).length;
    $("#tSubsCount").textContent = editing.subtasks.length ? `${d}/${editing.subtasks.length}` : "";
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
    const noteV = $("#tNote").value;
    const titleV = $("#tTitle").value.trim() || noteV.trim().split("\n")[0].slice(0, 60).trim();
    let t = task(editing.id);
    if (!t) {
      if (!editing.isNew || (!titleV && !noteV.trim())) return null; // 빈 새 메모는 만들지 않음
      const { isNew, ...base } = editing;
      t = base; state.tasks.push(t);
    }
    const newStatus = $("#tDone").checked ? "done" : (t.status === "done" ? "todo" : t.status);
    Object.assign(t, {
      updatedAt: Date.now(),
      title: titleV || t.title || "제목 없음",
      projectId: $("#tProject").value,
      priority: +$("#tPriority").value,
      due: $("#tDue").value,
      note: $("#tNote").value,
      subtasks: editing.subtasks,
      pinned: $("#tToday").checked ? ymd() : (t.pinned === ymd() ? "" : t.pinned),
    });
    if (newStatus !== t.status) setStatus(t, newStatus);
    return t;
  }
  // 저장은 dialog 'close' 이벤트 대신 form submit 시점에 처리 (더 확실함)
  $("#taskForm").addEventListener("submit", (e) => {
    if (e.submitter?.value === "save" && editing) { if (collectTask()) save(); }
    editing = null;
  });
  // Esc로 닫아도 쓴 내용은 저장 (메모장처럼)
  tm.addEventListener("cancel", () => {
    if (editing && collectTask()) save();
    editing = null;
  });
  $("#tDelete").addEventListener("click", () => {
    if (!confirm("이 할 일을 삭제할까요?")) return;
    state.tasks = state.tasks.filter((t) => t.id !== editing.id);
    editing = null; tm.close(); save();
  });

  // ---------- commitment (project) modal ----------
  const pm = $("#projectModal");
  let editingP = null, pColor = COLORS[0];
  $("#pKind").innerHTML = KINDS.map((k) => `<option>${k}</option>`).join("");
  $("#pStage").innerHTML = Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  function openProject(id) {
    const p = id ? proj(id) : null;
    editingP = p ? p.id : null;
    $("#pName").value = p ? p.name : "";
    $("#pKind").value = p ? p.kind : (ui.kind !== "all" ? ui.kind : "공모전");
    $("#pStage").value = p ? p.stage : "active";
    $("#pStart").value = p ? p.start : ymd();
    $("#pDue").value = p ? p.due : "";
    $("#pMemo").value = p ? p.memo || "" : "";
    $("#pLink").value = p ? p.link : "";
    pColor = p ? p.color : COLORS[state.projects.length % COLORS.length];
    $("#pColors").innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === pColor ? "sel" : ""}" aria-label="${c}"></button>`).join("");
    $("#pDelete").hidden = !p; $("#pArchive").hidden = !p;
    $("#pArchive").textContent = p && p.archived ? "보관 해제" : "보관";
    pm.showModal();
    setTimeout(() => $("#pName").focus(), 30);
  }
  $("#pColors").addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]"); if (!b) return;
    pColor = b.dataset.c; $$("#pColors button").forEach((x) => x.classList.toggle("sel", x === b));
  });
  $("#projectForm").addEventListener("submit", (e) => {
    if (e.submitter?.value === "save") {
      const data = {
        name: $("#pName").value.trim(), kind: $("#pKind").value, stage: $("#pStage").value,
        start: $("#pStart").value, due: $("#pDue").value, memo: $("#pMemo").value.trim(),
        link: $("#pLink").value.trim(), color: pColor,
      };
      if (data.name) {
        if (editingP) Object.assign(proj(editingP), data);
        else { const id = uid(); state.projects.push({ id, archived: false, createdAt: Date.now(), ...data }); ui.expanded = id; saveUi(); }
        save();
      }
    }
  });
  $("#pDelete").addEventListener("click", () => {
    const p = proj(editingP); if (!p) return;
    const n = state.tasks.filter((t) => t.projectId === p.id).length;
    if (!confirm(`‘${p.name}’을(를) 삭제할까요?${n ? `\n할 일 ${n}개는 ‘벌린 일 없음’으로 옮겨집니다.` : ""}\n(기록을 남기고 싶으면 삭제 대신 상태를 ‘끝남’으로 바꾸거나 보관하세요)`)) return;
    state.tasks.forEach((t) => { if (t.projectId === p.id) t.projectId = ""; });
    state.projects = state.projects.filter((x) => x.id !== p.id);
    pm.close(); save();
  });
  $("#pArchive").addEventListener("click", () => { const p = proj(editingP); p.archived = !p.archived; pm.close(); save(); });
  $("#addProject").addEventListener("click", () => openProject(null));
  $("#spreadAdd").addEventListener("click", () => openProject(null));
  $("#showArchived").addEventListener("change", (e) => { ui.showArchived = e.target.checked; saveUi(); render(); });

  // ---------- nav & keys ----------
  $("#nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    ui.view = b.dataset.view; saveUi(); render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select") || document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
    const views = { 1: "today", 2: "board", 3: "projects" };
    if (views[e.key]) { ui.view = views[e.key]; saveUi(); render(); }
    else if (e.key === "n" && ui.view === "board") { e.preventDefault(); newNote(); }
    else if (e.key === "n") { e.preventDefault(); ui.view = "today"; render(); $("#qaTitle").focus(); }
    else if (e.key === "p") { e.preventDefault(); openProject(null); }
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
  sm.querySelector("form").addEventListener("submit", (e) => { if (e.submitter?.value === "save") { applySettings(); save({ sync: false }); updateSyncStatus(); } });
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
      state = migrate({ ...data, ...keep });
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
      state = migrate({ ...remote, ...keep });
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
    const commits = openCommitments();
    miniEl("date").textContent = `${d.getMonth() + 1}.${d.getDate()} ${DOW[d.getDay()]} · TODAY`;
    miniEl("summary").textContent = `오늘 완료 ${done.length}/${done.length + list.length} · 벌린 일 ${commits.length}`;
    miniEl("spreadCount").textContent = commits.length;
    miniEl("spread").innerHTML = spreadItems(commits) || `<li class="empty">없음</li>`;
    const item = (t) => {
      const p = proj(t.projectId);
      return `<li class="${t.status}" data-id="${t.id}">
        <button class="cb" data-mact="toggle" aria-label="완료 전환"></button>
        <div><div class="t">${t.priority === 1 && t.status !== "done" ? '<span class="pri p1">!!</span> ' : ""}${esc(t.title)}</div>
          <div class="m">${p ? `<i class="dot" style="background:${p.color}"></i>${esc(p.name)}` : ""} ${t.status !== "done" ? dueBadge(t.due, t.status) : ""}</div></div>
      </li>`;
    };
    miniEl("list").innerHTML =
      (list.map(item).join("") || `<li class="empty muted">오늘 할 일이 없어요 🎉</li>`) +
      (done.length ? `<li class="sep">오늘 끝낸 일</li>` + done.slice(0, 8).map(item).join("") : "");
  }

  miniRoot.addEventListener("click", (e) => {
    const sp = e.target.closest(".sp");
    if (sp) {
      if (miniRoot.ownerDocument === document && !MINI_MODE) return goToCommitment(sp.dataset.pid);
      window.open(location.pathname, "wt-full"); return;
    }
    const b = e.target.closest("[data-mact]"); if (!b) return;
    const act = b.dataset.mact;
    if (act === "pip") return openPip();
    if (act === "full") { window.open(location.pathname, "wt-full"); return; }
    const t = task(b.closest("li")?.dataset.id); if (!t) return;
    if (act === "toggle") { setStatus(t, t.status === "done" ? "todo" : "done"); save(); }
  });
  miniEl("spreadBox").addEventListener("toggle", (e) => storage.set("work-tracker:miniSpread", e.target.open ? "1" : "0"));
  if (storage.get("work-tracker:miniSpread") === "0") miniEl("spreadBox").open = false;
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
      try { state = migrate(JSON.parse(e.newValue)); render(); } catch { /* ignore */ }
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
  render(); updateSyncStatus();
  if (state.autoSync) pullGist();
  // 날짜가 바뀌면 다시 그리기
  let lastDay = ymd();
  setInterval(() => { if (ymd() !== lastDay) { lastDay = ymd(); render(); } }, 60000);
})();
