import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("setLang calls patchMe and updates lang on resolve", async () => {
    const patchMe = vi.fn().mockResolvedValue({ ui_language: "nl" });
    render(
      <AppProvider initialLang="en" patchMe={patchMe}>
        <Probe />
      </AppProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "to-nl" }).click();
    });
    expect(patchMe).toHaveBeenCalledWith({ ui_language: "nl" });
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });

  it("does not update lang when patchMe rejects", async () => {
    const patchMe = vi.fn().mockRejectedValue(new Error("offline"));
    function Caller() {
      const { lang, setLang } = useAppContext();
      async function onClick() {
        try {
          await setLang("nl");
        } catch {
          /* swallow — UI-level handling is Slice 3 */
        }
      }
      return (
        <div>
          <div data-testid="lang">{lang}</div>
          <button type="button" onClick={onClick}>to-nl</button>
        </div>
      );
    }
    render(
      <AppProvider initialLang="en" patchMe={patchMe}>
        <Caller />
      </AppProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "to-nl" }).click();
    });
    expect(patchMe).toHaveBeenCalledWith({ ui_language: "nl" });
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("mounts without a patchMe prop (uses default binding)", () => {
    render(
      <AppProvider initialLang="en">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
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

  describe("<html lang> sync", () => {
    afterEach(() => {
      document.documentElement.lang = "";
    });

    it("sets document.documentElement.lang to initialLang on mount", () => {
      render(
        <AppProvider initialLang="en">
          <Probe />
        </AppProvider>,
      );
      expect(document.documentElement.lang).toBe("en");
    });

    it("updates document.documentElement.lang when lang changes", async () => {
      const patchMe = vi.fn().mockResolvedValue({ ui_language: "nl" });
      render(
        <AppProvider initialLang="en" patchMe={patchMe}>
          <Probe />
        </AppProvider>,
      );
      await act(async () => {
        screen.getByRole("button", { name: "to-nl" }).click();
      });
      expect(document.documentElement.lang).toBe("nl");
    });
  });
});
