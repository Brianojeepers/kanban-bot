import { addCard, ApiError, changePassword, createBoard, deleteAccount, deleteBoard, deleteCard, getBoard, getMessages, getSession, listBoards, logout, moveBoardCard, register, renameBoard, renameColumn, sendChat, signIn, updateCard } from "@/lib/api";

const ok = (body: unknown = {}) => ({ ok: true, json: () => Promise.resolve(body) });

describe("API client", () => {
  it("uses the expected endpoints, methods and request bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    await getSession();
    await signIn("ada", "secret");
    await register("ada", "secret");
    await logout();
    await changePassword("old", "new");
    await deleteAccount("secret");
    await listBoards();
    await createBoard("Launch");
    await renameBoard(2, "Launch 2");
    await deleteBoard(2);
    await getBoard(2);
    await renameColumn(2, "col-1", "Ideas");
    await addCard(2, "col-1", { title: "Plan", details: "Notes" });
    await updateCard(2, "card-1", { priority: "high", due_date: null });
    await deleteCard(2, "card-1");
    await moveBoardCard(2, "card-1", "col-2", 3);
    await getMessages(2);
    await sendChat(2, "Hi");

    const calls = fetchMock.mock.calls.map(([path, options]) => [options.method ?? "GET", path, options.body]);
    expect(calls).toEqual([
      ["GET", "/api/session", undefined],
      ["POST", "/api/login", JSON.stringify({ username: "ada", password: "secret" })],
      ["POST", "/api/register", JSON.stringify({ username: "ada", password: "secret" })],
      ["POST", "/api/logout", undefined],
      ["POST", "/api/account/password", JSON.stringify({ current_password: "old", new_password: "new" })],
      ["DELETE", "/api/account", JSON.stringify({ password: "secret" })],
      ["GET", "/api/boards", undefined],
      ["POST", "/api/boards", JSON.stringify({ name: "Launch" })],
      ["PATCH", "/api/boards/2", JSON.stringify({ name: "Launch 2" })],
      ["DELETE", "/api/boards/2", undefined],
      ["GET", "/api/boards/2", undefined],
      ["PATCH", "/api/boards/2/columns/col-1", JSON.stringify({ title: "Ideas" })],
      ["POST", "/api/boards/2/columns/col-1/cards", JSON.stringify({ title: "Plan", details: "Notes" })],
      ["PATCH", "/api/boards/2/cards/card-1", JSON.stringify({ priority: "high", due_date: null })],
      ["DELETE", "/api/boards/2/cards/card-1", undefined],
      ["POST", "/api/boards/2/cards/card-1/move", JSON.stringify({ column_id: "col-2", position: 3 })],
      ["GET", "/api/boards/2/messages", undefined],
      ["POST", "/api/boards/2/chat", JSON.stringify({ message: "Hi" })],
    ]);
  });

  it("rejects with the server's reason and status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ detail: "That username is taken" }) }));

    const failure = await register("ada", "secret").catch((error) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 409, detail: "That username is taken", message: "That username is taken" });
  });

  it("rejects with an empty reason when the body has no text detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({ detail: [{ msg: "bad" }] }) }));
    await expect(getBoard(1)).rejects.toMatchObject({ status: 422, detail: "", message: "Request failed" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("not json")) }));
    await expect(getBoard(1)).rejects.toMatchObject({ status: 500, detail: "" });
  });
});
