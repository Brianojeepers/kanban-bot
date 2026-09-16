import { addCard, deleteCard, getBoard, moveBoardCard, renameColumn } from "@/lib/api";

const board = { columns: [], cards: {} };

describe("board API client", () => {
  it("uses the expected endpoints and request bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(board) });
    vi.stubGlobal("fetch", fetchMock);

    await getBoard();
    await renameColumn("col-1", "Ideas");
    await addCard("col-1", "Plan", "Notes");
    await deleteCard("card-1");
    await moveBoardCard("card-1", "col-2", 3);

    expect(fetchMock).toHaveBeenCalledWith("/api/board", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/cards/card-1/move", expect.objectContaining({ method: "POST", body: JSON.stringify({ column_id: "col-2", position: 3 }) }));
  });

  it("rejects failed API responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(getBoard()).rejects.toThrow("Unable to update board");
  });
});