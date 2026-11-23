const { JSDOM } = require("jsdom"); const fs = require("fs");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x",
  beforeParse(w) { w.ResizeObserver = class { observe(){} unobserve(){} }; w.claude = { use: async () => null }; } });
const w = dom.window, d = w.document;
(async () => {
  await sleep(200);
  const node = d.querySelector(".node"); node.setPointerCapture = () => {};
  const ev = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0 });
  node.dispatchEvent(ev);
  const during = d.body.classList.contains("gesturing");
  node.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
  const vp = d.getElementById("viewport"); vp.setPointerCapture = () => {};
  const ev2 = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 5, clientY: 5, button: 0 }); vp.dispatchEvent(ev2);
  const panDuring = d.body.classList.contains("gesturing");
  vp.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
  console.log({ nodeDefaultPrevented: ev.defaultPrevented, during, after: d.body.classList.contains("gesturing"), panDefaultPrevented: ev2.defaultPrevented, panDuring });
  process.exit(0);
})();
