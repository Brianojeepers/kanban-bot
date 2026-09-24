import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";

describe("ChatSidebar", () => {
  it("displays history as bubbles and refreshes the board after a response", async () => {
    const onBoardUpdated = vi.fn();
    let reply: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn((path: string) => path === "/api/messages"
      ? Promise.resolve({ ok: true, json: () => Promise.resolve([{ role: "assistant", content: "Welcome" }]) })
      : new Promise((resolve) => { reply = resolve; })
    ));
    render(<ChatSidebar onBoardUpdated={onBoardUpdated} />);
    expect(await screen.findByText("Welcome")).toHaveClass("self-start");
    await userEvent.type(screen.getByPlaceholderText("Ask about your board"), "Help");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("Help")).toHaveClass("self-end");
    expect(screen.getByText("Assistant is typing...")).toBeVisible();
    expect(screen.getByPlaceholderText("Ask about your board")).toHaveValue("");
    reply({ ok: true, json: () => Promise.resolve({ messages: [{ role: "user", content: "Help" }, { role: "assistant", content: "Done" }] }) });
    expect(await screen.findByText("Done")).toHaveClass("self-start");
    expect(screen.queryByText("Assistant is typing...")).not.toBeInTheDocument();
    expect(onBoardUpdated).toHaveBeenCalledOnce();
  });

  it("keeps a message sent before the history finishes loading", async () => {
    let loadHistory: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn((path: string) => path === "/api/messages"
      ? new Promise((resolve) => { loadHistory = resolve; })
      : new Promise(() => {})
    ));
    render(<ChatSidebar onBoardUpdated={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Ask about your board"), "Early{Enter}");
    loadHistory({ ok: true, json: () => Promise.resolve([{ role: "assistant", content: "Earlier" }]) });
    expect(await screen.findByText("Earlier")).toBeVisible();
    expect(screen.getByText("Early")).toBeVisible();
  });

  it("sends on Enter and keeps Shift+Enter for new lines", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatSidebar onBoardUpdated={vi.fn()} />);
    expect(await screen.findByText(/Ask the assistant/)).toBeVisible();
    const input = screen.getByPlaceholderText("Ask about your board");
    await userEvent.type(input, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(input).toHaveValue("Line one\nLine two");
    await userEvent.type(input, "{Enter}");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/chat", expect.objectContaining({ body: JSON.stringify({ message: "Line one\nLine two" }) }));
  });

  it("shows the server's reason when the AI reply is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ detail: "The AI returned an invalid reply. Please try again." }) }));
    render(<ChatSidebar onBoardUpdated={vi.fn()} />);
    await userEvent.type(await screen.findByPlaceholderText("Ask about your board"), "Help{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI returned an invalid reply. Please try again.");
  });

  it("shows an error and restores the draft when chat cannot be sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }).mockResolvedValueOnce({ ok: false }));
    render(<ChatSidebar onBoardUpdated={vi.fn()} />);
    await userEvent.type(await screen.findByPlaceholderText("Ask about your board"), "Help");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to send message.");
    expect(screen.getByPlaceholderText("Ask about your board")).toHaveValue("Help");
    expect(screen.queryByText("Help", { selector: "p" })).not.toBeInTheDocument();
  });
});
