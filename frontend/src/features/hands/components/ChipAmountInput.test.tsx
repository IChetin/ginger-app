import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChipAmountInput } from "@/features/hands/components/ChipAmountInput";

describe("ChipAmountInput BB suffix", () => {
  it("puts BB in the flex row, not over the value", () => {
    render(
      <ChipAmountInput
        chips={200_000}
        bb={2000}
        mode="bb"
        onChange={vi.fn()}
        testId="amt"
        className="border px-2"
      />,
    );
    const input = screen.getByTestId("amt") as HTMLInputElement;
    const suffix = screen.getByTestId("amount-bb-suffix");
    expect(input.value).toBe("100");
    expect(input.parentElement).toBe(suffix.parentElement);
    expect(input.parentElement?.className).toMatch(/\bflex\b/);
    expect(input.parentElement?.className).toMatch(/items-center/);
    expect(input.className).toMatch(/flex-1/);
    expect(input.className).toMatch(/min-w-0/);
    expect(suffix.className).not.toMatch(/absolute/);
    expect(suffix.className).toMatch(/text-ink-3/);
    expect(suffix.className).not.toMatch(/font-extrabold/);
    expect(suffix.className).not.toMatch(/font-bold/);
  });

  it("keeps a 4-digit BB value beside the suffix", () => {
    render(
      <ChipAmountInput chips={2_000_000} bb={2000} mode="bb" onChange={vi.fn()} testId="amt" />,
    );
    expect((screen.getByTestId("amt") as HTMLInputElement).value.replace(/\s/g, "")).toBe("1000");
    expect(screen.getByTestId("amount-bb-suffix")).toHaveTextContent("BB");
  });

  it("shows an empty stack as the 100 BB default, not a grey placeholder", () => {
    render(
      <ChipAmountInput
        chips={null}
        bb={2000}
        mode="bb"
        placeholder="100"
        onChange={vi.fn()}
        testId="amt"
      />,
    );
    const input = screen.getByTestId("amt") as HTMLInputElement;
    expect(input.value).toBe("100");
    expect(input.className).toMatch(/text-ink/);
    expect(input.className).not.toMatch(/text-ink-3/);
    expect(screen.getByTestId("amount-bb-suffix")).toBeInTheDocument();
    expect(screen.getByTestId("number-stepper-inc")).toBeEnabled();
    expect(screen.getByTestId("number-stepper-dec")).toBeEnabled();
  });

  it("steps an empty stack from the 100 BB default", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipAmountInput chips={null} bb={200} mode="chips" onChange={onChange} testId="amt" />);
    const input = screen.getByTestId("amt") as HTMLInputElement;
    expect(input.value.replace(/\s/g, "")).toBe("20000");
    await user.click(screen.getByTestId("number-stepper-inc"));
    expect(onChange).toHaveBeenCalledWith(20_200);
    await user.click(screen.getByTestId("number-stepper-dec"));
    expect(onChange).toHaveBeenCalledWith(19_800);
  });

  it("shows the фишки suffix in chips mode", () => {
    render(
      <ChipAmountInput chips={2_000_000} bb={2000} mode="chips" onChange={vi.fn()} testId="amt" />,
    );
    expect((screen.getByTestId("amt") as HTMLInputElement).value.replace(/\s/g, "")).toBe(
      "2000000",
    );
    expect(screen.getByTestId("amount-chips-suffix")).toHaveTextContent("фишки");
    expect(screen.queryByTestId("amount-bb-suffix")).not.toBeInTheDocument();
  });

  it("steps stacks by the big blind in chips mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChipAmountInput chips={200_000} bb={2000} mode="chips" onChange={onChange} testId="amt" />,
    );
    await user.click(screen.getByTestId("number-stepper-inc"));
    expect(onChange).toHaveBeenCalledWith(202_000);
    await user.click(screen.getByTestId("number-stepper-dec"));
    expect(onChange).toHaveBeenCalledWith(198_000);
  });

  it("blocks decrement at one chip and at 0.5 BB", () => {
    const { rerender } = render(
      <ChipAmountInput chips={1} bb={2000} mode="chips" onChange={vi.fn()} testId="amt" />,
    );
    expect(screen.getByTestId("number-stepper-dec")).toBeDisabled();
    rerender(<ChipAmountInput chips={1000} bb={2000} mode="bb" onChange={vi.fn()} testId="amt" />);
    expect(screen.getByTestId("number-stepper-dec")).toBeDisabled();
    expect((screen.getByTestId("amt") as HTMLInputElement).value).toBe("0,5");
  });

  it("stores a typed zero so the parent can show an error", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChipAmountInput
        chips={0}
        bb={2000}
        mode="chips"
        onChange={onChange}
        testId="amt"
        error="Стек должен быть больше нуля"
      />,
    );
    expect((screen.getByTestId("amt") as HTMLInputElement).value).toBe("0");
    expect(screen.getByTestId("number-stepper-error")).toHaveTextContent(
      "Стек должен быть больше нуля",
    );
    await user.clear(screen.getByTestId("amt"));
    await user.type(screen.getByTestId("amt"), "0");
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("fills min from an empty bet field on increment", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChipAmountInput
        chips={null}
        bb={200}
        mode="chips"
        min={400}
        max={20_000}
        stepKind="bet"
        onChange={onChange}
        testId="amt"
      />,
    );
    expect((screen.getByTestId("amt") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("number-stepper-dec")).toBeDisabled();
    await user.click(screen.getByTestId("number-stepper-inc"));
    expect(onChange).toHaveBeenCalledWith(400);
  });
});
