const { JSDOM } = require("jsdom"); const fs = require("fs");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x",
  beforeParse(w) { w.ResizeObserver = class { observe(){} unobserve(){} }; w.claude = { use: async () => null }; } });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
(async () => {
  await sleep(200);
  const vp = d.getElementById("viewport"), z = () => d.getElementById("zVal").textContent;
  const z0 = z();
  vp.dispatchEvent(new w.WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })); const z1 = z();
  vp.dispatchEvent(new w.WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
  vp.dispatchEvent(new w.WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true })); const z2 = z();
  const t0 = d.getElementById("world").style.transform;
  vp.dispatchEvent(new w.WheelEvent("wheel", { deltaY: 100, shiftKey: true, bubbles: true, cancelable: true }));
  console.log({ z0, z1, z2, zoomStaysAfterShift: z() === z2, panned: d.getElementById("world").style.transform !== t0, errs });
  process.exit(0);
})();
