import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";
import { renameColumn } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getBoard: vi.fn(() => Promise.resolve(initialData)),
  renameColumn: vi.fn((_id: string, title: string) => Promise.resolve({ ...initialData, columns: [{ ...initialData.columns[0], title }, ...initialData.columns.slice(1)] })),
  addCard: vi.fn((columnId: string, title: string, details: string) => {
    const id = "card-new";
    return Promise.resolve({ ...initialData, cards: { ...initialData.cards, [id]: { id, title, details } }, columns: initialData.columns.map((column) => column.id === columnId ? { ...column, cardIds: [...column.cardIds, id] } : column) });
  }),
  updateCard: vi.fn(() => Promise.resolve(initialData)),
  deleteCard: vi.fn((cardId: string) => Promise.resolve({ ...initialData, cards: Object.fromEntries(Object.entries(initialData.cards).filter(([id]) => id !== cardId)) })),
  moveBoardCard: vi.fn(() => Promise.resolve(initialData)),
}));

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column once when editing finishes", async () => {
    vi.mocked(renameColumn).mockClear();
    render(<KanbanBoard />);
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
    render(<KanbanBoard />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(renameColumn).not.toHaveBeenCalled();
    expect(input).toHaveValue("Backlog");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
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
    render(<KanbanBoard />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to rename column.");
  });
});
