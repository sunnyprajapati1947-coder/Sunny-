"""Background scheduler for reminders, timers, alarms and system watchdogs."""
from __future__ import annotations

import threading
import time

from jarvis import sysinfo
from jarvis.util import iso, now, parse_iso

MAX_EVENTS = 200


class Scheduler:
    def __init__(self, core):
        self.core = core
        self._events: list[dict] = []
        self._lock = threading.Lock()
        self._next_id = 1
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_monitor = 0.0
        self._alerts: dict[str, float] = {}

    # ------------------------------------------------------------------ api
    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="jarvis-scheduler", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def push(self, kind: str, title: str, body: str, speech: str | None = None) -> dict:
        with self._lock:
            event = {
                "id": self._next_id,
                "type": kind,
                "title": title,
                "body": body,
                "speech": speech or f"{title}. {body}".strip(),
                "ts": iso(now()),
            }
            self._next_id += 1
            self._events.append(event)
            if len(self._events) > MAX_EVENTS:
                self._events = self._events[-MAX_EVENTS:]
            return dict(event)

    def events(self, since: int = 0) -> dict:
        with self._lock:
            items = [dict(item) for item in self._events if item["id"] > int(since or 0)]
            last = self._next_id - 1
        return {"events": items, "last_id": last}

    def pending(self) -> dict:
        store = self.core.store
        return {
            "reminders": len(store.reminders()),
            "timers": len(store.timers()),
            "alarms": len(store.alarms()),
        }

    # ----------------------------------------------------------------- loop
    def _run(self) -> None:
        while not self._stop.wait(1.0):
            try:
                self._tick()
            except Exception:
                # The scheduler must never take the assistant down.
                continue

    def _tick(self) -> None:
        reference = now()
        store = self.core.store

        for reminder in store.due_reminders(reference):
            store.mark_reminder_fired(reminder["id"])
            self.push(
                "reminder",
                "REMINDER",
                reminder.get("text", ""),
                speech=f"Sir, a reminder: {reminder.get('text', '')}",
            )

        for timer in store.due_timers(reference):
            store.mark_timer_fired(timer["id"])
            label = timer.get("label") or "timer"
            self.push(
                "timer",
                "TIMER COMPLETE",
                f"Your {label} has finished.",
                speech=f"Sir, your {label} is complete.",
            )

        today = reference.strftime("%Y-%m-%d")
        current_clock = reference.strftime("%H:%M")
        for alarm in store.alarms():
            if alarm.get("time") == current_clock and alarm.get("fired_on") != today:
                store.mark_alarm_fired(alarm["id"], today)
                self.push(
                    "alarm",
                    "ALARM",
                    alarm.get("label") or "Alarm",
                    speech=f"Good day, Sir. It is {current_clock}. {alarm.get('label') or 'Your alarm'}.",
                )

        if time.time() - self._last_monitor > 30:
            self._last_monitor = time.time()
            self._monitor()

    def _monitor(self) -> None:
        metrics = sysinfo.metrics(force=True)
        battery = metrics.get("battery") or {}
        percent = battery.get("percent")
        if battery.get("present") and percent is not None and percent <= 20 and not battery.get("plugged"):
            if self._cooldown("battery", 1800):
                self.push(
                    "system",
                    "POWER LOW",
                    f"Battery at {percent} percent. Consider connecting a charger, Sir.",
                    speech=f"Sir, battery is at {percent} percent. Perhaps a charger.",
                )
        disk = metrics.get("disk") or {}
        if float(disk.get("percent") or 0) >= 92:
            if self._cooldown("disk", 21600):
                self.push(
                    "system",
                    "STORAGE CRITICAL",
                    f"Disk usage at {disk.get('percent')} percent, Sir.",
                    speech=f"Sir, storage is at {disk.get('percent')} percent. Cleanup advised.",
                )

    def _cooldown(self, key: str, seconds: float) -> bool:
        last = self._alerts.get(key, 0.0)
        if time.time() - last < seconds:
            return False
        self._alerts[key] = time.time()
        return True
