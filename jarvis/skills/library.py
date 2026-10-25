"""Import, search and run skills.

Storage
    skills       one row per skill; `body` is zlib-compressed text (16 MB of
                 markdown becomes ~5 MB on disk, which matters on a phone)
    skills_fts   FTS5 over title/description/keywords (falls back to LIKE)

Sources
    <project>/apps/jarvis-pocket/data/manifest.json  + chunks/*.json
        the 23-pack, 1,889-item library already shipped with Jarvis Pocket
    jarvis/skills/builtin.json
        native skills whose steps map to real tools
"""

from __future__ import annotations

import json
import re
import time
import zlib
from pathlib import Path

from ..db import Database

DATA_REL = Path("apps") / "jarvis-pocket" / "data"
BUILTIN = Path(__file__).resolve().parent / "builtin.json"
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}
MAX_BODY = 260_000
_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_.\-\[\]]+)\s*\}\}")


class SkillError(ValueError):
    pass


def skill_risk(steps: list[dict]) -> str:
    """A skill is as risky as its riskiest tool."""
    worst = "low"
    for step in steps:
        risk = str(step.get("risk") or "").lower()
        if not risk:
            tool = str(step.get("tool") or "")
            risk = "medium" if tool in ("fs_write", "python_exec", "notify", "speak", "forget") else "low"
        if RISK_ORDER.get(risk, 0) > RISK_ORDER.get(worst, 0):
            worst = risk
    return worst


def _lookup(data, path: str):
    current = data
    for part in path.split("."):
        if isinstance(current, list):
            try:
                current = current[int(part)]
                continue
            except (ValueError, IndexError):
                return None
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        if part == "now":
            return time.strftime("%Y-%m-%d %H:%M")
        return None
    return current


def render_template(value, ctx: dict):
    """Fill {{input.query}} / {{prev.result.x}} / {{now}} placeholders."""
    if isinstance(value, dict):
        return {key: render_template(item, ctx) for key, item in value.items()}
    if isinstance(value, list):
        return [render_template(item, ctx) for item in value]
    if not isinstance(value, str):
        return value

    def replace(match):
        found = _lookup(ctx, match.group(1))
        if found is None:
            return ""
        if isinstance(found, (dict, list)):
            return json.dumps(found, ensure_ascii=False)
        return str(found)

    return _PLACEHOLDER.sub(replace, value)


class SkillLibrary:
    def __init__(self, db: Database, project_root: Path):
        self.db = db
        self.project_root = Path(project_root)
        self.data_dir = self.project_root / DATA_REL

    # ------------------------------------------------------------------ sync

    def status(self) -> dict:
        row = self.db.one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(bytes),0) AS b FROM skills")
        builtin = self.db.one("SELECT COUNT(*) AS n FROM skills WHERE builtin=1")
        meta = {item["key"]: item["value"] for item in self.db.query("SELECT key, value FROM meta")}
        packs = self.db.one("SELECT COUNT(DISTINCT pack) AS n FROM skills")
        imported_packs = self.db.one(
            "SELECT COUNT(DISTINCT pack) AS n FROM skills WHERE builtin=0")
        return {
            "total": int(row["n"] or 0),
            "builtin": int(builtin["n"] or 0),
            "imported": int(row["n"] or 0) - int(builtin["n"] or 0),
            "bytes": int(row["b"] or 0),
            "packs": int(packs["n"] or 0),
            "imported_packs": int(imported_packs["n"] or 0),
            "source": str(self.data_dir),
            "source_present": (self.data_dir / "manifest.json").exists(),
            "imported_at": meta.get("skills_synced_at", ""),
            "source_build": meta.get("skills_source_build", ""),
            "fts": self.db.has_skill_fts,
        }

    def sync(self, force: bool = False, include_packs: bool = True) -> dict:
        started = time.time()
        self._sync_builtin()
        imported = 0
        skipped = "packs not requested"
        manifest_path = self.data_dir / "manifest.json"
        if include_packs and manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except Exception as exc:
                raise SkillError(f"manifest unreadable: {type(exc).__name__}") from None
            build = str(manifest.get("built", ""))
            meta = self.db.one("SELECT value FROM meta WHERE key='skills_source_build'")
            already = meta["value"] if meta else ""
            if force or already != build or self._imported_count() == 0:
                imported = self._import_manifest(manifest)
                self._set_meta("skills_source_build", build)
                self._set_meta("skills_synced_at", time.strftime("%Y-%m-%d %H:%M:%S"))
                skipped = ""
            else:
                skipped = "already up to date"
        elif include_packs:
            skipped = "pack data missing"
        self.db.audit("skills_sync", {"imported": imported, "skipped": skipped,
                                      "ms": int((time.time() - started) * 1000)})
        return {"ok": True, "new": imported, "skipped": skipped,
                "ms": int((time.time() - started) * 1000), **self.status()}

    def _set_meta(self, key: str, value: str) -> None:
        self.db.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)))

    def _imported_count(self) -> int:
        row = self.db.one("SELECT COUNT(*) AS n FROM skills WHERE builtin=0")
        return int(row["n"] or 0)

    def _sync_builtin(self) -> None:
        if not BUILTIN.exists():
            return
        data = json.loads(BUILTIN.read_text(encoding="utf-8"))
        for skill in data.get("skills", []):
            steps = skill.get("steps") or []
            payload = json.dumps({"steps": steps, "inputs": skill.get("inputs") or {}},
                                 ensure_ascii=False)
            self._store(
                skill_id=str(skill["id"]), pack="jarvis", kind="builtin",
                title=str(skill.get("title") or skill["id"]),
                description=str(skill.get("description") or ""),
                tags=",".join(skill.get("tags") or []),
                keywords=" ".join([str(skill.get("title") or ""), str(skill.get("description") or ""),
                                   " ".join(skill.get("tags") or []), "jarvis builtin"]),
                path="jarvis/skills/builtin.json",
                body=payload,
                risk=str(skill.get("risk") or skill_risk(steps)),
                builtin=1,
            )

    def _import_manifest(self, manifest: dict) -> int:
        """Stream chunks one at a time so a phone never holds 16 MB at once."""
        packs = manifest.get("packs") or []
        types = manifest.get("types") or []
        pack_ids = [str(item.get("id") or f"pack{i}") for i, item in enumerate(packs)]
        entries = {str(item.get("i")): item for item in (manifest.get("items") or [])}
        pending = dict(entries)
        imported = 0

        type_names = list(types) if isinstance(types, dict) else [str(item) for item in types]

        def kind_of(entry: dict) -> str:
            raw = entry.get("y", "skill")
            if isinstance(raw, int):
                return type_names[raw] if raw < len(type_names) else "skill"
            text = str(raw or "skill")
            return text if text else "skill"

        def store_entry(entry: dict, text: str) -> None:
            nonlocal imported
            pack_idx = int(entry.get("p") or 0)
            self._store(
                skill_id=str(entry.get("i")),
                pack=pack_ids[pack_idx] if pack_idx < len(pack_ids) else f"pack{pack_idx}",
                kind=kind_of(entry),
                title=str(entry.get("t") or entry.get("i")),
                description=str(entry.get("d") or ""),
                tags=",".join(entry.get("g") or []),
                keywords=str(entry.get("k") or ""),
                path=str(entry.get("f") or ""),
                body=text, risk="low", builtin=0,
            )
            imported += 1

        for path in sorted((self.data_dir / "chunks").glob("c*.json")):
            try:
                chunk = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            for skill_id, text in (chunk.get("items") or {}).items():
                entry = pending.pop(str(skill_id), None)
                if entry is not None:
                    store_entry(entry, str(text))

        for entry in pending.values():          # keep a stub instead of losing the skill
            store_entry(entry, str(entry.get("d") or ""))

        if pending:
            self.db.audit("skills_partial", {"stubs": len(pending)})
        return imported

    def _body_of(self, row) -> str:
        try:
            return zlib.decompress(row["body"] or b"").decode("utf-8", "replace")
        except Exception:
            return ""

    def _store(self, *, skill_id: str, pack: str, kind: str, title: str, description: str,
               tags: str, keywords: str, path: str, body: str, risk: str, builtin: int) -> None:
        raw = (body or "").encode("utf-8")[:MAX_BODY]
        packed = zlib.compress(raw, 6)
        self.db.execute(
            "INSERT INTO skills(id, pack, type, title, description, tags, keywords, path, body,"
            " bytes, risk, builtin, synced) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(id) DO UPDATE SET pack=excluded.pack, type=excluded.type,"
            " title=excluded.title, description=excluded.description, tags=excluded.tags,"
            " keywords=excluded.keywords, path=excluded.path, body=excluded.body,"
            " bytes=excluded.bytes, risk=excluded.risk, builtin=excluded.builtin,"
            " synced=excluded.synced",
            (skill_id, pack, kind, title[:200], description[:1200], tags[:400], keywords[:800],
             path[:300], packed, len(raw), risk, int(builtin), time.time()))
        if self.db.has_skill_fts:
            try:
                self.db.execute("DELETE FROM skills_fts WHERE id=?", (skill_id,))
                self.db.execute(
                    "INSERT INTO skills_fts(id, title, description, keywords) VALUES(?,?,?,?)",
                    (skill_id, title[:400], description[:1200], keywords[:800]))
            except Exception:
                pass

    # ----------------------------------------------------------------- query

    def get(self, skill_id: str, with_body: bool = True) -> dict | None:
        row = self.db.one("SELECT * FROM skills WHERE id=?", (skill_id,))
        if not row:
            return None
        data = {
            "id": row["id"], "pack": row["pack"], "type": row["type"], "title": row["title"],
            "description": row["description"], "tags": [t for t in (row["tags"] or "").split(",") if t],
            "path": row["path"], "risk": row["risk"], "builtin": bool(row["builtin"]),
            "bytes": int(row["bytes"] or 0),
        }
        if with_body:
            raw = self._body_of(row)
            data["text"] = raw
            if row["builtin"]:
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    payload = {}
                steps = payload.get("steps") or []
                data["steps"] = steps
                data["inputs"] = payload.get("inputs") or {}
                data["text"] = self._builtin_markdown(data, steps)
        return data

    @staticmethod
    def _builtin_markdown(skill: dict, steps: list[dict]) -> str:
        lines = [f"# {skill['title']}", "", skill.get("description") or "", "", "## Steps", ""]
        for index, step in enumerate(steps, start=1):
            tool = step.get("tool") or "?"
            lines.append(f"{index}. **{step.get('title') or tool}** — `{tool}`")
        inputs = skill.get("inputs") or {}
        if inputs:
            lines += ["", "## Inputs", ""]
            lines += [f"- `{name}` — {hint}" for name, hint in inputs.items()]
        lines += ["", "_Native skill: runs on the phone with local tools, no model needed._"]
        return "\n".join(lines)

    def payload(self, skill_id: str) -> dict:
        """Parsed step definition of a builtin skill."""
        row = self.db.one("SELECT body, builtin FROM skills WHERE id=?", (skill_id,))
        if not row or not row["builtin"]:
            return {}
        try:
            return json.loads(self._body_of(row))
        except json.JSONDecodeError:
            return {}

    def search(self, query: str = "", limit: int = 20, pack: str = "", kind: str = "",
               builtin_only: bool = False) -> list[dict]:
        term = " ".join(str(query or "").split()).strip()
        limit = max(1, min(int(limit or 20), 100))
        filters, params = [], []
        if pack:
            filters.append("s.pack=?")
            params.append(pack)
        if kind:
            filters.append("s.type=?")
            params.append(kind)
        if builtin_only:
            filters.append("s.builtin=1")
        extra = (" AND " + " AND ".join(filters)) if filters else ""

        rows = []
        if term and self.db.has_skill_fts:
            safe = re.sub(r"[^\w\s\u0900-\u097F]", " ", term).strip()
            words = [word for word in safe.split() if len(word) > 1] or [safe]
            if safe:
                match = " OR ".join(f"{word}*" for word in words)
                try:
                    rows = self.db.query(
                        "SELECT s.* FROM skills_fts f JOIN skills s ON s.id=f.id "
                        f"WHERE skills_fts MATCH ?{extra} ORDER BY rank LIMIT ?",
                        (match, *params, limit))
                except Exception:
                    rows = []
        if not rows:
            like = f"%{term}%" if term else "%"
            plain = [f.replace("s.", "") for f in filters]
            extra_plain = (" AND " + " AND ".join(plain)) if plain else ""
            rows = self.db.query(
                "SELECT * FROM skills WHERE (title LIKE ? OR description LIKE ? OR keywords LIKE ?)"
                f"{extra_plain} ORDER BY builtin DESC, length(title) LIMIT ?",
                (like, like, like, *params, limit))
        return [{"id": row["id"], "title": row["title"], "description": row["description"][:280],
                 "pack": row["pack"], "type": row["type"], "risk": row["risk"],
                 "builtin": bool(row["builtin"]), "path": row["path"]}
                for row in rows]

    def packs(self) -> list[dict]:
        rows = self.db.query(
            "SELECT pack, COUNT(*) AS n, SUM(builtin) AS b FROM skills GROUP BY pack ORDER BY n DESC")
        return [{"pack": row["pack"], "count": int(row["n"]), "builtin": int(row["b"] or 0)}
                for row in rows]

    def prompt_block(self, query: str, limit: int = 4) -> str:
        rows = self.search(query, limit=limit) if query else []
        if not rows:
            return ""
        lines = ["Relevant skills from the user's own library (use skill_show / skill_run):"]
        for row in rows:
            origin = "native" if row["builtin"] else row["pack"]
            lines.append(f"- {row['id']} · {row['title']} [{origin}] — {row['description'][:150]}")
        return "\n".join(lines)

    def stats(self) -> dict:
        try:
            return self.status()
        except Exception:
            return {"total": 0, "builtin": 0, "imported": 0}


class SkillRunner:
    """Turns a skill into a task and executes it step by step.

    A skill task is bound to its skill in `meta`, so after an approval it can be
    resumed from the dashboard without re-creating (and re-charging) the work.
    """

    def __init__(self, library: SkillLibrary, tools, tasks, db):
        self.library = library
        self.tools = tools
        self.tasks = tasks
        self.db = db

    # ------------------------------------------------------------ plumbing

    def _bind(self, task_id: str, skill_id: str, inputs: dict) -> None:
        for key, value in ((f"skilltask:{task_id}", skill_id),
                           (f"skillinputs:{task_id}", json.dumps(inputs or {}, ensure_ascii=False))):
            self.db.execute(
                "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE "
                "SET value=excluded.value", (key, value))

    def bound_skill(self, task_id: str) -> str:
        row = self.db.one("SELECT value FROM meta WHERE key=?", (f"skilltask:{task_id}",))
        return row["value"] if row else ""

    def _inputs(self, task_id: str) -> dict:
        row = self.db.one("SELECT value FROM meta WHERE key=?", (f"skillinputs:{task_id}",))
        if not row:
            return {}
        try:
            return json.loads(row["value"]) or {}
        except Exception:
            return {}

    def _save_context(self, task_id: str, index: int, result) -> None:
        try:
            blob = json.dumps(result, ensure_ascii=False, default=str)[:20_000]
            self.db.execute(
                "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE "
                "SET value=excluded.value", (f"skillctx:{task_id}:{index}", blob))
        except Exception:
            pass

    def _load_context(self, task_id: str, index: int) -> dict:
        if index < 0:
            return {}
        row = self.db.one("SELECT value FROM meta WHERE key=?", (f"skillctx:{task_id}:{index}",))
        if not row:
            return {}
        try:
            return {"result": json.loads(row["value"])}
        except Exception:
            return {}

    # -------------------------------------------------------------- public

    def start(self, skill_id: str, inputs: dict | None = None, auto_run: bool = True,
              planner=None) -> dict:
        skill = self.library.get(skill_id)
        if not skill:
            raise SkillError(f"skill not found: {skill_id}")
        inputs = {str(key): value for key, value in (inputs or {}).items()}
        if skill["builtin"]:
            return self._run_builtin(skill, inputs, auto_run=auto_run)
        return self._run_imported(skill, inputs, auto_run=auto_run, planner=planner)

    def resume(self, task_id: str, planner=None) -> dict:
        """Continue a PAUSED skill task (for example after an approval)."""
        task = self.tasks.get(task_id)
        if not task:
            raise SkillError("task not found")
        skill_id = self.bound_skill(task_id)
        if not skill_id:
            raise SkillError("this task is not bound to a skill")
        skill = self.library.get(skill_id)
        if not skill:
            raise SkillError(f"skill not found: {skill_id}")
        inputs = self._inputs(task_id)
        if skill["builtin"]:
            return self._run_builtin(skill, inputs, auto_run=True, task=task)
        return self._run_imported(skill, inputs, auto_run=True, planner=planner, task=task)

    # -------------------------------------------------------------- builtin

    def _run_builtin(self, skill: dict, inputs: dict, auto_run: bool, task=None) -> dict:
        payload = self.library.payload(skill["id"])
        steps = payload.get("steps") or []
        if not steps:
            raise SkillError("skill has no steps")
        declared = payload.get("inputs") or {}
        missing = [name for name in declared if not str(inputs.get(name, "")).strip()]
        if missing:
            raise SkillError("missing input: " + ", ".join(missing))

        created = task is None
        if created:
            task = self.tasks.create(
                skill["title"], goal=skill["description"],
                steps=[str(step.get("title") or step.get("tool")) for step in steps],
                max_retries=1)
            self._bind(task.id, skill["id"], inputs)
            self.db.audit("skill_start", {"id": skill["id"], "task": task.id, "kind": "builtin"})

        outcome = {"approval": None}

        def executor(current, step):
            index = int(current.cursor)
            spec = steps[index] if index < len(steps) else {"tool": "", "args": {}}
            ctx = {"input": inputs, "prev": self._load_context(current.id, index - 1),
                   "now": time.strftime("%Y-%m-%d %H:%M")}
            args = render_template(spec.get("args") or {}, ctx)
            tool_name = str(spec.get("tool") or "")
            approval_id = None
            try:
                approval_id = self.tools.approvals.available_for(tool_name, args)
            except Exception:
                approval_id = None
            result = self.tools.call(tool_name, args, approval_id=approval_id)
            if result.get("approval_required"):
                outcome["approval"] = result.get("approval")
                return {"ok": False, "detail": f"approval required: {result['approval']['id']}"}
            if not result.get("ok"):
                return {"ok": False, "detail": str(result.get("error") or "tool failed")[:400]}
            self._save_context(current.id, index, result.get("result"))
            return {"ok": True, "detail": json.dumps(result.get("result"), ensure_ascii=False)[:600],
                    "result": json.dumps(result.get("result"), ensure_ascii=False)}

        if auto_run:
            task = self.tasks.run(task.id, executor)
            if outcome["approval"]:
                self.db.execute("UPDATE tasks SET status='PAUSED', error=? WHERE id=?",
                                (f"approval required: {outcome['approval']['id']}", task.id))
                task = self.tasks.get(task.id)
            self.db.audit("skill_done", {"id": skill["id"], "task": task.id,
                                         "status": task.status if task else "?"})
        task = self.tasks.get(task.id) or task
        return {"ok": True, "skill": skill["id"], "task": task.to_dict(),
                "approval": outcome["approval"], "auto_run": auto_run, "created": created}

    # ------------------------------------------------------------- imported

    def _run_imported(self, skill: dict, inputs: dict, auto_run: bool, planner,
                      task=None) -> dict:
        created = task is None
        if created:
            task = self.tasks.create(
                skill["title"],
                goal=(skill["description"] or "Follow the imported skill")[:400],
                steps=["Load skill instructions", "Plan with the model",
                       "Execute the plan with tools"],
                max_retries=0)
            self._bind(task.id, skill["id"], inputs)
            self.db.audit("skill_start", {"id": skill["id"], "task": task.id, "kind": "imported"})

        skill_text = skill.get("text") or ""

        def executor(current, step):
            index = int(current.cursor)
            if index == 0:
                return {"ok": True, "detail": (skill["description"] or "")[:400],
                        "result": "instructions loaded"}
            if planner is None:
                return {"ok": False, "detail": "model required: imported skills need a provider"}
            prompt = (
                f"User skill: {skill['title']}\n"
                f"Skill path: {skill['path']}\n"
                f"Instructions:\n{skill_text[:6000]}\n\n"
                f"User input: {json.dumps(inputs, ensure_ascii=False)}\n"
                f"Step {index + 1}/3: {step.title}. Do only this step, use one tool if needed, "
                "and report the concrete result."
            )
            return planner(current, step, prompt)

        if auto_run:
            task = self.tasks.run(task.id, executor)
        task = self.tasks.get(task.id) or task
        return {"ok": True, "skill": skill["id"], "task": task.to_dict(),
                "approval": None, "auto_run": auto_run, "created": created}
