const { JSDOM } = require("jsdom"); const fs = require("fs");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const mk = (id, type, x, y) => ({ id, type, x, y, name: id, data: type === "prompt" ? { prompt: "p", width: 1080, height: 1350, refs: [] } : {}, out: null, status: "idle", error: "" });
const S = { file: "", seq: 50, nodes: [mk("a", "split", 0, 0), mk("b", "prompt", 500, 0), mk("c", "prompt", 500, 400), mk("d", "image", 1000, 13)], edges: [{ id: "e1", from: "a", to: "b" }, { id: "e2", from: "a", to: "c" }, { id: "e3", from: "b", to: "d" }] };
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} }; w.claude = { use: async () => null };
  Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", { get() { return this.classList && this.classList.contains("node") ? 300 : 0; } });
  Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", { get() { return this.classList && this.classList.contains("node") ? 200 : 0; } });
  w.localStorage.setItem("coco-banner-flow-v2", JSON.stringify(S));
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
const ev = (type, x, y, extra = {}) => new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }, extra));
const node = (id) => d.querySelector(`.node[data-id="${id}"]`);
const pos = (id) => [parseInt(node(id).style.left), parseInt(node(id).style.top)];
const view = () => { const m = d.getElementById("world").style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/); return { x: +m[1], y: +m[2], k: +m[3] }; };
(async () => {
  await sleep(300);
  const vp = d.getElementById("viewport"); vp.setPointerCapture = () => {};
  for (const id of ["a","b","c","d"]) node(id).setPointerCapture = () => {};
  // 设定固定视图：k=1，原点在 (0,0)
  d.getElementById("zOut"); // 不改变
  const v = view(); const toScreen = (x, y) => [x * v.k + v.x, y * v.k + v.y];
  // 1. 框选 b、c、d（避开 a）
  const [sx, sy] = toScreen(450, -50), [ex, ey] = toScreen(1350, 650);
  vp.dispatchEvent(ev("pointerdown", sx, sy)); vp.dispatchEvent(ev("pointermove", ex, ey)); await sleep(40); vp.dispatchEvent(ev("pointerup", ex, ey)); await sleep(20);
  const sel = [...d.querySelectorAll(".node.sel")].map(n => n.dataset.id).sort().join("");
  check("框选选中 3 张卡片", sel === "bcd", sel);
  check("多选时出现对齐工具条", !d.getElementById("alignBar").hidden && /已选 3 张/.test(d.getElementById("selCount").textContent));
  // 2. 一起拖动：拖 b 向右 100（远离吸附）
  const before = { b: pos("b"), c: pos("c"), d: pos("d") };
  const [bx, by] = toScreen(550, 50);
  node("b").dispatchEvent(ev("pointerdown", bx, by)); node("b").dispatchEvent(ev("pointermove", bx + 137 * v.k, by + 61 * v.k)); await sleep(40); node("b").dispatchEvent(ev("pointerup", bx + 137 * v.k, by + 61 * v.k)); await sleep(20);
  const moved = ["b","c","d"].every(id => pos(id)[0] - before[id][0] === pos("b")[0] - before.b[0] && pos(id)[0] !== before[id][0]);
  check("选中的卡片一起移动", moved, JSON.stringify({ b: pos("b"), c: pos("c"), d: pos("d") }));
  check("未选中的卡片不动", pos("a")[0] === 0 && pos("a")[1] === 0);
  // 3. 吸附：单独拖 d 到 a 的顶部附近（a.y=0），偏差 5px 应吸附到 0
  node("d").dispatchEvent(ev("pointerdown", 0, 0, { shiftKey: false }));
  // 先单选 d
  vp.dispatchEvent(ev("pointerdown", -500, -500)); vp.dispatchEvent(ev("pointerup", -500, -500));
  const [dx0, dy0] = pos("d");
  const [px, py] = toScreen(dx0 + 10, dy0 + 10);
  node("d").dispatchEvent(ev("pointerdown", px, py));
  const targetY = 5; // 期望吸附到 a 的顶边 y=0
  node("d").dispatchEvent(ev("pointermove", px + 10 * v.k, py + (targetY - dy0) * v.k)); await sleep(40);
  const guidesShown = d.querySelectorAll("#guides line").length > 0;
  node("d").dispatchEvent(ev("pointerup", px + 10 * v.k, py + (targetY - dy0) * v.k)); await sleep(20);
  check("拖动接近对齐时自动吸附", pos("d")[1] === 0, "d.y=" + pos("d")[1]);
  check("吸附时显示参考线，松手后消失", guidesShown && d.querySelectorAll("#guides line").length === 0);
  // 按住 Alt 不吸附
  const [d1x, d1y] = pos("d"); const [qx, qy] = toScreen(d1x + 10, d1y + 10);
  node("d").dispatchEvent(ev("pointerdown", qx, qy)); node("d").dispatchEvent(ev("pointermove", qx, qy + 4 * v.k, { altKey: true })); await sleep(40); node("d").dispatchEvent(ev("pointerup", qx, qy + 4 * v.k, { altKey: true })); await sleep(20);
  check("按住 Alt 时不吸附", pos("d")[1] === 4, "d.y=" + pos("d")[1]);
  // 4. Shift 点击加选 + 对齐
  vp.dispatchEvent(ev("pointerdown", -500, -500)); vp.dispatchEvent(ev("pointerup", -500, -500));
  node("b").dispatchEvent(ev("pointerdown", 0, 0)); node("b").dispatchEvent(ev("pointerup", 0, 0));
  node("c").dispatchEvent(ev("pointerdown", 0, 0, { shiftKey: true })); node("c").dispatchEvent(ev("pointerup", 0, 0, { shiftKey: true }));
  check("Shift 点击加选", [...d.querySelectorAll(".node.sel")].length === 2);
  d.querySelector('[data-al="left"]').click(); await sleep(10);
  check("左对齐", pos("b")[0] === pos("c")[0], pos("b")[0] + "/" + pos("c")[0]);
  // 5. 等距需要至少 3 张
  check("少于 3 张时等距按钮禁用", d.querySelector('[data-al="hspace"]').disabled);
  // 6. 自动整理
  vp.dispatchEvent(ev("pointerdown", -500, -500)); vp.dispatchEvent(ev("pointerup", -500, -500));
  d.getElementById("tidyBtn").click(); await sleep(30);
  const pa = pos("a"), pb = pos("b"), pc = pos("c"), pd = pos("d");
  const noOverlap = (p, q) => p[0] + 300 <= q[0] || q[0] + 300 <= p[0] || p[1] + 200 <= q[1] || q[1] + 200 <= p[1];
  const all = [pa, pb, pc, pd]; let ok = true; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (!noOverlap(all[i], all[j])) ok = false;
  check("自动整理：按层级分列（父左子右）", pa[0] < pb[0] && pb[0] === pc[0] && pd[0] > pb[0], JSON.stringify(all));
  check("自动整理：卡片互不重叠，父与第一个子顶部对齐", ok && pa[1] === pb[1] && pb[1] === pd[1]);
  // 7. 撤销整理
  d.getElementById("undoBtn").click(); await sleep(30);
  check("整理可以撤销", JSON.stringify(pos("a")) !== JSON.stringify(pa) || JSON.stringify(pos("b")) !== JSON.stringify(pb));
  // 8. 抓手 / 空格平移
  const v0 = view();
  d.dispatchEvent(new w.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
  vp.dispatchEvent(ev("pointerdown", 100, 100)); vp.dispatchEvent(ev("pointermove", 160, 130)); await sleep(40); vp.dispatchEvent(ev("pointerup", 160, 130));
  d.dispatchEvent(new w.KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true })); await sleep(20);
  const v1 = view();
  check("按住空格拖动平移画布", Math.round(v1.x - v0.x) === 60 && Math.round(v1.y - v0.y) === 30, `${v1.x - v0.x},${v1.y - v0.y}`);
  // 9. 全选 + 删除多张
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
  check("⌘A 全选", d.querySelectorAll(".node.sel").length === d.querySelectorAll(".node").length && d.querySelectorAll(".node.sel").length >= 4, d.querySelectorAll(".node.sel").length + "/" + d.querySelectorAll(".node").length);
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
