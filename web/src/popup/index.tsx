import { createRoot } from "react-dom/client";
import PopupApp from "./PopupApp";

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<PopupApp />);
