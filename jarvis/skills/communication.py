"""Messaging: WhatsApp links, email drafts, calls, contact book."""
from __future__ import annotations

import re
from urllib.parse import quote

from jarvis.config import get_settings
from jarvis.store import get_store
from jarvis.util import reply, truncate

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def digits(value: str) -> str:
    return re.sub(r"\D", "", str(value or ""))


def normalize_phone(value: str, country_code: str | None = None) -> str | None:
    settings = get_settings()
    code = digits(country_code or settings.country_code) or "91"
    raw = digits(value)
    if not raw:
        return None
    while raw.startswith("00"):
        raw = raw[2:]
    if len(raw) > 12 and raw.startswith(code):
        raw = raw[len(code):]
    if raw.startswith("0"):
        raw = raw.lstrip("0")
    if len(raw) == 10:
        raw = code + raw
    elif len(raw) == 11 and raw.startswith("0"):
        raw = code + raw[1:]
    if len(raw) < 8 or len(raw) > 15:
        return None
    return raw


def _resolve_target(contact: str, field: str = "phone") -> tuple[str, str] | tuple[None, str]:
    value = str(contact or "").strip()
    if not value:
        return None, ""
    if field == "email" and EMAIL_RE.match(value):
        return value, value
    if field == "phone" and len(digits(value)) >= 8:
        normalized = normalize_phone(value)
        if normalized:
            return normalized, value
    entry = get_store().contact(value)
    if not entry:
        return None, value
    number = entry.get(field) or ""
    label = entry.get("name") or value
    if field == "phone":
        normalized = normalize_phone(number)
        if not normalized:
            return None, label
        return normalized, label
    if not EMAIL_RE.match(str(number)):
        return None, label
    return str(number), label


def save_contact(name: str = "", phone: str = "", email: str = "") -> dict:
    name = str(name or "").strip()
    if not name:
        return reply("Whose number should I save, Sir?")
    normalized = normalize_phone(phone) if phone else ""
    if phone and not normalized:
        return reply("That phone number does not look valid, Sir.")
    if email and not EMAIL_RE.match(str(email).strip()):
        return reply("That email address does not look valid, Sir.")
    if not normalized and not email:
        return reply("Give me a phone number or an email address for that contact, Sir.")
    entry = get_store().set_contact(
        name, phone=normalized or None, email=str(email).strip() or None
    )
    return reply(
        f"Saved {entry.get('name')} in your contact book, Sir."
        + (f" Phone {entry.get('phone')}." if entry.get("phone") else "")
        + (f" Email {entry.get('email')}." if entry.get("email") else ""),
        speech=f"Saved {name}, Sir.",
        cards=[
            {
                "type": "contact",
                "name": entry.get("name"),
                "phone": entry.get("phone"),
                "email": entry.get("email"),
            }
        ],
    )


def list_contacts() -> dict:
    entries = get_store().contacts()
    if not entries:
        return reply(
            "Your contact book is empty, Sir. Tell me “save Rahul's number as 98765…”.",
            speech="No contacts saved yet, Sir.",
        )
    rows = [
        f"{entry.get('name')} — {entry.get('phone') or entry.get('email') or 'no number'}"
        for entry in entries[:20]
    ]
    return reply(
        f"{len(entries)} contact{'s' if len(entries) != 1 else ''} on file, Sir.",
        cards=[{"type": "list", "title": "CONTACTS", "items": rows}],
    )


def whatsapp_send(contact: str = "", message: str = "") -> dict:
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(
            f"I do not have a number for “{contact}”, Sir. "
            "Try “save <name>'s number as <phone>” first, or give me the number directly.",
            speech=f"I do not have a number for {contact}, Sir.",
            data={"unknown_contact": True, "contact": contact},
        )
    text = str(message or "").strip()
    if not text:
        return reply(
            f"What should I say to {label}, Sir?",
            speech=f"What should I say to {label}, Sir?",
            data={"needs_message": True, "contact": contact, "number": number, "label": label},
        )
    url = f"https://wa.me/{number}?text={quote(text)}"
    return reply(
        f"Opening WhatsApp for {label} with your message ready to send, Sir.",
        speech=f"Opening WhatsApp for {label}, Sir.",
        action={"type": "open_url", "url": url, "label": f"WhatsApp · {label}"},
        cards=[
            {
                "type": "message",
                "title": f"WhatsApp · {label}",
                "body": text,
                "subtitle": f"+{number}",
                "url": url,
            }
        ],
        data={"number": number, "label": label, "url": url},
    )


def email_compose(to: str = "", subject: str = "", body: str = "") -> dict:
    address, label = _resolve_target(to, "email")
    if not address:
        return reply(
            f"I do not have an email address for “{to}”, Sir.",
            speech="I do not have that email address, Sir.",
            data={"unknown_contact": True},
        )
    subject = str(subject or "").strip()
    body = str(body or "").strip()
    if not subject and not body:
        subject = f"Message from {get_settings().owner}"
    url = f"mailto:{address}?subject={quote(subject)}&body={quote(body)}"
    return reply(
        f"Email draft ready for {label}, Sir. Your mail client should open with the fields filled.",
        speech=f"Email draft for {label} is ready, Sir.",
        action={"type": "open_url", "url": url, "label": "Mail"},
        cards=[
            {
                "type": "message",
                "title": f"EMAIL · {label}",
                "subtitle": address,
                "body": subject + ("\n\n" + body if body else ""),
                "url": url,
            }
        ],
        data={"to": address, "subject": subject},
    )


def call_contact(contact: str = "") -> dict:
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(
            f"I do not have a number for “{contact}”, Sir.",
            speech=f"No number for {contact}, Sir.",
        )
    url = f"tel:+{number}"
    return reply(
        f"Dialling {label}, Sir.",
        speech=f"Calling {label}, Sir.",
        action={"type": "open_url", "url": url, "label": f"Call {label}"},
        cards=[
            {
                "type": "contact",
                "name": label,
                "phone": "+" + number,
                "url": url,
                "action_label": "Place call",
            }
        ],
        data={"number": number},
    )


# --------------------------------------------------------------- preflight
def whatsapp_preflight(contact: str = "", message: str = "") -> dict | None:
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(
            f"I do not have a number for “{contact}”, Sir. "
            "Save it first with “save <name>'s number as <phone>”, or give me the number directly.",
            speech=f"I do not have a number for {contact}, Sir.",
            data={"unknown_contact": True, "contact": contact},
        )
    if not str(message or "").strip():
        return reply(
            f"What should I say to {label}, Sir?",
            speech=f"What should I say to {label}, Sir?",
            data={"needs_message": True, "contact": contact, "number": number, "label": label},
        )
    return None


def email_preflight(to: str = "", subject: str = "", body: str = "") -> dict | None:
    address, label = _resolve_target(to, "email")
    if not address:
        return reply(
            f"I do not have an email address for “{to}”, Sir.",
            speech="I do not have that email address, Sir.",
            data={"unknown_contact": True},
        )
    return None


def call_preflight(contact: str = "") -> dict | None:
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(
            f"I do not have a number for “{contact}”, Sir.",
            speech=f"No number for {contact}, Sir.",
            data={"unknown_contact": True},
        )
    return None
