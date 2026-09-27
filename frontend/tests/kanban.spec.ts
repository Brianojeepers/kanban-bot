import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
};

test.afterEach(async ({ page }) => {
  const response = await page.request.get("/api/board");
  if (!response.ok()) return;
  const board = await response.json();
  for (const card of Object.values(board.cards) as { id: string; title: string }[]) {
    if (/^(Playwright card|Drag card|Adjacent move|Keyboard move) \d+$/.test(card.title)) await page.request.delete(`/api/cards/${card.id}`);
  }
});

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const title = `Playwright card ${Date.now()}`;
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(title);
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn).toContainText(title);
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const title = `Drag card ${Date.now()}`;
  const sourceColumn = page.getByTestId("column-col-backlog");
  await sourceColumn.getByRole("button", { name: /add a card/i }).click();
  await sourceColumn.getByPlaceholder("Card title").fill(title);
  await sourceColumn.getByRole("button", { name: /add card/i }).click();
  const card = sourceColumn.locator('[data-testid^="card-"]').filter({ hasText: title });
  const targetColumn = page.getByTestId("column-col-review");
  // The board scrolls sideways when the columns do not fit; bring the card in last so its handle stays on screen.
  await targetColumn.scrollIntoViewIfNeeded();
  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.getByRole("button", { name: `Move ${title}` }).boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    cardBox.y + cardBox.height / 2,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn).toContainText(title);
});

test("moves a card from Backlog to Discovery and back without duplication", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const title = `Adjacent move ${Date.now()}`;
  const backlog = page.getByTestId("column-col-backlog");
  const discovery = page.getByTestId("column-col-discovery");

  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill(title);
  await backlog.getByRole("button", { name: /add card/i }).click();

  const moveCard = async (source: typeof backlog, destination: typeof discovery) => {
    // Wait for the previous drop animation: its drag preview (the only card without a test id) intercepts the next press.
    await expect(page.locator("article:not([data-testid])")).toHaveCount(0);
    const card = source.locator('[data-testid^="card-"]').filter({ hasText: title });
    await card.scrollIntoViewIfNeeded();
    await destination.scrollIntoViewIfNeeded();
    const cardBox = await card.getByRole("button", { name: `Move ${title}` }).boundingBox();
    const destinationBox = await destination.boundingBox();
    if (!cardBox || !destinationBox) throw new Error("Unable to resolve drag coordinates.");
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(destinationBox.x + destinationBox.width / 2, cardBox.y + cardBox.height / 2, { steps: 12 });
    await page.mouse.up();
  };

  await moveCard(backlog, discovery);
  await expect(discovery).toContainText(title);
  await expect(backlog).not.toContainText(title);

  await moveCard(discovery, backlog);
  await expect(backlog).toContainText(title);
  await expect(discovery).not.toContainText(title);
});

test("moves a card down one place within its column", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const stamp = Date.now();
  const [first, second] = [`Drag card ${stamp}`, `Drag card ${stamp + 1}`];
  const backlog = page.getByTestId("column-col-backlog");
  for (const title of [first, second]) {
    await backlog.getByRole("button", { name: /add a card/i }).click();
    await backlog.getByPlaceholder("Card title").fill(title);
    await backlog.getByRole("button", { name: /add card/i }).click();
    await expect(backlog).toContainText(title);
  }

  const handleBox = await backlog.getByRole("button", { name: `Move ${first}` }).boundingBox();
  const targetBox = await backlog.locator('[data-testid^="card-"]').filter({ hasText: second }).boundingBox();
  if (!handleBox || !targetBox) throw new Error("Unable to resolve drag coordinates.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.mouse.up();

  const titles = backlog.locator('[data-testid^="card-"] h4');
  await expect(titles.filter({ hasText: /^Drag card/ })).toHaveText([second, first]);
  await page.reload();
  await expect(titles.filter({ hasText: /^Drag card/ })).toHaveText([second, first]);
});

test("moves a card to another column with the keyboard", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const title = `Keyboard move ${Date.now()}`;
  const backlog = page.getByTestId("column-col-backlog");
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill(title);
  await backlog.getByRole("button", { name: /add card/i }).click();

  const announcement = page.locator('[id^="DndLiveRegion"]');
  await backlog.getByRole("button", { name: `Move ${title}` }).focus();
  await page.keyboard.press("Space");
  await expect(announcement).toHaveText(`${title} is over Backlog.`);
  // dnd-kit attaches its arrow-key listener in a setTimeout after pick-up; a later zero-delay timer runs after it.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  await page.keyboard.press("ArrowRight");
  await expect(announcement).toHaveText(`${title} is over Discovery.`);
  await page.keyboard.press("Space");
  await expect(announcement).toHaveText(`Dropped ${title} in Discovery.`);

  await expect(page.getByTestId("column-col-discovery")).toContainText(title);
  await expect(backlog).not.toContainText(title);
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog")).toHaveCount(0);
});

test("logs out and keeps the board protected", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect((await page.request.get("/api/board")).status()).toBe(401);
});

test("fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "AI assistant" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});

test("hides the assistant so the board uses the full width", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const board = page.locator("main > section");
  const narrow = (await board.boundingBox())!.width;
  await page.getByRole("button", { name: "Hide AI assistant" }).click();
  await expect(page.getByRole("heading", { name: "AI assistant" })).toBeHidden();
  expect((await board.boundingBox())!.width).toBeGreaterThan(narrow);
  await page.getByRole("button", { name: "Open AI assistant" }).click();
  await expect(page.getByRole("heading", { name: "AI assistant" })).toBeVisible();
});

test("edits and deletes a card", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const title = `Playwright card ${Date.now()}`;
  const backlog = page.getByTestId("column-col-backlog");
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill(title);
  await backlog.getByRole("button", { name: /add card/i }).click();
  // Lock onto the card's test id: in edit mode its title is in an input, so a text filter stops matching.
  const testId = await backlog.locator('[data-testid^="card-"]').filter({ hasText: title }).getAttribute("data-testid");
  const card = page.getByTestId(testId!);

  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByLabel("Card details").fill("Edited in the browser.");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Edited in the browser.");
  await page.reload();
  await expect(card).toContainText("Edited in the browser.");

  await backlog.getByRole("button", { name: `Delete ${title}` }).click();
  await expect(backlog).not.toContainText(title);
});

test("shows a chat reply and applies the board it returns", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const title = `Playwright card ${Date.now()}`;
  await page.route("**/api/chat", async (route) => {
    const board = await (await page.request.get("/api/board")).json();
    board.cards["card-chat"] = { id: "card-chat", title, details: "From the assistant." };
    board.columns[0].cardIds.push("card-chat");
    const messages = [{ role: "user", content: "Add a card" }, { role: "assistant", content: "Added it." }];
    await route.fulfill({ json: { response: "Added it.", messages, board } });
  });

  const input = page.getByPlaceholder("Ask about your board");
  await input.fill("Add a card");
  await input.press("Enter");

  await expect(page.locator("aside").getByText("Added it.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog")).toContainText(title);
});
