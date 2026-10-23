import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@designcodeio/threeui/style.css";
import "./index.css";
import { Scene } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Scene />
  </StrictMode>,
);
