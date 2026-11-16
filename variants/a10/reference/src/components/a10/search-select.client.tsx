"use client";

import { useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { Check, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { matchOptions, optionsFromChildren } from "./search-select-options";
import "./search-select.css";

type SearchSelectProps = Omit<ComponentProps<"select">, "onChange" | "value" | "multiple"> & {
  value: string;
  /** Called with the picked option's value, only when it differs from `value`. */
  onChange: (value: string) => void;
};

const OPEN_KEYS = new Set([" ", "Enter", "ArrowDown", "ArrowUp", "F4"]);

/**
 * A drop-in for a single `<select>` with `<option>` children: the select stays on the page (so its
 * styles, label and disabled state are unchanged), but opening it shows a list with a search box at
 * the top instead of the browser's own menu.
 */
export function SearchSelect({ value, onChange, children, disabled, onMouseDown, onKeyDown, ...rest }: SearchSelectProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const options = useMemo(() => optionsFromChildren(children), [children]);
  const shown = matchOptions(options, search);
  const label = rest["aria-label"] ?? "options";

  const show = (typed = "") => {
    if (disabled) return;
    const rows = matchOptions(options, typed);
    setSearch(typed);
    setActive(Math.max(0, typed ? rows.findIndex((row) => !row.disabled) : rows.findIndex((row) => row.value === value)));
    setOpen(true);
  };
  const pick = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
    requestAnimationFrame(() => selectRef.current?.focus());
  };
  const move = (step: number) => {
    if (shown.length === 0) return;
    let index = active;
    for (let tries = 0; tries < shown.length; tries++) {
      index = (index + step + shown.length) % shown.length;
      if (!shown[index].disabled) break;
    }
    setActive(index);
    listRef.current?.children[index]?.scrollIntoView({ block: "nearest" });
  };

  const keyOnSelect = (event: KeyboardEvent<HTMLSelectElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (OPEN_KEYS.has(event.key)) {
      event.preventDefault();
      show();
    } else if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      show(event.key);
    }
  };
  const keyOnSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = shown[active];
      if (row && !row.disabled) pick(row.value);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => (next ? show() : setOpen(false))}>
      <Popover.Anchor asChild>
        <select
          {...rest}
          ref={selectRef}
          value={value}
          disabled={disabled}
          aria-expanded={open}
          onChange={(event) => pick(event.target.value)}
          onMouseDown={(event) => {
            onMouseDown?.(event);
            if (event.defaultPrevented || event.button !== 0) return;
            event.preventDefault();
            selectRef.current?.focus();
            if (open) setOpen(false);
            else show();
          }}
          onKeyDown={keyOnSelect}
        >
          {children}
        </select>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="a10-search-select"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector("input")?.focus();
            listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            selectRef.current?.focus();
          }}
        >
          <label className="a10-search-select-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              aria-label={`Search ${label}`}
              placeholder="Search…"
              autoComplete="off"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(Math.max(0, matchOptions(options, event.target.value).findIndex((row) => !row.disabled)));
              }}
              onKeyDown={keyOnSearch}
            />
          </label>
          <ul ref={listRef} className="a10-search-select-list" role="listbox" aria-label={label}>
            {shown.map((row, index) => (
              <li
                key={`${row.value}:${index}`}
                role="option"
                aria-selected={row.value === value}
                aria-disabled={row.disabled || undefined}
                data-active={index === active ? "" : undefined}
                className="a10-search-select-option"
                onMouseMove={() => !row.disabled && setActive(index)}
                onClick={() => !row.disabled && pick(row.value)}
              >
                <span className="a10-search-select-tick">{row.value === value && <Check size={13} aria-hidden="true" />}</span>
                <span className="a10-search-select-name">{row.label}</span>
              </li>
            ))}
            {shown.length === 0 && <li className="a10-search-select-none">No match</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
