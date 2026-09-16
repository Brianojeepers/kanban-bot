import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";

describe("ChatSidebar", () => {
  it("displays history and refreshes the board after a response", async () => {
    const onBoardUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn((path: string) => Promise.resolve(
      path === "/api/messages"
        ? { ok: true, json: () => Promise.resolve([{ role: "assistant", content: "Welcome" }]) }
        : { ok: true, json: () => Promise.resolve({ messages: [{ role: "user", content: "Help" }, { role: "assistant", content: "Done" }] }) }
    )));
    render(<ChatSidebar onBoardUpdated={onBoardUpdated} />);
    expect(await screen.findByText(/Welcome/)).toBeVisible();
    await userEvent.type(screen.getByPlaceholderText("Ask about your board"), "Help");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Done/)).toBeVisible();
    expect(onBoardUpdated).toHaveBeenCalledOnce();
  });

  it("shows an error when chat cannot be sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }).mockResolvedValueOnce({ ok: false }));
    render(<ChatSidebar onBoardUpdated={vi.fn()} />);
    await userEvent.type(await screen.findByPlaceholderText("Ask about your board"), "Help");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to send message.");
  });
});