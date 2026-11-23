const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} };
  let c = 0;
  const mcp = { callTool: async (s, t, input) => { c++; await sleep(4);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: "ME", name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") return { payload: { nodeId: "9:" + c }, content: [] };
    if (t === "use_figma") return { payload: { bannerId: "10:" + c, width: 1080, height: 1350 }, content: [] };
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: null }), json: async () => ({ banners: [{ name: "A", width: 1080, height: 1350, title: "T", subtitle: "", prompt: "p" }] }) };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
const nodes = () => d.querySelectorAll(".node").length;
const modalBtn = (txt) => [...d.querySelectorAll(".modal button")].find(b => b.textContent.includes(txt));
(async () => {
  await sleep(500);
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x"; fi.dispatchEvent(new w.Event("input"));
  const board = () => d.querySelector('.node[data-type="board"]');
  // 生成两个工单：一个跑完，一个只拆解（未完成）
  [...board().querySelectorAll(".tk")][0].querySelector(".gen").click(); await sleep(600);
  board().querySelector('.bfoot input[type=checkbox]').click(); await sleep(20);
  const r2 = [...board().querySelectorAll(".tk")].find(r => r.querySelector(".gen").textContent === "生成"); const key2 = r2.querySelector(".key").textContent;
  r2.querySelector(".gen").click(); await sleep(500);
  const key1 = [...board().querySelectorAll(".tk")].find(r => r.querySelector(".gen").textContent === "查看流程").querySelector(".key").textContent;
  check("已完成的工单分组框标记为完成", d.querySelectorAll("#groups .grp.done").length === 1, d.querySelectorAll("#groups .grp.done").length);
  const before = nodes();
  // 一键清理已完成
  d.getElementById("cleanBtn").click(); await sleep(30);
  check("清理前弹出确认，说明数量与成品不受影响", !!d.querySelector(".modal") && /移除 5 张卡片/.test(d.querySelector(".modal").textContent) && /不会被删除/.test(d.querySelector(".modal").textContent), d.querySelector(".modal") && d.querySelector(".modal").textContent.slice(0, 90));
  modalBtn("取消").click(); await sleep(20);
  check("取消后不删除", nodes() === before && !d.querySelector(".modal"));
  d.getElementById("cleanBtn").click(); await sleep(30); modalBtn("清理").click(); await sleep(50);
  check("确认后只清理已完成的工单（5 张卡片）", nodes() === before - 5, `${before}→${nodes()}`);
  check("未完成的工单保留", !!d.querySelector(`.node[data-type="jira"] select`) && [...d.querySelectorAll('.node[data-type="jira"] select')].some(s => s.value === key2));
  const row1 = [...board().querySelectorAll(".tk")].find(r => r.querySelector(".key").textContent === key1);
  check("看板上该工单显示「已完成 · 1 张」并可重新生成", row1 && /已完成 · 1 张/.test(row1.textContent) && row1.querySelector(".gen").textContent === "重新生成", row1 && row1.textContent.slice(0, 80));
  check("提示可撤销", /可撤销/.test(d.getElementById("toast").textContent));
  // 撤销
  d.getElementById("undoBtn").click(); await sleep(30);
  check("撤销后卡片回来", nodes() === before, `${nodes()}/${before}`);
  // 框选（全选）后清理所选：包含未完成工单时提醒
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true })); await sleep(10);
  d.querySelector('[data-al="clean"]').click(); await sleep(30);
  const mt = d.querySelector(".modal").textContent;
  check("清理所选时提醒还有未完成的工单，且不删看板", /还没完成/.test(mt) && /涉及 2 个工单/.test(mt), mt.slice(0, 120));
  modalBtn("清理").click(); await sleep(40);
  check("清理所选后只剩看板", nodes() === 1 && !!board());
  // 分组标签上的「清理」
  d.getElementById("undoBtn").click(); await sleep(30);
  const g = d.querySelector("#groups .grp.done");
  g.querySelector('[data-act="clean"]').dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 })); await sleep(30);
  check("分组标签「清理」也会弹确认", !!d.querySelector(".modal")); modalBtn("清理").click(); await sleep(30);
  // Delete 多选也走确认
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Delete", bubbles: true })); await sleep(20);
  check("多选按 Delete 也先确认", !!d.querySelector(".modal"));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(10);
  check("Esc 关闭确认", !d.querySelector(".modal"));
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
