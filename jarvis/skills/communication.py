"""Messaging: WhatsApp links, email drafts, calls, contact book."""
from __future__ import annotations

import re
import smtplib
import subprocess
import time
import uuid
from datetime import timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote
import os
import platform

from jarvis.config import DATA_DIR, get_settings
from jarvis.store import get_store
from jarvis.timeparse import parse_when
from jarvis.util import now, reply, truncate

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


# ------------------------------------------------------------ real sending
def email_send(to: str = "", subject: str = "", body: str = "") -> dict:
    """Send a real email through the configured SMTP account."""
    address, label = _resolve_target(to, "email")
    if not address:
        return reply(f"I do not have an email address for “{to}”, Sir.", data={"unknown_contact": True})
    text = str(body or "").strip()
    if not text:
        return reply(f"What should the email to {label} say, Sir?", data={"needs_body": True})
    settings = get_settings()
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        return reply(
            "SMTP is not configured, Sir. Add JARVIS_SMTP_HOST, JARVIS_SMTP_USER and "
            "JARVIS_SMTP_PASSWORD (Gmail needs an app password), then I can send mail directly.",
            speech="Email sending needs SMTP credentials, Sir.",
            cards=[{"type": "list", "title": "SMTP SETUP", "rows": [
                "JARVIS_SMTP_HOST=smtp.gmail.com",
                "JARVIS_SMTP_PORT=587",
                "JARVIS_SMTP_USER=you@gmail.com",
                "JARVIS_SMTP_PASSWORD=<app password>",
                "JARVIS_SMTP_FROM=you@gmail.com  # optional",
            ]}],
            data={"needs_smtp": True},
        )
    subject = str(subject or "").strip() or f"Message from {settings.owner}"

    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = address
    message["Subject"] = subject
    message.set_content(text)

    try:
        if int(settings.smtp_port) == 465:
            client = smtplib.SMTP_SSL(settings.smtp_host, int(settings.smtp_port), timeout=25)
        else:
            client = smtplib.SMTP(settings.smtp_host, int(settings.smtp_port), timeout=25)
            client.ehlo()
            if settings.smtp_tls:
                client.starttls()
                client.ehlo()
        client.login(settings.smtp_user, settings.smtp_password)
        client.send_message(message)
        client.quit()
    except smtplib.SMTPAuthenticationError:
        return reply(
            "The mail server rejected those credentials, Sir. Gmail requires an app password, not your login password.",
            data={"error": "auth"},
        )
    except (smtplib.SMTPException, OSError) as exc:
        return reply(f"The mail server would not take it, Sir — {type(exc).__name__}: {exc}.")
    return reply(
        f"Email sent to {label} ({address}), Sir.",
        speech=f"Email sent to {label}, Sir.",
        cards=[{"type": "message", "title": "EMAIL SENT", "subtitle": address, "body": subject + "\n\n" + truncate(text, 300)}],
        data={"to": address, "subject": subject, "sent": True},
    )


def _ics_escape(value: str) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _clean_event_title(value: str) -> str:
    """Strip leftover date words from a title derived from “dentist tomorrow”."""
    text = str(value or "").strip(" ,.-")
    patterns = (
        r"\s+(?:on\s+)?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b.*$",
        r"\s+(?:tomorrow|today|tonight|day\s+after\s+tomorrow|parso|kal)\b.*$",
        r"\s+(?:at|by|around|before|after)\s+\d.*$",
        r"\s+(?:in|after)\s+\d+\s*(?:minute|hour|day|week)s?.*$",
        r"\s+(?:next\s+(?:week|month|year))\b.*$",
    )
    for pattern in patterns:
        text = re.sub(pattern, "", text, flags=re.I).strip()
    return text


def calendar_event(title: str = "", when: str = "", duration_minutes: int = 30, location: str = "", remind: bool = True) -> dict:
    """Create a real .ics calendar file and optionally a reminder.

    ``when`` may contain the title too — “dentist tomorrow at 5 pm” splits into
    the event title “dentist” and the parsed time.
    """
    raw = str(when or title or "").strip()
    if not raw:
        return reply("What should I schedule, Sir?")
    moment, leftover = parse_when(raw, reference=now())
    if moment is None:
        return reply(
            "When is it, Sir? Try “tomorrow at 5 pm”, “in 2 hours” or “on 30 October at 10:00”.",
            data={"needs_time": True, "needs_title": not str(title).strip()},
        )
    clean_title = str(title or "").strip()
    if not clean_title:
        clean_title = _clean_event_title(str(leftover or ""))
    if not clean_title:
        return reply("What should the event be called, Sir?", data={"needs_title": True})
    clean_title = clean_title or "Jarvis event"
    minutes = max(5, min(1440, int(duration_minutes or 30)))
    start = moment if moment.tzinfo else moment.astimezone()
    end = start + timedelta(minutes=minutes)
    stamp = now().astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    fmt = lambda value: value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    uid = f"jarvis-{uuid.uuid4().hex[:16]}@local"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//J.A.R.V.I.S.//MARK VIII//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{fmt(start)}",
        f"DTEND:{fmt(end)}",
        f"SUMMARY:{_ics_escape(clean_title)}",
        f"DESCRIPTION:{_ics_escape('Scheduled by J.A.R.V.I.S.')}",
    ]
    if location:
        lines.append(f"LOCATION:{_ics_escape(location)}")
    lines += ["END:VEVENT", "END:VCALENDAR", ""]
    folder = DATA_DIR / "files"
    folder.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-z0-9]+", "-", clean_title.lower()).strip("-")[:32] or "event"
    name = f"{safe}-{start.strftime('%Y%m%d-%H%M')}.ics"
    path = folder / name
    path.write_text("\r\n".join(lines), encoding="utf-8")

    reminder = None
    if remind:
        try:
            reminder = get_store().add_reminder(f"{clean_title} (in 10 minutes)", start - timedelta(minutes=10))
        except Exception:
            reminder = None

    when_text = start.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")
    return reply(
        f"Added “{clean_title}” to your calendar for {when_text}, Sir.",
        speech=f"Calendar event ready for {when_text}, Sir.",
        cards=[
            {
                "type": "link",
                "title": f"CALENDAR · {clean_title}",
                "subtitle": f"{when_text} · {minutes} min" + (" · download .ics" if True else ""),
                "url": f"/api/file?path=files/{quote(name)}",
            },
            {"type": "list", "title": "EVENT", "rows": [
                f"title: {clean_title}",
                f"start: {when_text}",
                f"duration: {minutes} minutes",
                f"file: {path}",
                "reminder: 10 minutes before" if reminder else "reminder: none",
            ]},
        ],
        data={"title": clean_title, "start": start.isoformat(), "minutes": minutes, "path": str(path), "uid": uid},
    )


def whatsapp_autosend(contact: str = "", message: str = "") -> dict:
    """Open WhatsApp Desktop with the chat prefilled, then press Enter."""
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(f"I do not have a number for “{contact}”, Sir.", data={"unknown_contact": True})
    text = str(message or "").strip()
    if not text:
        return reply(f"What should I say to {label}, Sir?", data={"needs_message": True})
    try:
        from jarvis.skills import desktop

        if not desktop.armed():
            return reply(
                "Arm desktop control first, Sir — auto-send types into WhatsApp Desktop.",
                data={"armed": False},
            )
        if not desktop._display_ok():
            return reply("There is no desktop session, Sir, so I cannot drive WhatsApp Desktop.")
        uri = f"whatsapp://send?phone={number}&text={quote(text)}"
        system = platform.system().lower()
        if system == "windows":
            os.startfile(uri)  # type: ignore[attr-defined]
        elif system == "darwin":
            subprocess.run(["open", uri], check=False, timeout=10)
        else:
            opener = "xdg-open"
            subprocess.run([opener, uri], check=False, timeout=10)
        time.sleep(3.0)
        desktop._press_enter()
    except Exception as exc:
        return reply(f"I could not drive WhatsApp Desktop, Sir — {type(exc).__name__}: {exc}.")
    return reply(
        f"Opened {label}'s WhatsApp chat and pressed Enter, Sir. Please glance at the chat to confirm it sent.",
        speech=f"WhatsApp message to {label} sent, Sir.",
        cards=[{"type": "message", "title": f"WHATSAPP · {label}", "subtitle": f"+{number}", "body": text}],
        data={"number": number, "label": label, "auto": True},
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


def email_send_preflight(to: str = "", subject: str = "", body: str = "") -> dict | None:
    address, label = _resolve_target(to, "email")
    if not address:
        return reply(f"I do not have an email address for “{to}”, Sir.", data={"unknown_contact": True})
    if not str(body or "").strip():
        return reply(f"What should the email to {label} say, Sir?", data={"needs_body": True})
    return None


def calendar_event_preflight(title: str = "", when: str = "", duration_minutes: int = 30, location: str = "", remind: bool = True) -> dict | None:
    raw = str(when or title or "").strip()
    if not raw:
        return reply("What should I schedule, Sir?")
    moment, leftover = parse_when(raw, reference=now())
    if moment is None:
        return reply(
            "When is it, Sir? Try “tomorrow at 5 pm”, “in 2 hours” or “on 30 October at 10:00”.",
            data={"needs_time": True},
        )
    if not str(title or "").strip() and not str(leftover or "").strip():
        return reply("What should the event be called, Sir?", data={"needs_title": True})
    return None


def whatsapp_autosend_preflight(contact: str = "", message: str = "") -> dict | None:
    number, label = _resolve_target(contact, "phone")
    if not number:
        return reply(f"I do not have a number for “{contact}”, Sir.", data={"unknown_contact": True})
    if not str(message or "").strip():
        return reply(f"What should I say to {label}, Sir?", data={"needs_message": True})
    return None
