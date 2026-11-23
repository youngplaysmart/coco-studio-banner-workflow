const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const calls = [], samples = [];
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} };
  w.localStorage.setItem("coco-banner-flow-v2", JSON.stringify({ file: "", nodes: [], edges: [], seq: 1, cocoMode: "text" }));
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(4);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: "ME", name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") return { payload: { nodeId: "9:" + calls.length }, content: [] };
    if (t === "use_figma") return { payload: { bannerId: "10:" + calls.length, width: 1080, height: 1350 }, content: [] };
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: { maxCount: 5, mediaTypes: ["image/png", "image/jpeg"] } }),
    json: async (txt, opts) => { samples.push({ txt, n: opts && opts.images ? opts.images.length : 0 }); return /banners/.test(txt)
      ? { banners: [{ name: "有Coco", width: 1080, height: 1350, title: "T", subtitle: "", coco: true, prompt: "Coco gives a thumbs up on the right. No text, no letters, no numbers, no logos, no watermark." }, { name: "纯背景", width: 1080, height: 1350, title: "T2", subtitle: "", coco: false, prompt: "Stadium at night. No text, no letters, no numbers, no logos, no watermark." }] }
      : { prompt: "Coco dances on the left. No text, no letters, no numbers, no logos, no watermark." }; } };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
(async () => {
  await sleep(500);
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x"; fi.dispatchEvent(new w.Event("input"));
  d.querySelector('.node[data-type="board"] .tk .gen').click(); await sleep(900);
  const split = samples.find(x => /banners/.test(x.txt));
  check("拆解时要求判断是否用到 Coco，且只写动作位置", /coco 为 true/.test(split.txt) && /不要描述它的外观/.test(split.txt));
  const ps = [...d.querySelectorAll('.node[data-type="prompt"]')];
  const cb = (p) => p.querySelector(".cocorow input");
  check("用到 Coco 的提示词卡片自动勾选标准形象，并显示 Coco 缩略图", ps.length === 2 && ps.filter(p => cb(p).checked).length === 1 && ps[0].querySelector(".cocorow img").src.startsWith("data:image/jpeg"));
  const gens = calls.filter(c => c.t === "generate_image").map(c => c.input.prompt);
  const withCoco = gens.find(g => /thumbs up/.test(g)), without = gens.find(g => /Stadium/.test(g));
  check("生图时自动附上 Coco 标准外观", withCoco && /red-orange skin/.test(withCoco) && /burnt-orange crewneck sweatshirt/.test(withCoco) && /gold curb-chain necklace/.test(withCoco));
  check("用到 Coco 时放开衣服上的 COCO 字样", withCoco && /No other text/.test(withCoco) && /"COCO"/.test(withCoco) && !/no letters/.test(withCoco));
  check("没用 Coco 的图不附角色描述", without && !/crocodile/.test(without) && /no letters/.test(without));
  // 改写时附上 Coco 标准形象图
  const pc = ps.find(p => cb(p).checked);
  [...pc.querySelectorAll(".chipbtn")].find(b => /改写/.test(b.textContent)).click(); await sleep(80);
  const rw = samples[samples.length - 1];
  check("改写时把 Coco 标准形象图交给 Claude，并要求不改外观", rw.n === 1 && /不要改写或描述它的外观/.test(rw.txt), rw.n);
  // 手动关掉开关后不附
  cb(pc).click(); await sleep(10);
  check("取消勾选后，下游标为需重跑", pc.closest(".node") && [...d.querySelectorAll('.node[data-type="image"]')].some(n => n.dataset.status === "stale"));
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
