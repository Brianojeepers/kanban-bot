import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";

vi.mock("@/components/Workspace", () => ({
  Workspace: ({ username, onSignedOut }: { username: string; onSignedOut: () => void }) => <button onClick={onSignedOut}>Signed in as {username}</button>,
}));

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

const fillIn = async (username: string, password: string) => {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
};

describe("AuthGate", () => {
  it("opens the workspace for an existing session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { username: "ada" })));
    render(<AuthGate />);
    expect(await screen.findByRole("button", { name: "Signed in as ada" })).toBeVisible();
  });

  it("shows a login error for rejected credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401, { detail: "Invalid username or password" })));
    render(<AuthGate />);
    await fillIn("user", "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
  });

  it("signs in and returns to the form after signing out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, { username: "user" })));
    render(<AuthGate />);
    await fillIn("user", "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(fetch).toHaveBeenLastCalledWith("/api/login", expect.objectContaining({ body: JSON.stringify({ username: "user", password: "password" }) }));
    await userEvent.click(await screen.findByRole("button", { name: "Signed in as user" }));
    expect(await screen.findByLabelText("Username")).toBeVisible();
  });

  it("creates an account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, { username: "ada" })));
    render(<AuthGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    await fillIn("ada", "long password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(fetch).toHaveBeenLastCalledWith("/api/register", expect.objectContaining({ body: JSON.stringify({ username: "ada", password: "long password" }) }));
    expect(await screen.findByRole("button", { name: "Signed in as ada" })).toBeVisible();
  });

  it("shows why an account could not be created, and clears it when switching back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(409, { detail: "That username is taken" })).mockResolvedValueOnce(reply(422, { detail: [] })));
    render(<AuthGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    await fillIn("ada", "long password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is taken");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 3 to 32 letters");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
  });

  it("shows the sign-in form with a message when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")));
    render(<AuthGate />);
    expect(await screen.findByLabelText("Username")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to reach the server.");
  });

  it("shows the wait time when there have been too many sign-in attempts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(429, { detail: "Too many requests. Try again in 42 seconds." })));
    render(<AuthGate />);
    await fillIn("user", "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests. Try again in 42 seconds.");
  });
});
