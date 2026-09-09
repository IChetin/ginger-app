import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NumberStepper } from "@/components/ui/NumberStepper";

describe("NumberStepper", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("steps from the buttons and arrow keys", async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    render(
      <NumberStepper onStep={onStep} canDecrement canIncrement>
        <input aria-label="amount" defaultValue="1000" />
      </NumberStepper>,
    );
    await user.click(screen.getByTestId("number-stepper-inc"));
    await user.click(screen.getByTestId("number-stepper-dec"));
    fireEvent.keyDown(screen.getByLabelText("amount"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByLabelText("amount"), { key: "ArrowDown" });
    expect(onStep.mock.calls.map((call) => call[0])).toEqual([1, -1, 1, -1]);
  });

  it("blocks buttons at the bounds and shows the max hint", () => {
    const onStep = vi.fn();
    render(
      <NumberStepper
        onStep={onStep}
        canDecrement={false}
        canIncrement={false}
        incrementHint="Больше стека"
      >
        <input aria-label="amount" defaultValue="200000" />
      </NumberStepper>,
    );
    expect(screen.getByTestId("number-stepper-inc")).toBeDisabled();
    expect(screen.getByTestId("number-stepper-dec")).toBeDisabled();
    expect(screen.getByTestId("number-stepper-max-hint")).toHaveTextContent("Больше стека");
  });

  it("shows a field error instead of the max hint", () => {
    render(
      <NumberStepper
        onStep={vi.fn()}
        canDecrement={false}
        canIncrement={false}
        incrementHint="Больше стека"
        error="Стек должен быть больше нуля"
      >
        <input aria-label="amount" defaultValue="0" />
      </NumberStepper>,
    );
    expect(screen.getByTestId("number-stepper-error")).toHaveTextContent(
      "Стек должен быть больше нуля",
    );
    expect(screen.queryByTestId("number-stepper-max-hint")).not.toBeInTheDocument();
  });

  it("repeats faster after a 500ms hold", () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    render(
      <NumberStepper onStep={onStep} canDecrement canIncrement>
        <input aria-label="amount" defaultValue="1000" />
      </NumberStepper>,
    );
    fireEvent.pointerDown(screen.getByTestId("number-stepper-inc"), { button: 0 });
    expect(onStep).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onStep).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStep).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(onStep.mock.calls.length).toBeGreaterThanOrEqual(3);
    fireEvent.pointerUp(window);
  });

  it("vibrates on a step when the API exists", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const user = userEvent.setup();
    render(
      <NumberStepper onStep={vi.fn()} canDecrement canIncrement>
        <input aria-label="amount" />
      </NumberStepper>,
    );
    await user.click(screen.getByTestId("number-stepper-inc"));
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});
