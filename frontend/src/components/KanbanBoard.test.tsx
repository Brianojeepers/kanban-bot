import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { getBoard, renameColumn } from "@/lib/api";
import { boardFixture as initialData } from "@/test/fixtures";

vi.mock("@/lib/api", () => ({
  getBoard: vi.fn(() => Promise.resolve(initialData)),
  renameColumn: vi.fn((_id: string, title: string) => Promise.resolve({ ...initialData, columns: [{ ...initialData.columns[0], title }, ...initialData.columns.slice(1)] })),
  addCard: vi.fn((columnId: string, title: string, details: string) => {
    const id = "card-new";
    return Promise.resolve({ ...initialData, cards: { ...initialData.cards, [id]: { id, title, details } }, columns: initialData.columns.map((column: BoardData["columns"][number]) => column.id === columnId ? { ...column, cardIds: [...column.cardIds, id] } : column) });
  }),
  updateCard: vi.fn(() => Promise.resolve(initialData)),
  deleteCard: vi.fn((cardId: string) => Promise.resolve({ ...initialData, cards: Object.fromEntries(Object.entries(initialData.cards).filter(([id]) => id !== cardId)) })),
  moveBoardCard: vi.fn(() => Promise.resolve(initialData)),
}));

const Harness = () => {
  const [board, setBoard] = useState<BoardData | null>(null);
  return <KanbanBoard board={board} onBoardChange={setBoard} />;
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
    expect(renameColumn).toHaveBeenCalledWith("col-backlog", "New Name");
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
