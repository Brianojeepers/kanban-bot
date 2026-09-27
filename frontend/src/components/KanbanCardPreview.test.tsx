import { render, screen } from "@testing-library/react";
import { makeCard } from "@/test/fixtures";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";

it("renders the active card content", () => {
  render(
    <KanbanCardPreview
      card={makeCard("card-1", "Prepare release", "Confirm notes")}
    />
  );

  expect(screen.getByRole("heading", { name: "Prepare release" })).toBeVisible();
  expect(screen.getByText("Confirm notes")).toBeVisible();
});