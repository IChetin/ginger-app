import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HandRead } from "@/api/types/hands";
import { HandWizardPage } from "@/features/hands/pages/HandWizardPage";
import {
  clearHandDraft,
  emptyLocalDraft,
  getLocalDraft,
  putLocalDraft,
} from "@/features/hands/lib/draftIdb";
import { STACK_DISPLAY_STORAGE_KEY } from "@/features/hands/lib/stackDisplay";
import { emptyWizard, type WizardState } from "@/features/hands/lib/wizardState";
import { renderWithProviders } from "@/test/render";

const publishHand = vi.hoisted(() => vi.fn());
const createHandDraft = vi.hoisted(() => vi.fn());
const patchHandDraft = vi.hoisted(() => vi.fn());

vi.mock("@/features/hands/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/hands/api")>();
  return {
    ...actual,
    publishHand: (...args: unknown[]) => publishHand(...args),
    createHandDraft: (...args: unknown[]) => createHandDraft(...args),
    patchHandDraft: (...args: unknown[]) => patchHandDraft(...args),
  };
});

vi.mock("@/features/hands/lib/useEquity", () => ({
  useEquity: (holes: string[][] | null) => ({
    result: holes && holes.length >= 1 ? { values: [0.85, 0.15], exact: false } : null,
    failed: false,
  }),
}));

const DRAFT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function renderDraftWizard() {
  return renderWithProviders(
    <Routes>
      <Route path="/hand/draft/:draftId" element={<HandWizardPage />} />
    </Routes>,
    { route: `/hand/draft/${DRAFT_ID}` },
  );
}

async function seedDraft(state: WizardState) {
  await putLocalDraft(emptyLocalDraft(DRAFT_ID, state));
}

async function selectTableSize(user: ReturnType<typeof userEvent.setup>, size: number) {
  await user.selectOptions(screen.getByTestId("table-size-select"), String(size));
}

async function goToStreet(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => screen.getByTestId("hand-wizard"));
  await selectTableSize(user, 3);
  await user.click(screen.getByTestId("wizard-next"));
  await user.click(screen.getByRole("button", { name: "As" }));
  await user.click(screen.getByRole("button", { name: "Kd" }));
  await user.click(screen.getByTestId("wizard-next"));
  expect(screen.getByTestId("street-queue")).toBeInTheDocument();
}

describe("HandWizardPage layout", () => {
  beforeEach(async () => {
    publishHand.mockReset();
    createHandDraft.mockReset();
    patchHandDraft.mockReset();
    createHandDraft.mockResolvedValue({ id: DRAFT_ID, status: "draft", slug: "dR4ftSlugA" });
    patchHandDraft.mockResolvedValue({ id: DRAFT_ID, status: "draft", slug: "dR4ftSlugA" });
    await clearHandDraft();
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });
  it("blinds and stacks can shrink; wizard clips horizontal overflow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    const wizard = await waitFor(() => screen.getByTestId("hand-wizard"));
    expect(wizard.className).toMatch(/overflow-x-clip/);
    expect(wizard.className).toMatch(/min-w-0/);

    const row = screen.getByTestId("blinds-row");
    expect(row.className).toMatch(/min-w-0/);
    const fields = row.querySelectorAll("label");
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field.className).toMatch(/min-w-0/);
      expect(field.className).toMatch(/flex-1/);
      const input = field.querySelector("input");
      expect(input?.className).toMatch(/min-w-0/);
      expect(input?.className).toMatch(/flex-1/);
      expect(field.querySelector("[data-testid='number-stepper']")).toBeTruthy();
    }

    await user.click(screen.getByTestId("seat-row-1"));
    const stack = screen.getByTestId("stack-input");
    expect(stack.className).toMatch(/min-w-0/);
    expect(stack.className).toMatch(/flex-1/);
    expect(stack.className).not.toMatch(/min-w-\[7/);
    const frame = stack.closest("[data-testid='number-stepper']");
    expect(frame?.className).toMatch(/min-w-0/);
    expect(frame?.className).toMatch(/w-full/);
    expect(stack.parentElement?.className).toMatch(/\bflex\b/);
  });

  it("renames an opponent from the seat list and keeps the hero as Вы", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    await user.click(screen.getByRole("button", { name: "Переименовать: Игрок 2" }));
    await user.clear(screen.getByTestId("seat-name-input"));
    await user.type(screen.getByTestId("seat-name-input"), "Рег из Минска");
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Переименовать: Рег из Минска" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("seat-name-1")).toHaveTextContent("Вы");
    await user.click(screen.getByTestId("seat-edit-close"));
    await user.click(screen.getByRole("button", { name: "Переименовать: Рег из Минска" }));
    await user.clear(screen.getByTestId("seat-name-input"));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Переименовать: Игрок 2" })).toBeInTheDocument();
  });

  it("places SB and BB on one row and ante beside the mode toggle", async () => {
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const row = screen.getByTestId("blinds-row");
    expect(row.className).toMatch(/flex-col/);
    const labels = [...row.querySelectorAll("label")].map(
      (field) => field.querySelector("span")?.textContent,
    );
    expect(labels).toEqual(["SB", "BB", "Анте"]);
    expect(row.contains(screen.getByTestId("ante-mode-toggle"))).toBe(true);
  });

  it("shows a hint when tapping the hero seat", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const hero = screen.getByRole("button", { name: "BTN" });
    expect(hero.getAttribute("data-required")).toBe("1");
    await user.click(hero);
    expect(screen.getByTestId("seat-toast")).toHaveTextContent("Это ваше место");
  });

  it("keeps BB selected and explains why", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const bb = within(screen.getByTestId("mini-table")).getByRole("button", { name: "BB" });
    expect(bb.getAttribute("data-required")).toBe("1");
    await user.click(bb);
    expect(screen.getByTestId("seat-toast")).toHaveTextContent(
      "Без большого блайнда раздачи не бывает",
    );
    expect(bb.getAttribute("data-required")).toBe("1");
  });

  it("allows unmarking SB with a dead-button hint", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const sb = screen.getByRole("button", { name: "SB" });
    expect(sb.getAttribute("data-required")).toBe("0");
    await user.click(sb);
    expect(screen.getByTestId("seat-toast")).toHaveTextContent("Малого блайнда нет (dead button)");
    expect(sb.getAttribute("data-required")).toBe("0");
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
  });

  it("shows the mini-table first on step 1", async () => {
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    const mini = await waitFor(() => screen.getByTestId("mini-table"));
    expect(mini).toBeVisible();
    expect(screen.getByTestId("wizard-header-more")).toBeInTheDocument();
    expect(screen.getByTestId("mini-felt")).toBeVisible();
    const felt = screen.getByTestId("mini-felt");
    expect(felt.className).toMatch(/min-h-\[216px\]/);
    const sizeSelect = screen.getByTestId("table-size-select");
    expect(sizeSelect).toHaveValue("6");
    expect(
      mini.compareDocumentPosition(sizeSelect) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Стол · 6 мест · 3 игрока")).toBeInTheDocument();
  });

  it("locks both heads-up seats", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    await selectTableSize(user, 2);
    const table = screen.getByTestId("mini-table");
    expect(within(table).getAllByRole("button")).toHaveLength(2);
    expect(within(table).getByRole("button", { name: "BTN" }).getAttribute("data-required")).toBe(
      "1",
    );
    expect(within(table).getByRole("button", { name: "BB" }).getAttribute("data-required")).toBe(
      "1",
    );
  });

  it("occupies every seat of the selected size", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const table = screen.getByTestId("mini-table");
    expect(within(table).getAllByRole("button")).toHaveLength(6);
    await selectTableSize(user, 3);
    expect(within(table).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("Стол · 3 места")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "SB" }));
    expect(screen.getByText("Стол · 3 места · 2 игрока")).toBeInTheDocument();
  });

  it("disables next on the street until betting is closed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(screen.getByText("ходит")).toBeInTheDocument();
  });

  it("undoes an action with Ctrl+Z", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(screen.getByText("фолд")).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.queryByText("фолд")).not.toBeInTheDocument();
    expect(screen.getByText("ходит")).toBeInTheDocument();
  });

  it("goes back from flop to preflop actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: "Чек" }));
    await user.click(screen.getByTestId("wizard-next"));
    await user.click(screen.getByRole("button", { name: "Ks" }));
    await user.click(screen.getByRole("button", { name: "9h" }));
    await user.click(screen.getByRole("button", { name: "4d" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Флоп");
    await user.click(screen.getByTestId("wizard-back"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Префлоп");
    expect(screen.getAllByText(/колл/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Выберите карты борда")).not.toBeInTheDocument();
  });

  it("switches streets from the street tabs without dropping actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    expect(screen.getByTestId("street-tabs")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: "Чек" }));
    await user.click(screen.getByTestId("street-tab-flop"));
    await user.click(screen.getByRole("button", { name: "Ks" }));
    await user.click(screen.getByRole("button", { name: "9h" }));
    await user.click(screen.getByRole("button", { name: "4d" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Флоп");
    expect(screen.getByTestId("street-tab-flop")).toHaveAttribute("data-state", "current");
    await user.click(screen.getByTestId("street-tab-preflop"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Префлоп");
    expect(screen.getAllByText(/колл/).length).toBeGreaterThan(0);
    await user.click(screen.getByTestId("street-tab-flop"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Флоп");
    expect(screen.getByTestId("street-tab-flop")).toHaveAttribute("data-state", "current");
  });

  it("hides street tabs on steps 1, 2 and 4", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    expect(screen.queryByTestId("street-tabs")).not.toBeInTheDocument();
    await selectTableSize(user, 3);
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.queryByTestId("street-tabs")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "As" }));
    await user.click(screen.getByRole("button", { name: "Kd" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("street-tabs")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByText("Итог раздачи")).toBeInTheDocument();
    expect(screen.queryByTestId("street-tabs")).not.toBeInTheDocument();
  });

  it("keeps StickyHeader and step labels on every wizard step", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    expect(screen.getByTestId("sticky-header")).toBeInTheDocument();
    expect(screen.getByTestId("sticky-header").className).toMatch(/safe-area-inset-top/);
    expect(screen.getByTestId("wizard-steps")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-1")).toHaveTextContent("Стол");
    expect(screen.getByTestId("wizard-step-2")).toHaveTextContent("Карты");
    expect(screen.getByTestId("wizard-step-3")).toHaveTextContent("Действия");
    expect(screen.getByTestId("wizard-step-4")).toHaveTextContent("Итог");
    expect(screen.getByTestId("wizard-step-2").querySelector("span")?.className).toMatch(
      /max-\[379px\]:hidden/,
    );
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();

    await goToStreet(user);
    expect(screen.getByTestId("sticky-header")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-steps")).toBeInTheDocument();
    const undoOnStreet = screen.getByTestId("wizard-header-undo");
    expect(undoOnStreet).toBeInTheDocument();
    expect(undoOnStreet).toBeDisabled();
    expect(undoOnStreet).toHaveAttribute("aria-label", "Отменить последнее действие");

    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByText("Итог раздачи")).toBeInTheDocument();
    expect(screen.getByTestId("sticky-header")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-steps")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-4")).toHaveAttribute("data-state", "current");
  });

  it("does not jump forward to a step that is not reached yet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    await user.click(screen.getByTestId("wizard-step-3"));
    expect(screen.getByText("Стол и игроки")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-hint")).toHaveTextContent(
      "Сначала заполните текущий шаг",
    );
    expect(screen.queryByTestId("street-queue")).not.toBeInTheDocument();
  });

  it("warns when going back to the lineup after actions and keeps them if nothing changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(screen.getAllByText("фолд")).toHaveLength(2);

    await user.click(screen.getByTestId("wizard-step-1"));
    expect(screen.getByText("Изменить состав игроков?")).toBeInTheDocument();
    expect(
      screen.getByText("Изменение состава удалит введённые действия (2 шт.). Продолжить?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByTestId("street-queue")).toBeInTheDocument();
    expect(screen.getAllByText("фолд")).toHaveLength(2);

    await user.click(screen.getByTestId("wizard-back"));
    expect(screen.getByText("Изменить карты?")).toBeInTheDocument();
    expect(
      screen.getByText("Изменение карт удалит введённые действия (2 шт.). Продолжить?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByTestId("street-queue")).toBeInTheDocument();

    await user.click(screen.getByTestId("wizard-step-1"));
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByText("Стол и игроки")).toBeInTheDocument();

    await user.click(screen.getByTestId("wizard-step-3"));
    expect(screen.getByTestId("street-queue")).toBeInTheDocument();
    expect(screen.getAllByText("фолд")).toHaveLength(2);
  });

  it("wipes actions after the lineup actually changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByTestId("wizard-step-1"));
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await selectTableSize(user, 6);
    await user.click(screen.getByTestId("wizard-step-3"));
    expect(screen.getByText("Стол и игроки")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-hint")).toHaveTextContent(
      "Сначала заполните текущий шаг",
    );

    await user.click(screen.getByTestId("wizard-next"));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("street-queue")).toBeInTheDocument();
    expect(screen.queryByText("фолд")).not.toBeInTheDocument();
  });

  it("edits flop cards after actions without a warning", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: /Колл/ }));
    await user.click(screen.getByRole("button", { name: "Чек" }));
    await user.click(screen.getByTestId("wizard-next"));
    await user.click(screen.getByRole("button", { name: "Ks" }));
    await user.click(screen.getByRole("button", { name: "9h" }));
    await user.click(screen.getByRole("button", { name: "4d" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("street-board")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Чек" }));
    expect(screen.getByText("чек")).toBeInTheDocument();
    await user.click(screen.getByTestId("board-card-0"));
    await user.click(screen.getByRole("button", { name: "Qs" }));
    expect(screen.getByTestId("board-card-0")).toHaveAccessibleName("Qs");
    expect(screen.getByText("чек")).toBeInTheDocument();
    expect(screen.queryByText("Действия после этого будут удалены")).not.toBeInTheDocument();
  });

  it("lets you change hero cards after street actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByTestId("wizard-step-2"));
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByText("Ваши карты")).toBeInTheDocument();
    await user.click(screen.getByTestId("hero-card-0"));
    await user.click(screen.getByRole("button", { name: "Qs" }));
    await user.click(screen.getByTestId("wizard-step-3"));
    expect(screen.getByTestId("street-queue")).toBeInTheDocument();
    expect(screen.getByText("фолд")).toBeInTheDocument();
  });

  it("collapses folded players on the result step", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByText("Итог раздачи")).toBeInTheDocument();
    expect(screen.getByText("Игрок 3")).toBeInTheDocument();
    expect(screen.queryByText("Игрок 2")).not.toBeInTheDocument();
    expect(screen.getByTestId("folded-earlier-toggle")).toHaveTextContent(
      "Сбросили ранее: 2 игрока",
    );
    await user.click(screen.getByTestId("folded-earlier-toggle"));
    expect(screen.getByTestId("folded-earlier-1")).toHaveTextContent("Вы · фолд на префлопе");
    expect(screen.getByTestId("folded-earlier-2")).toHaveTextContent("Игрок 2 · фолд на префлопе");
    expect(screen.getByText("выиграл")).toBeInTheDocument();
    expect(screen.getByTestId("showdown-row-3")).toHaveTextContent("выиграл");
    expect(screen.getByTestId("hero-profit").textContent).not.toMatch(/₽/);
    expect(screen.queryByTestId("card-deck")).not.toBeInTheDocument();
    expect(screen.queryByTestId("muck-showdown")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "карты" })).not.toBeInTheDocument();
  });

  it("keeps the header undo button in compact mode", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);
    await user.click(screen.getByRole("button", { name: "Фолд" }));
    const undo = screen.getByTestId("wizard-header-undo");
    expect(undo).toBeEnabled();

    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("sticky-header")).toHaveAttribute("data-compact", "true");
    });
    expect(screen.getByTestId("wizard-header-undo")).toBeEnabled();
    expect(screen.getByTestId("wizard-header-undo")).toHaveAttribute(
      "aria-label",
      "Отменить последнее действие",
    );
    expect(screen.getByTestId("wizard-header-undo")).toHaveAttribute(
      "title",
      "Отменить последнее действие",
    );
    expect(screen.getByTestId("wizard-header-undo-icon")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-header-undo-label")).toHaveTextContent("Отменить");
    expect(screen.queryByTestId("wizard-header-logo")).not.toBeInTheDocument();
    expect(screen.getByText(/Шаг 3 из 4/)).toBeInTheDocument();
  });

  it("uses a 36px undo icon below 420px and never truncates the label", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await goToStreet(user);

    const undo = screen.getByTestId("wizard-header-undo");
    expect(undo).toBeDisabled();
    expect(undo).toHaveAttribute("aria-label", "Отменить последнее действие");
    expect(undo).toHaveAttribute("title", "Отменить последнее действие");
    expect(undo.className).toMatch(/shrink-0/);
    expect(undo.className).toMatch(/whitespace-nowrap/);
    expect(undo.className).toMatch(/h-9/);
    expect(undo.className).toMatch(/w-9/);
    expect(undo.className).toMatch(/border-line-gold/);
    expect(undo.className).toMatch(/bg-transparent/);
    expect(undo.className).not.toMatch(/bg-gold-grad/);
    expect(undo.className).not.toMatch(/truncate/);
    expect(undo.className).not.toMatch(/max-w-\[40%\]/);
    expect(undo.className).toMatch(/min-\[420px\]:w-auto/);
    expect(screen.getByTestId("wizard-header-undo-label").className).toMatch(/hidden/);
    expect(screen.getByTestId("wizard-header-undo-label").className).toMatch(
      /min-\[420px\]:inline/,
    );
    const icon = screen.getByTestId("wizard-header-undo-icon");
    expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(icon.innerHTML).toContain("M3 8h11a6 6 0 0 1 0 12H8");
    expect(icon.innerHTML).toContain("M7 4L3 8l4 4");

    const logo = screen.getByTestId("wizard-header-logo");
    expect(logo.className).toMatch(/hidden/);
    expect(logo.className).toMatch(/min-\[380px\]:inline-flex/);

    await user.click(screen.getByRole("button", { name: "Фолд" }));
    expect(undo).toBeEnabled();
  });

  it("converts stack input between chips and BB without losing chips", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const toggle = screen.getByTestId("stack-display-toggle");
    expect(toggle).toBeInTheDocument();
    await user.click(screen.getByTestId("seat-row-1"));
    const stack = screen.getByTestId("stack-input") as HTMLInputElement;
    await user.clear(stack);
    await user.type(stack, "200000");
    await user.click(within(toggle).getByRole("button", { name: "BB" }));
    expect(stack.value).toBe("100");
    const suffix = stack.parentElement?.querySelector('[data-testid="amount-bb-suffix"]');
    expect(suffix).toBeTruthy();
    expect(suffix?.className).not.toMatch(/absolute/);
    expect(within(toggle).getByRole("button", { name: "Фишки" }).className).toMatch(/min-h-11/);
    await user.click(screen.getByTestId("seat-edit-close"));
    await user.click(screen.getByTestId("seat-row-2"));
    const emptyStack = screen.getByTestId("stack-input") as HTMLInputElement;
    expect(emptyStack.value).toBe("100");
    expect(emptyStack.className).not.toMatch(/text-ink-3/);
    expect(
      within(emptyStack.closest("[data-testid='number-stepper']") as HTMLElement).getByTestId(
        "number-stepper-inc",
      ),
    ).toBeEnabled();
    await user.click(screen.getByTestId("seat-edit-close"));
    await user.click(screen.getByTestId("seat-row-1"));
    const heroStack = screen.getByTestId("stack-input") as HTMLInputElement;
    const blinds = screen.getByTestId("blinds-row");
    const bbInput = within(blinds).getAllByRole("textbox")[1] as HTMLInputElement;
    await user.clear(bbInput);
    await user.type(bbInput, "1000");
    expect(heroStack.value).toBe("200");
    await user.click(within(toggle).getByRole("button", { name: "Фишки" }));
    expect(heroStack.value.replace(/\s/g, "")).toBe("200000");
  });

  it("disables BB units when the big blind is empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const blinds = screen.getByTestId("blinds-row");
    const bbInput = within(blinds).getAllByRole("textbox")[1];
    await user.clear(bbInput);
    expect(screen.getByTestId("bb-unit-hint")).toHaveTextContent("Укажите размер BB");
    expect(
      within(screen.getByTestId("stack-display-toggle")).getByRole("button", { name: "BB" }),
    ).toBeDisabled();
  });

  it("blocks next when a starting stack is zero and names the player", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const villainRow = screen.getByTestId("seat-row-2");
    await user.click(villainRow);
    const villain = screen.getByTestId("stack-input") as HTMLInputElement;
    await user.clear(villain);
    await user.type(villain, "0");
    expect(villain).toHaveValue("0");
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(screen.getByTestId("stack-errors")).toHaveTextContent("Игрок 2");
    expect(screen.getAllByText("Стек должен быть больше нуля").length).toBeGreaterThanOrEqual(1);
    await user.clear(villain);
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
    expect(screen.queryByTestId("stack-errors")).not.toBeInTheDocument();
  });

  it("accepts a stack below 1 BB and an empty stack default", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const toggle = screen.getByTestId("stack-display-toggle");
    await user.click(within(toggle).getByRole("button", { name: "BB" }));
    await user.click(screen.getByTestId("seat-row-1"));
    const hero = screen.getByTestId("stack-input") as HTMLInputElement;
    await user.clear(hero);
    await user.type(hero, "0,5");
    expect(hero.value).toMatch(/0[,.]5/);
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
    expect(screen.queryByTestId("stack-errors")).not.toBeInTheDocument();
    const heroStepper = hero.closest("[data-testid='number-stepper']");
    expect(heroStepper).toBeTruthy();
    expect(within(heroStepper as HTMLElement).getByTestId("number-stepper-dec")).toBeDisabled();
    await user.click(screen.getByTestId("seat-edit-close"));
    await user.click(screen.getByTestId("seat-row-2"));
    const empty = screen.getByTestId("stack-input") as HTMLInputElement;
    expect(empty.value).toBe("100");
    expect(empty.className).not.toMatch(/text-ink-3/);
  });

  it("rejects a zero big blind", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const blinds = screen.getByTestId("blinds-row");
    const bbInput = within(blinds).getAllByRole("textbox")[1] as HTMLInputElement;
    await user.clear(bbInput);
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    const errors = screen.getAllByTestId("number-stepper-error").map((el) => el.textContent);
    expect(errors).toEqual(expect.arrayContaining(["Укажите SB", "Укажите BB"]));
  });

  it("defaults to BB-ante and switches to occupied", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const toggle = screen.getByTestId("ante-mode-toggle");
    expect(within(toggle).getByRole("button", { name: "BB-анте" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("ante-mode-hint")).toHaveTextContent(
      "Одно анте платит большой блайнд",
    );
    await user.click(within(toggle).getByRole("button", { name: "По сидящим" }));
    expect(within(toggle).getByRole("button", { name: "По сидящим" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("ante-mode-hint")).toHaveTextContent("Анте платит каждый сидящий");
    const blinds = screen.getByTestId("blinds-row");
    const anteInput = within(blinds).getAllByRole("textbox")[2] as HTMLInputElement;
    await user.clear(anteInput);
    await user.type(anteInput, "0");
    expect(screen.getByTestId("ante-mode-hint")).toHaveTextContent(
      "Анте нет — в стартовый банк не идёт",
    );
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
  });

  it("fills SB and ante from BB", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    const blinds = screen.getByTestId("blinds-row");
    const [sbInput, bbInput, anteInput] = within(blinds).getAllByRole(
      "textbox",
    ) as HTMLInputElement[];
    await user.clear(bbInput);
    await user.type(bbInput, "4000");
    expect(sbInput.value.replace(/\s/g, "")).toBe("2000");
    expect(anteInput.value.replace(/\s/g, "")).toBe("4000");
  });
});

function step3Draft(overrides: Partial<WizardState> = {}): WizardState {
  return {
    ...emptyWizard(),
    step: 3,
    furthestStep: 3,
    tableSize: 6,
    occupied: [1, 2, 3, 4, 5, 6],
    heroCards: ["As", "Kd"],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: Array.from({ length: 8 }, (_, index) => ({
          seat: (index % 6) + 1,
          action: "fold" as const,
        })),
      },
    ],
    ...overrides,
  };
}

function completeDraft(): WizardState {
  const checks = (seats: number[]) => seats.map((seat) => ({ seat, action: "check" as const }));
  return {
    ...emptyWizard(),
    step: 4,
    furthestStep: 4,
    occupied: [1, 2, 3],
    heroCards: ["As", "Ah"],
    streets: [
      {
        street: "preflop",
        board: [],
        actions: [
          { seat: 1, action: "call", amount: 2000 },
          { seat: 2, action: "call", amount: 2000 },
          { seat: 3, action: "check" },
        ],
      },
      { street: "flop", board: ["Ad", "2c", "3d"], actions: checks([2, 3, 1]) },
      { street: "turn", board: ["Ad", "2c", "3d", "9s"], actions: checks([2, 3, 1]) },
      { street: "river", board: ["Ad", "2c", "3d", "9s", "4h"], actions: checks([2, 3, 1]) },
    ],
    activeStreetIndex: 3,
    showdownCards: { 2: ["Ks", "Kh"], 3: ["7c", "8d"] },
  };
}

const savedHand: HandRead = {
  id: "hand-1",
  slug: "abc",
  status: "published",
  current_step: null,
  current_street: null,
  title: "Тестовая раздача",
  note: null,
  is_public: true,
  views_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  event_id: null,
  series_id: null,
  live_session_id: null,
  event: null,
  series: null,
  author: { nickname: "player" },
  is_owner: true,
  data: {
    schema_version: 1,
    table_size: 9,
    blinds: { sb: 1000, bb: 2000, ante: 2000 },
    hero_seat: 1,
    button_seat: 1,
    seats: [
      { seat: 1, position: "BTN", name: "Вы", stack: 200000, is_hero: true, cards: ["As", "Ah"] },
      { seat: 2, position: "SB", name: "Игрок 2", stack: 200000 },
      { seat: 3, position: "BB", name: "Игрок 3", stack: 200000 },
    ],
    streets: [],
    result: {
      winner_seats: [1],
      pot: 0,
      hero_invested: 0,
      hero_profit: 0,
      side_pots: null,
    },
  },
  wizard: null,
};

describe("HandWizardPage drafts", () => {
  beforeEach(async () => {
    publishHand.mockReset();
    createHandDraft.mockReset();
    patchHandDraft.mockReset();
    createHandDraft.mockResolvedValue({ id: DRAFT_ID, status: "draft", slug: "dR4ftSlugA" });
    patchHandDraft.mockResolvedValue({ id: DRAFT_ID, status: "draft", slug: "dR4ftSlugA" });
    await clearHandDraft();
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });

  it("starts a new wizard on /hand/new even if another draft exists locally", async () => {
    await seedDraft(step3Draft());
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    expect(await screen.findByTestId("hand-wizard")).toBeInTheDocument();
    expect(screen.getByText("Стол и игроки")).toBeInTheDocument();
    expect(screen.queryByTestId("hand-draft-resume")).not.toBeInTheDocument();
    expect(screen.queryByTestId("street-queue")).not.toBeInTheDocument();
  });

  it("opens a stored draft by id without a resume gate", async () => {
    await seedDraft(step3Draft());
    renderDraftWizard();
    expect(await screen.findByTestId("hand-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("street-queue")).toBeInTheDocument();
    expect(screen.getByTestId("street-title")).toHaveTextContent("Префлоп");
    expect(screen.getByText(/Шаг 3 из 4 · префлоп/)).toBeInTheDocument();
  });

  it("resets from the header menu on any step and names the lost actions", async () => {
    const user = userEvent.setup();
    await seedDraft(step3Draft());
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    await user.click(screen.getByTestId("wizard-header-more"));
    expect(screen.getByTestId("draft-last-saved")).toHaveTextContent(
      /Сохранено|Ещё не сохранялось/,
    );
    await user.click(screen.getByTestId("wizard-header-restart"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Введено 8 действий");
    await user.click(within(dialog).getByRole("button", { name: "Начать заново" }));
    expect(await screen.findByText("Стол и игроки")).toBeInTheDocument();
    expect(screen.queryByTestId("street-queue")).not.toBeInTheDocument();
  });

  it("does not prompt for an empty wizard", async () => {
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    expect(await screen.findByTestId("hand-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("hand-draft-resume")).not.toBeInTheDocument();
  });

  it("deletes the local draft after a successful publish", async () => {
    const user = userEvent.setup();
    publishHand.mockResolvedValue(savedHand);
    await seedDraft(completeDraft());
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    await user.click(screen.getByTestId("wizard-next"));
    await waitFor(() => expect(publishHand).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await getLocalDraft(DRAFT_ID)).toBeNull();
    });
  });
});

describe("HandWizardPage board strip and result hint", () => {
  beforeEach(async () => {
    publishHand.mockReset();
    createHandDraft.mockReset();
    patchHandDraft.mockReset();
    createHandDraft.mockResolvedValue({ id: DRAFT_ID, status: "draft", slug: "dR4ftSlugA" });
    patchHandDraft.mockResolvedValue({ id: DRAFT_ID, status: "draft", slug: "dR4ftSlugA" });
    await clearHandDraft();
    localStorage.removeItem(STACK_DISPLAY_STORAGE_KEY);
  });

  it("hides the board strip on steps 1 and 2", async () => {
    renderWithProviders(<HandWizardPage />, { route: "/hand/new" });
    await waitFor(() => screen.getByTestId("hand-wizard"));
    expect(screen.queryByTestId("wizard-board-strip")).not.toBeInTheDocument();
  });

  it("shows the board strip on step 3 inside the sticky header", async () => {
    await seedDraft(step3Draft());
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    const strip = screen.getByTestId("wizard-board-strip");
    expect(screen.getByTestId("wizard-board-strip-cards").className).toMatch(/h-11/);
    expect(screen.getByTestId("strip-pot")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-hero-equity")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/strip-card-/)).toHaveLength(5);
    expect(screen.getByTestId("strip-group-flop")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-turn")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-river")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("sticky-header")).toContainElement(strip);
  });

  it("hides hero equity until hole cards are entered", async () => {
    await seedDraft(step3Draft({ heroCards: [] }));
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    expect(screen.getByTestId("wizard-board-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-hero-equity")).not.toBeInTheDocument();
  });

  it("labels exact equity against shown hands on the result step", async () => {
    await seedDraft(completeDraft());
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    expect(screen.getByTestId("wizard-hero-equity")).toHaveAttribute("data-vs", "known");
    expect(screen.getByTestId("wizard-equity-caption")).toHaveTextContent("против вскрытых рук");
  });

  it("highlights the current street group in the board strip", async () => {
    const user = userEvent.setup();
    await seedDraft(completeDraft());
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    expect(screen.getByTestId("wizard-board-strip")).toBeInTheDocument();
    expect(screen.getByTestId("strip-group-flop")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-turn")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-river")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-flop").className).not.toMatch(/outline-gold/);

    await user.click(screen.getByTestId("strip-card-0"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Флоп");
    expect(screen.getByTestId("board-replace-hint")).toBeInTheDocument();
    expect(screen.getByTestId("strip-group-flop")).toHaveAttribute("data-current", "1");
    expect(screen.getByTestId("strip-group-flop").className).toMatch(/outline-gold/);
    expect(screen.getByTestId("strip-group-turn")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-river")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-card-0").className).not.toMatch(/ring-gold/);

    await user.click(screen.getByTestId("street-tab-turn"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Тёрн");
    expect(screen.getByTestId("strip-group-flop")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-turn")).toHaveAttribute("data-current", "1");
    expect(screen.getByTestId("strip-group-river")).toHaveAttribute("data-current", "0");

    await user.click(screen.getByTestId("street-tab-river"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Ривер");
    expect(screen.getByTestId("strip-group-flop")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-turn")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-river")).toHaveAttribute("data-current", "1");

    await user.click(screen.getByTestId("street-tab-preflop"));
    expect(screen.getByTestId("street-title")).toHaveTextContent("Префлоп");
    expect(screen.getByTestId("strip-group-flop")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-turn")).toHaveAttribute("data-current", "0");
    expect(screen.getByTestId("strip-group-river")).toHaveAttribute("data-current", "0");
  });

  it("blocks save until a winner is chosen and names what is missing", async () => {
    const user = userEvent.setup();
    await seedDraft({ ...completeDraft(), showdownCards: {} });
    renderDraftWizard();
    await screen.findByTestId("hand-wizard");
    expect(screen.getByTestId("wizard-next")).toBeDisabled();
    expect(screen.getByTestId("wizard-next")).toHaveAttribute("title", "Укажите, кто забрал банк");
    expect(screen.getByTestId("result-errors")).toHaveTextContent("Укажите, кто забрал банк");
    expect(screen.getByTestId("pick-winner-hint")).toBeInTheDocument();
    expect(screen.getByTestId("result-board")).toBeInTheDocument();
    await user.click(screen.getByTestId("muck-seat-2"));
    await user.click(screen.getByTestId("muck-seat-3"));
    await user.click(screen.getByTestId("take-pot-1"));
    expect(screen.getByTestId("wizard-next")).toBeEnabled();
    expect(screen.getByTestId("hero-profit").textContent).not.toBe("Укажите, кто забрал банк");
    expect(screen.queryByTestId("result-errors")).not.toBeInTheDocument();
    expect(screen.getByText("фишек")).toBeInTheDocument();
  });
});
