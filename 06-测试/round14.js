const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const calls = [];
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} };
  w.createImageBitmap = async () => ({ width: 800, height: 600 });
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,QUFB";
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(4);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: "ME", name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "use_figma" && input.code.includes("exportAsync")) return { payload: { b64: "QUFBQQ==", name: "COCO 1", page: "AI生成图片" }, content: [] };
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: { maxCount: 5, mediaTypes: ["image/png", "image/jpeg"] } }), json: async () => ({ banners: [{ name: "A", width: 1080, height: 1350, title: "T", subtitle: "", coco: false, prompt: "p" }] }) };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
(async () => {
  await sleep(500);
  d.querySelector('.node[data-type="board"] .bfoot input[type=checkbox]').click(); await sleep(20);
  d.querySelector('.node[data-type="board"] .tk .gen').click(); await sleep(500);
  const p = () => d.querySelector('.node[data-type="prompt"] .refs');
  check("参考图区域有链接输入框", !!p().querySelector(".reflink"));
  // Figma 图层链接
  let inp = p().querySelector(".reflink"); inp.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x?node-id=418-183&t=abc"; 
  [...p().querySelectorAll(".linkrow button")][0].click(); await sleep(80);
  const ex = calls.find(c => c.t === "use_figma" && c.input.code.includes("exportAsync"));
  check("Figma 图层链接：用连接器导出该图层", ex && ex.input.fileKey === "1uVH1nbU0gUdFxayxCm3ul" && ex.input.code.includes('"418:183"'));
  check("导出的图层成为参考图", p().querySelectorAll(".ref img").length === 1 && /已从 Figma 读取「COCO 1」|已添加 1 张/.test(d.getElementById("toast").textContent), d.getElementById("toast").textContent);
  // 没有 node-id 的 Figma 链接
  inp = p().querySelector(".reflink"); inp.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x";
  [...p().querySelectorAll(".linkrow button")][0].click(); await sleep(30);
  check("Figma 链接缺 node-id 时说明怎么复制链接", /没有 node-id/.test(d.getElementById("toast").textContent));
  // 网页图片链接
  inp = p().querySelector(".reflink"); inp.value = "https://example.com/a.jpg";
  inp.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await sleep(30);
  check("网页图片链接：说明安全限制并引导复制粘贴", /复制图片/.test(d.getElementById("toast").textContent) && p().querySelectorAll(".ref img").length === 1);
  // data: 链接
  inp = p().querySelector(".reflink"); inp.value = "data:image/png;base64,QUFBQQ==";
  [...p().querySelectorAll(".linkrow button")][0].click(); await sleep(50);
  check("data: 图片链接可直接添加", p().querySelectorAll(".ref img").length === 2);
  // 粘贴图片文件
  const ev = new w.Event("paste", { bubbles: true, cancelable: true });
  ev.clipboardData = { files: [new w.File(["x"], "a.png", { type: "image/png" })], getData: () => "" };
  p().dispatchEvent(ev); await sleep(50);
  check("⌘V 粘贴图片可添加", p().querySelectorAll(".ref img").length === 3);
  // 拖入图片
  const dv = new w.Event("drop", { bubbles: true, cancelable: true });
  dv.dataTransfer = { files: [new w.File(["x"], "b.png", { type: "image/png" })], getData: () => "" };
  p().dispatchEvent(dv); await sleep(50);
  check("拖入图片可添加", p().querySelectorAll(".ref img").length === 4);
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
