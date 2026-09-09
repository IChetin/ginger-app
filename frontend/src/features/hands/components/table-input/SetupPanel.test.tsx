import { useReducer, useState } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { SetupPanel, type SetupSheet } from "@/features/hands/components/table-input/SetupPanel";
import { STACK_DISPLAY_STORAGE_KEY } from "@/features/hands/lib/stackDisplay";
import { emptyTableInput, tableReducer } from "@/features/hands/lib/tableInputState";
import { renderWithProviders } from "@/test/render";

function renderSetup({
  stacks = {},
  sheet = "bar",
  playing = false,
}: {
  stacks?: Record<number, string>;
  sheet?: SetupSheet;
  playing?: boolean;
} = {}) {
  function Harness() {
    const [currentSheet, setSheet] = useState<SetupSheet>(sheet);
    const [state, dispatch] = useReducer(tableReducer, {
      ...emptyTableInput(),
      stacks,
    });
    return (
      <SetupPanel
        state={state}
        dispatch={dispatch}
        sheet={currentSheet}
        onSheetChange={setSheet}
        playing={playing}
        onResume={() => undefined}
      />
    );
  }
  return renderWithProviders(<Harness />);
}

describe("SetupPanel", () => {
  beforeEach(() => {
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });

  it("starts enabled with default chip blinds summary", () => {
    renderSetup();
    const start = screen.getByTestId("table-start-hand");
    expect(start).toBeEnabled();
    expect(start).toHaveTextContent("3 игрока");
    expect(screen.getByTestId("table-setup-panel")).toHaveTextContent("100 / 200 · анте 200");
    expect(screen.getByTestId("table-setup-panel")).toHaveTextContent("9 мест · без турнира");
    expect(screen.getByTestId("stack-display-toggle")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("table-setup-panel")).getByRole("button", { name: "Фишки" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("table-stacks-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ante-mode-toggle")).not.toBeInTheDocument();
  });

  it("blocks start when a stack is zero", () => {
    renderSetup({ stacks: { 2: "0" } });
    expect(screen.getByTestId("table-start-hand")).toBeDisabled();
    expect(screen.getByTestId("table-start-hint")).toHaveTextContent(
      "Стек должен быть больше нуля: Игрок 2",
    );
  });

  it("opens settings in a sheet and closes with Done", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    expect(within(sheet).queryByTestId("stack-display-toggle")).not.toBeInTheDocument();
    const anteToggle = within(sheet).getByTestId("ante-mode-toggle");
    expect(anteToggle).toHaveTextContent("изменить");
    expect(anteToggle).toHaveAttribute("aria-pressed", "false");
    expect(within(sheet).queryByRole("button", { name: "Все" })).not.toBeInTheDocument();
    expect(within(sheet).getByTestId("ante-mode-hint")).toHaveTextContent(
      "Анте платит только большой блайнд",
    );
    expect(within(sheet).getByTestId("setup-ante-stepper").className).not.toMatch(/flex-1/);
    const steppers = within(sheet).getAllByTestId("number-stepper");
    expect(steppers).toHaveLength(3);
    for (const stepper of steppers) {
      expect(stepper).toHaveClass("border-line-strong");
      expect(within(stepper).getByRole("button", { name: "Уменьшить" })).toBeEnabled();
      expect(within(stepper).getByRole("button", { name: "Увеличить" })).toBeEnabled();
      expect(within(stepper).getByRole("textbox").className).toMatch(/text-ink-3/);
    }
    expect(within(sheet).getByTestId("table-size-select")).toBeInTheDocument();
    expect(within(sheet).getByTestId("table-size-9")).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).queryByTestId("table-size-2")).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId("table-size-3")).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId("table-size-4")).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId("table-size-5")).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId("table-size-heads-up")).not.toBeInTheDocument();
    expect(screen.queryByTestId("table-stacks-list")).not.toBeInTheDocument();
    expect(within(sheet).getByTestId("hand-link-trigger")).toHaveTextContent("Не привязывать");
    expect(within(sheet).queryByTestId("hand-link-picker")).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId("hand-link-none")).not.toBeInTheDocument();
    await user.click(anteToggle);
    expect(within(sheet).getByTestId("ante-mode-hint")).toHaveTextContent(
      "Анте платит каждый игрок за столом",
    );
    expect(anteToggle).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("table-settings-done"));
    expect(screen.queryByTestId("table-settings-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("table-setup-panel")).toBeInTheDocument();
  });

  it("switches the blinds summary from the bar toggle", async () => {
    const user = userEvent.setup();
    renderSetup();
    const bar = screen.getByTestId("table-setup-panel");
    const toggle = within(bar).getByTestId("stack-display-toggle");
    await user.click(within(toggle).getByRole("button", { name: "BB" }));
    expect(bar).toHaveTextContent("0,5 / 1");
    expect(bar).toHaveTextContent("анте 1");
    expect(bar).toHaveTextContent("BB");
    expect(within(toggle).getByRole("button", { name: "BB" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(toggle).getByRole("button", { name: "Фишки" }));
    expect(bar).toHaveTextContent("100 / 200 · анте 200");
    expect(localStorage.getItem(STACK_DISPLAY_STORAGE_KEY)).toBe("chips");
  });

  it("lets you enter a stack in BB from the seat sheet", async () => {
    const user = userEvent.setup();
    renderSetup({ sheet: 2 });
    const sheet = screen.getByTestId("table-seat-sheet");
    const toggle = within(sheet).getByTestId("stack-display-toggle");
    expect(within(toggle).getByRole("button", { name: "BB" })).toBeEnabled();
    await user.click(within(toggle).getByRole("button", { name: "BB" }));
    const input = screen.getByTestId("stack-input") as HTMLInputElement;
    expect(input.value).toBe("100");
    expect(within(sheet).getByTestId("amount-bb-suffix")).toHaveTextContent("BB");
    await user.clear(input);
    await user.type(input, "58");
    expect(input.value).toBe("58");
    await user.click(within(toggle).getByRole("button", { name: "Фишки" }));
    expect(input.value.replace(/\s/g, "")).toBe("11600");
    expect(within(sheet).getByTestId("amount-chips-suffix")).toHaveTextContent("фишки");
  });

  it("lets you edit a default stack in the seat sheet", async () => {
    const user = userEvent.setup();
    renderSetup({ sheet: 2 });
    const input = screen.getByTestId("stack-input") as HTMLInputElement;
    expect(input.value.replace(/\s/g, "")).toBe("20000");
    expect(input.className).not.toMatch(/text-ink-3/);
    expect(screen.getByTestId("number-stepper-inc")).toBeEnabled();
    await user.click(screen.getByTestId("number-stepper-inc"));
    expect(input.value.replace(/\s/g, "")).toBe("20200");
    await user.clear(input);
    await user.type(input, "58000");
    expect(input.value.replace(/\s/g, "")).toBe("58000");
  });

  it("keeps chip blinds in settings after switching stacks to BB", async () => {
    const user = userEvent.setup();
    renderSetup({ sheet: 2 });
    await user.click(
      within(screen.getByTestId("table-seat-sheet")).getByRole("button", { name: "BB" }),
    );
    await user.click(screen.getByTestId("seat-edit-close"));
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    expect(within(sheet).getByDisplayValue("100")).toBeInTheDocument();
    expect(within(sheet).getAllByDisplayValue("200")).toHaveLength(2);
    expect(within(sheet).queryByDisplayValue("0,5")).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId("amount-bb-suffix")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("textbox", { name: "SB" }).className).toMatch(/text-ink-3/);
    expect(within(sheet).getByRole("textbox", { name: "BB" }).className).toMatch(/text-ink-3/);
    expect(within(sheet).getByRole("textbox", { name: "Анте" }).className).toMatch(/text-ink-3/);
  });

  it("recalculates the other two blinds from whichever field is edited", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    const sb = within(sheet).getByRole("textbox", { name: "SB" }) as HTMLInputElement;
    const bb = within(sheet).getByRole("textbox", { name: "BB" }) as HTMLInputElement;
    const ante = within(sheet).getByRole("textbox", { name: "Анте" }) as HTMLInputElement;
    expect(sb.value.replace(/\s/g, "")).toBe("100");
    expect(bb.value.replace(/\s/g, "")).toBe("200");
    expect(ante.value.replace(/\s/g, "")).toBe("200");

    await user.clear(ante);
    await user.type(ante, "300");
    expect(ante.value.replace(/\s/g, "")).toBe("300");
    expect(bb.value.replace(/\s/g, "")).toBe("300");
    expect(sb.value.replace(/\s/g, "")).toBe("150");
    expect(ante.className).not.toMatch(/text-ink-3/);
    expect(sb.className).toMatch(/text-ink-3/);
    expect(bb.className).toMatch(/text-ink-3/);

    await user.clear(bb);
    await user.type(bb, "400");
    expect(bb.value.replace(/\s/g, "")).toBe("400");
    expect(sb.value.replace(/\s/g, "")).toBe("200");
    expect(ante.value.replace(/\s/g, "")).toBe("400");
  });

  it("keeps blinds linked when using the steppers", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    const sb = within(sheet).getByRole("textbox", { name: "SB" }) as HTMLInputElement;
    const bb = within(sheet).getByRole("textbox", { name: "BB" }) as HTMLInputElement;
    const ante = within(sheet).getByRole("textbox", { name: "Анте" }) as HTMLInputElement;
    const steppers = within(sheet).getAllByTestId("number-stepper");

    await user.click(within(steppers[1]).getByRole("button", { name: "Увеличить" }));
    expect(bb.value.replace(/\s/g, "")).toBe("400");
    expect(sb.value.replace(/\s/g, "")).toBe("200");
    expect(ante.value.replace(/\s/g, "")).toBe("400");

    await user.click(within(steppers[0]).getByRole("button", { name: "Увеличить" }));
    expect(sb.value.replace(/\s/g, "")).toBe("600");
    expect(bb.value.replace(/\s/g, "")).toBe("1200");
    expect(ante.value.replace(/\s/g, "")).toBe("1200");

    await user.click(within(steppers[2]).getByRole("button", { name: "Увеличить" }));
    expect(ante.value.replace(/\s/g, "")).toBe("2400");
    expect(bb.value.replace(/\s/g, "")).toBe("2400");
    expect(sb.value.replace(/\s/g, "")).toBe("1200");
  });

  it("fills BB and ante from a typed SB", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    const sb = within(sheet).getByRole("textbox", { name: "SB" }) as HTMLInputElement;
    const bb = within(sheet).getByRole("textbox", { name: "BB" }) as HTMLInputElement;
    const ante = within(sheet).getByRole("textbox", { name: "Анте" }) as HTMLInputElement;
    await user.clear(sb);
    await user.type(sb, "250");
    expect(sb.value.replace(/\s/g, "")).toBe("250");
    expect(bb.value.replace(/\s/g, "")).toBe("500");
    expect(ante.value.replace(/\s/g, "")).toBe("500");
  });

  it("opens the tournament picker in a separate overlay", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("table-open-settings"));
    const sheet = screen.getByTestId("table-settings-sheet");
    expect(within(sheet).getByTestId("hand-link-trigger")).toBeInTheDocument();
    expect(within(sheet).queryByTestId("hand-link-picker")).not.toBeInTheDocument();
    await user.click(within(sheet).getByTestId("hand-link-trigger"));
    const picker = await screen.findByTestId("hand-link-picker");
    expect(picker).toBeInTheDocument();
    expect(within(sheet).queryByTestId("hand-link-picker")).not.toBeInTheDocument();
    expect(within(picker).getByRole("dialog", { name: "Турнир" }).className).toMatch(
      /max-w-\[420px\]/,
    );
    expect(within(picker).getByTestId("hand-link-search")).toBeInTheDocument();
    expect(within(picker).getByTestId("hand-link-none")).toHaveTextContent("Не привязывать");
  });

  it("does not offer remove on hero or BB", () => {
    renderSetup({ sheet: 1 });
    expect(screen.getByTestId("table-seat-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("table-seat-remove")).not.toBeInTheDocument();
    expect(screen.queryByTestId("table-seat-set-hero")).not.toBeInTheDocument();
  });

  it("allows removing SB and moving the hero", () => {
    renderSetup({ sheet: 2 });
    expect(screen.getByTestId("table-seat-remove")).toBeInTheDocument();
    expect(screen.getByTestId("table-seat-set-hero")).toBeInTheDocument();
  });

  it("does not offer remove on BB", () => {
    renderSetup({ sheet: 3 });
    expect(screen.queryByTestId("table-seat-remove")).not.toBeInTheDocument();
    expect(screen.getByTestId("table-seat-set-hero")).toBeInTheDocument();
  });

  it("shows Continue when opened during a hand", () => {
    renderSetup({ playing: true });
    expect(screen.getByTestId("table-resume-hand")).toHaveTextContent("Продолжить");
    expect(screen.queryByTestId("table-start-hand")).not.toBeInTheDocument();
  });
});
