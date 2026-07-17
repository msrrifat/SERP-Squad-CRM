import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

/* after a deploy, a browser holding the previous index.html references lazy
   chunks that no longer exist — instead of a white screen, force ONE fresh
   reload (cache-busted) so the new build loads; the guard prevents loops */
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  if (sessionStorage.getItem("ss_chunk_reload")) return;
  sessionStorage.setItem("ss_chunk_reload", "1");
  window.location.replace(window.location.pathname + "?v=" + Date.now());
});
if (sessionStorage.getItem("ss_chunk_reload")) setTimeout(() => sessionStorage.removeItem("ss_chunk_reload"), 10000);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
