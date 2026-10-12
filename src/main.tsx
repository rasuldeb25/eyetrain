import { render } from "preact";
import { App } from "./ui/app";
import "./style.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
