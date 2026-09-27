import type { Active, KeyboardCoordinateGetter, Over } from "@dnd-kit/core";
import { applyMove, boardAnnouncements, columnKeyboardCoordinates, dueStatus, emptyFilter, isDueSoon, formatDueDate, getMoveTarget, isFiltering, localToday, labelColor, matchesFilter, parseLabels, timeAgo, UNASSIGNED, type Column } from "@/lib/kanban";
import { makeCard } from "@/test/fixtures";

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
    expect(getMoveTarget(columns, "card-1", "card-2")).toEqual({ columnId: "col-a", position: 1 });
    expect(getMoveTarget(columns, "card-1", "card-3")).toEqual({ columnId: "col-a", position: 2 });
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

describe("boardAnnouncements", () => {
  const announcements = boardAnnouncements({
    id: 1,
    name: "Board",
    owner: "user",
    members: ["user"],
    labels: [],
    columns: [{ id: "col-a", title: "Backlog", cardIds: ["card-1"] }, { id: "col-b", title: "Review", cardIds: ["card-2"] }],
    cards: { "card-1": makeCard("card-1", "Draft"), "card-2": makeCard("card-2", "Other") },
  });
  const active = { id: "card-1" } as Active;
  const over = (id: string) => ({ id }) as Over;

  it("announces cards and columns by title", () => {
    expect(announcements.onDragStart({ active })).toBe("Picked up Draft.");
    expect(announcements.onDragOver({ active, over: over("col-b") })).toBe("Draft is over Review.");
    expect(announcements.onDragOver({ active, over: over("card-2") })).toBe("Draft is over Review.");
    expect(announcements.onDragEnd({ active, over: over("col-b") })).toBe("Dropped Draft in Review.");
    expect(announcements.onDragCancel({ active, over: null })).toBe("Cancelled moving Draft.");
  });

  it("covers drops outside a column and unknown ids", () => {
    expect(announcements.onDragOver({ active, over: null })).toBe("Draft is not over a column.");
    expect(announcements.onDragEnd({ active, over: null })).toBe("Dropped Draft.");
    expect(announcements.onDragStart({ active: { id: "missing" } as Active })).toBe("Picked up card.");
    expect(announcements.onDragOver({ active, over: over("missing") })).toBe("Draft is over column.");
  });
});

describe("columnKeyboardCoordinates", () => {
  const rect = (left: number, top: number, width = 100, height = 400) => ({ left, top, width, height, right: left + width, bottom: top + height });
  type Rect = ReturnType<typeof rect>;
  const move = (code: string, columns: Rect[], collisionRect: Rect, cards: [string, Rect][] = []) =>
    columnKeyboardCoordinates({ code, preventDefault: vi.fn() } as unknown as KeyboardEvent, {
      active: "card-active",
      currentCoordinates: { x: collisionRect.left, y: collisionRect.top },
      context: {
        collisionRect,
        droppableRects: new Map<string, Rect>([...columns.map((column, index) => [`col-${index}`, column] as [string, Rect]), ...cards]),
        droppableContainers: { getEnabled: () => [
          ...columns.map((_, index) => ({ id: `col-${index}`, data: { current: { type: "column" } } })),
          ...cards.map(([id]) => ({ id, data: { current: {} } })),
        ] },
      },
    } as unknown as Parameters<KeyboardCoordinateGetter>[1]);
  const sideBySide = [rect(0, 0), rect(120, 0), rect(240, 0)];

  it("moves to the adjacent column on Left and Right, keeping the height", () => {
    expect(move("ArrowRight", sideBySide, rect(10, 50, 80, 60))).toEqual({ x: 130, y: 50 });
    expect(move("ArrowLeft", sideBySide, rect(130, 50, 80, 60))).toEqual({ x: 10, y: 50 });
  });

  it("does not move past the first or last column, or from outside a column", () => {
    expect(move("ArrowLeft", sideBySide, rect(10, 50, 80, 60))).toBeUndefined();
    expect(move("ArrowRight", sideBySide, rect(250, 50, 80, 60))).toBeUndefined();
    expect(move("ArrowRight", sideBySide, rect(1000, 50, 80, 60))).toBeUndefined();
  });

  it("places the card inside the next column when columns are stacked", () => {
    const stacked = [rect(0, 0, 300, 400), rect(0, 420, 300, 400)];
    expect(move("ArrowRight", stacked, rect(10, 100, 280, 60))).toEqual({ x: 10, y: 420 });
  });

  it("moves Up and Down past the neighbouring card in the same column only", () => {
    const cards: [string, Rect][] = [
      ["card-a", rect(10, 20, 80, 60)], ["card-b", rect(10, 100, 80, 60)], ["card-c", rect(10, 180, 80, 60)],
      ["card-other-column", rect(130, 60, 80, 60)], ["card-active", rect(10, 100, 80, 60)],
    ];
    expect(move("ArrowUp", sideBySide, rect(10, 100, 80, 60), cards)).toEqual({ x: 10, y: 20 });
    expect(move("ArrowDown", sideBySide, rect(10, 100, 80, 60), cards)).toEqual({ x: 10, y: 180 });
    expect(move("ArrowUp", sideBySide, rect(10, 20, 80, 60), cards)).toBeUndefined();
  });

  it("ignores other keys", () => {
    expect(move("KeyA", sideBySide, rect(10, 50, 80, 60))).toBeUndefined();
  });
});

describe("applyMove", () => {
  const board = {
    id: 1,
    name: "Board",
    owner: "user",
    members: ["user"],
    labels: [],
    columns: [{ id: "col-a", title: "A", cardIds: ["card-1", "card-2", "card-3"] }, { id: "col-b", title: "B", cardIds: ["card-4"] }],
    cards: {},
  };

  it("moves a card into another column at a position", () => {
    expect(applyMove(board, "card-2", "col-b", 0).columns.map((column) => column.cardIds)).toEqual([["card-1", "card-3"], ["card-2", "card-4"]]);
  });

  it("reorders within a column without changing the original board", () => {
    expect(applyMove(board, "card-1", "col-a", 2).columns[0].cardIds).toEqual(["card-2", "card-3", "card-1"]);
    expect(board.columns[0].cardIds).toEqual(["card-1", "card-2", "card-3"]);
  });
});

describe("due dates", () => {
  it("formats today's local date as the API does", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("classifies a due date against today", () => {
    expect(dueStatus("2026-03-01", "2026-03-02")).toBe("overdue");
    expect(dueStatus("2026-03-02", "2026-03-02")).toBe("today");
    expect(dueStatus("2026-03-05", "2026-03-02")).toBe("soon");
    expect(dueStatus("2026-03-06", "2026-03-02")).toBe("upcoming");
    expect(dueStatus("2026-03-02", "2026-02-27")).toBe("soon");
    expect(isDueSoon("today")).toBe(true);
    expect(isDueSoon("soon")).toBe(true);
    expect(isDueSoon("overdue")).toBe(false);
  });

  it("shows a due date as a short month and day", () => {
    expect(formatDueDate("2026-10-01")).toBe("Oct 1");
  });
});

describe("matchesFilter", () => {
  const card = makeCard("card-1", "Launch site", "Coordinate with Marketing", { priority: "high", dueDate: "2026-01-01" });

  it("matches everything without a filter", () => {
    expect(isFiltering(emptyFilter)).toBe(false);
    expect(matchesFilter(makeCard("card-2", "Plain"), emptyFilter, "2026-06-01")).toBe(true);
  });

  it("searches titles and details, ignoring case and surrounding spaces", () => {
    expect(matchesFilter(card, { ...emptyFilter, text: " LAUNCH " }, "2026-06-01")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, text: "marketing" }, "2026-06-01")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, text: "budget" }, "2026-06-01")).toBe(false);
    expect(isFiltering({ ...emptyFilter, text: "   " })).toBe(false);
  });

  it("filters by assignee, including unassigned cards", () => {
    expect(matchesFilter({ ...card, assignee: "ada" }, { ...emptyFilter, assignee: "ada" }, "2026-06-01")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, assignee: "ada" }, "2026-06-01")).toBe(false);
    expect(matchesFilter(card, { ...emptyFilter, assignee: UNASSIGNED }, "2026-06-01")).toBe(true);
    expect(isFiltering({ ...emptyFilter, assignee: UNASSIGNED })).toBe(true);
  });

  it("filters by label, ignoring case", () => {
    const labelled = { ...card, labels: ["Research", "q3"] };
    expect(matchesFilter(labelled, { ...emptyFilter, label: "research" }, "2026-06-01")).toBe(true);
    expect(matchesFilter(labelled, { ...emptyFilter, label: "q4" }, "2026-06-01")).toBe(false);
    expect(isFiltering({ ...emptyFilter, label: "q3" })).toBe(true);
  });

  it("filters by priority and by overdue due date", () => {
    expect(matchesFilter(card, { ...emptyFilter, priority: "high" }, "2026-06-01")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, priority: "low" }, "2026-06-01")).toBe(false);
    expect(matchesFilter(card, { ...emptyFilter, due: "overdue" }, "2026-06-01")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, due: "overdue" }, "2025-12-01")).toBe(false);
    expect(matchesFilter(makeCard("card-2", "No date"), { ...emptyFilter, due: "overdue" }, "2026-06-01")).toBe(false);
    expect(matchesFilter(card, { ...emptyFilter, due: "soon" }, "2025-12-30")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, due: "soon" }, "2026-01-01")).toBe(true);
    expect(matchesFilter(card, { ...emptyFilter, due: "soon" }, "2025-12-01")).toBe(false);
    expect(matchesFilter(card, { ...emptyFilter, due: "soon" }, "2026-06-01")).toBe(false);
    expect(matchesFilter(makeCard("card-2", "No date"), { ...emptyFilter, due: "soon" }, "2026-06-01")).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it.each([
    ["2026-09-27T11:59:30Z", "just now"],
    ["2026-09-27T12:00:05Z", "just now"],
    ["2026-09-27T11:59:00Z", "1 minute ago"],
    ["2026-09-27T11:15:00Z", "45 minutes ago"],
    ["2026-09-27T10:00:00Z", "2 hours ago"],
    ["2026-09-26T12:00:00Z", "1 day ago"],
    ["2026-09-20T12:00:00Z", "7 days ago"],
  ])("describes %s as %s", (timestamp, text) => {
    expect(timeAgo(timestamp, now)).toBe(text);
  });
});

describe("labels", () => {
  it("parses comma-separated labels", () => {
    expect(parseLabels(" ux, backend ,, q3 ")).toEqual(["ux", "backend", "q3"]);
    expect(parseLabels("   ")).toEqual([]);
  });

  it("gives a label the same palette color whatever its case", () => {
    expect(labelColor("Research")).toBe(labelColor("research"));
    expect(new Set(["ux", "backend", "q3", "research", "design", "bug", "docs"].map(labelColor)).size).toBeGreaterThan(1);
  });
});
