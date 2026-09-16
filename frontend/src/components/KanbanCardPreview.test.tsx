import { render, screen } from "@testing-library/react";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";

it("renders the active card content", () => {
  render(
    <KanbanCardPreview
      card={{ id: "card-1", title: "Prepare release", details: "Confirm notes" }}
    />
  );

  expect(screen.getByRole("heading", { name: "Prepare release" })).toBeVisible();
  expect(screen.getByText("Confirm notes")).toBeVisible();
});