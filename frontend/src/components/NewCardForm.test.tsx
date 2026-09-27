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

    expect(onAdd).toHaveBeenCalledWith({ title: "Plan API", details: "Notes", priority: null, due_date: null });
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

  it("does not submit a blank title", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText("Card title"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("sets a priority and due date on the new card", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText("Card title"), "Urgent");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "High");
    await userEvent.type(screen.getByLabelText("Due date"), "2026-10-01");
    await userEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(onAdd).toHaveBeenCalledWith({ title: "Urgent", details: "", priority: "high", due_date: "2026-10-01" });
  });
});
