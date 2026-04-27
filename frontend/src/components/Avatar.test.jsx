import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Avatar from "./Avatar.jsx";

describe("Avatar", () => {
  it("AVATAR-12: renders <img> when avatar_image_url is set", () => {
    const { container } = render(
      <Avatar avatarImageUrl="/icons/icon-192.png" avatarEmoji="🦊" name="Waldo" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/icons/icon-192.png");
    expect(container.textContent).not.toContain("🦊");
  });

  it("AVATAR-13: renders the emoji span when only avatar_emoji is set", () => {
    const { container } = render(<Avatar avatarEmoji="🐯" name="Lex" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("🐯");
  });

  it("AVATAR-14: renders the emoji span when avatar_image_url is empty string", () => {
    const { container } = render(
      <Avatar avatarImageUrl="" avatarEmoji="🐼" name="Ben" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("🐼");
  });

  it("AVATAR-15: emits no <img> element when only emoji is set (no network probe)", () => {
    const { container } = render(<Avatar avatarEmoji="🐰" name="Kaat" />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders <img> with explicit width and height to prevent layout shift", () => {
    const { container } = render(
      <Avatar avatarImageUrl="/icons/icon-192.png" avatarEmoji="🦊" name="Waldo" />,
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("width")).toBeTruthy();
    expect(img.getAttribute("height")).toBeTruthy();
  });
});
