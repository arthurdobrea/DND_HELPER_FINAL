import test from "node:test";
import assert from "node:assert/strict";
import { monsterToCreature } from "../src/lib/monster-creature.ts";

const base = {
  slug: "x", name: "Beast", size: "Large", armor_class: 12, hit_points: 26, speed: { walk: 50, hover: false },
  strength: 17, dexterity: 15, constitution: 13, intelligence: 3, wisdom: 12, charisma: 8,
  skills: { perception: 3, stealth: 6, "animal handling": 1 }, senses: "darkvision 60 ft., passive Perception 13",
};
const lion = {
  ...base, slug: "lion", name: "Lion",
  special_abilities: [{ name: "Pounce", desc: "If the lion moves at least 20 feet straight toward a creature and then hits it with a claw attack on the same turn, that target must succeed on a DC 13 Strength saving throw or be knocked prone." }],
  actions: [
    { name: "Bite", desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) piercing damage.", attack_bonus: 5, damage_dice: "1d8+3" },
    { name: "Claw", desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.", attack_bonus: 5, damage_dice: "1d6+3" },
  ],
};

test("статы: размер, скорости, навыки, чувства", () => {
  const c = monsterToCreature(lion);
  assert.equal(c.size, "LARGE");
  assert.deepEqual(c.speeds, { WALK: 50 });
  assert.deepEqual(c.skills, { PERCEPTION: 3, STEALTH: 6, ANIMAL_HANDLING: 1 });
  assert.deepEqual(c.senses, { DARKVISION: 60 });
  assert.equal(c.hp, 26);
});

test("лев: напрыгивание + когти со спасброском и бонусный укус цепочкой", () => {
  const { actions } = monsterToCreature(lion);
  const claw = actions.find((a) => a.name === "Claw");
  assert.deepEqual([claw.attackBonus, claw.dice, claw.damageType, claw.reach], [5, "1d6+3", "Slashing", "5 фт"]);
  const pounce = actions.find((a) => a.name === "Напрыгивание + Когти");
  assert.equal(pounce.dice, "1d6+3");
  assert.deepEqual(pounce.onHit[0].save, { ability: "STR", dc: 13, onFail: "Цель сбита с ног." });
  const bite = actions.find((a) => a.name === "Укус (напрыгивание)");
  assert.equal(bite.cost, "BONUS");
  assert.equal(bite.after, "Напрыгивание + Когти");
  assert.equal(bite.dice, "1d8+3");
});

test("мультиатака: части с числом повторов, перевод имён по порядку", () => {
  const m = {
    ...base, name: "Aboleth",
    actions: [
      { name: "Multiattack", desc: "The aboleth makes two Tentacle attacks and one Tail attack." },
      { name: "Tentacle", desc: "Melee Weapon Attack: +9 to hit, reach 10 ft. Hit: 12 (2d6 + 5) bludgeoning damage.", attack_bonus: 9 },
      { name: "Tail", desc: "Melee Weapon Attack: +9 to hit, reach 10 ft. Hit: 15 (3d6 + 5) bludgeoning damage.", attack_bonus: 9 },
    ],
  };
  const loc = { ...m, name: "Аболет", actions: m.actions.map((a, i) => ({ ...a, name: ["Мультиатака", "Щупальце", "Хвост"][i] })) };
  const [multi] = monsterToCreature(m, loc).actions;
  assert.equal(multi.name, "Мультиатака");
  assert.deepEqual(multi.parts, [{ name: "Щупальце", count: 2 }, { name: "Хвост", count: 1 }]);
});

test("бонусные действия и реакции получают цену; обычное без parts", () => {
  const m = { ...base, actions: [{ name: "Slam", desc: "Melee Weapon Attack: +4 to hit." }], bonus_actions: [{ name: "Dash", desc: "Moves." }], reactions: [{ name: "Parry", desc: "+2 AC." }] };
  const a = monsterToCreature(m).actions;
  assert.deepEqual(a.map((x) => x.cost), [undefined, "BONUS", "REACTION"]);
  assert.equal(a[0].parts, undefined);
});

test("мультиатака «one with its bite and two with its claws»: Claw ×2", () => {
  const m = {
    ...base, name: "Dragon",
    actions: [
      { name: "Multiattack", desc: "The dragon makes three attacks: one with its bite and two with its claws." },
      { name: "Bite", desc: "Melee Weapon Attack: +14 to hit, reach 10 ft.", attack_bonus: 14 },
      { name: "Claw", desc: "Melee Weapon Attack: +14 to hit, reach 5 ft.", attack_bonus: 14 },
    ],
  };
  assert.deepEqual(monsterToCreature(m).actions[0].parts, [{ name: "Bite", count: 1 }, { name: "Claw", count: 2 }]);
});

test("спасбросок с attack_bonus 0 не становится атакой, а настоящая атака +0 остаётся", () => {
  const m = {
    ...base,
    actions: [
      { name: "Fire Breath", desc: "The dragon exhales fire. Each creature must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage.", attack_bonus: 0 },
      { name: "Weak Slam", desc: "Melee Weapon Attack: +0 to hit, reach 5 ft. Hit: 3 (1d4 + 0) bludgeoning damage.", attack_bonus: 0 },
    ],
  };
  const [breath, slam] = monsterToCreature(m).actions;
  assert.equal(breath.attackBonus, undefined);
  assert.equal(slam.attackBonus, 0);
});
