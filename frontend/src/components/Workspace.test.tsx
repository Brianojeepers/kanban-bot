import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/components/KanbanBoard", () => ({
  KanbanBoard: ({ boardId, board, onBoardChange, toolbar, actions }: { boardId: number; board: BoardData | null; onBoardChange: (board: BoardData) => void; toolbar: ReactNode; actions: ReactNode }) => (
    <div>
      {toolbar}
      {actions}
      <p>{board ? `Showing ${board.name}` : `Loading board ${boardId}`}</p>
      <button onClick={() => onBoardChange({ id: boardId, name: `Board ${boardId}`, owner: boardId === 5 ? "grace" : "ada", members: ["ada", "grace"], labels: [], columns: [], cards: {} })}>Load board</button>
    </div>
  ),
}));
vi.mock("@/components/ChatSidebar", () => ({
  ChatSidebar: ({ onBoardUpdated, onClose }: { onBoardUpdated: (board: BoardData) => void; onClose: () => void }) => (
    <aside>
      <h2>AI assistant</h2>
      <button onClick={onClose}>Hide AI assistant</button>
      <button onClick={() => onBoardUpdated({ id: 1, name: "Late reply", owner: "ada", members: ["ada"], labels: [], columns: [], cards: {} })}>Late reply for board 1</button>
    </aside>
  ),
}));

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const boards = [{ id: 1, name: "Roadmap", owner: "ada" }, { id: 2, name: "Launch", owner: "ada" }];
const boardData = (id: number, name: string) => ({ id, name, owner: "ada", members: ["ada"], labels: [], columns: [], cards: {} });

// Routes fetch by method and path; unmatched requests fail like a server error.
const serve = (routes: Record<string, () => ReturnType<typeof reply>>) =>
  vi.stubGlobal("fetch", vi.fn((path: string, options?: RequestInit) => Promise.resolve((routes[`${options?.method ?? "GET"} ${path}`] ?? (() => reply(500)))())));

const renderWorkspace = async (onSignedOut = vi.fn()) => {
  render(<Workspace username="ada" onSignedOut={onSignedOut} />);
  await screen.findByLabelText("Board");
  return onSignedOut;
};

describe("Workspace", () => {
  it("opens the first board and switches between boards", async () => {
    serve({ "GET /api/boards": () => reply(200, boards) });
    await renderWorkspace();
    expect(screen.getByText("Loading board 1")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Launch");
    expect(screen.getByText("Loading board 2")).toBeVisible();
  });

  it("ignores board data that arrives for a board that is no longer open", async () => {
    serve({ "GET /api/boards": () => reply(200, boards) });
    await renderWorkspace();
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Launch");
    await userEvent.click(screen.getByRole("button", { name: "Late reply for board 1" }));
    expect(screen.getByText("Loading board 2")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Load board" }));
    expect(screen.getByText("Showing Board 2")).toBeVisible();
  });

  it("creates a board and opens it", async () => {
    serve({ "GET /api/boards": () => reply(200, boards), "POST /api/boards": () => reply(200, boardData(3, "Hiring")) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Hiring{Enter}");
    expect(await screen.findByText("Showing Hiring")).toBeVisible();
    expect(screen.getByLabelText("Board")).toHaveValue("3");
  });

  it("renames the open board in the list", async () => {
    serve({ "GET /api/boards": () => reply(200, boards), "PATCH /api/boards/1": () => reply(200, boardData(1, "Roadmap 2027")) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    await userEvent.clear(screen.getByLabelText("Board name"));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap 2027{Enter}");
    expect(await screen.findByRole("option", { name: "Roadmap 2027" })).toBeInTheDocument();
    expect(screen.getByText("Showing Roadmap 2027")).toBeVisible();
  });

  it("deletes the open board and opens the first remaining one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    serve({ "GET /api/boards": () => reply(200, boards), "DELETE /api/boards/2": () => reply(200, [boards[0]]) });
    await renderWorkspace();
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Launch");
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(screen.queryByRole("option", { name: "Launch" })).not.toBeInTheDocument());
    expect(screen.getByText("Loading board 1")).toBeVisible();
  });

  it("shows the server's reason, or a fallback, when a board action fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    serve({ "GET /api/boards": () => reply(200, boards), "DELETE /api/boards/1": () => reply(409, { detail: "You need at least one board" }) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You need at least one board");
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Hiring{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create board.");
  });

  it("shows an error when the boards cannot be loaded", async () => {
    serve({});
    render(<Workspace username="ada" onSignedOut={vi.fn()} />);
    expect(screen.getByText("Loading boards...")).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load your boards.");
  });

  it("logs out, even when the server cannot be reached", async () => {
    serve({ "GET /api/boards": () => reply(200, boards) });
    const onSignedOut = await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("shares the open board and leaves a board shared by someone else", async () => {
    serve({
      "GET /api/boards": () => reply(200, [...boards, { id: 5, name: "Hiring", owner: "grace" }]),
      "DELETE /api/boards/5/members/ada": () => reply(200, boardData(5, "Hiring")),
    });
    await renderWorkspace();
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Hiring (grace)");
    await userEvent.click(screen.getByRole("button", { name: "Share board" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load board" }));
    expect(screen.getByRole("dialog", { name: "Share board" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    await waitFor(() => expect(screen.queryByRole("option", { name: "Hiring (grace)" })).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Loading board 1")).toBeVisible();
  });

  it("opens and closes the board's activity", async () => {
    serve({ "GET /api/boards": () => reply(200, boards), "GET /api/boards/1/activity": () => reply(200, []) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Board activity" }));
    expect(screen.getByRole("dialog", { name: "Activity" })).toHaveTextContent("Roadmap");
    await userEvent.click(screen.getByRole("button", { name: "Close activity" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the archive and shows a restored card's board", async () => {
    serve({
      "GET /api/boards": () => reply(200, boards),
      "GET /api/boards/1/archive": () => reply(200, [{ id: "card-1", title: "Old task", column: "Backlog", archivedAt: new Date().toISOString() }]),
      "POST /api/boards/1/cards/card-1/restore": () => reply(200, boardData(1, "Roadmap restored")),
    });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Archived cards" }));
    await userEvent.click(await screen.findByRole("button", { name: "Restore Old task" }));
    expect(await screen.findByText("Showing Roadmap restored")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Close archived cards" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a board from My work", async () => {
    const assigned = [
      { boardId: 1, boardName: "Roadmap", id: "card-1", title: "Here already", column: "Backlog", done: false, priority: null, dueDate: null },
      { boardId: 2, boardName: "Launch", id: "card-2", title: "Elsewhere", column: "Backlog", done: false, priority: null, dueDate: null },
    ];
    serve({ "GET /api/boards": () => reply(200, boards), "GET /api/my-cards": () => reply(200, assigned) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Load board" }));
    await userEvent.click(screen.getByRole("button", { name: "My work" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Here already/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Showing Board 1")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "My work" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Elsewhere/ }));
    expect(screen.getByText("Loading board 2")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "My work" }));
    await userEvent.click(screen.getByRole("button", { name: "Close my work" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refreshes the board list to open a board it does not have yet", async () => {
    const shared = { id: 9, name: "Shared since", owner: "grace" };
    let listed = boards;
    serve({
      "GET /api/boards": () => reply(200, listed),
      "GET /api/my-cards": () => reply(200, [{ boardId: 9, boardName: "Shared since", id: "card-9", title: "New to me", column: "Backlog", done: false, priority: null, dueDate: null }]),
    });
    await renderWorkspace();
    listed = [...boards, shared];
    await userEvent.click(screen.getByRole("button", { name: "My work" }));
    await userEvent.click(await screen.findByRole("button", { name: /^New to me/ }));
    expect(await screen.findByText("Loading board 9")).toBeVisible();
    expect(screen.getByLabelText("Board")).toHaveValue("9");
  });

  it("closes the sharing dialog", async () => {
    serve({ "GET /api/boards": () => reply(200, boards) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Load board" }));
    await userEvent.click(screen.getByRole("button", { name: "Share board" }));
    await userEvent.click(screen.getByRole("button", { name: "Close sharing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens and closes the account settings", async () => {
    serve({ "GET /api/boards": () => reply(200, boards) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Account settings" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Close account settings" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides the assistant to give the board the full width, and brings it back", async () => {
    serve({ "GET /api/boards": () => reply(200, boards) });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Hide AI assistant" }));
    expect(screen.getByRole("heading", { name: "AI assistant", hidden: true })).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    expect(screen.getByRole("heading", { name: "AI assistant" })).toBeVisible();
  });
});
