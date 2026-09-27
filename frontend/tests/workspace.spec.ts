import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page, username = "user", password = "password") => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

// Boards these tests create for the demo account, removed even when a test fails part way.
test.afterEach(async ({ page }) => {
  const response = await page.request.get("/api/boards");
  if (!response.ok()) return;
  for (const board of (await response.json()) as { id: number; name: string; owner: string }[]) {
    if (board.owner === "user" && /^(Side project|Long column|Filters|Shared|Comments|Labels|My work|Archive|New card) \d+$/.test(board.name)) await page.request.delete(`/api/boards/${board.id}`);
  }
});

// Registration is rate limited per address (5 an hour), so the whole account lifecycle runs as one test.
test("registers, manages boards and cards, changes the password and deletes the account", async ({ page }) => {
  const username = `e2e-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("first password");
  await page.getByRole("button", { name: "Create account" }).click();

  const boardSelect = page.getByLabel("Board", { exact: true });
  await expect(boardSelect.locator("option:checked")).toHaveText("My first board");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  // A second board, with a card that has a priority and due date.
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Launch plan");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(boardSelect.locator("option:checked")).toHaveText("Launch plan");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Book venue");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await firstColumn.getByRole("button", { name: "Edit Book venue" }).click();
  await firstColumn.getByLabel("Priority").selectOption("high");
  await firstColumn.getByLabel("Due date").fill("2000-01-02");
  await firstColumn.getByRole("button", { name: "Save" }).click();
  await expect(firstColumn).toContainText("High priority");
  await expect(firstColumn).toContainText("Due Jan 2, overdue");

  await page.getByRole("button", { name: "Rename board" }).click();
  await page.getByLabel("Board name").fill("Launch 2027");
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();

  // The first board opens after a reload; the other board kept its name and card.
  await expect(boardSelect.locator("option:checked")).toHaveText("My first board");
  await boardSelect.selectOption({ label: "Launch 2027" });
  await expect(page.locator('[data-testid^="column-"]').first()).toContainText("Book venue");
  await expect(page.locator('[data-testid^="column-"]').first()).toContainText("High priority");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(boardSelect.locator("option")).toHaveText(["My first board"]);
  await expect(page.getByRole("button", { name: "Delete board" })).toBeDisabled();

  // Changing the password keeps this session and replaces the old password.
  await page.getByRole("button", { name: "Account settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  await dialog.getByLabel("Current password").fill("first password");
  await dialog.getByLabel("New password", { exact: true }).fill("second password");
  await dialog.getByLabel("Confirm new password").fill("second password");
  await dialog.getByRole("button", { name: "Change password" }).click();
  await expect(dialog.getByRole("status")).toContainText("Password changed.");
  await dialog.getByRole("button", { name: "Close account settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, username, "first password");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await signIn(page, username, "second password");
  await expect(boardSelect).toBeVisible();

  await page.getByRole("button", { name: "Account settings" }).click();
  await dialog.getByLabel("Password", { exact: true }).fill("second password");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await signIn(page, username, "second password");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});

test("keeps each board's cards and chat separate", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const boardSelect = page.getByLabel("Board", { exact: true });
  const name = `Side project ${Date.now()}`;
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(boardSelect.locator("option:checked")).toHaveText(name);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);
  await expect(page.locator("aside")).toContainText("Ask the assistant");

  await boardSelect.selectOption({ index: 0 });
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
});

test("moves a card with the keyboard from the bottom of a long, scrolled column", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  const board = await (await page.request.post("/api/boards", { data: { name: `Long column ${Date.now()}` } })).json();
  const [first, second] = board.columns;
  for (let number = 1; number <= 12; number++) await page.request.post(`/api/boards/${board.id}/columns/${first.id}/cards`, { data: { title: `Task ${number}` } });
  await page.reload();
  await page.getByLabel("Board", { exact: true }).selectOption(String(board.id));

  const announcement = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole("button", { name: "Move Task 12" }).focus();
  await page.keyboard.press("Space");
  await expect(announcement).toHaveText(`Task 12 is over ${first.title}.`);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  await page.keyboard.press("ArrowRight");
  await expect(announcement).toHaveText(`Task 12 is over ${second.title}.`);
  await page.keyboard.press("Space");
  await expect(page.getByTestId(`column-${second.id}`)).toContainText("Task 12");
});

test("filters the board by text, priority and overdue cards", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  const board = await (await page.request.post("/api/boards", { data: { name: `Filters ${Date.now()}` } })).json();
  const column = board.columns[0].id;
  for (const card of [
    { title: "Write launch post", priority: "high" },
    { title: "Order stickers", due_date: "2000-01-01" },
    { title: "Plan retro", details: "Book a room for the launch retro" },
  ]) await page.request.post(`/api/boards/${board.id}/columns/${column}/cards`, { data: card });
  await page.reload();
  await page.getByLabel("Board", { exact: true }).selectOption(String(board.id));
  const cards = page.locator('[data-testid^="card-"] h4');
  await expect(cards).toHaveCount(3);
  await expect(page.getByText("1 overdue")).toBeVisible();

  await page.getByPlaceholder("Search cards").fill("launch");
  await expect(cards).toHaveText(["Write launch post", "Plan retro"]);
  await expect(page.getByText("Showing 2 of 3 cards")).toBeVisible();
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(cards).toHaveText(["Write launch post"]);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by due date").selectOption("overdue");
  await expect(cards).toHaveText(["Order stickers"]);
});

test("shares a board with another user, who can assign cards and leave", async ({ page, browser }) => {
  // A long-lived member account: registered on the first run only, to stay within the registration limit.
  const member = await browser.newContext();
  const memberPage = await member.newPage();
  const credentials = { username: "e2e-member", password: "member password" };
  if (!(await memberPage.request.post("/api/login", { data: credentials })).ok()) {
    expect((await memberPage.request.post("/api/register", { data: credentials })).ok()).toBe(true);
  }

  await page.goto("/");
  await signIn(page);
  const boardSelect = page.getByLabel("Board", { exact: true });
  await expect(boardSelect).toBeVisible();
  const name = `Shared ${Date.now()}`;
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(boardSelect.locator("option:checked")).toHaveText(name);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Shared task");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  await page.getByRole("button", { name: "Share board" }).click();
  const dialog = page.getByRole("dialog", { name: "Share board" });
  await dialog.getByLabel("Add a member by username").fill("e2e-member");
  await dialog.getByRole("button", { name: "Add member" }).click();
  await expect(dialog.getByRole("list", { name: "Members" })).toContainText("e2e-member");
  await dialog.getByRole("button", { name: "Close sharing" }).click();

  // The member sees the board, labelled with its owner, and assigns the card to themselves.
  await memberPage.goto("/");
  const memberSelect = memberPage.getByLabel("Board", { exact: true });
  await memberSelect.selectOption({ label: `${name} (user)` });
  await expect(memberPage.getByRole("button", { name: "Rename board" })).toBeDisabled();
  const card = memberPage.locator('[data-testid^="card-"]').filter({ hasText: "Shared task" });
  await card.getByRole("button", { name: "Edit Shared task" }).click();
  await memberPage.getByLabel("Assignee", { exact: true }).selectOption("e2e-member");
  await memberPage.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Assigned to e2e-member");

  await page.reload();
  await boardSelect.selectOption({ label: name });
  await expect(page.locator('[data-testid^="card-"]').filter({ hasText: "Shared task" })).toContainText("e2e-member");
  await page.getByLabel("Filter by assignee").selectOption("e2e-member");
  await expect(page.getByText("Showing 1 of 1 cards")).toBeVisible();

  await memberPage.getByRole("button", { name: "Share board" }).click();
  await memberPage.getByRole("button", { name: "Leave board" }).click();
  await expect(memberSelect.locator("option", { hasText: name })).toHaveCount(0);

  await page.reload();
  await boardSelect.selectOption({ label: name });
  await expect(page.locator('[data-testid^="card-"]').filter({ hasText: "Shared task" })).not.toContainText("e2e-member");
  await member.close();
});

test("comments on a card and shows the board's activity", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const boardSelect = page.getByLabel("Board", { exact: true });
  await expect(boardSelect).toBeVisible();
  const name = `Comments ${Date.now()}`;
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(boardSelect.locator("option:checked")).toHaveText(name);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Discuss scope");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  await firstColumn.getByRole("button", { name: "Open Discuss scope" }).click();
  const dialog = page.getByRole("dialog", { name: "Discuss scope" });
  await expect(dialog).toContainText("No comments yet.");
  await dialog.getByLabel("New comment").fill("Let's cut the export feature.");
  await dialog.getByRole("button", { name: "Add comment" }).click();
  await expect(dialog.getByRole("list", { name: "Comments" })).toContainText("Let's cut the export feature.");
  await dialog.getByRole("button", { name: "Close card" }).click();
  await expect(firstColumn).toContainText("1 comment");
  await page.reload();
  await boardSelect.selectOption({ label: name });
  await expect(page.locator('[data-testid^="column-"]').first()).toContainText("1 comment");

  await page.getByRole("button", { name: "Board activity" }).click();
  await expect(page.getByRole("list", { name: "Recent activity" }).getByRole("listitem")).toHaveText([
    /^user commented on "Discuss scope"/,
    /^user added "Discuss scope" to Backlog/,
    /^user created the board/,
  ]);
  await page.getByRole("button", { name: "Close activity" }).click();
});

test("labels cards and filters the board by label", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  const board = await (await page.request.post("/api/boards", { data: { name: `Labels ${Date.now()}` } })).json();
  const column = board.columns[0].id;
  for (const title of ["Fix login bug", "Write docs"]) await page.request.post(`/api/boards/${board.id}/columns/${column}/cards`, { data: { title } });
  await page.reload();
  await page.getByLabel("Board", { exact: true }).selectOption(String(board.id));

  // Lock onto the test id: in edit mode the title is in an input, so a text filter stops matching.
  const testId = await page.locator('[data-testid^="card-"]').filter({ hasText: "Fix login bug" }).getAttribute("data-testid");
  const card = page.getByTestId(testId!);
  await card.getByRole("button", { name: "Edit Fix login bug" }).click();
  await card.getByLabel("Labels").fill("bug, auth");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Label: auth");
  await expect(card).toContainText("Label: bug");

  await page.getByLabel("Filter by label").selectOption("bug");
  await expect(page.locator('[data-testid^="card-"] h4')).toHaveText(["Fix login bug"]);
  await page.reload();
  await page.getByLabel("Board", { exact: true }).selectOption(String(board.id));
  await expect(page.locator('[data-testid^="card-"]').filter({ hasText: "Fix login bug" })).toContainText("Label: bug");
});

test("lists my assigned cards across boards and opens their board", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const boardSelect = page.getByLabel("Board", { exact: true });
  await expect(boardSelect).toBeVisible();
  const name = `My work ${Date.now()}`;
  const board = await (await page.request.post("/api/boards", { data: { name } })).json();
  await page.request.post(`/api/boards/${board.id}/columns/${board.columns[0].id}/cards`, { data: { title: "Assigned to me", assignee: "user", due_date: "2000-01-02" } });

  await page.getByRole("button", { name: "My work" }).click();
  const item = page.getByRole("list", { name: "Assigned cards" }).getByRole("button", { name: /^Assigned to me/ }).filter({ hasText: name });
  await expect(item).toContainText(`${name} · Backlog`);
  await expect(item).toContainText("Overdue, Jan 2");
  await item.click();
  await expect(boardSelect.locator("option:checked")).toHaveText(name);
  await expect(page.locator('[data-testid^="card-"]')).toContainText("Assigned to me");
});

test("tracks a checklist on a card, then archives and restores the card", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  const board = await (await page.request.post("/api/boards", { data: { name: `Archive ${Date.now()}` } })).json();
  for (const title of ["Launch checklist", "Stays put"]) await page.request.post(`/api/boards/${board.id}/columns/${board.columns[0].id}/cards`, { data: { title } });
  await page.reload();
  await page.getByLabel("Board", { exact: true }).selectOption(String(board.id));
  const column = page.locator('[data-testid^="column-"]').first();

  await column.getByRole("button", { name: "Open Launch checklist" }).click();
  const dialog = page.getByRole("dialog", { name: "Launch checklist" });
  for (const item of ["Book room", "Send invites"]) {
    await dialog.getByLabel("New checklist item").fill(item);
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByRole("list", { name: "Checklist" })).toContainText(item);
  }
  await dialog.getByRole("checkbox", { name: "Book room" }).check();
  await expect(dialog).toContainText("1 of 2 done");
  await dialog.getByRole("button", { name: "Close card" }).click();
  await expect(column).toContainText("1/2 checklist items done");

  await column.getByRole("button", { name: "Archive Launch checklist" }).click();
  await expect(page.locator('[data-testid^="card-"] h4')).toHaveText(["Stays put"]);
  await page.getByRole("button", { name: "Archived cards" }).click();
  const archive = page.getByRole("dialog", { name: "Archived cards" });
  await expect(archive).toContainText("From Backlog, archived");
  await archive.getByRole("button", { name: "Restore Launch checklist" }).click();
  await expect(archive).toContainText("No archived cards.");
  await archive.getByRole("button", { name: "Close archived cards" }).click();
  await expect(page.locator('[data-testid^="card-"] h4')).toHaveText(["Stays put", "Launch checklist"]);
  await expect(column).toContainText("1/2 checklist items done");
});

test("adds a card with a priority and due date that stays visible under a filter, and explains icons on hover", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  const board = await (await page.request.post("/api/boards", { data: { name: `New card ${Date.now()}` } })).json();
  await page.request.post(`/api/boards/${board.id}/columns/${board.columns[0].id}/cards`, { data: { title: "Already urgent", priority: "high" } });
  await page.reload();
  await page.getByLabel("Board", { exact: true }).selectOption(String(board.id));
  await page.getByLabel("Filter by priority").selectOption("high");

  const column = page.locator('[data-testid^="column-"]').first();
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Low but due");
  await column.getByLabel("Priority").selectOption("low");
  await column.getByLabel("Due date").fill(today);
  await column.getByRole("button", { name: /add card/i }).click();
  const card = column.locator('[data-testid^="card-"]').filter({ hasText: "Low but due" });
  await expect(card).toContainText("Low priority");
  await expect(card).toContainText("due today");
  await expect(page.getByText("1 due soon")).toBeVisible();

  const edit = card.getByRole("button", { name: "Edit Low but due" });
  await card.hover();
  await edit.hover();
  await expect.poll(() => edit.evaluate((element) => getComputedStyle(element, "::after").opacity)).toBe("1");
  expect(await edit.evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"Edit title, details, priority, due date, labels and assignee"');
});
