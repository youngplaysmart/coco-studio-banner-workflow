const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const ME = "ME";
const calls = []; let extra = null, failOnce = 0;
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} };
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(4);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: ME, name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") { const pg = input.nextPageToken ? fx.p2 : fx.p1; if (extra && input.nextPageToken) return { payload: Object.assign({}, pg, { issues: pg.issues.concat([extra]) }), content: [] }; return { payload: pg, content: [] }; }
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") { if (failOnce > 0) { failOnce--; throw { code: "server_unavailable", server: "Figma", message: "busy", retryable: true, retryAfterMs: 10 }; } return { payload: { nodeId: "9:" + calls.length }, content: [] }; }
    if (t === "use_figma") return { payload: { bannerId: "10:" + calls.length, width: 1080, height: 1350 }, content: [] };
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: null }), json: async () => ({ banners: [{ name: "A", width: 1080, height: 1350, title: "T", subtitle: "", coco: false, prompt: "p" }, { name: "B", width: 1080, height: 1350, title: "T", subtitle: "", coco: false, prompt: "p2" }] }) };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
const t = (x) => calls.filter(c => c.t === x).length;
(async () => {
  await sleep(600);
  check("首次读取不会把现有工单全部自动处理", d.querySelectorAll('.node[data-type="jira"]').length === 0);
  d.getElementById("autoBtn").click(); await sleep(10);
  const ap = d.getElementById("autoPanel");
  check("自动化面板：默认自动刷新、自动拆解开启，自动生图关闭", !ap.hidden && /每 10 分钟自动刷新/.test(ap.textContent) && /立即处理我负责的未开始工单（8）/.test(ap.textContent));
  // 新出现一个我负责的工单
  extra = JSON.parse(JSON.stringify(fx.p1.issues.find(i => i.fields.assignee && i.fields.assignee.accountId === ME)));
  extra.key = "DEMO-999"; extra.fields.summary = "新需求 Banner";
  [...d.querySelector('.node[data-type="board"]').querySelectorAll(".chipbtn")].find(b => b.textContent === "刷新").click(); await sleep(800);
  const jn = [...d.querySelectorAll('.node[data-type="jira"] select')].map(s => s.value);
  check("新出现的我负责工单被自动建流程并拆解", jn.includes("DEMO-999") && t("getJiraIssue") === 1, jn.join(","));
  check("自动拆解不生图", t("generate_image") === 0);
  const row = [...d.querySelectorAll(".tk")].find(r => r.querySelector(".key").textContent === "DEMO-999");
  check("看板显示「已在画布」", row && /已在画布/.test(row.textContent));
  // 开启自动生图，上限 1 次，立即处理全部
  const autoGen = [...ap.querySelectorAll(".arow")].find(r => /自动生图并合成/.test(r.textContent)).querySelector("input"); autoGen.click(); await sleep(10);
  const capInp = ap.querySelector(".acap"); capInp.value = "1"; capInp.dispatchEvent(new w.Event("change"));
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x"; fi.dispatchEvent(new w.Event("input"));
  failOnce = 1; calls.length = 0;
  [...ap.querySelectorAll("button")].find(b => /立即处理/.test(b.textContent)).click(); await sleep(2500);
  check("立即处理：其余我负责的工单全部建流程", d.querySelectorAll('.node[data-type="jira"]').length === 9, d.querySelectorAll('.node[data-type="jira"]').length);
  check("自动生图遵守每轮上限（1 次）", t("generate_image") === 2 /* 1 次失败 + 1 次重试 */, t("generate_image"));
  check("临时出错自动重试成功", d.querySelectorAll('.node[data-type="image"][data-status="done"]').length === 1);
  console.error("Q:", d.getElementById("queue").hidden, d.getElementById("queue").textContent.slice(0,400)); check("超出上限的在队列里标明等你确认", /超出本轮自动生图上限|等你确认/.test(d.getElementById("queue").textContent));
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
