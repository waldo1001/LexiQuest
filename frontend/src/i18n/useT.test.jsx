import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppProvider, useAppContext } from "../context/AppContext.jsx";
import { useT } from "./useT.js";

function Probe() {
  const t = useT();
  const { setLang } = useAppContext();
  return (
    <div>
      <div data-testid="title">{t("picker.title")}</div>
      <div data-testid="greeting">{t("home.greeting", { name: "Lex" })}</div>
      <button type="button" onClick={() => setLang("nl")}>to-nl</button>
    </div>
  );
}

describe("useT", () => {
  it("returns a function that translates into the context's lang (en)", () => {
    render(
      <AppProvider initialLang="en">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("title").textContent).toBe("Who are you?");
    expect(screen.getByTestId("greeting").textContent).toBe("Hello, Lex");
  });

  it("returns Dutch strings when context lang is nl", () => {
    render(
      <AppProvider initialLang="nl">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("title").textContent).toBe("Wie ben jij?");
    expect(screen.getByTestId("greeting").textContent).toBe("Hallo, Lex");
  });

  it("re-renders with new translations when setLang flips the context", () => {
    render(
      <AppProvider initialLang="en">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("title").textContent).toBe("Who are you?");
    act(() => {
      screen.getByRole("button", { name: "to-nl" }).click();
    });
    expect(screen.getByTestId("title").textContent).toBe("Wie ben jij?");
    expect(screen.getByTestId("greeting").textContent).toBe("Hallo, Lex");
  });
});
