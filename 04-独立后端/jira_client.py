"""Jira Cloud 读取：工单标题、描述（ADF 转纯文本）、前 3 张图片附件。"""
import base64
import os
import re

import httpx

KEY_RE = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")


def find_issue_key(url_or_key: str) -> str | None:
    """支持 /browse/DESIGN-128、?selectedIssue=DESIGN-128 或直接填 DESIGN-128。"""
    m = KEY_RE.search(url_or_key or "")
    return m.group(1) if m else None


def _auth():
    return (os.getenv("JIRA_EMAIL", ""), os.getenv("JIRA_API_TOKEN", ""))


def adf_to_text(node) -> str:
    """Atlassian Document Format → 纯文本（保留换行）。"""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    t = node.get("type")
    if t == "text":
        return node.get("text", "")
    if t == "hardBreak":
        return "\n"
    inner = "".join(adf_to_text(c) for c in node.get("content", []) or [])
    if t in ("paragraph", "heading"):
        return inner + "\n"
    if t == "listItem":
        return "- " + inner
    return inner


def fetch_issue(key: str, max_images: int = 3) -> dict:
    base = os.getenv("JIRA_BASE_URL", "").rstrip("/")
    with httpx.Client(auth=_auth(), timeout=30, follow_redirects=True) as c:
        r = c.get(
            f"{base}/rest/api/3/issue/{key}",
            params={"fields": "summary,description,attachment"},
            headers={"Accept": "application/json"},
        )
        if r.status_code == 404:
            raise ValueError(f"找不到工单 {key}，或当前 Jira 账号没有权限")
        r.raise_for_status()
        f = r.json()["fields"]

        images = []
        for att in f.get("attachment") or []:
            if len(images) >= max_images:
                break
            if not str(att.get("mimeType", "")).startswith("image/"):
                continue
            img = c.get(att["content"])
            if img.status_code == 200:
                images.append({
                    "name": att.get("filename"),
                    "data": base64.b64encode(img.content).decode(),
                })

    desc = f.get("description")
    desc_text = adf_to_text(desc) if isinstance(desc, dict) else (desc or "")
    return {
        "key": key,
        "summary": f.get("summary", ""),
        "description": desc_text.strip(),
        "images": images,
    }
