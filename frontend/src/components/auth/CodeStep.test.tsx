import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeStep } from "@/components/auth/CodeStep";

function setup(verifyCode = vi.fn().mockResolvedValue(undefined)) {
  render(
    <CodeStep
      email="player@example.com"
      initialRetryAfter={60}
      onChangeEmail={vi.fn()}
      onNetworkError={vi.fn()}
      verifyCode={verifyCode}
      resendCode={vi.fn().mockResolvedValue({ retry_after: 60 })}
    />,
  );
  return verifyCode;
}

function mockClipboard(text: string | Error) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(() => (text instanceof Error ? Promise.reject(text) : Promise.resolve(text))),
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("CodeStep", () => {
  it("автоподстановка кладёт весь код в одно поле — разносим по клеткам", async () => {
    const verifyCode = setup();
    fireEvent.change(screen.getByLabelText("Цифра 1"), { target: { value: "474747" } });

    await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("474747"));
    expect(screen.getByLabelText("Цифра 6")).toHaveValue("7");
  });

  it("кнопка вставляет код из буфера обмена", async () => {
    mockClipboard("Ваш код: 123456");
    const verifyCode = setup();

    fireEvent.click(await screen.findByTestId("paste-code"));
    await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("123456"));
  });

  it("в буфере не код — говорим об этом, а не молчим", async () => {
    mockClipboard("просто текст");
    const verifyCode = setup();

    fireEvent.click(await screen.findByTestId("paste-code"));
    expect(await screen.findByTestId("code-error")).toHaveTextContent("нет кода из шести цифр");
    expect(verifyCode).not.toHaveBeenCalled();
  });

  it("без доступа к буферу кнопки нет", () => {
    setup();
    expect(screen.queryByTestId("paste-code")).not.toBeInTheDocument();
  });
});
