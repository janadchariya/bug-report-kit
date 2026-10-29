import { render, screen, within } from "@testing-library/react";
import { BugGuide } from "./bug-guide";

it("adds Almond's three-step bug timeline and HTML mocks at the coachmark anchor", () => {
  render(<BugGuide />);
  const section = screen.getByRole("region", { name: "Report a bug" });
  expect(section.id).toBe("report-a-bug");
  expect(within(section).getAllByRole("heading", { level: 3 }).map(node => node.textContent)).toEqual([
    "Open the bug form", "Describe and attach a screenshot", "Send and follow up",
  ]);
  expect(within(section).getAllByRole("figure")).toHaveLength(3);
  expect(section.querySelector("img")).toBeNull();
  expect(section).toHaveTextContent("⌘/Ctrl+V");
  expect(section).toHaveTextContent("PDF");
  expect(section).toHaveTextContent("4 MiB");
  expect(section).toHaveTextContent("My bug reports");
  expect(section).toHaveTextContent("In progress");
  expect(section).toHaveTextContent("Done");
  expect(section).not.toHaveTextContent("ลีด");
});
