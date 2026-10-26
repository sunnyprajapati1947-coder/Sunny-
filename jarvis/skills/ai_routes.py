"""Free AI routes: status, setup, models, testing and switching the brain.

These are the conversational faces of :mod:`jarvis.routes`. They exist so the
answer to “kaun se model connect hain?” is one honest table instead of a guess.
"""
from __future__ import annotations

from jarvis import routes
from jarvis.config import get_settings, update_settings
from jarvis.util import reply, truncate

MODE_LABELS = {
    "route": "free routes",
    "auto": "auto (Gemini → local Qwen → free routes)",
    "local": "local Qwen",
    "gemini": "Gemini",
    "offline": "offline core",
}


def _dot(online: bool) -> str:
    return "●" if online else "○"


def _setup_rows() -> list[str]:
    rows: list[str] = []
    for preset in routes.PRESETS:
        rows.append(f"{preset['label']} — {preset['homepage']}")
        rows.append(f"  install: {preset['install']}")
        rows.append(f"  endpoint: {preset['base_url']}")
        rows.append(f"  {preset['note']}")
    rows += [
        "",
        "No key at all? The keyless lane needs nothing — just internet. Say “route test keyless”.",
        "Then in Jarvis: “route test freellmapi” or “use free models”.",
        "Another machine? “add route mybox at http://192.168.1.20:3001/v1”.",
    ]
    return rows


def _route_row(item: dict) -> str:
    """One honest line per route, including the keyless lane."""
    if item.get("keyless"):
        if item.get("online"):
            return f"{item['label']}: ● online · no API key · model {item.get('model', 'auto')}"
        if item.get("ready") and not item.get("checked"):
            return f"{item['label']}: ● ready · no API key needed · checked on first use"
        return f"{item['label']}: ○ offline · {item.get('error') or 'not reachable'} · no API key needed"
    if item["online"]:
        return (
            f"{item['label']}: ● online · {item['models']} models · "
            f"{(item.get('latency_ms') or 0):.0f} ms · model {item['model']}"
        )
    return f"{item['label']}: ○ offline · {item['error']} ({item['base_url']})"


def route_status() -> dict:
    items = routes.status_all()
    online = [item for item in items if item["online"]]
    ready = [item for item in items if item.get("ready")]
    keyless = [item for item in items if item.get("keyless") and item.get("ready")]
    gateways = [item for item in online if not item.get("keyless")]
    rows: list[str] = [_route_row(item) for item in items]
    settings = get_settings()
    rows += ["", f"brain mode: {MODE_LABELS.get(settings.brain_mode, settings.brain_mode)}"]
    rows.append(f"free models available: {sum(item['models'] for item in online)}")
    if gateways:
        rows.append(f"preferred route: {gateways[0]['label']}")
    elif keyless:
        rows.append(f"no-key lane ready: {keyless[0]['label']} — no install, no key")
    else:
        rows += ["", "No route is answering yet — say “free route setup” for the two install commands."]
    if gateways:
        headline = (
            f"{len(gateways)} free route{'s' if len(gateways) != 1 else ''} online, Sir — "
            f"{sum(item['models'] for item in gateways)} models reachable."
        )
    elif online:
        headline = "The keyless lane is answering, Sir — no API key involved."
    elif keyless:
        headline = (
            "No gateway is running, Sir, but the keyless lane is ready — "
            "I can still answer without any API key."
        )
    else:
        headline = "No free route is answering, Sir. Both gateways are optional and self-hosted."
    return reply(
        headline,
        speech=headline,
        cards=[{"type": "list", "title": "FREE AI ROUTES", "rows": rows}],
        data={
            "ok": True,
            "online": len(online),
            "ready": len(ready),
            "keyless": len(keyless),
            "routes": items,
            "brain_mode": settings.brain_mode,
        },
    )


def route_setup() -> dict:
    rows = _setup_rows()
    return reply(
        "Two ways to get free models into Jarvis, Sir — pick either or both.",
        speech="Free route setup instructions are on screen, Sir.",
        cards=[{"type": "list", "title": "FREE ROUTE SETUP", "rows": rows}],
        data={"ok": True, "presets": [
            {key: preset[key] for key in ("id", "label", "base_url", "install", "homepage")}
            for preset in routes.PRESETS
        ]},
    )


def route_models(route_id: str = "") -> dict:
    result = routes.models(route_id)
    if not result["routes"]:
        return reply(
            f"I don't know a route called “{route_id}”, Sir. Known routes: "
            + ", ".join(route["id"] for route in routes.routes()),
            data={"ok": False, "error": "unknown route"},
        )
    rows: list[str] = []
    total = 0
    for item in result["routes"]:
        if not item["online"]:
            rows.append(f"{item['label']}: offline — {item['error']}")
            continue
        total += item["count"]
        rows.append(f"{item['label']}: {item['count']} models")
        shown = item["models"][:25]
        rows.extend(f"  · {name}" for name in shown)
        if item["count"] > len(shown):
            rows.append(f"  … and {item['count'] - len(shown)} more")
    headline = (
        f"{total} free model endpoints reachable, Sir."
        if total
        else "No route is answering, so I have no free model list to show, Sir."
    )
    return reply(
        headline,
        speech=headline,
        cards=[{"type": "list", "title": "ROUTE MODELS", "rows": rows}],
        data={"ok": result["ok"], "total": total, "routes": result["routes"]},
    )


def route_test(route_id: str = "") -> dict:
    if not route_id:
        live = [item for item in routes.status_all() if item["online"] and item["enabled"]]
        if not live:
            return reply(
                "No route is answering yet, Sir. Say “free route setup” for the exact install commands.",
                data={"ok": False, "online": 0},
            )
        route_id = live[0]["id"]
    result = routes.test(route_id)
    if not result["ok"]:
        return reply(
            f"{route_id} did not answer, Sir — {truncate(result['error'], 160)}.",
            cards=[{"type": "list", "title": "ROUTE TEST", "rows": [
                f"route: {route_id}",
                f"error: {truncate(result['error'], 200)}",
                "check: is the gateway running on that port?",
            ]}],
            data=result,
        )
    via = result.get("routed_via") or "the gateway did not say"
    rows = [
        f"route: {route_id}",
        f"reply: {truncate(result['reply'], 120)}",
        f"served by: {via}",
        f"model: {result.get('model') or 'auto'}",
        f"latency: {result.get('ms')} ms",
    ]
    if result.get("tokens"):
        rows.append(f"tokens: {result['tokens']}")
    return reply(
        f"{route_id} answered in {result.get('ms')} ms, Sir — served by {via}.",
        speech=f"{route_id} is live, Sir.",
        cards=[{"type": "list", "title": "ROUTE TEST", "rows": rows}],
        data=result,
    )


def route_use(mode: str = "route", model: str = "") -> dict:
    wanted = str(mode or "route").strip().lower()
    aliases = {"free": "route", "routes": "route", "best": "route", "auto": "auto", "local": "local",
               "gemini": "gemini", "offline": "offline"}
    wanted = aliases.get(wanted, wanted)
    if wanted not in {"route", "auto", "local", "gemini", "offline"}:
        return reply(
            "Pick one, Sir: “use free models”, “use auto brain”, “use local qwen”, "
            "“use gemini” or “go offline”.",
            data={"ok": False, "mode": wanted},
        )
    settings, warnings = update_settings({"brain_mode": wanted})
    extra = ""
    if wanted == "route":
        online = [item for item in routes.status_all() if item["online"]]
        if not online:
            extra = " No route is answering yet, so replies stay on the offline core until one is up."
        elif model:
            best = online[0]
            routes.save_route(best["id"], base_url=best["base_url"], model=model, priority=best.get("priority", 10))
            extra = f" {best['label']} now uses model “{model}”."
        else:
            extra = f" Routing through {online[0]['label']} ({online[0]['models']} models)."
    return reply(
        f"Brain mode set to {MODE_LABELS[wanted]}, Sir.{extra}",
        speech=f"Brain mode {wanted}, Sir.",
        cards=[{"type": "list", "title": "BRAIN MODE", "rows": [
            f"mode: {MODE_LABELS[wanted]}",
            *[f"note: {warning}" for warning in warnings],
        ]}],
        data={"ok": True, "mode": wanted, "settings": settings.public()},
    )


def route_add(route_id: str = "", base_url: str = "", model: str = "auto", api_key: str = "") -> dict:
    slug = str(route_id or "").strip().lower() or "custom"
    if not base_url:
        return reply(
            "I need the endpoint, Sir — for example: "
            "“add route mybox at http://192.168.1.20:3001/v1”.",
            data={"ok": False, "error": "missing base_url"},
        )
    result = routes.save_route(slug, base_url=base_url, model=model, api_key=api_key)
    if not result["ok"]:
        return reply(f"I could not save that route, Sir — {result['error']}", data=result)
    route = result["route"]
    probe = routes.probe(route, fresh=True)
    state = (
        f"it is answering with {probe['models']} models in {probe['latency_ms']:.0f} ms"
        if probe["online"]
        else f"it is not answering yet ({probe['error']})"
    )
    return reply(
        f"Route “{route['id']}” saved at {route['base_url']}, Sir — {state}.",
        cards=[{"type": "list", "title": "ROUTE SAVED", "rows": [
            f"id: {route['id']}",
            f"endpoint: {route['base_url']}",
            f"model: {route['model']}",
            f"key: {routes.mask(route)}",
            f"state: {'online' if probe['online'] else 'offline'}",
        ]}],
        data={"ok": True, "route": route, "probe": probe},
    )


def route_remove(route_id: str = "") -> dict:
    result = routes.remove_route(route_id)
    if not result["ok"]:
        return reply(f"{result['error']} (presets stay, only your overrides are removed.)", data=result)
    return reply(f"Removed my custom settings for “{result['removed']}”, Sir.", data=result)


def models_connected() -> dict:
    """One table: cloud key, local lanes and free routes — what can actually answer."""
    from jarvis.local_brain import get_local_brain

    settings = get_settings()
    local = get_local_brain().status()
    route_info = routes.summary()
    rows = [
        f"Gemini: {'configured (' + settings.gemini_model + ')' if settings.gemini_key else 'no key'}",
        f"local Qwen: {'online · ' + str(len(local.get('lanes') or [])) + ' lane(s)' if local.get('online') else 'not running'}",
    ]
    for lane in local.get("lanes") or []:
        state = "online" if lane.get("online") else "offline"
        rows.append(f"  · {lane.get('name')}: {state} {lane.get('model', '')}")
    for item in route_info["routes"]:
        if item.get("keyless"):
            state = (
                "online · no API key"
                if item["online"]
                else ("ready · no API key (checked on use)" if item.get("ready") else f"offline · {item.get('error') or 'not reachable'}")
            )
        else:
            state = f"online · {item['models']} models" if item["online"] else f"offline · {item['error']}"
        rows.append(f"{item['label']}: {state}")
    rows += ["", f"brain mode: {MODE_LABELS.get(settings.brain_mode, settings.brain_mode)}"]
    keyless_ready = [
        item for item in route_info["routes"]
        if item.get("keyless") and (item.get("online") or item.get("ready"))
    ]
    total = (
        (1 if settings.gemini_key else 0)
        + (len(local.get("lanes") or []) if local.get("online") else 0)
        + route_info["models"]
        + len(keyless_ready)
    )
    if total:
        headline = f"{total} model endpoint{'s' if total != 1 else ''} can answer right now, Sir."
    else:
        headline = "Nothing can answer yet, Sir — add a Gemini key, start Ollama, or bring up a free route."
    return reply(
        headline,
        speech=headline,
        cards=[{"type": "list", "title": "CONNECTED MODELS", "rows": rows}],
        data={
            "ok": True,
            "total": total,
            "gemini": bool(settings.gemini_key),
            "local_online": bool(local.get("online")),
            "routes": route_info,
            "brain_mode": settings.brain_mode,
        },
    )


def route_add_preflight(route_id: str = "", base_url: str = "", model: str = "auto", api_key: str = "") -> dict | None:
    if not str(base_url or "").strip():
        return reply(
            "I need the endpoint, Sir — for example "
            "“add route mybox at http://192.168.1.20:3001/v1”.",
        )
    if not str(base_url).strip().startswith(("http://", "https://")):
        return reply("The endpoint must start with http:// or https://, Sir.")
    return None
