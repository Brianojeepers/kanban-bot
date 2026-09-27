import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDialog } from "@/components/AccountDialog";

const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

const changePassword = async (current: string, next: string, confirm = next) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
};

describe("AccountDialog", () => {
  it("changes the password and clears the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200)));
    render(<AccountDialog username="ada" onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Account" })).toHaveTextContent("Signed in as ada");
    await changePassword("old password", "new password");
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
    expect(fetch).toHaveBeenCalledWith("/api/account/password", expect.objectContaining({ body: JSON.stringify({ current_password: "old password", new_password: "new password" }) }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("checks that the new passwords match before sending", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<AccountDialog username="ada" onClose={vi.fn()} onDeleted={vi.fn()} />);
    await changePassword("old password", "new password", "different one");
    expect(await screen.findByRole("alert")).toHaveTextContent("The new passwords do not match.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the password cannot be changed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(403, { detail: "Current password is incorrect" })).mockRejectedValueOnce(new TypeError("offline")));
    render(<AccountDialog username="ada" onClose={vi.fn()} onDeleted={vi.fn()} />);
    await changePassword("wrong", "new password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to change password.");
  });

  it("deletes the account with the password", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(403, { detail: "Password is incorrect" })).mockResolvedValueOnce(reply(200)));
    const onDeleted = vi.fn();
    render(<AccountDialog username="ada" onClose={vi.fn()} onDeleted={onDeleted} />);
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(onDeleted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("closes with the close button or Escape", async () => {
    const onClose = vi.fn();
    render(<AccountDialog username="ada" onClose={onClose} onDeleted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Close account settings" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
