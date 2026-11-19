import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "inter-ui/inter-variable.css";
import App from "@/app/App";
import "./styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
