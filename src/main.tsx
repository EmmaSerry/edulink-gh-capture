import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/capture.css";
import "./styles/capture-splash.css";
import App from "./App";
import { CaptureSplash } from "./components/CaptureSplash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <CaptureSplash />
    </BrowserRouter>
  </React.StrictMode>
);
