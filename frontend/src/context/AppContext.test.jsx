import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppProvider, useAppContext } from "./AppContext.jsx";

function Probe() {
  const { user, lang, setLang, setUser } = useAppContext();
  return (
    <div>
      <div data-testid="lang">{lang}</div>
      <div data-testid="user-name">{user ? user.name : "none"}</div>
      <button type="button" onClick={() => setLang("nl")}>to-nl</button>
      <button type="button" onClick={() => setUser({ name: "Lex" })}>set-user</button>
    </div>
  );
}

describe("AppContext", () => {
  it("throws a helpful error when used outside an AppProvider", () => {
    const prevError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(
        /useAppContext must be used within an AppProvider/,
      );
    } finally {
      console.error = prevError;
    }
  });

  it("defaults lang to 'en' when no initialLang prop is supplied", () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("honours the initialLang prop", () => {
    render(
      <AppProvider initialLang="nl">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });

  it("setLang updates the exposed lang value", () => {
    render(
      <AppProvider initialLang="en">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
    act(() => {
      screen.getByRole("button", { name: "to-nl" }).click();
    });
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });

  it("setUser updates the exposed user value", () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("user-name").textContent).toBe("none");
    act(() => {
      screen.getByRole("button", { name: "set-user" }).click();
    });
    expect(screen.getByTestId("user-name").textContent).toBe("Lex");
  });
});
