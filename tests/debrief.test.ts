import { describe, expect, test } from "vitest";
import { rookDebrief } from "../src/game/debrief";

const chassis = (hp = 160, maxHp = 160) => ({ hp, maxHp, dead: hp <= 0 });
describe("Rook's recovery assessment", () => {
  test.each([
    [1, "One back.", "other three"], [2, "Two back.", "other two"],
    [3, "Three back.", "missing chassis"], [4, "All four back.", null],
  ] as const)("acknowledges %i returned chassis and the ones left behind", (count, opening, recovery) => {
    const squad = Array.from({ length: 4 }, (_, i) => chassis(i < count ? 160 : 0));
    const line = rookDebrief(squad, true);
    expect(line.startsWith(opening)).toBe(true);
    if (recovery) expect(line).toContain(recovery);
    else expect(line).not.toContain("recovery rig");
  });

  test.each([
    [160, "No holes, no bent joints"], [120, "A few dents"],
    [119, "more than a paint job"], [56, "straight to my bench"],
  ])("assesses a returned frame at %i integrity without treating damage as a casualty", (hp, assessment) => {
    const line = rookDebrief([chassis(), chassis(), chassis(), chassis(hp)], true);
    expect(line).toContain("All four back.");
    expect(line).toContain(assessment);
    expect(line).not.toContain("recovery rig");
  });

  test("the human replay's three survivors and critically damaged frame get an appropriate line", () => {
    const line = rookDebrief([chassis(), chassis(), chassis(50), chassis(0)], true);
    expect(line).toContain("Three back.");
    expect(line).toContain("That battered frame");
    expect(line).toContain("missing chassis");
  });

  test("condition scales with model integrity and distinguishes one critical frame from several", () => {
    const line = rookDebrief([chassis(90, 300), chassis(40), chassis(), chassis()], true);
    expect(line).toContain("Those battered frames");
    expect(rookDebrief([chassis(90, 300), chassis(), chassis(), chassis()], true)).toContain("That battered frame");
  });

  test("failed missions arrange recovery without claiming stranded robots came home", () => {
    const stranded = rookDebrief([chassis(), chassis(50), chassis(0), chassis(0)], false);
    expect(stranded).toContain("Keep the surviving chassis where they are");
    expect(stranded).not.toContain("Two back");
    const lost = rookDebrief(Array.from({ length: 4 }, () => chassis(0)), false);
    expect(lost).toContain("No chassis back.");
    expect(lost).toContain("last telemetry");
  });
});
