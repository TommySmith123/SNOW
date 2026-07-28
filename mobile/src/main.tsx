import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SnowGame } from "../../web/app/game/SnowGame";
import "../../web/app/globals.css";
import "./mobile.css";
import { initializeNativeBridge } from "./nativeBridge";

document.body.classList.add("native-mobile");
void initializeNativeBridge();

const root = document.getElementById("root");
if (!root) throw new Error("Missing mobile root element.");

createRoot(root).render(
  <StrictMode>
    <SnowGame />
  </StrictMode>,
);
