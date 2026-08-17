import {
  BUILDINGS,
  STATIONS,
  availableStations,
  assignJob,
  buildNext,
  canBuild,
  colonyMorale,
  colonistMood,
  createGame,
  endDay,
  getOutcome,
  selectColonist,
  summarize,
} from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, mergeProgress, saveProgress } from "./persist.js";

const $ = (q) => document.querySelector(q);
const audio = new GameAudio();

const ICONS = {
  wood: "./assets/icons/wood.png",
  wheat: "./assets/icons/wheat.png",
  apple: "./assets/icons/apple.png",
  planks: "./assets/icons/planks.png",
  hearts: "./assets/icons/hearts.png",
  house: "./assets/icons/house.png",
  colonist: "./assets/icons/colonist.png",
};

let state = createGame({ seed: Date.now() % 9973 });
let progress = { best: 0, wins: 0, plays: 0 };
let toastTimer = null;

function showToast(text) {
  const el = $("#toast");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

function needBar(label, value, tone) {
  const pct = Math.max(0, Math.min(100, value));
  return `<div class="need"><span>${label}</span><span class="track"><i class="${tone}" style="width:${pct}%"></i></span><b>${pct}</b></div>`;
}

function renderColonists() {
  return state.colonists
    .map((c) => {
      if (c.left) {
        return `<button type="button" class="colonist left" disabled><span>離島</span><strong>${c.name}</strong></button>`;
      }
      const mood = colonistMood(c);
      const selected = state.selected === c.id ? " selected" : "";
      const job = c.job ? STATIONS[c.job]?.name : "待命";
      return `<button type="button" class="colonist${selected}" data-id="${c.id}" aria-pressed="${state.selected === c.id}">
        <img src="${ICONS.colonist}" width="28" height="28" alt="" />
        <strong>${c.name}</strong>
        <small>${job}</small>
        <span class="mood" data-low="${mood < 35}">心情 ${mood}</span>
      </button>`;
    })
    .join("");
}

function renderStations() {
  const open = availableStations(state);
  return open
    .map((id) => {
      const station = STATIONS[id];
      const workers = state.colonists.filter((c) => !c.left && c.job === id).length;
      return `<button type="button" class="station" data-station="${id}">
        <img src="${ICONS[station.icon]}" width="40" height="40" alt="" />
        <strong>${station.name}</strong>
        <small>${workers} 人</small>
      </button>`;
    })
    .join("");
}

function renderChain() {
  return BUILDINGS.map((b, i) => {
    const built = state.built.includes(b.id);
    const next = state.nextBuild === b.id;
    const cost = Object.entries(b.cost)
      .map(([k, v]) => `${k === "wood" ? "木材" : k === "parts" ? "零件" : k}${v}`)
      .join(" ");
    return `<div class="chain-step${built ? " built" : ""}${next ? " next" : ""}">
      <span class="dot">${built ? "✓" : i + 1}</span>
      <strong>${b.name}</strong>
      ${cost ? `<small>${cost}</small>` : "<small>起始</small>"}
    </div>${i < BUILDINGS.length - 1 ? '<i class="chain-link" aria-hidden="true"></i>' : ""}`;
  }).join("");
}

function renderResources() {
  const r = state.resources;
  return `<div class="res"><img src="${ICONS.wheat}" alt="" />食物 <b>${r.food}</b></div>
    <div class="res"><img src="${ICONS.apple}" alt="" />餐點 <b>${r.meals}</b></div>
    <div class="res"><img src="${ICONS.wood}" alt="" />木材 <b>${r.wood}</b></div>
    <div class="res"><img src="${ICONS.planks}" alt="" />零件 <b>${r.parts}</b></div>`;
}

function renderOverlay() {
  const outcome = getOutcome(state);
  if (outcome === "playing") return "";
  const won = outcome === "won";
  return `<div class="overlay" role="dialog" aria-modal="true">
    <div class="panel end">
      <h2>${won ? "信標點亮！" : "前哨失守"}</h2>
      <p>${state.reason ?? ""}</p>
      <p>第 ${state.day} 日 · 分數 ${state.score}</p>
      <button type="button" id="again" class="primary">${won ? "再守一季" : "重新開局"}</button>
    </div>
  </div>`;
}

function renderDetail() {
  const c = state.colonists.find((x) => x.id === state.selected && !x.left);
  if (!c) {
    return `<p class="detail-hint">點選殖民者，再點工作站派工。士氣與飽足度會影響產量。</p>`;
  }
  return `<div class="detail">
    <h3>${c.name}</h3>
    ${needBar("飽足", c.hunger, "hunger")}
    ${needBar("休息", c.rest, "rest")}
    ${needBar("社交", c.social, "social")}
    <button type="button" id="clear-job" class="secondary">取消派工</button>
  </div>`;
}

function render() {
  const summary = summarize(state);
  const morale = summary.morale;
  $("#board").innerHTML = `
    <div class="island">
      <div class="sky">離島前哨 · 第 ${state.day} 日</div>
      <div class="shore"></div>
      <div class="camp">${state.built.map((b) => BUILDINGS.find((x) => x.id === b)?.name).join(" · ")}</div>
    </div>
    <div class="chain" aria-label="建造鏈">${renderChain()}</div>
    <div class="stations" aria-label="工作站">${renderStations()}</div>
    ${renderDetail()}
    ${renderOverlay()}
  `;

  $("#resources").innerHTML = renderResources();
  $("#colonists").innerHTML = renderColonists();
  $("#msg").textContent = state.message;
  $("#morale").textContent = `士氣 ${morale}`;
  $("#morale").dataset.low = morale < 30 ? "1" : "0";
  $("#score").textContent = `分數 ${state.score}`;
  $("#best").textContent = progress.best || 0;
  $("#build").disabled = !canBuild(state);
  $("#build").hidden = getOutcome(state) !== "playing";
  $("#end-day").disabled = getOutcome(state) !== "playing";

  bindBoardEvents();
}

function bindBoardEvents() {
  $("#colonists")?.querySelectorAll(".colonist[data-id]").forEach((btn) => {
    btn.onclick = () => {
      audio.play("click");
      state = selectColonist(state, Number(btn.dataset.id));
      render();
    };
  });

  $("#board")?.querySelectorAll(".station[data-station]").forEach((btn) => {
    btn.onclick = () => {
      if (getOutcome(state) !== "playing") return;
      const colonistId = state.selected;
      if (colonistId === null) {
        showToast("請先點選一位殖民者。");
        return;
      }
      audio.play("assign");
      state = assignJob(state, colonistId, btn.dataset.station);
      render();
    };
  });

  $("#board")?.querySelector("#clear-job")?.addEventListener("click", () => {
    if (state.selected === null) return;
    audio.play("click");
    state = assignJob(state, state.selected, null);
    render();
  });

  $("#board")?.querySelector("#again")?.addEventListener("click", () => {
    audio.play("click");
    state = createGame({ seed: Date.now() % 9973 });
    render();
  });
}

async function persistIfEnded() {
  if (getOutcome(state) === "playing") return;
  progress = mergeProgress(progress, state);
  $("#best").textContent = progress.best;
  await saveProgress(progress, () => showToast("戰績同步失敗（仍可繼續玩）。"));
}

function onBuild() {
  if (!canBuild(state)) {
    audio.play("lose", { volume: 0.35 });
    showToast("資源不足，無法建造。");
    return;
  }
  audio.play("build");
  state = buildNext(state);
  render();
  void persistIfEnded();
}

function onEndDay() {
  if (getOutcome(state) !== "playing") return;
  audio.play("day");
  state = endDay(state);
  if (state.event) audio.play("event", { volume: 0.4 });
  const outcome = getOutcome(state);
  if (outcome === "won") audio.play("win");
  if (outcome === "lost") audio.play("lose");
  render();
  void persistIfEnded();
}

function suspend() {
  audio.suspend();
}

function resume() {
  audio.resume();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") suspend();
  else resume();
});
window.addEventListener("pagehide", suspend);

$("#build").addEventListener("click", onBuild);
$("#end-day").addEventListener("click", onEndDay);

$("#start").addEventListener("click", async () => {
  await audio.start();
  $("#lobby").hidden = true;
  $("#game").hidden = false;
  state = createGame({ seed: Date.now() % 9973 });
  render();
});

$("#sound").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const on = btn.getAttribute("aria-pressed") !== "true";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.textContent = on ? "♫ 音效" : "♫ 靜音";
  audio.setEnabled(on);
  if (on) await audio.start();
});

$("#credits").addEventListener("click", (e) => {
  e.preventDefault();
  $("#credits-panel").hidden = !$("#credits-panel").hidden;
});

async function boot() {
  try {
    await globalThis.PG.ready;
    progress = await loadProgress();
    $("#best").textContent = progress.best || 0;
  } catch {
    showToast("讀取戰績失敗；仍可遊玩。");
  }
}

void boot();
