import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewCardForm } from "@/components/NewCardForm";

describe("NewCardForm", () => {
  it("submits trimmed values and closes", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText("Card title"), "  Plan API  ");
    await userEvent.type(screen.getByPlaceholderText("Details"), "  Notes  ");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));

    expect(onAdd).toHaveBeenCalledWith("Plan API", "Notes");
    expect(screen.getByRole("button", { name: /add a card/i })).toBeVisible();
  });

  it("cancels and clears form values", async () => {
    render(<NewCardForm onAdd={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText("Card title"), "Discard me");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));

    expect(screen.getByPlaceholderText("Card title")).toHaveValue("");
  });
});