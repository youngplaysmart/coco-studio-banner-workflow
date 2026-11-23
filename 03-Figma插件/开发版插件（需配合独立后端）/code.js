// Coco Banner — Figma 插件主线程
// 画布就是“无限画布”：需求卡片是真实图层，设计师直接在画布上改；
// 插件面板只负责：解析需求、选平台尺寸、触发生成。
// 注意：插件沙箱里避免使用 ?. 和 ??，保证兼容。

figma.showUI(__html__, { width: 340, height: 640, themeColors: true });

// ---------- 样式 ----------
var COLOR = {
  section: "#121318",
  card: "#1D1E24",
  box: "#15161B",
  line: "#2E3038",
  text: "#F2F2F5",
  muted: "#9A9CA8",
  accent: "#B79CFF",
  slot: "#5A5D6B",
};
var FONT = { r: { family: "Inter", style: "Regular" }, b: { family: "Inter", style: "Bold" } };
var SUBLINE_PLACEHOLDER = "（没有副标题可以留空或删掉这行）";

function rgb(hex) {
  var n = parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function solid(hex, opacity) {
  return [{ type: "SOLID", color: rgb(hex), opacity: opacity == null ? 1 : opacity }];
}

async function loadFonts() {
  var candidates = [
    ["Noto Sans SC", "Regular", "Bold"],
    ["PingFang SC", "Regular", "Semibold"],
    ["Inter", "Regular", "Bold"],
  ];
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    try {
      await figma.loadFontAsync({ family: c[0], style: c[1] });
      await figma.loadFontAsync({ family: c[0], style: c[2] });
      FONT = { r: { family: c[0], style: c[1] }, b: { family: c[0], style: c[2] } };
      return;
    } catch (e) {}
  }
}

// ---------- 小工具 ----------
function txt(chars, size, color, bold) {
  var t = figma.createText();
  t.fontName = bold ? FONT.b : FONT.r;
  t.fontSize = size;
  t.characters = chars && chars.length ? chars : " ";
  t.fills = solid(color);
  t.lineHeight = { unit: "PERCENT", value: 150 };
  return t;
}

function appendFill(parent, node) {
  parent.appendChild(node);
  node.layoutSizingHorizontal = "FILL";
  if (node.type === "TEXT") node.textAutoResize = "HEIGHT";
  return node;
}

function vstack(name, spacing) {
  var f = figma.createFrame();
  f.name = name;
  f.layoutMode = "VERTICAL";
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "FIXED";
  f.itemSpacing = spacing;
  f.fills = [];
  return f;
}

function card(title, hint, width) {
  var f = vstack(title, 12);
  f.resize(width, 100);
  f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = 20;
  f.cornerRadius = 12;
  f.fills = solid(COLOR.card);
  f.strokes = solid(COLOR.line);
  f.strokeWeight = 1;
  appendFill(f, txt(title, 16, COLOR.text, true));
  if (hint) appendFill(f, txt(hint, 12, COLOR.muted, false));
  return f;
}

// 可编辑的文字框：role 用来在生成时把文字读回来
function editBox(parent, label, value, role, size) {
  if (label) appendFill(parent, txt(label, 12, COLOR.muted, false));
  var box = vstack(label || role, 0);
  box.paddingLeft = box.paddingRight = 14;
  box.paddingTop = box.paddingBottom = 12;
  box.cornerRadius = 8;
  box.fills = solid(COLOR.box);
  box.strokes = solid(COLOR.line);
  appendFill(parent, box);
  var t = appendFill(box, txt(value, size || 14, COLOR.text, false));
  t.name = role;
  t.setPluginData("role", role);
  return t;
}

function slot(label, role, index) {
  var s = figma.createFrame();
  s.name = "拖入图片 · " + label;
  s.layoutMode = "VERTICAL";
  s.primaryAxisAlignItems = "CENTER";
  s.counterAxisAlignItems = "CENTER";
  s.primaryAxisSizingMode = "FIXED";
  s.counterAxisSizingMode = "FIXED";
  s.resize(112, 112);
  s.cornerRadius = 8;
  s.clipsContent = true;
  s.fills = solid(COLOR.box);
  s.strokes = solid(COLOR.slot);
  s.dashPattern = [4, 4];
  s.setPluginData("role", role);
  s.setPluginData("index", String(index));
  var t = txt("+ " + label, 12, COLOR.muted, false);
  t.name = "提示";
  s.appendChild(t);
  return s;
}

function putImageInSlot(s, base64) {
  var img = figma.createImage(figma.base64Decode(base64));
  s.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }];
  s.strokes = [];
  for (var i = 0; i < s.children.length; i++) s.children[i].visible = false;
}

function imageHashOf(n) {
  if (!("fills" in n) || n.fills === figma.mixed) return null;
  for (var i = 0; i < n.fills.length; i++) {
    var p = n.fills[i];
    if (p.type === "IMAGE" && p.visible !== false && p.imageHash) return p.imageHash;
  }
  return null;
}

// 角色识别：优先读 pluginData；没有时按图层名识别
// （手动复制的画布、或通过 Figma MCP 铺出来的测试画布都没有 pluginData）
var TEXT_ROLES = ["prompt", "negative", "headline", "subline"];
function roleOf(n) {
  var r = n.getPluginData("role");
  if (r) return r;
  if (n.type === "TEXT" && TEXT_ROLES.indexOf(n.name) >= 0) return n.name;
  if (n.type === "FRAME" && n.name.indexOf("拖入图片 · ") === 0) {
    return n.name === "拖入图片 · Coco" ? "character" : "ref";
  }
  return "";
}
function isCocoSection(n) {
  return n.type === "SECTION" && (!!n.getPluginData("coco") || n.name.indexOf("Coco 灵感海报") === 0);
}

// 槽位本身的图片填充，或设计师拖进槽位的图片图层
async function slotImage(s) {
  var hash = imageHashOf(s);
  if (!hash) {
    var child = s.findOne(function (n) { return n.visible && !!imageHashOf(n); });
    if (child) hash = imageHashOf(child);
  }
  if (!hash) return null;
  var img = figma.getImageByHash(hash);
  if (!img) return null;
  return figma.base64Encode(await img.getBytesAsync());
}

function rightmostX() {
  var max = 0;
  var kids = figma.currentPage.children;
  for (var i = 0; i < kids.length; i++) max = Math.max(max, kids[i].x + kids[i].width);
  return kids.length ? max + 200 : 0;
}

// ---------- 1. 把草稿铺到画布 ----------
async function buildCanvas(draft, images) {
  var key = draft.issue_key || "手动需求";
  var sec = figma.createSection();
  sec.name = "Coco 灵感海报 · " + key;
  sec.fills = solid(COLOR.section);
  sec.x = rightmostX();
  sec.y = 0;

  var h1 = txt((draft.title || "灵感海报") + " · " + key, 28, COLOR.text, true);
  h1.x = 40; h1.y = 40; sec.appendChild(h1);
  var h2 = txt("直接在画布上改文字、把图片拖进虚线框；改好后回到插件面板点「生成 Banner」。", 13, COLOR.muted, false);
  h2.x = 40; h2.y = 88; sec.appendChild(h2);

  // 第 1 列：Jira 原始需求
  var src = card("Jira 需求", key, 300);
  if (draft.issue_url) appendFill(src, txt(draft.issue_url, 11, COLOR.accent, false));
  appendFill(src, txt(draft.source_text || "", 13, COLOR.muted, false));
  src.x = 40; src.y = 140; sec.appendChild(src);

  // 第 2 列：提示词 + 文案
  var p = card("画面提示词", "AI 根据需求补全，可以直接改写", 480);
  editBox(p, null, draft.prompt, "prompt", 14);
  editBox(p, "避免", draft.negative, "negative", 13);
  p.x = 380; p.y = 140; sec.appendChild(p);

  var c = card("海报文案", "生成后会叠成可编辑的文字图层，不交给模型画", 480);
  editBox(c, "主标题", draft.headline, "headline", 18);
  var sub = editBox(c, "副标题", draft.subline || SUBLINE_PLACEHOLDER, "subline", 14);
  if (!draft.subline) sub.fills = solid(COLOR.muted);
  c.x = 380; c.y = p.y + p.height + 24; sec.appendChild(c);

  // 第 3 列：背景参考 + 角色
  var r = card("背景参考", "把图片拖进虚线框即可替换，空着的会被忽略", 400);
  var row = figma.createFrame();
  row.name = "参考图";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 12;
  row.fills = [];
  row.primaryAxisSizingMode = "AUTO";
  row.counterAxisSizingMode = "AUTO";
  var roles = draft.ref_roles && draft.ref_roles.length ? draft.ref_roles : [];
  var defaults = ["场景", "氛围", "构图"];
  for (var i = 0; i < 3; i++) {
    var s = slot(roles[i] || defaults[i], "ref", i);
    row.appendChild(s);
    if (images && images[i]) putImageInSlot(s, images[i].data);
  }
  r.appendChild(row);
  r.x = 900; r.y = 140; sec.appendChild(r);

  var ch = card("角色参考 · Coco", "放 Coco 标准形象；留空则使用后端默认形象", 400);
  ch.appendChild(slot("Coco", "character", 0));
  ch.x = 900; ch.y = r.y + r.height + 24; sec.appendChild(ch);

  // 收尺寸
  var w = 0, hgt = 0;
  for (var k = 0; k < sec.children.length; k++) {
    var n = sec.children[k];
    w = Math.max(w, n.x + n.width);
    hgt = Math.max(hgt, n.y + n.height);
  }
  sec.resizeWithoutConstraints(w + 40, hgt + 40);

  var meta = {
    title: draft.title, issue_key: draft.issue_key, issue_url: draft.issue_url,
    platform: draft.platform, width: draft.width, height: draft.height,
    use_character: !!draft.use_character,
  };
  sec.setPluginData("coco", JSON.stringify(meta));
  figma.currentPage.setPluginData("lastSection", sec.id);
  figma.currentPage.selection = [sec];
  figma.viewport.scrollAndZoomIntoView([sec]);
  return sec;
}

// ---------- 找当前画布 ----------
async function activeSection() {
  var n = figma.currentPage.selection[0];
  while (n && n.type !== "PAGE") {
    if (isCocoSection(n)) return n;
    // 选中的是生成结果时，回到它的来源画布
    if (n.getPluginData && n.getPluginData("cocoResult")) {
      var src = await figma.getNodeByIdAsync(n.getPluginData("cocoResult"));
      if (src) return src;
    }
    n = n.parent;
  }
  var id = figma.currentPage.getPluginData("lastSection");
  if (id) {
    var last = await figma.getNodeByIdAsync(id);
    if (last && !last.removed) return last;
  }
  // 兜底：当前页上最后一块 Coco 画布
  var secs = figma.currentPage.findChildren(isCocoSection);
  return secs.length ? secs[secs.length - 1] : null;
}

function readMeta(sec) {
  try { return JSON.parse(sec.getPluginData("coco")); } catch (e) {
    return { title: sec.name, platform: "小红书", width: 1080, height: 1440, use_character: true };
  }
}

async function sendContext() {
  var sec = await activeSection();
  figma.ui.postMessage({
    type: "context",
    hasCanvas: !!sec,
    sectionId: sec ? sec.id : null,
    name: sec ? sec.name : null,
    meta: sec ? readMeta(sec) : null,
  });
}

// ---------- 2. 读回设计师修改后的内容 ----------
function roleText(sec, role) {
  var t = sec.findOne(function (n) { return n.type === "TEXT" && roleOf(n) === role; });
  return t ? t.characters.trim() : "";
}

async function collect(sec) {
  // findAll 按图层顺序返回，正好是 场景 → 氛围 → 构图
  var slots = sec.findAll(function (n) { return roleOf(n) === "ref"; });
  var refs = [];
  for (var i = 0; i < slots.length; i++) {
    var b64 = await slotImage(slots[i]);
    if (b64) refs.push(b64);
  }
  var charSlot = sec.findOne(function (n) { return roleOf(n) === "character"; });
  var subline = roleText(sec, "subline");
  if (subline === SUBLINE_PLACEHOLDER) subline = "";
  return {
    prompt: roleText(sec, "prompt"),
    negative: roleText(sec, "negative"),
    headline: roleText(sec, "headline"),
    subline: subline,
    references: refs,
    character: charSlot ? await slotImage(charSlot) : null,
  };
}

// ---------- 3. 把生成结果落到画布 ----------
async function placeResult(sec, image, meta, headline, subline) {
  var W = meta.width, H = meta.height;
  var siblings = figma.currentPage.findChildren(function (n) { return n.getPluginData("cocoResult") === sec.id; });

  var f = figma.createFrame();
  f.name = "Banner · " + (meta.platform || "自定义") + " " + W + "×" + H;
  f.resize(W, H);
  f.clipsContent = true;
  var img = figma.createImage(figma.base64Decode(image));
  f.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }];
  f.x = sec.x + sec.width + 120 + siblings.length * (W + 80);
  f.y = sec.y;
  f.setPluginData("cocoResult", sec.id);

  var shadow = [{
    type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.35 }, offset: { x: 0, y: 2 },
    radius: Math.round(W * 0.01), spread: 0, visible: true, blendMode: "NORMAL",
  }];
  var pad = Math.round(W * 0.08);
  var y = Math.round(H * 0.07);
  if (headline) {
    var t = txt(headline, Math.round(W * 0.075), "#FFFFFF", true);
    t.name = "主标题（可编辑）";
    t.lineHeight = { unit: "PERCENT", value: 130 };
    t.effects = shadow;
    f.appendChild(t);
    t.x = pad; t.y = y;
    t.resize(W - pad * 2, t.height);
    t.textAutoResize = "HEIGHT";
    y += t.height + Math.round(W * 0.02);
  }
  if (subline) {
    var s = txt(subline, Math.round(W * 0.035), "#FFFFFF", false);
    s.name = "副标题（可编辑）";
    s.effects = shadow;
    f.appendChild(s);
    s.x = pad; s.y = y;
    s.resize(W - pad * 2, s.height);
    s.textAutoResize = "HEIGHT";
  }
  figma.currentPage.selection = [f];
  figma.viewport.scrollAndZoomIntoView([sec, f]);
}

// ---------- 提示词库（存在本机 clientStorage） ----------
async function getHistory() {
  return (await figma.clientStorage.getAsync("cocoPrompts")) || [];
}

async function setText(node, value) {
  var fonts = node.getRangeAllFontNames(0, node.characters.length);
  for (var i = 0; i < fonts.length; i++) await figma.loadFontAsync(fonts[i]);
  node.characters = value && value.length ? value : " ";
}

// ---------- 消息 ----------
figma.ui.onmessage = async function (msg) {
  var reply = function (data) { data.reqId = msg.reqId; figma.ui.postMessage(data); };
  try {
    if (msg.type === "save-settings") {
      await figma.clientStorage.setAsync("cocoSettings", msg.settings);
    } else if (msg.type === "build") {
      await buildCanvas(msg.draft, msg.images);
      figma.notify("需求草稿已铺到画布");
      await sendContext();
    } else if (msg.type === "update-meta") {
      var sec1 = await activeSection();
      if (sec1) sec1.setPluginData("coco", JSON.stringify(msg.meta));
    } else if (msg.type === "collect") {
      var sec2 = await activeSection();
      if (!sec2) throw new Error("没有找到需求画布，请先解析需求，或选中一个 Coco 画布");
      var data = await collect(sec2);
      reply({ type: "collected", sectionId: sec2.id, meta: readMeta(sec2), payload: data });
    } else if (msg.type === "place") {
      var sec3 = await figma.getNodeByIdAsync(msg.sectionId);
      if (!sec3) throw new Error("来源画布已被删除");
      await placeResult(sec3, msg.image, msg.meta, msg.headline, msg.subline);
      figma.notify("Banner 已生成，文字图层可以直接编辑");
      reply({ type: "placed" });
    } else if (msg.type === "save-prompt") {
      var sec4 = await activeSection();
      if (!sec4) throw new Error("没有可保存的提示词");
      var list = await getHistory();
      list.unshift({ prompt: roleText(sec4, "prompt"), negative: roleText(sec4, "negative"), savedAt: Date.now() });
      await figma.clientStorage.setAsync("cocoPrompts", list.slice(0, 30));
      figma.notify("已保存到提示词库");
      figma.ui.postMessage({ type: "history", history: list.slice(0, 30) });
    } else if (msg.type === "delete-prompt") {
      var l2 = await getHistory();
      l2.splice(msg.index, 1);
      await figma.clientStorage.setAsync("cocoPrompts", l2);
      figma.ui.postMessage({ type: "history", history: l2 });
    } else if (msg.type === "apply-prompt") {
      var sec5 = await activeSection();
      if (!sec5) throw new Error("请先选中一个 Coco 画布");
      var item = (await getHistory())[msg.index];
      var pNode = sec5.findOne(function (n) { return n.type === "TEXT" && roleOf(n) === "prompt"; });
      var nNode = sec5.findOne(function (n) { return n.type === "TEXT" && roleOf(n) === "negative"; });
      if (pNode) await setText(pNode, item.prompt);
      if (nNode) await setText(nNode, item.negative);
      figma.notify("已替换当前画布的提示词");
    }
  } catch (e) {
    reply({ type: "error", message: String(e && e.message ? e.message : e) });
  }
};

figma.on("selectionchange", function () { sendContext(); });

(async function init() {
  await loadFonts();
  figma.ui.postMessage({
    type: "init",
    settings: (await figma.clientStorage.getAsync("cocoSettings")) || { apiBase: "http://localhost:8000", token: "" },
    history: await getHistory(),
  });
  await sendContext();
})();
