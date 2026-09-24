import { getMoveTarget, type Column } from "@/lib/kanban";

describe("getMoveTarget", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2", "card-3"] },
    { id: "col-b", title: "B", cardIds: ["card-4"] },
    { id: "col-c", title: "C", cardIds: [] },
  ];

  it("places a card at the index of the card it is dropped on in another column", () => {
    expect(getMoveTarget(columns, "card-2", "card-4")).toEqual({ columnId: "col-b", position: 0 });
  });

  it("places a card at the end of a column it is dropped on", () => {
    expect(getMoveTarget(columns, "card-1", "col-b")).toEqual({ columnId: "col-b", position: 1 });
    expect(getMoveTarget(columns, "card-1", "col-c")).toEqual({ columnId: "col-c", position: 0 });
  });

  it("reorders within a column", () => {
    expect(getMoveTarget(columns, "card-1", "card-3")).toEqual({ columnId: "col-a", position: 1 });
    expect(getMoveTarget(columns, "card-3", "card-1")).toEqual({ columnId: "col-a", position: 0 });
    expect(getMoveTarget(columns, "card-1", "col-a")).toEqual({ columnId: "col-a", position: 2 });
  });

  it("returns null when the card would not move", () => {
    expect(getMoveTarget(columns, "card-2", "card-2")).toBeNull();
    expect(getMoveTarget(columns, "card-3", "col-a")).toBeNull();
  });

  it("returns null for unknown ids", () => {
    expect(getMoveTarget(columns, "missing", "card-1")).toBeNull();
    expect(getMoveTarget(columns, "card-1", "missing")).toBeNull();
  });
});
