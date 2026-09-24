import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
};

test.afterEach(async ({ page }) => {
  const board = await (await page.request.get("/api/board")).json();
  for (const card of Object.values(board.cards) as { id: string; title: string }[]) {
    if (/^(Playwright card|Drag card|Adjacent move) \d+$/.test(card.title)) await page.request.delete(`/api/cards/${card.id}`);
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
  await card.scrollIntoViewIfNeeded();
  await targetColumn.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
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
    columnBox.y + 120,
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
    const card = source.locator('[data-testid^="card-"]').filter({ hasText: title });
    await card.scrollIntoViewIfNeeded();
    await destination.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    const destinationBox = await destination.boundingBox();
    if (!cardBox || !destinationBox) throw new Error("Unable to resolve drag coordinates.");
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + 120, { steps: 12 });
    await page.mouse.up();
  };

  await moveCard(backlog, discovery);
  await expect(discovery).toContainText(title);
  await expect(backlog).not.toContainText(title);

  await moveCard(discovery, backlog);
  await expect(backlog).toContainText(title);
  await expect(discovery).not.toContainText(title);
});
