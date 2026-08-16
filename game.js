/** pg-outpost — 離島前哨 (殖民地模擬) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1 } = {}) {
  return { seed, turn: 0, score: 0, level: 1, meter: 0, resources: 10, flags: {}, log: ["離島前哨：配工／進食／建設"], outcome: "playing", msg: "離島前哨：配工／進食／建設" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["farm","build","comfort","ration"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.turn * 19);
  s.turn++;
  
  s.flags.food = s.flags.food ?? 10;
  s.flags.morale = s.flags.morale ?? 50;
  s.flags.people = s.flags.people ?? 4;
  if (action === "farm") { s.flags.food += 4; s.msg = "出海漁獲"; }
  else if (action === "build") { s.resources += 2; s.meter += 10; s.flags.food -= 1; s.msg = "加蓋工寮"; }
  else if (action === "comfort") { s.flags.morale += 10; s.resources -= 1; s.msg = "晚會鼓舞"; }
  else { s.flags.food -= s.flags.people; s.flags.morale -= 5; s.msg = "配給"; }
  s.flags.food -= Math.ceil(s.flags.people / 2);
  if (s.flags.food < 0) { s.flags.morale -= 15; s.flags.food = 0; }
  s.score = s.flags.people * 10 + s.flags.morale;
  s.meter = clamp(s.flags.morale, 0, 100);
  if (s.turn >= 12 && s.flags.morale >= 40) { s.level = 5; s.meter = 100; }
  if (s.flags.morale <= 0) { s.outcome = "lost"; s.msg = "殖民者離去"; }

  if (s.resources < 0) s.resources = 0;
  if (s.outcome === "playing" && s.level >= 5 && s.meter >= 100) {
    s.outcome = "won";
    s.msg = "目標達成！";
  }
  if (s.outcome === "playing" && (s.resources <= 0 && s.meter < 20 && s.turn > 8)) {
    s.outcome = "lost";
    s.msg = "資源崩盤";
  }
  return s;
}
export function summarize(s) {
  return { turn: s.turn, level: s.level, meter: s.meter, score: s.score, resources: s.resources, msg: s.msg, outcome: s.outcome, flags: s.flags };
}
export function getOutcome(s) { return s.outcome; }

