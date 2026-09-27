import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDialog } from "@/components/CardDialog";
import { boardFixture, makeCard } from "@/test/fixtures";

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const card = makeCard("card-1", "Draft");
const base = "/api/boards/1/cards/card-1";
const comment = (id: number, author: string | null, content: string) => ({ id, author, content, createdAt: new Date().toISOString() });

// Routes fetch by method and path; each route answers with its next reply, then keeps repeating the last one.
const serve = (routes: Record<string, ReturnType<typeof reply>[]>) =>
  vi.stubGlobal("fetch", vi.fn((path: string, options?: RequestInit) => {
    const replies = routes[`${options?.method ?? "GET"} ${path}`] ?? [reply(500)];
    return Promise.resolve(replies.length > 1 ? replies.shift()! : replies[0]);
  }));

const renderCard = (props: Partial<Parameters<typeof CardDialog>[0]> = {}) =>
  render(<CardDialog boardId={1} card={card} username="ada" onBoardChange={vi.fn()} onClose={vi.fn()} {...props} />);

describe("CardDialog", () => {
  it("lists comments, with a delete button only on your own", async () => {
    serve({ [`GET ${base}/checklist`]: [reply(200, [])], [`GET ${base}/comments`]: [reply(200, [comment(1, "ada", "Mine"), comment(2, "grace", "Theirs"), comment(3, null, "Orphaned")])] });
    renderCard();
    expect(screen.getByRole("dialog", { name: "Draft" })).toHaveTextContent("Checklist and comments");
    expect(screen.getByText("Loading...")).toBeVisible();
    expect(await screen.findByText("Theirs")).toBeVisible();
    expect(screen.getByText("Former member")).toBeVisible();
    expect(screen.getAllByText("just now")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Delete comment" })).toHaveLength(1);
  });

  it("adds and deletes a comment and passes the updated board on", async () => {
    serve({
      [`GET ${base}/checklist`]: [reply(200, [])],
      [`GET ${base}/comments`]: [reply(200, [])],
      [`POST ${base}/comments`]: [reply(200, { comments: [comment(4, "ada", "First!")], board: boardFixture })],
      [`DELETE ${base}/comments/4`]: [reply(200, { comments: [], board: boardFixture })],
    });
    const onBoardChange = vi.fn();
    renderCard({ onBoardChange });
    expect(await screen.findByText("No comments yet.")).toBeVisible();
    await userEvent.type(screen.getByLabelText("New comment"), "  First!  ");
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByText("First!")).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith(`${base}/comments`, expect.objectContaining({ body: JSON.stringify({ content: "First!" }) }));
    expect(onBoardChange).toHaveBeenCalledWith(boardFixture);
    expect(screen.getByLabelText("New comment")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(await screen.findByText("No comments yet.")).toBeVisible();
  });

  it("adds, ticks and removes checklist items", async () => {
    const item = { id: 7, text: "Write tests", done: false };
    serve({
      [`GET ${base}/checklist`]: [reply(200, [])],
      [`GET ${base}/comments`]: [reply(200, [])],
      [`POST ${base}/checklist`]: [reply(200, { items: [item], board: boardFixture })],
      [`PATCH ${base}/checklist/7`]: [reply(200, { items: [{ ...item, done: true }], board: boardFixture })],
      [`DELETE ${base}/checklist/7`]: [reply(200, { items: [], board: boardFixture })],
    });
    const onBoardChange = vi.fn();
    renderCard({ onBoardChange });
    await userEvent.type(await screen.findByLabelText("New checklist item"), "Write tests{Enter}");
    const list = await screen.findByRole("list", { name: "Checklist" });
    expect(screen.getByText("0 of 1 done")).toBeVisible();
    expect(screen.getByLabelText("New checklist item")).toHaveValue("");
    await userEvent.click(within(list).getByRole("checkbox", { name: "Write tests" }));
    expect(fetch).toHaveBeenLastCalledWith(`${base}/checklist/7`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ done: true }) }));
    expect(await screen.findByText("1 of 1 done")).toBeVisible();
    expect(within(list).getByRole("checkbox", { name: "Write tests" })).toBeChecked();
    expect(screen.getByText("Write tests")).toHaveClass("line-through");
    await userEvent.click(screen.getByRole("button", { name: "Remove Write tests" }));
    expect(await screen.findByLabelText("New checklist item")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Checklist" })).not.toBeInTheDocument();
    expect(onBoardChange).toHaveBeenCalledTimes(3);
  });

  it("ticks an item at once and unticks it again if the server refuses", async () => {
    let refuse: (value: Response) => void = () => {};
    serve({ [`GET ${base}/checklist`]: [reply(200, [{ id: 7, text: "Step", done: false }])], [`GET ${base}/comments`]: [reply(200, [])] });
    renderCard();
    const checkbox = await screen.findByRole("checkbox", { name: "Step" });
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { refuse = resolve; }));
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    refuse(reply(500) as unknown as Response);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update the checklist.");
    expect(checkbox).not.toBeChecked();
  });

  it("keeps a draft and shows an error when a change fails", async () => {
    serve({ [`GET ${base}/checklist`]: [reply(200, [])], [`GET ${base}/comments`]: [reply(200, [])], [`POST ${base}/comments`]: [reply(500)], [`POST ${base}/checklist`]: [reply(500)] });
    renderCard();
    await userEvent.type(await screen.findByLabelText("New comment"), "Keep me");
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to add comment.");
    expect(screen.getByLabelText("New comment")).toHaveValue("Keep me");
    await userEvent.type(screen.getByLabelText("New checklist item"), "Step{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update the checklist.");
  });

  it("ignores blank text, reports a failed load, and closes", async () => {
    serve({});
    const onClose = vi.fn();
    renderCard({ onClose });
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load this card.");
    await userEvent.type(screen.getByLabelText("New comment"), "   ");
    screen.getByLabelText("New comment").closest("form")!.requestSubmit();
    expect(fetch).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Close card" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
