import type { BoardData, BoardSummary, Priority } from "@/lib/kanban";

// Carries the server's reason (FastAPI's string `detail`) when there is one.
export class ApiError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(detail || "Request failed");
  }
}

// The server's reason for a failed request, or the fallback when there is none.
export const failureMessage = (failure: unknown, fallback: string) => (failure instanceof ApiError && failure.detail) || fallback;

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, typeof body?.detail === "string" ? body.detail : "");
  }
  return response.json();
};

const send = <T>(method: string, path: string, body?: unknown) => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export type CardFields = { title?: string; details?: string; priority?: Priority | null; due_date?: string | null; assignee?: string | null; labels?: string[] };

export const getSession = () => request<{ username: string }>("/api/session");
export const signIn = (username: string, password: string) => send<{ username: string }>("POST", "/api/login", { username, password });
export const register = (username: string, password: string) => send<{ username: string }>("POST", "/api/register", { username, password });
export const logout = () => send("POST", "/api/logout");
export const changePassword = (currentPassword: string, newPassword: string) => send("POST", "/api/account/password", { current_password: currentPassword, new_password: newPassword });
export const deleteAccount = (password: string) => send("DELETE", "/api/account", { password });

export const listBoards = () => request<BoardSummary[]>("/api/boards");
export const createBoard = (name: string) => send<BoardData>("POST", "/api/boards", { name });
export const renameBoard = (boardId: number, name: string) => send<BoardData>("PATCH", `/api/boards/${boardId}`, { name });
export const deleteBoard = (boardId: number) => send<BoardSummary[]>("DELETE", `/api/boards/${boardId}`);
export const addMember = (boardId: number, username: string) => send<BoardData>("POST", `/api/boards/${boardId}/members`, { username });
export const removeMember = (boardId: number, username: string) => send<BoardData>("DELETE", `/api/boards/${boardId}/members/${encodeURIComponent(username)}`);

export const getBoard = (boardId: number) => request<BoardData>(`/api/boards/${boardId}`);
export const renameColumn = (boardId: number, columnId: string, title: string) => send<BoardData>("PATCH", `/api/boards/${boardId}/columns/${columnId}`, { title });
export const addCard = (boardId: number, columnId: string, fields: CardFields & { title: string }) => send<BoardData>("POST", `/api/boards/${boardId}/columns/${columnId}/cards`, fields);
export const updateCard = (boardId: number, cardId: string, fields: CardFields) => send<BoardData>("PATCH", `/api/boards/${boardId}/cards/${cardId}`, fields);
export const deleteCard = (boardId: number, cardId: string) => send<BoardData>("DELETE", `/api/boards/${boardId}/cards/${cardId}`);
export const moveBoardCard = (boardId: number, cardId: string, columnId: string, position: number) => send<BoardData>("POST", `/api/boards/${boardId}/cards/${cardId}/move`, { column_id: columnId, position });

// author is the sender of a user message (null once their account is deleted).
export type ChatMessage = { role: string; content: string; author?: string | null };
export const getMessages = (boardId: number) => request<ChatMessage[]>(`/api/boards/${boardId}/messages`);
export const sendChat = (boardId: number, message: string) => send<{ messages: ChatMessage[]; board: BoardData }>("POST", `/api/boards/${boardId}/chat`, { message });

export type Comment = { id: number; author: string | null; content: string; createdAt: string };
export type ActivityEntry = { id: number; actor: string | null; action: string; createdAt: string };
type CommentsResult = { comments: Comment[]; board: BoardData };
export const getComments = (boardId: number, cardId: string) => request<Comment[]>(`/api/boards/${boardId}/cards/${cardId}/comments`);
export const addComment = (boardId: number, cardId: string, content: string) => send<CommentsResult>("POST", `/api/boards/${boardId}/cards/${cardId}/comments`, { content });
export const deleteComment = (boardId: number, cardId: string, commentId: number) => send<CommentsResult>("DELETE", `/api/boards/${boardId}/cards/${cardId}/comments/${commentId}`);
export const getActivity = (boardId: number) => request<ActivityEntry[]>(`/api/boards/${boardId}/activity`);

export type AssignedCard = { boardId: number; boardName: string; id: string; title: string; column: string; done: boolean; priority: Priority | null; dueDate: string | null };
export const getMyCards = () => request<AssignedCard[]>("/api/my-cards");

export type ArchivedCard = { id: string; title: string; column: string; archivedAt: string };
export const archiveCard = (boardId: number, cardId: string) => send<BoardData>("POST", `/api/boards/${boardId}/cards/${cardId}/archive`);
export const restoreCard = (boardId: number, cardId: string) => send<BoardData>("POST", `/api/boards/${boardId}/cards/${cardId}/restore`);
export const getArchivedCards = (boardId: number) => request<ArchivedCard[]>(`/api/boards/${boardId}/archive`);
export const deleteArchivedCard = (boardId: number, cardId: string) => send<ArchivedCard[]>("DELETE", `/api/boards/${boardId}/archive/${cardId}`);

export type ChecklistItem = { id: number; text: string; done: boolean };
type ChecklistResult = { items: ChecklistItem[]; board: BoardData };
export const getChecklist = (boardId: number, cardId: string) => request<ChecklistItem[]>(`/api/boards/${boardId}/cards/${cardId}/checklist`);
export const addChecklistItem = (boardId: number, cardId: string, text: string) => send<ChecklistResult>("POST", `/api/boards/${boardId}/cards/${cardId}/checklist`, { text });
export const updateChecklistItem = (boardId: number, cardId: string, itemId: number, fields: { text?: string; done?: boolean }) => send<ChecklistResult>("PATCH", `/api/boards/${boardId}/cards/${cardId}/checklist/${itemId}`, fields);
export const deleteChecklistItem = (boardId: number, cardId: string, itemId: number) => send<ChecklistResult>("DELETE", `/api/boards/${boardId}/cards/${cardId}/checklist/${itemId}`);
