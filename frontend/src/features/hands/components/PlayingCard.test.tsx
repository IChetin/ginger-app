import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayingCard } from "@/features/hands/components/PlayingCard";

describe("PlayingCard", () => {
  it("renders a dark back with a Day2 mark at hole size", () => {
    render(<PlayingCard back size="hole" />);
    const back = screen.getByTestId("card-back");
    expect(back).toHaveTextContent("2");
    expect(back.className).toMatch(/#4A3D24/);
    expect(screen.queryByTestId("card-slot")).not.toBeInTheDocument();
  });

  it("renders an empty board slot as a dashed placeholder", () => {
    render(<PlayingCard slot size="md" />);
    const slot = screen.getByTestId("card-slot");
    expect(slot).not.toHaveTextContent("2");
    expect(slot.className).toMatch(/border-dashed/);
    expect(screen.queryByTestId("card-back")).not.toBeInTheDocument();
  });

  it("paints four-color diamonds blue and clubs green", () => {
    render(<PlayingCard card="Ad" size="xs" scheme="four_color" />);
    expect(screen.getByTestId("playing-card")).toHaveStyle({ color: "#2E6FC4" });
    render(<PlayingCard card="Ac" size="xs" scheme="four_color" />);
    const clubs = screen.getAllByTestId("playing-card")[1];
    expect(clubs).toHaveStyle({ color: "#1F8A4C" });
  });

  it("paints classic diamonds and clubs red and black", () => {
    render(<PlayingCard card="Ad" size="xs" scheme="classic" />);
    expect(screen.getByTestId("playing-card")).toHaveStyle({ color: "#C7382F" });
    render(<PlayingCard card="Ac" size="xs" scheme="classic" />);
    const clubs = screen.getAllByTestId("playing-card")[1];
    expect(clubs).toHaveStyle({ color: "#1A1710" });
  });
});
