import type { ReactElement } from "react";
import { render } from "@testing-library/react";

export function renderApp(ui: ReactElement) {
  return render(ui);
}
