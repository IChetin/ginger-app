import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkImportPage } from "@/features/admin/bulk-import/BulkImportPage";
import { renderWithProviders } from "@/test/render";

const fetchBulkJobs = vi.hoisted(() => vi.fn());
const uploadBulkJob = vi.hoisted(() => vi.fn());
const fetchAdminDashboard = vi.hoisted(() => vi.fn());

vi.mock("@/features/admin/bulk-import/api", () => ({
  TEMPLATE_URL: "/day2_series_upload.xlsx",
  fetchBulkJobs: (...args: unknown[]) => fetchBulkJobs(...args),
  uploadBulkJob: (...args: unknown[]) => uploadBulkJob(...args),
  fetchBulkJob: vi.fn(),
  previewBulkImport: vi.fn(),
  publishBulkImport: vi.fn(),
}));

vi.mock("@/features/admin/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/admin/api")>("@/features/admin/api");
  return { ...actual, fetchAdminDashboard: (...args: unknown[]) => fetchAdminDashboard(...args) };
});

describe("BulkImportPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    fetchBulkJobs.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    uploadBulkJob.mockResolvedValue({ id: "bulk-1", status: "review" });
  });

  it("offers the template for download", async () => {
    renderWithProviders(<BulkImportPage />, { route: "/admin/import/bulk" });

    const link = await screen.findByRole("link", { name: "Скачать шаблон" });
    expect(link).toHaveAttribute("href", "/day2_series_upload.xlsx");
  });

  it("uploads the workbook and opens the preview", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/admin/import/bulk" element={<BulkImportPage />} />
        <Route path="/admin/import/bulk/:jobId" element={<div>Предпросмотр bulk-1</div>} />
      </Routes>,
      { route: "/admin/import/bulk" },
    );

    const input = document.querySelector("#bulk-import-file") as HTMLInputElement;
    const file = new File(["PK"], "series.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Загрузить и разобрать" }));

    await waitFor(() => {
      expect(uploadBulkJob).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText("Предпросмотр bulk-1")).toBeInTheDocument();
  });
});
