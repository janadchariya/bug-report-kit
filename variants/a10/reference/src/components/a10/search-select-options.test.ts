import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { matchOptions, optionsFromChildren } from "./search-select-options";

const option = (value: string | undefined, ...text: (string | number)[]) => createElement("option", { key: `${value}${text.join("")}`, value }, ...text);

describe("search select options", () => {
  it("reads <option> children, joining split text and flattening arrays and fragments", () => {
    const children = [
      option("", "None"),
      [option("a", "SEO ", "Course"), option("b", "GA4", " · ", 2)],
      createElement(Fragment, { key: "f" }, option(undefined, "Ad copy")),
      "stray text",
      createElement("span", { key: "s" }, "not an option"),
    ];
    expect(optionsFromChildren(children)).toEqual([
      { value: "", label: "None", disabled: false },
      { value: "a", label: "SEO Course", disabled: false },
      { value: "b", label: "GA4 · 2", disabled: false },
      { value: "Ad copy", label: "Ad copy", disabled: false },
    ]);
  });

  it("keeps a disabled option, marked", () => {
    expect(optionsFromChildren(createElement("option", { value: "x", disabled: true }, "X"))).toEqual([{ value: "x", label: "X", disabled: true }]);
  });

  it("matches every word of the search anywhere in the label, ignoring case", () => {
    const options = optionsFromChildren([option("1", "SEO Course"), option("2", "SEO Blog Content"), option("3", "Social Media"), option("4", "งานออกแบบ")]);
    expect(matchOptions(options, "  ").map((o) => o.value)).toEqual(["1", "2", "3", "4"]);
    expect(matchOptions(options, "seo").map((o) => o.value)).toEqual(["1", "2"]);
    expect(matchOptions(options, "content seo").map((o) => o.value)).toEqual(["2"]);
    expect(matchOptions(options, "MEDIA").map((o) => o.value)).toEqual(["3"]);
    expect(matchOptions(options, "ออกแบบ").map((o) => o.value)).toEqual(["4"]);
    expect(matchOptions(options, "nothing")).toEqual([]);
  });
});
