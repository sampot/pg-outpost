/** 離島前哨 — 殖民者需求／心情／生產鏈（純邏輯，無 DOM）。 */

export const COLONIST_NAMES = ["阿海", "小晴", "老周", "美玲", "阿東"];

export const STATIONS = {
  forage: {
    id: "forage",
    name: "伐木",
    icon: "wood",
    need: null,
    produces: "wood",
    base: 3,
    drains: { rest: 10, hunger: 5, social: 2 },
  },
  farm: {
    id: "farm",
    name: "農耕",
    icon: "wheat",
    need: null,
    produces: "food",
    base: 4,
    drains: { rest: 12, hunger: 6, social: 2 },
  },
  kitchen: {
    id: "kitchen",
    name: "炊事",
    icon: "apple",
    need: "storehouse",
    produces: "meals",
    base: 2,
    cost: { food: 2 },
    drains: { rest: 8, hunger: 4, social: 1 },
  },
  craft: {
    id: "craft",
    name: "工匠",
    icon: "planks",
    need: "workshop",
    produces: "parts",
    base: 2,
    cost: { wood: 3 },
    drains: { rest: 14, hunger: 5, social: 3 },
  },
  social: {
    id: "social",
    name: "聚會",
    icon: "hearts",
    need: null,
    produces: "morale",
    base: 6,
    drains: { hunger: 4, rest: 4 },
    restores: { social: 14 },
  },
  rest: {
    id: "rest",
    name: "休息",
    icon: "house",
    need: null,
    produces: null,
    base: 0,
    drains: { hunger: 3, social: 1 },
    restores: { rest: 20 },
  },
};

export const STATION_IDS = Object.keys(STATIONS);

export const BUILDINGS = [
  { id: "camp", name: "營地", cost: {}, chain: 0 },
  { id: "storehouse", name: "倉庫", cost: { wood: 12 }, chain: 1 },
  { id: "workshop", name: "工坊", cost: { wood: 18 }, chain: 2 },
  { id: "beacon", name: "信標塔", cost: { wood: 25, parts: 10 }, chain: 3 },
];

export const TARGET_DAY = 18;
export const FOOD_PER_COLONIST = 1;
export const DESERT_MOOD = 18;
export const LOSE_MORALE = 8;
export const WIN_MORALE = 38;

const clone = (v) => structuredClone(v);

export function seeded(seed, turn = 0, salt = 0) {
  let t = (Math.trunc(seed) + turn * 997 + salt * 7919 + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function colonistMood(c) {
  if (c.left) return 0;
  return clamp(Math.round((c.hunger + c.rest + c.social) / 3), 0, 100);
}

export function colonyMorale(state) {
  const active = state.colonists.filter((c) => !c.left);
  if (!active.length) return 0;
  const moods = active.map(colonistMood);
  const bonus = Math.min(20, state.resources.meals * 2);
  return clamp(Math.round(moods.reduce((a, b) => a + b, 0) / active.length + bonus * 0.35), 0, 100);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function makeColonist(id, name) {
  return {
    id,
    name,
    hunger: 72,
    rest: 68,
    social: 60,
    job: null,
    left: false,
  };
}

export function createGame({ seed = 1 } = {}) {
  return {
    seed: Number(seed) || 1,
    day: 1,
    turn: 0,
    score: 0,
    outcome: "playing",
    reason: null,
    message: "點選殖民者，再點工作站派工。湊齊生產鏈，建起信標塔。",
    selected: null,
    colonists: COLONIST_NAMES.map((name, i) => makeColonist(i, name)),
    resources: { food: 10, wood: 6, parts: 0, meals: 0 },
    built: ["camp"],
    nextBuild: "storehouse",
    event: null,
    famineDays: 0,
    moraleCrisis: 0,
    log: [],
  };
}

export function getOutcome(state) {
  return state.outcome;
}

export function summarize(state) {
  return {
    day: state.day,
    turn: state.turn,
    score: state.score,
    outcome: state.outcome,
    morale: colonyMorale(state),
    resources: { ...state.resources },
    activeColonists: state.colonists.filter((c) => !c.left).length,
  };
}

export function stationAvailable(state, stationId) {
  const station = STATIONS[stationId];
  if (!station) return false;
  if (!station.need) return true;
  return state.built.includes(station.need);
}

export function availableStations(state) {
  return STATION_IDS.filter((id) => stationAvailable(state, id));
}

export function getLegalActions(state) {
  if (state.outcome !== "playing") return [];
  const actions = ["endDay"];
  if (canBuild(state)) actions.unshift("build");
  for (const id of availableStations(state)) actions.unshift(`assign:${id}`);
  return actions;
}

export function selectColonist(state, colonistId) {
  const s = clone(state);
  if (s.outcome !== "playing") return s;
  const c = s.colonists.find((x) => x.id === colonistId && !x.left);
  s.selected = c ? colonistId : null;
  s.message = c ? `已選 ${c.name}，點工作站派工。` : "這位殖民者已離島。";
  return s;
}

export function assignJob(state, colonistId, stationId) {
  const s = clone(state);
  if (s.outcome !== "playing") return s;
  const colonist = s.colonists.find((c) => c.id === colonistId && !c.left);
  if (!colonist) return s;
  if (stationId !== null) {
    if (!stationAvailable(s, stationId)) {
      s.message = `${STATIONS[stationId]?.name ?? stationId} 尚未解鎖。`;
      return s;
    }
    colonist.job = stationId;
    s.message = `${colonist.name} 負責 ${STATIONS[stationId].name}。`;
  } else {
    colonist.job = null;
    s.message = `${colonist.name} 待命。`;
  }
  s.selected = colonistId;
  return s;
}

export function canBuild(state) {
  if (state.outcome !== "playing" || !state.nextBuild) return false;
  const spec = BUILDINGS.find((b) => b.id === state.nextBuild);
  if (!spec || state.built.includes(spec.id)) return false;
  return Object.entries(spec.cost).every(([k, v]) => (state.resources[k] ?? 0) >= v);
}

export function buildNext(state) {
  const s = clone(state);
  if (!canBuild(s)) {
    s.message = "資源不足或已無下一階段。";
    return s;
  }
  const spec = BUILDINGS.find((b) => b.id === s.nextBuild);
  for (const [k, v] of Object.entries(spec.cost)) s.resources[k] -= v;
  s.built.push(spec.id);
  s.score += 25 + spec.chain * 10;
  const next = BUILDINGS.find((b) => b.chain === spec.chain + 1);
  s.nextBuild = next?.id ?? null;
  s.message = `完成 ${spec.name}！${next ? `下一步：${next.name}` : "生產鏈完成。"}`;
  s.log.unshift(`第 ${s.day} 日 · 建成 ${spec.name}`);
  checkOutcome(s);
  return s;
}

function moodMultiplier(mood) {
  if (mood >= 70) return 1.25;
  if (mood >= 45) return 1;
  if (mood >= 25) return 0.65;
  return 0.35;
}

function applyDrain(colonist, drains) {
  for (const [key, amount] of Object.entries(drains ?? {})) {
    colonist[key] = clamp(colonist[key] - amount, 0, 100);
  }
}

function applyRestore(colonist, restores) {
  for (const [key, amount] of Object.entries(restores ?? {})) {
    colonist[key] = clamp(colonist[key] + amount, 0, 100);
  }
}

function consumeFood(state) {
  const eaters = state.colonists.filter((c) => !c.left);
  let needed = eaters.length * FOOD_PER_COLONIST;
  if (state.resources.meals > 0) {
    const mealUse = Math.min(state.resources.meals, needed);
    state.resources.meals -= mealUse;
    needed -= mealUse;
    for (const c of eaters) c.hunger = clamp(c.hunger + 8, 0, 100);
  }
  if (state.resources.food >= needed) {
    state.resources.food -= needed;
    for (const c of eaters) c.hunger = clamp(c.hunger + 4, 0, 100);
    state.famineDays = 0;
    return;
  }
  state.resources.food = 0;
  state.famineDays += 1;
  for (const c of eaters) {
    c.hunger = clamp(c.hunger - 18, 0, 100);
    c.rest = clamp(c.rest - 6, 0, 100);
  }
}

function resolveProduction(state) {
  const totals = { wood: 0, food: 0, parts: 0, meals: 0, morale: 0 };
  for (const colonist of state.colonists) {
    if (colonist.left || !colonist.job) continue;
    const station = STATIONS[colonist.job];
    if (!station) continue;
    const mood = colonistMood(colonist);
    const mult = moodMultiplier(mood);
    applyDrain(colonist, station.drains);
    applyRestore(colonist, station.restores);
    if (station.produces === "morale") {
      totals.morale += Math.round(station.base * mult);
      continue;
    }
    if (station.produces === null) continue;
    if (station.cost) {
      const ok = Object.entries(station.cost).every(([k, v]) => (state.resources[k] ?? 0) >= v);
      if (!ok) {
        colonist.job = null;
        continue;
      }
      for (const [k, v] of Object.entries(station.cost)) state.resources[k] -= v;
    }
    const amount = Math.max(0, Math.round(station.base * mult));
    totals[station.produces] += amount;
  }
  state.resources.wood += totals.wood;
  state.resources.food += totals.food;
  state.resources.parts += totals.parts;
  state.resources.meals += totals.meals;
  if (totals.morale) {
    for (const c of state.colonists) {
      if (!c.left) c.social = clamp(c.social + Math.round(totals.morale / 4), 0, 100);
    }
  }
  state.score += totals.wood + totals.food * 2 + totals.parts * 4 + totals.meals * 3;
}

function passiveDecay(state) {
  for (const c of state.colonists) {
    if (c.left) continue;
    c.social = clamp(c.social - (c.job === "social" ? 0 : 3), 0, 100);
    if (!c.job || c.job === "rest") c.rest = clamp(c.rest - 2, 0, 100);
  }
}

function resolveDesertion(state) {
  for (const c of state.colonists) {
    if (c.left) continue;
    if (colonistMood(c) <= DESERT_MOOD || c.hunger <= 8) {
      c.left = true;
      c.job = null;
      state.log.unshift(`第 ${state.day} 日 · ${c.name} 離島（士氣崩潰）`);
    }
  }
}

function pickEvent(state) {
  const r = seeded(state.seed, state.day, 17);
  if (state.day % 4 !== 0) return null;
  if (r < 0.28) return { id: "storm", name: "暴風雨", detail: "風雨襲港，儲糧受創。" };
  if (r < 0.5) return { id: "driftwood", name: "漂木", detail: "海邊漂來成堆木材。" };
  if (r < 0.72) return { id: "homesick", name: "想家", detail: "離島久了，士氣下滑。" };
  return { id: "visitor", name: "補給船", detail: "路過船隻留下一些補給。" };
}

export function applyEvent(state, event) {
  if (!event) return;
  switch (event.id) {
    case "storm":
      if (state.built.includes("storehouse")) {
        state.resources.food = Math.max(0, state.resources.food - 2);
        state.message = "暴風雨過境；倉庫保住了大部分存糧。";
      } else {
        state.resources.food = Math.max(0, state.resources.food - 5);
        state.message = "暴風雨沖走存糧！快建倉庫。";
      }
      break;
    case "driftwood":
      state.resources.wood += 6;
      state.message = "漂木入港，木材 +6。";
      break;
    case "homesick":
      for (const c of state.colonists) {
        if (!c.left) c.social = clamp(c.social - 12, 0, 100);
      }
      state.message = "想家潮來襲，社交需求下降。";
      break;
    case "visitor":
      state.resources.food += 4;
      for (const c of state.colonists) {
        if (!c.left) c.social = clamp(c.social + 6, 0, 100);
      }
      state.message = "補給船留下乾糧與消息。";
      break;
    default:
      break;
  }
  state.log.unshift(`第 ${state.day} 日 · 事件：${event.name}`);
}

export function checkOutcome(state) {
  const active = state.colonists.filter((c) => !c.left).length;
  const morale = colonyMorale(state);
  if (active <= 1) {
    state.outcome = "lost";
    state.reason = "能工作的殖民者太少，前哨無法維持。";
    return;
  }
  if (state.famineDays >= 2) {
    state.outcome = "lost";
    state.reason = "連日斷糧，前哨無法維持。";
    return;
  }
  if (morale <= LOSE_MORALE) {
    state.moraleCrisis += 1;
    if (state.moraleCrisis >= 2) {
      state.outcome = "lost";
      state.reason = "士氣潰散，離島者眾。";
    }
    return;
  }
  state.moraleCrisis = 0;
  if (state.built.includes("beacon") && state.day >= TARGET_DAY && morale >= WIN_MORALE) {
    state.outcome = "won";
    state.reason = "信標點亮，補給線建立！";
    state.score += 120 + morale;
  }
}

export function endDay(state) {
  const s = clone(state);
  if (s.outcome !== "playing") return s;
  resolveProduction(s);
  consumeFood(s);
  passiveDecay(s);
  resolveDesertion(s);
  const event = pickEvent(s);
  s.event = event;
  applyEvent(s, event);
  s.day += 1;
  s.turn += 1;
  if (!event) s.message = `第 ${s.day - 1} 日結束。安排明日工作。`;
  checkOutcome(s);
  return s;
}

/** 舊 API 相容：以 action 字串驅動（供測試／簡化入口）。 */
export function applyAction(state, action) {
  if (action === "build") return buildNext(state);
  if (action === "nextDay" || action === "endDay") return endDay(state);
  if (action.startsWith("assign:")) {
    const stationId = action.slice(7);
    const colonistId = state.selected ?? 0;
    return assignJob(state, colonistId, stationId);
  }
  if (action === "farm") return assignJob(selectColonist(state, 0), 0, "farm");
  if (action === "lumber") return assignJob(selectColonist(state, 0), 0, "forage");
  return state;
}
