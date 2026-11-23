const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const ME = "ME";
const calls = [], samples = [];
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} }; w.confirm = () => true;
  w.createImageBitmap = async () => ({ width: 1200, height: 800 });
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64," + "QUFB".repeat(50);
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(3);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://blockdance.atlassian.net", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: ME, name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") return { payload: { nodeId: "9:" + calls.length, image: { width: 1024, height: 1280 } }, content: [{ type: "image", data: "AAAA", mimeType: "image/png" }] };
    if (t === "use_figma") return { payload: { bannerId: "10:" + calls.length, width: 1080, height: 1350 }, content: [] };
    throw { code: "tool_error", message: "unexpected " + t }; } };
  const sample = { limits: async () => ({ images: { maxCount: 5, mediaTypes: ["image/png", "image/jpeg"] } }),
    json: async (txt, opts) => { samples.push({ txt, n: opts && opts.images ? opts.images.length : 0 }); return /banners/.test(txt) ? { banners: [{ name: "Liga MX Parlay", width: 1080, height: 1350, title: "T", subtitle: "", prompt: "p" }] } : { prompt: "rewritten with refs" }; } };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
async function addRefs(node, k) {
  const inp = node.querySelector('.refs input[type=file]');
  const files = Array.from({ length: k }, (_, i) => new w.File(["x"], "r" + i + ".png", { type: "image/png" }));
  Object.defineProperty(inp, "files", { value: files, configurable: true });
  inp.dispatchEvent(new w.Event("change")); await sleep(50);
}
(async () => {
  await sleep(500);
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x?node-id=274-751"; fi.dispatchEvent(new w.Event("input"));
  // 先拆解模式
  d.querySelector('.node[data-type="board"] .bfoot input[type=checkbox]').click(); await sleep(20);
  d.querySelector('.node[data-type="board"] .tk .gen').click(); await sleep(600);
  const split = d.querySelector('.node[data-type="split"]'), prompt = d.querySelector('.node[data-type="prompt"]');
  check("拆解与提示词节点都有参考图入口", !!split.querySelector(".refs") && !!prompt.querySelector(".refs"));
  await addRefs(prompt, 2);
  check("添加 2 张参考图并显示缩略图", prompt.querySelectorAll(".refs .ref img").length === 2);
  check("参考图可选用途", prompt.querySelectorAll(".refs .ref select").length === 2);
  check("参考图不进入画布存档（不拖慢撤销/拖拽）", !(w.localStorage.getItem("coco-banner-flow-v2") || "").includes("base64") && (w.localStorage.getItem("coco-ref-images-v1") || "").includes("base64"));
  [...prompt.querySelectorAll(".chipbtn")].find(b => /按意见 \/ 参考图改写/.test(b.textContent)).click(); await sleep(100);
  const last = samples[samples.length - 1];
  check("只有参考图也能改写，且把 2 张图发给 Claude", last && last.n === 2 && /随附 2 张参考图/.test(last.txt), last && last.n);
  check("改写结果写回提示词", prompt.querySelector('[data-key="prompt"]').value === "rewritten with refs");
  // 拆解节点整体参考图 → 重新拆解时带图
  await addRefs(split, 1);
  split.querySelector('.head .icon-btn').click(); await sleep(300);
  const sp = samples.filter(x => /banners/.test(x.txt)).pop();
  check("重新拆解时附带整体参考图", sp && sp.n === 1 && /整体参考图/.test(sp.txt));
  // 生成并检查命名参数
  d.querySelector(".confirm .go").click(); await sleep(600);
  const uf = calls.filter(c => c.t === "use_figma").pop();
  const code = uf ? uf.input.code : "";
  const key = d.querySelector('.node[data-type="jira"] select').value;
  check("合成时带上 Jira 单号和基础名", code.includes('"key":"' + key + '"') && code.includes('"baseName":"Liga MX Parlay"'), key);
  check("命名规则：Banner · 单号 · 名称 · 宽×高", code.includes('out.name = "Banner · " + (P.key ? P.key + " · " : "") + P.baseName + " · " + Math.round(out.width) + "×" + Math.round(out.height)'));
  // 拖拽：连线复用同一个 path 元素
  const pathBefore = d.querySelector("#edges path.edge");
  const head = prompt;
  head.setPointerCapture = () => {};
  head.dispatchEvent(new w.MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true, pointerId: 1 }));
  for (let i = 1; i <= 20; i++) head.dispatchEvent(new w.MouseEvent("pointermove", { clientX: 100 + i * 5, clientY: 100 + i * 3, bubbles: true, pointerId: 1 }));
  await sleep(50);
  head.dispatchEvent(new w.MouseEvent("pointerup", { clientX: 200, clientY: 160, bubbles: true, pointerId: 1 }));
  await sleep(50);
  check("拖拽时不重建连线（同一个元素被更新）", d.querySelector("#edges path.edge") === pathBefore);
  check("拖拽后节点位置已更新", parseInt(prompt.style.left) !== 0);
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
