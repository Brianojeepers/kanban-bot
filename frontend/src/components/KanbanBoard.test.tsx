import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { getBoard, renameColumn } from "@/lib/api";
import { localToday } from "@/lib/kanban";
import { boardFixture as initialData, makeCard } from "@/test/fixtures";

vi.mock("@/lib/api", () => ({
  getBoard: vi.fn(() => Promise.resolve(initialData)),
  renameColumn: vi.fn((_board: number, _id: string, title: string) => Promise.resolve({ ...initialData, columns: [{ ...initialData.columns[0], title }, ...initialData.columns.slice(1)] })),
  addCard: vi.fn((_board: number, columnId: string, { title, details }: { title: string; details: string }) => {
    const id = "card-new";
    return Promise.resolve({ ...initialData, cards: { ...initialData.cards, [id]: makeCard(id, title, details) }, columns: initialData.columns.map((column: BoardData["columns"][number]) => column.id === columnId ? { ...column, cardIds: [...column.cardIds, id] } : column) });
  }),
  updateCard: vi.fn(() => Promise.resolve(initialData)),
  deleteCard: vi.fn((_board: number, cardId: string) => Promise.resolve({ ...initialData, cards: Object.fromEntries(Object.entries(initialData.cards).filter(([id]) => id !== cardId)) })),
  moveBoardCard: vi.fn(() => Promise.resolve(initialData)),
  getComments: vi.fn(() => Promise.resolve([])),
  getChecklist: vi.fn(() => Promise.resolve([])),
  archiveCard: vi.fn((_board: number, cardId: string) => Promise.resolve({ ...initialData, cards: Object.fromEntries(Object.entries(initialData.cards).filter(([id]) => id !== cardId)), columns: initialData.columns.map((column: BoardData["columns"][number]) => ({ ...column, cardIds: column.cardIds.filter((id) => id !== cardId) })) })),
  failureMessage: (_failure: unknown, fallback: string) => fallback,
}));

const Harness = () => {
  const [board, setBoard] = useState<BoardData | null>(null);
  return <KanbanBoard boardId={1} username="user" board={board} onBoardChange={setBoard} />;
};

const renderBoard = async () => {
  render(<Harness />);
  await screen.findAllByTestId(/column-/i);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("shows a loading state, then the five columns from the API", async () => {
    render(<Harness />);
    expect(screen.getByText("Loading board...")).toBeVisible();
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.queryByText("Loading board...")).not.toBeInTheDocument();
  });

  it("shows only an error, not placeholder cards, when the board cannot load", async () => {
    vi.mocked(getBoard).mockRejectedValueOnce(new Error("offline"));
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load board.");
    expect(screen.queryAllByTestId(/column-/i)).toHaveLength(0);
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("clears an earlier error after a later change succeeds", async () => {
    vi.mocked(renameColumn).mockRejectedValueOnce(new Error("offline"));
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to rename column.");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas again{Enter}");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("renames a column once when editing finishes", async () => {
    vi.mocked(renameColumn).mockClear();
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(renameColumn).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(renameColumn).toHaveBeenCalledOnce();
    expect(renameColumn).toHaveBeenCalledWith(1, "col-backlog", "New Name");
    await waitFor(() => expect(input).toHaveValue("New Name"));
  });

  it("restores the saved title instead of saving an empty one", async () => {
    vi.mocked(renameColumn).mockClear();
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(renameColumn).not.toHaveBeenCalled();
    expect(input).toHaveValue("Backlog");
  });

  it("adds and removes a card", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("shows an error when a board mutation fails", async () => {
    vi.mocked(renameColumn).mockRejectedValueOnce(new Error("offline"));
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to rename column.");
  });
});

describe("KanbanBoard filters", () => {
  const Filtered = () => {
    const [board, setBoard] = useState<BoardData | null>({
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], priority: "high", dueDate: "2000-01-01" },
        "card-2": { ...initialData.cards["card-2"], dueDate: localToday() },
        "card-7": { ...initialData.cards["card-7"], dueDate: "2000-01-01", assignee: "ada" },
      },
    });
    // A stable onBoardChange, as in the app: a new one each render would reload the board.
    return <KanbanBoard boardId={1} username="user" board={board} onBoardChange={setBoard} />;
  };

  it("counts overdue and due-soon cards that are not done", async () => {
    vi.mocked(getBoard).mockReturnValueOnce(new Promise(() => {}));
    render(<Filtered />);
    expect(screen.getByText("1 overdue")).toBeVisible();
    expect(screen.getByText("1 due soon")).toBeVisible();
  });

  it("keeps a card added while filtering visible until the filter changes", async () => {
    vi.mocked(getBoard).mockReturnValueOnce(new Promise(() => {}));
    render(<Filtered />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "High");
    const column = screen.getAllByTestId(/column-/)[0];
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText("Card title"), "Unprioritised");
    await userEvent.click(within(column).getByRole("button", { name: "Add card" }));
    expect(await within(column).findByText("Unprioritised")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "Medium");
    expect(within(column).queryByText("Unprioritised")).not.toBeInTheDocument();
  });

  it("searches, filters by priority and overdue, and clears", async () => {
    vi.mocked(getBoard).mockReturnValueOnce(new Promise(() => {}));
    render(<Filtered />);
    await userEvent.type(screen.getByPlaceholderText("Search cards"), "customer");
    expect(screen.getByText("Showing 1 of 8 cards")).toBeVisible();
    expect(screen.getByText("Gather customer signals")).toBeVisible();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(within(screen.getAllByTestId(/column-/)[1]).getByText("No matching cards")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    expect(screen.getByText("Align roadmap themes")).toBeVisible();

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "High");
    expect(screen.getByText("Showing 1 of 8 cards")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "Any priority");
    await userEvent.selectOptions(screen.getByLabelText("Filter by due date"), "Overdue");
    expect(screen.getByText("Showing 2 of 8 cards")).toBeVisible();
    expect(screen.getByText("Ship marketing page")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Filter by due date"), "Due in the next 3 days");
    expect(screen.getByText("Showing 1 of 8 cards")).toBeVisible();
    expect(screen.getByText("Gather customer signals")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Filter by due date"), "Any due date");

    await userEvent.selectOptions(screen.getByLabelText("Filter by assignee"), "ada");
    expect(screen.getByText("Showing 1 of 8 cards")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Filter by assignee"), "Unassigned");
    expect(screen.getByText("Showing 7 of 8 cards")).toBeVisible();
  });

  it("filters by label when the board has labels", async () => {
    vi.mocked(getBoard).mockResolvedValueOnce({
      ...initialData,
      labels: ["research"],
      cards: { ...initialData.cards, "card-2": { ...initialData.cards["card-2"], labels: ["research"] } },
    });
    await renderBoard();
    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "research");
    expect(screen.getByText("Showing 1 of 8 cards")).toBeVisible();
    expect(screen.getByText("Gather customer signals")).toBeVisible();
  });

  it("offers no assignee filter on a board nobody else can open", async () => {
    vi.mocked(getBoard).mockResolvedValueOnce({ ...initialData, members: ["user"] });
    await renderBoard();
    expect(screen.queryByLabelText("Filter by assignee")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by label")).not.toBeInTheDocument();
  });
});

describe("KanbanBoard card actions", () => {
  it("opens and closes a card", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Open Align roadmap themes" }));
    expect(screen.getByRole("dialog", { name: "Align roadmap themes" })).toHaveTextContent("Checklist and comments");
    expect(await screen.findByText("No comments yet.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Close card" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("archives a card", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Archive Align roadmap themes" }));
    await waitFor(() => expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument());
  });
});
