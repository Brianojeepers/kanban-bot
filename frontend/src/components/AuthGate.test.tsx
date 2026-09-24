import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";

vi.mock("@/components/KanbanBoard", () => ({ KanbanBoard: ({ onLogout }: { onLogout: () => void }) => <button onClick={onLogout}>Log out</button> }));

describe("AuthGate", () => {
  it("shows a login error for rejected credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }));
    render(<AuthGate />);
    await screen.findByLabelText("Username");
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
  });

  it("renders the board after a valid login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }));
    render(<AuthGate />);
    await screen.findByLabelText("Username");
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Log out" })).toBeVisible();
  });

  it("returns to the sign-in form after logging out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    render(<AuthGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByLabelText("Username")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});