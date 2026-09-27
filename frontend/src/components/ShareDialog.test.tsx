import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "@/components/ShareDialog";
import { boardFixture } from "@/test/fixtures";

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const board = { ...boardFixture, owner: "user", members: ["user", "ada"] };
const handlers = () => ({ onBoardChange: vi.fn(), onLeft: vi.fn(), onClose: vi.fn() });

describe("ShareDialog", () => {
  it("lets the owner add a member", async () => {
    const updated = { ...board, members: ["user", "ada", "grace"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, updated)));
    const props = handlers();
    render(<ShareDialog board={board} username="user" {...props} />);
    expect(within(screen.getByRole("list", { name: "Members" })).getByText("Owner")).toBeVisible();
    await userEvent.type(screen.getByLabelText("Add a member by username"), " grace ");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
    expect(fetch).toHaveBeenCalledWith("/api/boards/1/members", expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "grace" }) }));
    expect(props.onBoardChange).toHaveBeenCalledWith(updated);
    expect(screen.getByLabelText("Add a member by username")).toHaveValue("");
  });

  it("shows why a member could not be added", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(404, { detail: "There is no user called nobody" })).mockRejectedValueOnce(new TypeError("offline")));
    render(<ShareDialog board={board} username="user" {...handlers()} />);
    await userEvent.type(screen.getByLabelText("Add a member by username"), "nobody{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("There is no user called nobody");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to add that member.");
  });

  it("lets the owner remove a member", async () => {
    const updated = { ...board, members: ["user"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, updated)));
    const props = handlers();
    render(<ShareDialog board={board} username="user" {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove ada" }));
    expect(fetch).toHaveBeenCalledWith("/api/boards/1/members/ada", expect.objectContaining({ method: "DELETE" }));
    expect(props.onBoardChange).toHaveBeenCalledWith(updated);
    expect(props.onLeft).not.toHaveBeenCalled();
  });

  it("lets a member leave, but not change who else has access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(500)).mockResolvedValueOnce(reply(200, board)));
    const props = handlers();
    render(<ShareDialog board={{ ...board, members: ["user", "ada", "grace"] }} username="ada" {...props} />);
    expect(screen.getByText("Shared with you by user. Only they can rename, share or delete it.")).toBeVisible();
    expect(screen.queryByLabelText("Add a member by username")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove grace" })).not.toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to remove that member.");
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    expect(props.onLeft).toHaveBeenCalledOnce();
    expect(props.onBoardChange).not.toHaveBeenCalled();
  });

  it("closes", async () => {
    const props = handlers();
    render(<ShareDialog board={board} username="user" {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Close sharing" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
