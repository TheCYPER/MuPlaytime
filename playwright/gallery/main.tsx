import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../../src/styles.css";

type StoryModule = Record<string, ComponentType<Record<string, unknown>>>;
type MountParams = { story: string; props?: Record<string, unknown> };

const modules = import.meta.glob<StoryModule>("../../src/**/*.story.tsx", {
  eager: true,
});
const stories = new Map<string, ComponentType<Record<string, unknown>>>();

for (const [path, module] of Object.entries(modules)) {
  const normalized = path
    .replace(/^\.\.\/\.\.\/src\//, "")
    .replace(/\.story\.tsx$/, "");
  for (const [name, story] of Object.entries(module)) {
    if (typeof story === "function")
      stories.set(`${normalized}/${name}`, story);
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Component gallery root is missing");
const root = createRoot(rootElement);

declare global {
  interface Window {
    mount: (params: MountParams) => Promise<void>;
    unmount: () => Promise<void>;
  }
}

window.mount = ({ story, props = {} }) => {
  const Story = stories.get(story);
  if (!Story) throw new Error(`Unknown story: ${story}`);
  document.documentElement.lang =
    localStorage.getItem("muplaytime.locale.v1") ?? "en";
  flushSync(() => {
    root.render(
      <StrictMode>
        <Story {...props} />
      </StrictMode>,
    );
  });
  return Promise.resolve();
};

window.unmount = () => {
  flushSync(() => root.render(null));
  return Promise.resolve();
};
