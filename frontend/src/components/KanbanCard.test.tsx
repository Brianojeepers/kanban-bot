import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanCard } from "@/components/KanbanCard";
import { formatDueDate, localToday } from "@/lib/kanban";
import { makeCard } from "@/test/fixtures";

vi.mock("@dnd-kit/sortable", () => ({ useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: "", isDragging: false }) }));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => "" } } }));

const draft = makeCard("card-1", "Draft", "Notes");

it("edits a card through its save action", async () => {
  const onEdit = vi.fn();
  render(<KanbanCard card={draft} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit Draft" }));
  await userEvent.clear(screen.getByLabelText("Card title"));
  await userEvent.type(screen.getByLabelText("Card title"), "Ship");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onEdit).toHaveBeenCalledWith("card-1", { title: "Ship", details: "Notes", priority: null, due_date: null, assignee: null, labels: [] });
});

it("sets and clears the priority and due date", async () => {
  const onEdit = vi.fn();
  const { rerender } = render(<KanbanCard card={draft} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit Draft" }));
  await userEvent.selectOptions(screen.getByLabelText("Priority"), "High");
  await userEvent.type(screen.getByLabelText("Due date"), "2026-10-01");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onEdit).toHaveBeenLastCalledWith("card-1", { title: "Draft", details: "Notes", priority: "high", due_date: "2026-10-01", assignee: null, labels: [] });

  rerender(<KanbanCard card={{ ...draft, priority: "high", dueDate: "2026-10-01" }} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit Draft" }));
  expect(screen.getByLabelText("Priority")).toHaveValue("high");
  await userEvent.selectOptions(screen.getByLabelText("Priority"), "No priority");
  await userEvent.clear(screen.getByLabelText("Due date"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onEdit).toHaveBeenLastCalledWith("card-1", { title: "Draft", details: "Notes", priority: null, due_date: null, assignee: null, labels: [] });
});

it("shows the priority and due date, and marks overdue cards", () => {
  const { rerender } = render(<KanbanCard card={{ ...draft, priority: "medium", dueDate: "2000-01-02" }} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText("Medium")).toHaveTextContent("Medium priority");
  expect(screen.getByText("Jan 2")).toHaveTextContent("Due Jan 2, overdue");
  expect(screen.getByText("Jan 2")).toHaveAttribute("data-tooltip", "Overdue: it was due Jan 2");
  expect(screen.getByText("Medium")).toHaveAttribute("data-tooltip", "Medium priority");

  rerender(<KanbanCard card={{ ...draft, priority: "low", dueDate: localToday() }} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText("Low")).toBeVisible();
  expect(screen.getByText(formatDueDate(localToday()))).not.toHaveTextContent("overdue");
});

it("shows no badges for a card without priority or due date", () => {
  render(<KanbanCard card={draft} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.queryByText(/priority|Due/)).not.toBeInTheDocument();
});

it("uses a labelled move handle so the card itself is not a button", () => {
  render(<KanbanCard card={draft} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByTestId("card-card-1")).not.toHaveAttribute("role");
  expect(screen.getByRole("button", { name: "Move Draft" })).toBeVisible();
});

it("discards edits on cancel", async () => {
  const onEdit = vi.fn();
  render(<KanbanCard card={draft} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit Draft" }));
  await userEvent.type(screen.getByLabelText("Card title"), " changed");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onEdit).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Draft" })).toBeVisible();
});

it("assigns a card to a board member and shows who it is assigned to", async () => {
  const onEdit = vi.fn();
  const { rerender } = render(<KanbanCard card={draft} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit Draft" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain("ada");
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "ada");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onEdit).toHaveBeenLastCalledWith("card-1", expect.objectContaining({ assignee: "ada" }));

  rerender(<KanbanCard card={{ ...draft, assignee: "ada" }} members={["user", "ada"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  expect(screen.getByText("ada")).toHaveTextContent("Assigned to ada");
});

it("opens the card and shows how many comments it has", async () => {
  const onOpen = vi.fn();
  const { rerender } = render(<KanbanCard card={draft} members={["user"]} onDelete={vi.fn()} onOpen={onOpen} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.queryByText(/comment/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Open Draft" }));
  expect(onOpen).toHaveBeenCalledWith("card-1");

  rerender(<KanbanCard card={{ ...draft, comments: 1 }} members={["user"]} onDelete={vi.fn()} onOpen={onOpen} onArchive={vi.fn()} onEdit={vi.fn()} />);
  const chip = (text: string) => screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === text);
  expect(chip("1 comment")).toBeInTheDocument();
  rerender(<KanbanCard card={{ ...draft, comments: 3 }} members={["user"]} onDelete={vi.fn()} onOpen={onOpen} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(chip("3 comments")).toBeInTheDocument();
});

it("edits and shows labels", async () => {
  const onEdit = vi.fn();
  const { rerender } = render(<KanbanCard card={{ ...draft, labels: ["ux"] }} members={["user"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  expect(screen.getByText("ux")).toHaveTextContent("Label: ux");
  await userEvent.click(screen.getByRole("button", { name: "Edit Draft" }));
  expect(screen.getByLabelText("Labels")).toHaveValue("ux");
  await userEvent.type(screen.getByLabelText("Labels"), ", backend ,");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onEdit).toHaveBeenLastCalledWith("card-1", expect.objectContaining({ labels: ["ux", "backend"] }));
  rerender(<KanbanCard card={{ ...draft, labels: [] }} members={["user"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={onEdit} />);
  expect(screen.queryByText(/Label:/)).not.toBeInTheDocument();
});

it("archives a card and shows its checklist progress", async () => {
  const onArchive = vi.fn();
  const { rerender } = render(<KanbanCard card={{ ...draft, checklist: { done: 1, total: 3 } }} members={["user"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={onArchive} onEdit={vi.fn()} />);
  const chip = (text: string) => screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === text);
  expect(chip("1/3 checklist items done")).not.toHaveClass("text-[#2f855a]");
  await userEvent.click(screen.getByRole("button", { name: "Archive Draft" }));
  expect(onArchive).toHaveBeenCalledWith("card-1");
  rerender(<KanbanCard card={{ ...draft, checklist: { done: 3, total: 3 } }} members={["user"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={onArchive} onEdit={vi.fn()} />);
  expect(chip("3/3 checklist items done")).toHaveClass("text-[#2f855a]");
});

it("marks cards due today or soon, and explains every badge and button on hover", () => {
  const today = localToday();
  const [year, month, day] = today.split("-").map(Number);
  const soon = localToday(new Date(year, month - 1, day + 2));
  const { rerender } = render(<KanbanCard card={{ ...draft, dueDate: today }} members={["user"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText(formatDueDate(today))).toHaveTextContent("due today");
  expect(screen.getByText(formatDueDate(today))).toHaveAttribute("data-tooltip", "Due today");

  rerender(<KanbanCard card={{ ...draft, dueDate: soon, assignee: "ada", labels: ["ux"], comments: 2, checklist: { done: 1, total: 2 } }} members={["user"]} onDelete={vi.fn()} onOpen={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText(formatDueDate(soon))).toHaveTextContent("due soon");
  expect(screen.getByText(formatDueDate(soon))).toHaveAttribute("data-tooltip", `Due soon ${formatDueDate(soon)}`);
  expect(screen.getByText("ada")).toHaveAttribute("data-tooltip", "Assigned to ada");
  expect(screen.getByText("ux")).toHaveAttribute("data-tooltip", 'Label "ux"');
  for (const name of ["Move Draft", "Open Draft", "Edit Draft", "Archive Draft", "Delete Draft"]) {
    expect(screen.getByRole("button", { name })).toHaveAttribute("data-tooltip");
  }
});
