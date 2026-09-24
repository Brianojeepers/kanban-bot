import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanCard } from "@/components/KanbanCard";

vi.mock("@dnd-kit/sortable", () => ({ useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: "", isDragging: false }) }));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => "" } } }));

it("edits a card through its save action", async () => {
  const onEdit = vi.fn();
  render(<KanbanCard card={{ id: "card-1", title: "Draft", details: "Notes" }} onDelete={vi.fn()} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.clear(screen.getByLabelText("Card title"));
  await userEvent.type(screen.getByLabelText("Card title"), "Ship");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onEdit).toHaveBeenCalledWith("card-1", "Ship", "Notes");
});
it("uses a labelled move handle so the card itself is not a button", () => {
  render(<KanbanCard card={{ id: "card-1", title: "Draft", details: "Notes" }} onDelete={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByTestId("card-card-1")).not.toHaveAttribute("role");
  expect(screen.getByRole("button", { name: "Move Draft" })).toBeVisible();
});
