import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { boardFixture } from "@/test/fixtures";

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const archived = (id: string, title: string) => ({ id, title, column: "Review", archivedAt: new Date().toISOString() });

describe("ArchiveDialog", () => {
  it("lists archived cards and restores one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, [archived("card-1", "Old"), archived("card-2", "Older")])).mockResolvedValueOnce(reply(200, boardFixture)));
    const onBoardChange = vi.fn();
    render(<ArchiveDialog boardId={1} boardName="Roadmap" onBoardChange={onBoardChange} onClose={vi.fn()} />);
    expect(screen.getByText("Loading archived cards...")).toBeVisible();
    expect(await screen.findAllByText("From Review, archived just now")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Restore Old" }));
    expect(fetch).toHaveBeenLastCalledWith("/api/boards/1/cards/card-1/restore", expect.objectContaining({ method: "POST" }));
    expect(onBoardChange).toHaveBeenCalledWith(boardFixture);
    expect(screen.queryByRole("button", { name: "Restore Old" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Older" })).toBeVisible();
  });

  it("deletes a card for good only after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, [archived("card-1", "Old")])).mockResolvedValueOnce(reply(200, [])));
    render(<ArchiveDialog boardId={1} boardName="Roadmap" onBoardChange={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Old for good" }));
    expect(fetch).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Delete Old for good" }));
    expect(confirm).toHaveBeenLastCalledWith('Delete "Old" for good?');
    expect(await screen.findByText("No archived cards.")).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith("/api/boards/1/archive/card-1", expect.objectContaining({ method: "DELETE" }));
  });

  it("reports failures and closes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, [archived("card-1", "Old")])).mockResolvedValueOnce(reply(404, { detail: "Card card-1 does not exist" })).mockResolvedValueOnce(reply(500)).mockResolvedValueOnce(reply(500)));
    const onClose = vi.fn();
    const { unmount } = render(<ArchiveDialog boardId={1} boardName="Roadmap" onBoardChange={vi.fn()} onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "Restore Old" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Card card-1 does not exist");
    await userEvent.click(screen.getByRole("button", { name: "Delete Old for good" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete that card.");
    await userEvent.click(screen.getByRole("button", { name: "Close archived cards" }));
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    render(<ArchiveDialog boardId={1} boardName="Roadmap" onBoardChange={vi.fn()} onClose={onClose} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load archived cards.");
  });
});
