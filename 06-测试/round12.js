const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const calls = []; let edited = false;
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} };
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(4);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: "ME", name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") return { payload: { nodeId: "9:" + calls.length }, content: [] };
    if (t === "use_figma") {
      if (input.code.includes("master.clone")) return { payload: { nodeId: "77:1", hashes: ["a", "b"] }, content: [] };
      if (input.code.includes("return { exists: true, hashes }")) return { payload: { exists: true, hashes: edited ? ["a", "b", "c"] : ["a", "b"] }, content: [] };
      return { payload: { bannerId: "10:" + calls.length, width: 1080, height: 1350 }, content: [] };
    }
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: null }), json: async () => ({ banners: [{ name: "Coco 庆祝", width: 1080, height: 1350, title: "T", subtitle: "", coco: true, prompt: "Coco jumps with joy in a stadium. No text, no letters, no numbers, no logos, no watermark." }, { name: "纯背景", width: 1080, height: 1350, title: "T2", subtitle: "", coco: false, prompt: "Stadium. No text, no letters, no numbers, no logos, no watermark." }] }) };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
const t = (x) => calls.filter(c => c.t === x).length;
(async () => {
  await sleep(500);
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x?node-id=274-751"; fi.dispatchEvent(new w.Event("input"));
  d.querySelector('.node[data-type="board"] .bfoot input[type=checkbox]').click(); await sleep(20);
  d.querySelector('.node[data-type="board"] .tk .gen').click(); await sleep(500);
  check("确认面板显示 Coco 图走 Figma 改图，预计生图只算普通图", /在 Figma 里改图/.test(d.querySelector(".confirm").textContent) && /确认并生成 1 张图/.test(d.querySelector(".confirm .go").textContent), d.querySelector(".confirm .go").textContent);
  d.querySelector(".confirm .go").click(); await sleep(700);
  const imgs = [...d.querySelectorAll('.node[data-type="image"]')];
  const waiting = imgs.filter(n => n.dataset.status === "waiting");
  check("Coco 图停在「待改图」，普通图正常生成并合成", waiting.length === 1 && t("generate_image") === 1 && imgs.some(n => n.dataset.status === "done"), `${waiting.length} / gen ${t("generate_image")}`);
  const clone = calls.find(c => c.t === "use_figma" && c.input.code.includes("master.clone"));
  check("复制的是 Figma 里的 Coco 母版 418:183，放到链接所在页", clone && clone.input.code.includes('"masterId":"418:183"') && clone.input.code.includes('"targetNodeId":"274:751"'));
  const panel = waiting[0].querySelector(".editbox");
  const prompt = panel && panel.querySelector("textarea").value; console.error("PROMPT:", JSON.stringify(prompt));
  check("卡片上给出改图步骤和提示词（保持五官与比例）", panel && /保持 Coco 的五官/.test(prompt) && /身体比例完全不变/.test(prompt) && /jumps with joy/.test(prompt) && !/no letters/.test(prompt));
  check("完成汇总提示还有图等改图", /等你在 Figma 里改图/.test(d.querySelector(".confirm .prog").textContent));
  // 没改就点继续
  const before = t("use_figma");
  [...panel.querySelectorAll("button")].find(b => b.textContent === "我已改好，继续").click(); await sleep(200);
  check("还没改就点继续：提示先改图，仍待改图", /还没改/.test(d.getElementById("toast").textContent) && waiting[0].dataset.status === "waiting", d.getElementById("toast").textContent);
  // 改好后继续
  edited = true;
  [...waiting[0].querySelectorAll(".editbox button")].find(b => b.textContent === "我已改好，继续").click(); await sleep(300);
  const composeCalls = calls.filter(c => c.t === "use_figma" && c.input.code.includes("imageNodeId"));
  const last = composeCalls[composeCalls.length - 1];
  check("改好后用改过的 Coco 图层合成 Banner", waiting[0].dataset.status === "done" && last && last.input.code.includes('"imageNodeId":"77:1"'));
  check("全程没有额外调用其他生图工具", !calls.some(c => /weave/.test(c.t)) && t("generate_image") === 1);
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
