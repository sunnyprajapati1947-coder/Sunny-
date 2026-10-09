"""Web tools: keyless search (SearXNG if configured, else Wikipedia) and webpage reading.

Only http/https is allowed. Hosts that resolve to private/loopback addresses are refused
(unless web.allow_private_hosts is set), and every redirect hop is checked the same way.
"""

from __future__ import annotations

import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

from nova.context import Context
from nova.security import PolicyError
from nova.tools.registry import Tool, ToolResult
from nova.util import truncate

USER_AGENT = "NovaPhoneAI/0.1 (personal assistant; +https://github.com/sunnyprajapati1947-coder/Sunny-)"


def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast \
                or ip.is_unspecified:
            return False
    return True


def check_url(url: str, allow_private: bool) -> str:
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise PolicyError("only http and https URLs are allowed")
    if not parsed.hostname:
        raise PolicyError("URL has no host")
    if not allow_private and not _host_is_public(parsed.hostname):
        raise PolicyError(f"host {parsed.hostname} is not a public address")
    return parsed.geturl()


class _CheckedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allow_private: bool):
        self.allow_private = allow_private

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl, self.allow_private)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def http_get(url: str, ctx: Context, accept: str = "text/html,application/json,text/plain") -> tuple[str, str]:
    """Return (final_url, decoded_text). Enforces size, timeout and host checks."""
    allow_private = ctx.config.web.allow_private_hosts
    url = check_url(url, allow_private)
    opener = urllib.request.build_opener(_CheckedRedirect(allow_private))
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    with opener.open(req, timeout=ctx.config.web.timeout) as resp:
        final = resp.geturl()
        raw = resp.read(ctx.config.web.max_bytes + 1)
        charset = resp.headers.get_content_charset() or "utf-8"
    if len(raw) > ctx.config.web.max_bytes:
        raw = raw[: ctx.config.web.max_bytes]
    return final, raw.decode(charset, errors="replace")


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def html_to_text(html: str) -> tuple[str, str]:
    parser = _TextExtractor()
    parser.feed(html)
    text = " ".join(" ".join(parser.parts).split())
    text = re.sub(r"\s{2,}", " ", text)
    return parser.title.strip(), text


def _read_webpage(args: dict, ctx: Context) -> ToolResult:
    final, body = http_get(args["url"], ctx)
    title, text = html_to_text(body) if "<" in body[:500] else ("", " ".join(body.split()))
    limit = int(args.get("max_chars") or 3000)
    if not text:
        return ToolResult(False, error="page had no readable text")
    return ToolResult(True, output=f"Title: {title or '(none)'}\nURL: {final}\n\n{truncate(text, limit)}",
                      data={"url": final, "title": title, "chars": len(text)})


def _wikipedia_search(query: str, ctx: Context, limit: int) -> list[dict]:
    api = (f"{ctx.config.web.wikipedia_api}?action=query&list=search&format=json&srlimit="
           f"{limit}&srsearch={urllib.parse.quote(query)}")
    _, body = http_get(api, ctx, accept="application/json")
    items = json.loads(body).get("query", {}).get("search", [])
    results = []
    for item in items:
        snippet = html_to_text(item.get("snippet", ""))[1]
        title = item.get("title", "")
        page = urllib.parse.quote(title.replace(" ", "_"))
        results.append({"title": title, "url": ctx.config.web.wikipedia_api.split("/w/")[0] + "/wiki/" + page,
                        "snippet": snippet})
    return results


def _searxng_search(query: str, ctx: Context, limit: int) -> list[dict]:
    base = ctx.config.web.searxng_url.rstrip("/")
    url = f"{base}/search?format=json&q={urllib.parse.quote(query)}"
    _, body = http_get(url, ctx, accept="application/json")
    items = json.loads(body).get("results", [])[:limit]
    return [{"title": i.get("title", ""), "url": i.get("url", ""), "snippet": i.get("content", "")} for i in items]


def _web_search(args: dict, ctx: Context) -> ToolResult:
    query = args["query"].strip()
    if not query:
        return ToolResult(False, error="empty query")
    limit = min(int(args.get("max_results") or 5), 10)
    errors = []
    source = ""
    results: list[dict] = []
    if ctx.config.web.searxng_url:
        try:
            results, source = _searxng_search(query, ctx, limit), "searxng"
        except (OSError, ValueError, PolicyError) as exc:
            errors.append(f"searxng: {exc}")
    if not results:
        try:
            results, source = _wikipedia_search(query, ctx, limit), "wikipedia"
        except (OSError, ValueError, PolicyError) as exc:
            errors.append(f"wikipedia: {exc}")
    if not results:
        return ToolResult(False, error="no results (" + "; ".join(errors) + ")" if errors else "no results")
    lines = [f"{i}. {r['title']} — {r['url']}\n   {truncate(r['snippet'], 200)}" for i, r in enumerate(results, 1)]
    return ToolResult(True, output=f"Source: {source}\n" + "\n".join(lines),
                      data={"source": source, "count": len(results), "results": results})


TOOLS = [
    Tool("web_search", "Search the web (keyless Wikipedia by default; SearXNG if configured).",
         {"query": {"type": "str", "required": True}, "max_results": {"type": "int"}}, _web_search),
    Tool("read_webpage", "Fetch a public http(s) page and return its readable text.",
         {"url": {"type": "str", "required": True}, "max_chars": {"type": "int"}}, _read_webpage),
]
