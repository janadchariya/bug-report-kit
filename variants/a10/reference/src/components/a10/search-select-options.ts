import { Children, Fragment, isValidElement, type ReactNode } from "react";

export type SearchSelectOption = { value: string; label: string; disabled: boolean };

type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The `<option>` children of a select, as plain rows. Fragments and arrays are flattened; anything else is skipped. */
export function optionsFromChildren(children: ReactNode): SearchSelectOption[] {
  const rows: SearchSelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === Fragment) {
      rows.push(...optionsFromChildren(child.props.children));
      return;
    }
    if (child.type !== "option") return;
    const label = textOf(child.props.children);
    rows.push({ value: child.props.value === undefined ? label : String(child.props.value), label, disabled: !!child.props.disabled });
  });
  return rows;
}

const fold = (text: string) => text.toLocaleLowerCase("th");

/** The options whose label holds every word of the search, in their order. A blank search keeps them all. */
export function matchOptions(options: SearchSelectOption[], search: string): SearchSelectOption[] {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const label = fold(option.label);
    return words.every((word) => label.includes(word));
  });
}
