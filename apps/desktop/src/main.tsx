import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";

import "@/styles/app.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing #root mount element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
