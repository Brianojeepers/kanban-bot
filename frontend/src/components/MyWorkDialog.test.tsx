import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyWorkDialog } from "@/components/MyWorkDialog";

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const card = (id: string, fields: object) => ({ boardId: 1, boardName: "Roadmap", id, title: id, column: "Backlog", done: false, priority: null, dueDate: null, ...fields });

describe("MyWorkDialog", () => {
  it("lists open assigned cards with their board, column, priority and due date, and opens a card's board", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, [
      card("Late task", { dueDate: "2000-01-02", priority: "high" }),
      card("Future task", { boardId: 2, boardName: "Launch", column: "Review", dueDate: "2999-03-04" }),
      card("Undated task", {}),
      card("Finished task", { done: true }),
    ])));
    const onOpenBoard = vi.fn();
    render(<MyWorkDialog username="ada" onOpenBoard={onOpenBoard} onClose={vi.fn()} />);
    expect(screen.getByText("Loading your cards...")).toBeVisible();
    const items = within(await screen.findByRole("list", { name: "Assigned cards" })).getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual([
      "Late taskRoadmap · Backlog · High priorityOverdue, Jan 2",
      "Future taskLaunch · ReviewDue Mar 4",
      "Undated taskRoadmap · Backlog",
    ]);
    expect(screen.getByText("1 done card is not shown.")).toBeVisible();
    await userEvent.click(items[1]);
    expect(onOpenBoard).toHaveBeenCalledWith(2);
  });

  it("says when nothing open is assigned, counting done cards", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, [card("A", { done: true }), card("B", { done: true })])));
    render(<MyWorkDialog username="ada" onOpenBoard={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText("Nothing open is assigned to you.")).toBeVisible();
    expect(screen.getByText("2 done cards are not shown.")).toBeVisible();
  });

  it("reports a failed load and closes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(500)));
    const onClose = vi.fn();
    render(<MyWorkDialog username="ada" onOpenBoard={vi.fn()} onClose={onClose} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load your cards.");
    await userEvent.click(screen.getByRole("button", { name: "Close my work" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
