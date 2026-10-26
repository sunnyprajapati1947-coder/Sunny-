"""Web intelligence: search, URLs, Wikipedia, news."""
from __future__ import annotations

import html
import json
import re
from urllib.parse import quote_plus, urlsplit

from jarvis import net
from jarvis.config import get_settings
from jarvis.util import reply, truncate

WIKI_CACHE = net.TTLCache(ttl=900)
NEWS_CACHE = net.TTLCache(ttl=300)
SUMMARY_CACHE = net.TTLCache(ttl=300)

ENGINES = {
    "google": ("https://www.google.com/search?q={}", "Google"),
    "youtube": ("https://www.youtube.com/results?search_query={}", "YouTube"),
    "bing": ("https://www.bing.com/search?q={}", "Bing"),
    "duckduckgo": ("https://duckduckgo.com/?q={}", "DuckDuckGo"),
    "ddg": ("https://duckduckgo.com/?q={}", "DuckDuckGo"),
    "images": ("https://www.google.com/search?tbm=isch&q={}", "Google Images"),
    "maps": ("https://www.google.com/maps/search/{}", "Google Maps"),
    "github": ("https://github.com/search?q={}", "GitHub"),
    "stackoverflow": ("https://stackoverflow.com/search?q={}", "Stack Overflow"),
    "amazon": ("https://www.amazon.in/s?k={}", "Amazon"),
    "flipkart": ("https://www.flipkart.com/search?q={}", "Flipkart"),
    "wikipedia": ("https://en.wikipedia.org/w/index.php?search={}", "Wikipedia"),
    "news": ("https://news.google.com/search?q={}", "Google News"),
}


def _valid_url(url: str) -> str | None:
    value = str(url or "").strip()
    if not value:
        return None
    if value.startswith("www."):
        value = "https://" + value
    if not value.lower().startswith(("http://", "https://")):
        value = "https://" + value
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None
    if len(value) > 2000 or " " in value:
        return None
    return value


def open_url(url: str) -> dict:
    safe = _valid_url(url)
    if not safe:
        return reply("That does not look like a valid web address, Sir.")
    host = urlsplit(safe).netloc.replace("www.", "")
    return reply(
        f"Opening {host} in your browser, Sir.",
        speech=f"Opening {host}, Sir.",
        action={"type": "open_url", "url": safe, "label": host},
        cards=[{"type": "link", "title": host, "subtitle": safe, "url": safe}],
        data={"url": safe},
    )


def web_search(query: str = "", engine: str = "google") -> dict:
    query = str(query or "").strip()
    if not query:
        return reply("What should I search for, Sir?")
    key = str(engine or "google").lower().strip()
    template, label = ENGINES.get(key, ENGINES["google"])
    url = template.format(quote_plus(query))
    verb = "Searching" if key != "youtube" else "Pulling up YouTube results for"
    return reply(
        f"{verb} “{query}” on {label}, Sir.",
        speech=f"Searching {label} for {truncate(query, 60)}, Sir.",
        action={"type": "open_url", "url": url, "label": label},
        cards=[
            {
                "type": "link",
                "title": f"{label}: {truncate(query, 70)}",
                "subtitle": label.lower() + ".com",
                "url": url,
            }
        ],
        data={"query": query, "engine": key, "url": url},
    )


def youtube_search(query: str) -> dict:
    return web_search(query, "youtube")


def wikipedia(query: str = "") -> dict:
    query = str(query or "").strip()
    if not query:
        return reply("Which topic should I look up, Sir?")
    cache_key = query.lower()
    cached = WIKI_CACHE.get(cache_key)
    if cached:
        return cached

    title = quote_plus(query.replace(" ", "_"))
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
    settings = get_settings()
    try:
        data = net.get_json(
            url,
            timeout=settings.http_timeout,
            headers={"Accept": "application/json"},
        )
    except net.NetError:
        search_url = ENGINES["wikipedia"][0].format(quote_plus(query))
        return reply(
            f"I cannot reach Wikipedia right now, Sir. I have prepared a search link instead.",
            speech="Wikipedia is unreachable, Sir. I have prepared a search link.",
            cards=[
                {
                    "type": "link",
                    "title": f"Wikipedia: {truncate(query, 60)}",
                    "subtitle": "en.wikipedia.org",
                    "url": search_url,
                }
            ],
        )

    if not isinstance(data, dict) or data.get("type") == "disambiguation":
        search_url = ENGINES["wikipedia"][0].format(quote_plus(query))
        return reply(
            f"“{query}” is ambiguous on Wikipedia, Sir. It could refer to several things.",
            speech=f"“{query}” has several possible meanings, Sir.",
            cards=[{"type": "link", "title": f"Disambiguation: {query}", "url": search_url}],
        )

    extract = re.sub(r"\s+", " ", str(data.get("extract") or "")).strip()
    if not extract:
        return reply(f"I found a page for “{query}” but it has no summary, Sir.")
    page_url = (data.get("content_urls", {}).get("desktop", {}) or {}).get("page") or (
        "https://en.wikipedia.org/wiki/" + quote_plus(query.replace(" ", "_"))
    )
    description = str(data.get("description") or "").strip()
    body = truncate(extract, 700)
    result = reply(
        body + ("\n\n— Wikipedia" if not body.endswith(".") else " — Wikipedia"),
        speech=truncate(extract, 340),
        cards=[
            {
                "type": "article",
                "title": data.get("title") or query,
                "subtitle": description or "Wikipedia",
                "body": body,
                "url": page_url,
                "image": (data.get("thumbnail") or {}).get("source"),
            }
        ],
        data={"title": data.get("title"), "url": page_url},
    )
    WIKI_CACHE.set(cache_key, result)
    return result


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", "", str(value or ""))
    return html.unescape(text).strip()


def news(topic: str = "") -> dict:
    topic = str(topic or "").strip()
    cache_key = topic.lower() or "__top__"
    cached = NEWS_CACHE.get(cache_key)
    if cached:
        return cached

    settings = get_settings()
    if topic:
        feed = (
            "https://news.google.com/rss/search?q="
            + quote_plus(topic)
            + "&hl=en-IN&gl=IN&ceid=IN:en"
        )
    else:
        feed = settings.news_feed

    try:
        raw = net.get_text(feed, timeout=settings.http_timeout)
    except net.NetError:
        search_url = (
            "https://news.google.com/search?q=" + quote_plus(topic)
            if topic
            else "https://news.google.com"
        )
        return reply(
            "The news uplink is down, Sir. I can still open the headlines in your browser.",
            speech="The news feed is unreachable, Sir.",
            cards=[
                {
                    "type": "link",
                    "title": "Google News",
                    "subtitle": "news.google.com",
                    "url": search_url,
                }
            ],
        )

    blocks = re.findall(r"<item>(.*?)</item>", raw, re.S)[:6]
    if not blocks:
        # Atom feeds
        blocks = re.findall(r"<entry>(.*?)</entry>", raw, re.S)[:6]

    parsed = []
    for block in blocks:
        title_match = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", block, re.S)
        link_match = re.search(r"<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", block, re.S)
        if not link_match:
            link_match = re.search(r'<link[^>]*href="([^"]+)"', block)
        source_match = re.search(r"<source[^>]*>(.*?)</source>", block, re.S)
        date_match = re.search(r"<pubDate>(.*?)</pubDate>", block, re.S)
        if not title_match or not link_match:
            continue
        title = _strip_html(title_match.group(1))
        link = _strip_html(link_match.group(1))
        source = _strip_html(source_match.group(1)) if source_match else "Google News"
        if " - " in title and source and title.endswith(source):
            title = title[: -(len(source) + 3)]
        parsed.append(
            {
                "title": title,
                "url": link,
                "source": source,
                "published": _strip_html(date_match.group(1)) if date_match else "",
            }
        )

    if not parsed:
        return reply(
            "I reached the feed but could not parse any headlines, Sir.",
            speech="I could not parse the news feed, Sir.",
        )

    top = parsed[0]
    lines = "\n".join(f"{index}. {item['title']}" for index, item in enumerate(parsed, 1))
    speech = (
        f"Top headline, Sir: {top['title']}."
        if topic
        else f"Top headline right now, Sir: {top['title']}."
    )
    result = reply(
        f"Here are the latest headlines{' on ' + topic if topic else ''}, Sir.\n{lines}",
        speech=speech,
        cards=[
            {
                "type": "news",
                "title": f"HEADLINES · {topic.upper()}" if topic else "HEADLINES · INDIA",
                "items": parsed,
            }
        ],
        data={"items": parsed},
    )
    NEWS_CACHE.set(cache_key, result)
    return result


def health() -> dict:
    return {"ok": True}


def _json_dump(value) -> str:  # pragma: no cover - debugging helper
    return json.dumps(value, ensure_ascii=False)[:2000]
