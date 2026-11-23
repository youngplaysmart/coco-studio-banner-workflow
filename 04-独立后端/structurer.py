"""把一段需求文字拆成画布卡片需要的结构化草稿。

有 ANTHROPIC_API_KEY 时调用 Claude；没有时用规则兜底，保证流程能跑通。
"""
import json
import os
import re

import httpx

PLATFORM_SIZES = {
    "小红书": [1080, 1440],
    "抖音": [1080, 1920],
    "快手": [1080, 1920],
    "Instagram": [1080, 1350],
    "TikTok": [1080, 1920],
    "YouTube": [1280, 720],
    "B 站": [1920, 1080],
    "微信": [900, 383],
}

SYSTEM = """你是游戏/IP 营销海报的需求整理助手。把需求文字拆成 JSON，只输出 JSON，不要任何解释或 Markdown。
字段：
{
  "title": "海报名称，10 字以内",
  "platform": "小红书|抖音|快手|Instagram|TikTok|YouTube|B 站|微信 之一，需求没写默认小红书",
  "use_character": true/false（需求提到 Coco 或角色时为 true）,
  "ref_count": 参考图数量 0-3,
  "ref_roles": ["场景","氛围","构图"] 这类，长度等于 ref_count,
  "prompt": "中文画面提示词，3-5 句，描述主体、场景、光线、构图；必须为标题预留干净的排版空间；不要要求画面里出现文字",
  "negative": "需要避免的内容，一句话",
  "headline": "主标题文案（照抄需求里的文案，保留换行用 \\n）",
  "subline": "副标题，没有就空字符串"
}"""


def _rule_based(text: str) -> dict:
    platform = next((p for p in PLATFORM_SIZES if p.replace(" ", "") in text.replace(" ", "")), "小红书")
    m = re.search(r"文案[:：]\s*(.+)", text, re.S)
    headline = m.group(1).strip() if m else ""
    headline = re.sub(r"\s*\n\s*", "\n", headline)[:60]
    n = re.search(r"(\d)\s*[–\-~到]?\s*(\d)?\s*张", text)
    ref_count = int(n.group(2) or n.group(1)) if n else 0
    use_char = "coco" in text.lower() or "角色" in text
    return {
        "title": "灵感海报",
        "platform": platform,
        "use_character": use_char,
        "ref_count": min(ref_count, 3),
        "ref_roles": ["场景", "氛围", "构图"][: min(ref_count, 3)],
        "prompt": (
            ("保持 Coco 的标准形象，" if use_char else "")
            + "融合参考图的场景、氛围与构图。\n建议使用温暖自然光，主体清晰，背景简洁，为标题预留干净的排版空间。"
        ),
        "negative": "角色变形、画面杂乱、画面中出现文字或乱码。",
        "headline": headline,
        "subline": "",
    }


def _call_claude(text: str) -> dict:
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": os.getenv("LLM_MODEL", "claude-sonnet-5-5"),
            "max_tokens": 1500,
            "system": SYSTEM,
            "messages": [{"role": "user", "content": text}],
        },
        timeout=60,
    )
    r.raise_for_status()
    out = "".join(b.get("text", "") for b in r.json()["content"] if b.get("type") == "text")
    out = re.sub(r"```(json)?", "", out).strip()
    return json.loads(out)


def structure_requirement(text: str) -> dict:
    draft = _rule_based(text)
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            draft.update({k: v for k, v in _call_claude(text).items() if v is not None})
            draft["llm"] = True
        except Exception as e:  # LLM 出错时退回规则结果，不阻断流程
            draft["llm_error"] = str(e)
    if draft.get("platform") not in PLATFORM_SIZES:
        draft["platform"] = "小红书"
    draft["width"], draft["height"] = PLATFORM_SIZES[draft["platform"]]
    return draft
