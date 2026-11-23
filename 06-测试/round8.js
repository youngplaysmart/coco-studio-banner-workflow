const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const ME = "ME";
const calls = []; let slow = 3;
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} }; w.confirm = () => true;
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(slow);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: ME, name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") return { payload: { nodeId: "9:" + calls.length, image: { width: 1024, height: 1280 } }, content: [{ type: "image", data: "AAAA", mimeType: "image/png" }] };
    if (t === "use_figma") return { payload: { bannerId: "10:" + calls.length, width: 1080, height: 1350 }, content: [] };
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: null }), json: async () => ({ banners: [{ name: "图A", width: 1080, height: 1350, title: "T", subtitle: "", prompt: "p" }, { name: "图B", width: 1080, height: 1350, title: "T2", subtitle: "", prompt: "p2" }] }) };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
const count = (t) => calls.filter(c => c.t === t).length;
(async () => {
  await sleep(500);
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x?node-id=274-751"; fi.dispatchEvent(new w.Event("input"));
  const board = () => d.querySelector('.node[data-type="board"]');
  const rows = [...board().querySelectorAll(".tk")].slice(0, 3);
  rows.forEach(r => r.click()); await sleep(20);
  calls.length = 0; slow = 15;
  board().querySelector(".bfoot .btn.primary").click(); await sleep(40);
  const q = d.getElementById("queue");
  check("批量生成时出现运行队列", !q.hidden && q.querySelectorAll("li").length === 3, q.textContent.slice(0, 80));
  check("队列显示进度 0/3 且第一个在运行", /运行队列 0\/3/.test(q.textContent) && q.querySelectorAll("li.q-running").length === 1);
  const runningNode = d.querySelector('.node[data-status="running"]');
  check("正在执行的卡片被高亮（运行状态）", !!runningNode);
  // 运行中再点另一个工单的生成：加入队列而不是被拒绝
  const extra = [...board().querySelectorAll(".tk")].find(r => r.querySelector(".gen").textContent === "生成");
  extra.querySelector(".gen").click(); await sleep(20);
  check("运行中点生成会追加到队列", q.querySelectorAll("li").length === 4, q.querySelectorAll("li").length);
  // 取消剩余
  await sleep(200);
  [...q.querySelectorAll(".chipbtn")].find(b => b.textContent === "取消剩余").click();
  await sleep(1500);
  const states = [...q.querySelectorAll("li")].map(li => li.className.replace("q-", "")).join(",");
  check("取消剩余后，当前工单做完、其余标记为取消", /done/.test(states) && /cancelled/.test(states) && !/waiting|running/.test(states), states);
  check("队列显示预计生图次数", /预计生图 \d+ 次/.test(q.textContent), q.querySelector(".qmeta").textContent);
  // 分组框
  const groups = d.querySelectorAll("#groups .grp");
  check("每个工单一个分组框", groups.length === d.querySelectorAll('.node[data-type="jira"]').length && groups.length >= 4, groups.length);
  const g0 = groups[0];
  check("分组标题显示单号与进度", /DEMO-\d+/.test(g0.querySelector(".gkey").textContent) && /Banner \d\/\d|待运行/.test(g0.querySelector(".gstat").textContent), g0.textContent.slice(0, 80));
  // 选中整组
  g0.querySelector('[data-act="sel"]').dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  const selN = d.querySelectorAll(".node.sel").length;
  check("点「选中」选中整组卡片", selN >= 5, selN);
  // 整组拖动
  const jid = g0.dataset.g; const jEl = d.querySelector(`.node[data-id="${jid}"]`);
  const x0 = parseInt(jEl.style.left);
  const lab = g0.querySelector(".glabel"); lab.setPointerCapture = () => {};
  lab.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
  lab.dispatchEvent(new w.MouseEvent("pointermove", { bubbles: true, clientX: 210, clientY: 10, altKey: true })); await sleep(40);
  lab.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: 210, clientY: 10, altKey: true })); await sleep(20);
  check("按住分组标题拖动整组", parseInt(jEl.style.left) > x0, x0 + "→" + jEl.style.left);
  // 固定生成图：改标题后重新运行整组，不再生图，只重新合成
  const firstImg = [...d.querySelectorAll('.node[data-type="image"]')].find(n => n.dataset.status === "done");
  [...firstImg.querySelectorAll(".pinbtn")][0].click(); await sleep(20);
  check("可以固定生成图", firstImg.querySelector(".pinbtn").classList.contains("on"));
  // 找到它的提示词节点并改标题
  const prompts = [...d.querySelectorAll('.node[data-type="prompt"]')];
  const titleInp = prompts.map(p => p.querySelector('[data-key="title"]')).find(Boolean);
  // 用同组的提示词：找到与 firstImg 相连的那个（通过顺序近似：第一个已完成的提示词）
  const pDone = prompts.find(p => p.dataset.status === "done");
  const ti = pDone.querySelector('[data-key="title"]'); ti.value = "NEW TITLE"; ti.dispatchEvent(new w.Event("input")); await sleep(20);
  const imgsDoneAfterEdit = [...d.querySelectorAll('.node[data-type="image"]')].filter(n => n.dataset.status === "done").length;
  check("改标题后，固定的生成图仍是已完成（不需重跑）", firstImg.dataset.status === "done", firstImg.dataset.status);
  calls.length = 0;
  const grpOfImg = [...d.querySelectorAll("#groups .grp")].find(g => g.dataset.g); // 运行第一个组
  g0.querySelector('[data-act="run"]').dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  await sleep(1200);
  check("运行整组：固定的图跳过生图，只重新合成", count("use_figma") >= 1 && count("generate_image") <= 1, `生图 ${count("generate_image")} 次，合成 ${count("use_figma")} 次`);
  const lastCompose = calls.filter(c => c.t === "use_figma").map(c => c.input.code).find(c => c.includes("NEW TITLE"));
  check("合成用了新标题", !!lastCompose);
  // 确认面板不把固定的图计入生图次数
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
