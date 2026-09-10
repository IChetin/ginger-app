import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { DemoProvider } from "@/demo/DemoProvider";

export function renderWithProviders(
  ui: React.ReactElement,
  options?: {
    route?: string;
    routerProps?: MemoryRouterProps;
    renderOptions?: Omit<RenderOptions, "wrapper">;
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });

  const route = options?.route ?? "/";

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        {...options?.routerProps}
      >
        <ConfirmProvider>
          <DemoProvider>
            {ui}
          </DemoProvider>
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
    options?.renderOptions,
  );

  return { ...view, queryClient };
}
