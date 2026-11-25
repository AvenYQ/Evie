import "./sidebar-compact.css";
import "./weft.css";
import { startWeftBootScene } from "./bootScene";

if (typeof document !== "undefined") {
  document.documentElement.dataset.weft = "";
  const stopBootScene = startWeftBootScene();
  import.meta.hot?.dispose(stopBootScene);
}
