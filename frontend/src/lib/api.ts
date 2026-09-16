import type { BoardData } from "@/lib/kanban";

const request = async (path: string, options?: RequestInit): Promise<BoardData> => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) throw new Error("Unable to update board");
  return response.json();
};

export const getBoard = () => request("/api/board");
export const renameColumn = (columnId: string, title: string) => request(`/api/columns/${columnId}`, { method: "PATCH", body: JSON.stringify({ title }) });
export const addCard = (columnId: string, title: string, details: string) => request(`/api/columns/${columnId}/cards`, { method: "POST", body: JSON.stringify({ title, details }) });
export const updateCard = (cardId: string, title: string, details: string) => request(`/api/cards/${cardId}`, { method: "PATCH", body: JSON.stringify({ title, details }) });
export const deleteCard = (cardId: string) => request(`/api/cards/${cardId}`, { method: "DELETE" });
export const moveBoardCard = (cardId: string, columnId: string, position: number) => request(`/api/cards/${cardId}/move`, { method: "POST", body: JSON.stringify({ column_id: columnId, position }) });