import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityDialog } from "@/components/ActivityDialog";

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe("ActivityDialog", () => {
  it("lists the board's recent activity", async () => {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, [
      { id: 2, actor: "ada", action: 'moved "Task" to Review', createdAt: hourAgo },
      { id: 1, actor: null, action: "created the board", createdAt: hourAgo },
    ])));
    const onClose = vi.fn();
    render(<ActivityDialog boardId={3} boardName="Launch" onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Activity" })).toHaveTextContent("Launch");
    const items = within(await screen.findByRole("list", { name: "Recent activity" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(['ada moved "Task" to Review1 hour ago', "Former member created the board1 hour ago"]);
    expect(fetch).toHaveBeenCalledWith("/api/boards/3/activity", expect.any(Object));
    await userEvent.click(screen.getByRole("button", { name: "Close activity" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says when nothing has happened yet, and when activity cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, [])).mockResolvedValueOnce(reply(500)));
    const { unmount } = render(<ActivityDialog boardId={3} boardName="Launch" onClose={vi.fn()} />);
    expect(screen.getByText("Loading activity...")).toBeVisible();
    expect(await screen.findByText("Nothing has happened on this board yet.")).toBeVisible();
    unmount();
    render(<ActivityDialog boardId={3} boardName="Launch" onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load activity.");
  });
});
