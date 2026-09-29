from __future__ import annotations

import pytest

from tools.web import WebToolError, _validate_public_url, build_web_tools


def test_web_tools_have_expected_names_and_schemas():
    search_tool, fetch_tool = build_web_tools()
    assert search_tool.name == "web_search"
    assert fetch_tool.name == "web_fetch"
    assert search_tool.parameters["required"] == ["query"]
    assert fetch_tool.parameters["required"] == ["url"]


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8080/health",
        "http://localhost:8080/",
        "http://10.0.0.1/",
        "http://192.168.1.1/",
        "http://169.254.169.254/",
        "file:///etc/passwd",
    ],
)
def test_web_blocks_local_or_unsafe_urls(url):
    with pytest.raises(WebToolError):
        _validate_public_url(url)


def test_web_blocks_url_credentials():
    with pytest.raises(WebToolError):
        _validate_public_url("https://user:pass@example.com/")


def test_web_accepts_public_https_host():
    assert _validate_public_url("https://example.com/") == "https://example.com/"
