import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

import { ScrollToTop } from "@/components/layout/ScrollToTop";

function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Назад
    </button>
  );
}

function renderApp() {
  return render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Link to="/bookmarks">Открыть закладки</Link>} />
        <Route
          path="/bookmarks"
          element={
            <>
              <h1>Закладки</h1>
              <BackButton />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ScrollToTop (BUG-2: top of /bookmarks looked unrendered)", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  it("scrolls to the top on forward navigation", async () => {
    const user = userEvent.setup();
    renderApp();

    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByRole("link", { name: "Открыть закладки" }));
    expect(await screen.findByRole("heading", { name: "Закладки" })).toBeInTheDocument();

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaves scroll restoration to the browser on back navigation", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("link", { name: "Открыть закладки" }));
    await screen.findByRole("heading", { name: "Закладки" });

    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("link", { name: "Открыть закладки" })).toBeInTheDocument();

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
