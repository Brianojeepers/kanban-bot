import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardSwitcher } from "@/components/BoardSwitcher";

const boards = [{ id: 1, name: "Roadmap", owner: "ada" }, { id: 2, name: "Launch", owner: "ada" }];
const handlers = () => ({ username: "ada", onShare: vi.fn(), onShowActivity: vi.fn(), onShowArchive: vi.fn(), onSelect: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() });

describe("BoardSwitcher", () => {
  it("switches boards", async () => {
    const props = handlers();
    render(<BoardSwitcher boards={boards} activeId={1} {...props} />);
    expect(screen.getByLabelText("Board")).toHaveValue("1");
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Launch");
    expect(props.onSelect).toHaveBeenCalledWith(2);
  });

  it("creates a board with a trimmed name", async () => {
    const props = handlers();
    render(<BoardSwitcher boards={boards} activeId={1} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    expect(screen.getByLabelText("Board name")).toHaveValue("");
    await userEvent.type(screen.getByLabelText("Board name"), "  Hiring  ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(props.onCreate).toHaveBeenCalledWith("Hiring");
    expect(screen.getByLabelText("Board")).toBeVisible();
  });

  it("renames the active board, starting from its name", async () => {
    const props = handlers();
    render(<BoardSwitcher boards={boards} activeId={2} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Launch");
    await userEvent.clear(input);
    await userEvent.type(input, "Go live{Enter}");
    expect(props.onRename).toHaveBeenCalledWith("Go live");
  });

  it("ignores a blank name and cancels with Escape or the Cancel button", async () => {
    const props = handlers();
    render(<BoardSwitcher boards={boards} activeId={1} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    await userEvent.clear(screen.getByLabelText("Board name"));
    await userEvent.type(screen.getByLabelText("Board name"), "   ");
    screen.getByLabelText("Board name").closest("form")!.requestSubmit();
    expect(props.onRename).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Board")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("deletes the active board only after confirmation", async () => {
    const props = handlers();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<BoardSwitcher boards={boards} activeId={2} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(confirm).toHaveBeenLastCalledWith('Delete "Launch" and all of its cards?');
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it("labels boards shared by others, and leaves renaming and deleting them to their owner", async () => {
    const props = handlers();
    render(<BoardSwitcher boards={[...boards, { id: 3, name: "Hiring", owner: "grace" }]} activeId={3} {...props} />);
    expect(screen.getByRole("option", { name: "Hiring (grace)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Roadmap" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename board" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete board" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Share board" }));
    expect(props.onShare).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Board activity" }));
    expect(props.onShowActivity).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Archived cards" }));
    expect(props.onShowArchive).toHaveBeenCalledOnce();
  });

  it("does not offer to delete the only board", () => {
    render(<BoardSwitcher boards={[boards[0]]} activeId={1} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Delete board" })).toBeDisabled();
  });
});
