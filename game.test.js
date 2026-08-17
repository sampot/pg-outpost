import { describe, expect, it } from "vitest";
import {
  BUILDINGS,
  COLONIST_NAMES,
  DESERT_MOOD,
  FOOD_PER_COLONIST,
  STATIONS,
  TARGET_DAY,
  WIN_MORALE,
  applyAction,
  applyEvent,
  assignJob,
  availableStations,
  buildNext,
  canBuild,
  checkOutcome,
  colonistMood,
  colonyMorale,
  createGame,
  endDay,
  getLegalActions,
  getOutcome,
  seeded,
  selectColonist,
  stationAvailable,
  summarize,
} from "./game.js";
import { EMPTY_PROGRESS, mergeProgress as mergePersist } from "./persist.js";

function rich(state, patch = {}) {
  return { ...structuredClone(state), ...patch };
}

function withJobs(state, jobs) {
  const s = structuredClone(state);
  jobs.forEach(([id, job]) => {
    s.colonists[id].job = job;
  });
  return s;
}

describe("createGame", () => {
  it("starts five colonists with camp and resources", () => {
    const s = createGame({ seed: 42 });
    expect(s.colonists).toHaveLength(COLONIST_NAMES.length);
    expect(s.built).toEqual(["camp"]);
    expect(s.nextBuild).toBe("storehouse");
    expect(getOutcome(s)).toBe("playing");
  });

  it("is deterministic for the same seed", () => {
    expect(createGame({ seed: 9 })).toEqual(createGame({ seed: 9 }));
  });
});

describe("colonist needs and mood", () => {
  it("derives mood from hunger rest and social", () => {
    const c = { hunger: 90, rest: 60, social: 30, left: false };
    expect(colonistMood(c)).toBe(60);
  });

  it("returns zero mood for departed colonists", () => {
    expect(colonistMood({ hunger: 80, rest: 80, social: 80, left: true })).toBe(0);
  });

  it("averages active colonist moods for colony morale", () => {
    const s = createGame();
    s.colonists.forEach((c) => {
      c.hunger = 70;
      c.rest = 70;
      c.social = 70;
    });
    expect(colonyMorale(s)).toBeGreaterThanOrEqual(70);
  });
});

describe("station assignment", () => {
  it("lists base stations before buildings unlock extras", () => {
    const s = createGame();
    expect(availableStations(s)).toContain("forage");
    expect(availableStations(s)).not.toContain("kitchen");
    expect(availableStations(s)).not.toContain("craft");
  });

  it("unlocks kitchen after storehouse and craft after workshop", () => {
    let s = createGame();
    s.built = ["camp", "storehouse"];
    expect(stationAvailable(s, "kitchen")).toBe(true);
    s.built.push("workshop");
    expect(stationAvailable(s, "craft")).toBe(true);
  });

  it("assigns and clears jobs immutably", () => {
    const before = createGame({ seed: 3 });
    const picked = selectColonist(before, 1);
    const assigned = assignJob(picked, 1, "farm");
    expect(before.colonists[1].job).toBeNull();
    expect(assigned.colonists[1].job).toBe("farm");
    const cleared = assignJob(assigned, 1, null);
    expect(cleared.colonists[1].job).toBeNull();
  });

  it("rejects locked stations", () => {
    const s = assignJob(selectColonist(createGame(), 0), 0, "craft");
    expect(s.colonists[0].job).toBeNull();
    expect(s.message).toMatch(/尚未解鎖/);
  });
});

describe("production chain build", () => {
  it("requires resources for the next building", () => {
    const s = rich(createGame(), { resources: { food: 10, wood: 5, parts: 0, meals: 0 } });
    expect(canBuild(s)).toBe(false);
  });

  it("spends wood to build storehouse then advances chain", () => {
    let s = rich(createGame(), { resources: { food: 10, wood: 20, parts: 0, meals: 0 } });
    s = buildNext(s);
    expect(s.built).toContain("storehouse");
    expect(s.nextBuild).toBe("workshop");
    expect(s.resources.wood).toBe(8);
  });

  it("eventually allows beacon when parts and wood are ready", () => {
    let s = rich(createGame(), {
      built: ["camp", "storehouse", "workshop"],
      nextBuild: "beacon",
      resources: { food: 20, wood: 30, parts: 12, meals: 0 },
    });
    s = buildNext(s);
    expect(s.built).toContain("beacon");
    expect(s.nextBuild).toBeNull();
  });
});

describe("daily simulation", () => {
  it("forage adds wood based on assigned workers", () => {
    let s = withJobs(createGame({ seed: 5 }), [[0, "forage"], [1, "forage"]]);
    const woodBefore = s.resources.wood;
    s = endDay(s);
    expect(s.resources.wood).toBeGreaterThan(woodBefore);
  });

  it("consumes food each day for every colonist", () => {
    let s = createGame();
    s.resources.food = COLONIST_NAMES.length * FOOD_PER_COLONIST;
    s = endDay(s);
    expect(s.resources.food).toBeLessThan(COLONIST_NAMES.length * FOOD_PER_COLONIST);
  });

  it("tracks famine when food runs out", () => {
    let s = createGame();
    s.resources.food = 0;
    s.resources.meals = 0;
    s = endDay(s);
    expect(s.famineDays).toBeGreaterThan(0);
  });

  it("kitchen converts food to meals when storehouse exists", () => {
    let s = rich(createGame(), {
      built: ["camp", "storehouse"],
      resources: { food: 10, wood: 0, parts: 0, meals: 0 },
    });
    s.colonists.forEach((c, i) => {
      if (i > 0) c.left = true;
    });
    s = withJobs(s, [[0, "kitchen"]]);
    s = endDay(s);
    expect(s.resources.meals).toBeGreaterThan(0);
  });

  it("craft spends wood for parts with workshop", () => {
    let s = rich(createGame(), {
      built: ["camp", "storehouse", "workshop"],
      resources: { food: 20, wood: 12, parts: 0, meals: 0 },
    });
    s = withJobs(s, [[0, "craft"]]);
    s = endDay(s);
    expect(s.resources.parts).toBeGreaterThan(0);
    expect(s.resources.wood).toBeLessThan(12);
  });
});

describe("events", () => {
  it("uses seeded rng for event rolls", () => {
    expect(seeded(1, 4, 17)).toBe(seeded(1, 4, 17));
    expect(seeded(1, 4, 17)).not.toBe(seeded(2, 4, 17));
  });

  it("storm hurts more without storehouse", () => {
    let s = rich(createGame(), { resources: { food: 10, wood: 0, parts: 0, meals: 0 } });
    applyEvent(s, { id: "storm", name: "暴風雨" });
    const lossBare = 10 - s.resources.food;
    s = rich(createGame(), {
      built: ["camp", "storehouse"],
      resources: { food: 10, wood: 0, parts: 0, meals: 0 },
    });
    applyEvent(s, { id: "storm", name: "暴風雨" });
    expect(10 - s.resources.food).toBeLessThan(lossBare);
  });

  it("driftwood adds wood", () => {
    const s = rich(createGame(), { resources: { food: 0, wood: 1, parts: 0, meals: 0 } });
    applyEvent(s, { id: "driftwood", name: "漂木" });
    expect(s.resources.wood).toBe(7);
  });
});

describe("outcomes", () => {
  it("loses when too many colonists leave", () => {
    const s = createGame();
    s.colonists.forEach((c, i) => {
      if (i > 0) c.left = true;
    });
    checkOutcome(s);
    expect(getOutcome(s)).toBe("lost");
  });

  it("loses after repeated famine", () => {
    const s = rich(createGame(), { famineDays: 2 });
    checkOutcome(s);
    expect(getOutcome(s)).toBe("lost");
  });

  it("wins with beacon morale and target day", () => {
    const s = rich(createGame(), {
      day: TARGET_DAY,
      built: ["camp", "storehouse", "workshop", "beacon"],
      nextBuild: null,
    });
    s.colonists.forEach((c) => {
      c.hunger = 80;
      c.rest = 80;
      c.social = 80;
    });
    checkOutcome(s);
    expect(getOutcome(s)).toBe("won");
    expect(s.reason).toMatch(/信標/);
  });

  it("does not win early without beacon", () => {
    const s = rich(createGame(), { day: TARGET_DAY + 5 });
    checkOutcome(s);
    expect(getOutcome(s)).toBe("playing");
  });
});

describe("desertion", () => {
  it(" removes colonists below desert mood threshold", () => {
    let s = createGame();
    s.colonists[0].hunger = 5;
    s.colonists[0].rest = 5;
    s.colonists[0].social = 5;
    expect(colonistMood(s.colonists[0])).toBeLessThanOrEqual(DESERT_MOOD);
    s = endDay(s);
    expect(s.colonists[0].left).toBe(true);
  });
});

describe("legal actions and summary", () => {
  it(" exposes build when affordable and always allows end day", () => {
    let s = rich(createGame(), { resources: { food: 10, wood: 20, parts: 0, meals: 0 } });
    const actions = getLegalActions(s);
    expect(actions).toContain("build");
    expect(actions).toContain("endDay");
  });

  it("summarize reports morale and active colonists", () => {
    const summary = summarize(createGame());
    expect(summary.activeColonists).toBe(COLONIST_NAMES.length);
    expect(summary.morale).toBeGreaterThan(0);
  });

  it("applyAction routes legacy action names", () => {
    let s = applyAction(createGame(), "lumber");
    expect(s.colonists[0].job).toBe("forage");
    s = applyAction(s, "nextDay");
    expect(s.day).toBe(2);
  });

  it("ignores invalid actions safely", () => {
    const s = createGame();
    expect(applyAction(s, "nope")).toEqual(s);
  });
});

describe("persist merge", () => {
  it("tracks best score and wins", () => {
    const merged = mergePersist(EMPTY_PROGRESS, { score: 90, outcome: "won", day: 20 });
    expect(merged.best).toBe(90);
    expect(merged.wins).toBe(1);
    expect(merged.plays).toBe(1);
  });

  it("keeps previous best when lower", () => {
    const merged = mergePersist({ best: 200, wins: 3, plays: 5 }, { score: 50, outcome: "lost", day: 8 });
    expect(merged.best).toBe(200);
    expect(merged.plays).toBe(6);
  });
});

describe("constants", () => {
  it("defines a four-step building chain ending at beacon", () => {
    expect(BUILDINGS.at(-1).id).toBe("beacon");
    expect(Object.keys(STATIONS)).toHaveLength(6);
  });

  it("requires minimum morale to win", () => {
    expect(WIN_MORALE).toBeGreaterThan(20);
  });
});
