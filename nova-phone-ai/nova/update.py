"""Safe update system.

Guarantees (and their limits):
  * Only fetches from remotes listed in update.trusted_remotes; refuses anything else.
  * Refuses if the project folder has uncommitted local changes, or if the update is not a fast-forward.
  * Fetches the candidate into a temporary copy and runs its unit tests there BEFORE touching your tree.
    (Those tests execute upstream code; that is why an explicit --yes is required and the remote must be trusted.)
  * Writes a timestamped backup tarball of this project folder and a manifest before applying.
  * `rollback` returns to the previous commit recorded in the manifest.
The AI assistant itself cannot call update; it is a CLI-only operation.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tarfile
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from nova.config import Config
from nova.security import GITHUB_TOKEN_VARS, sanitized_env


class UpdateError(Exception):
    pass


@dataclass
class UpdateReport:
    ok: bool
    message: str
    steps: list[str] = field(default_factory=list)


def _git(repo: Path, *args: str, timeout: int = 120) -> str:
    try:
        proc = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                              timeout=timeout, env=sanitized_env(allow=GITHUB_TOKEN_VARS), shell=False)
    except FileNotFoundError as exc:
        raise UpdateError("git is not installed: pkg install git") from exc
    except subprocess.TimeoutExpired as exc:
        raise UpdateError(f"git {' '.join(args[:2])} timed out") from exc
    if proc.returncode != 0:
        raise UpdateError(f"git {' '.join(args[:2])} failed: {(proc.stderr or proc.stdout).strip()[:300]}")
    return proc.stdout.strip()


def _norm(url: str) -> str:
    return url.strip().rstrip("/").removesuffix(".git").lower()


def repo_root(cfg: Config) -> Path:
    try:
        return Path(_git(cfg.project_root, "rev-parse", "--show-toplevel")).resolve()
    except UpdateError as exc:
        raise UpdateError("Nova is not inside a git checkout, so it cannot update safely.") from exc


def _rel(cfg: Config, root: Path) -> str:
    return str(cfg.project_root.resolve().relative_to(root))


def _trusted_check(cfg: Config, root: Path, remote: str) -> str:
    url = _git(root, "remote", "get-url", remote)
    trusted = {_norm(u) for u in cfg.update.trusted_remotes}
    if _norm(url) not in trusted:
        raise UpdateError(f"remote '{remote}' ({url}) is not in update.trusted_remotes; refusing to update")
    return url


def check(cfg: Config) -> dict:
    root = repo_root(cfg)
    rel = _rel(cfg, root)
    remote = cfg.update.remote
    url = _trusted_check(cfg, root, remote)
    branch = cfg.update.branch
    _git(root, "fetch", "--no-tags", remote, branch)
    fetched = _git(root, "rev-parse", "FETCH_HEAD")
    head = _git(root, "rev-parse", "HEAD")
    behind = _git(root, "rev-list", "--count", f"HEAD..{fetched}")
    ahead = _git(root, "rev-list", "--count", f"{fetched}..HEAD")
    dirty = _git(root, "status", "--porcelain", "--", rel)
    is_ff = subprocess.run(["git", "-C", str(root), "merge-base", "--is-ancestor", head, fetched],
                           capture_output=True).returncode == 0
    return {"remote": remote, "remote_url": url, "branch": branch, "head": head, "upstream": fetched,
            "behind": int(behind), "ahead": int(ahead), "fast_forward": is_ff,
            "local_changes_in_nova": bool(dirty), "project_path": rel}


def _backup(cfg: Config, root: Path, head: str, label: str) -> Path:
    cfg.backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    archive = cfg.backup_dir / f"nova-phone-ai-{stamp}-{label}.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(cfg.project_root, arcname="nova-phone-ai",
                filter=lambda ti: None if "__pycache__" in ti.name or ti.name.endswith(".pyc") else ti)
    manifest = {"created": stamp, "head_before": head, "archive": str(archive), "project_path": _rel(cfg, root),
                "status": "backup"}
    (cfg.backup_dir / f"nova-phone-ai-{stamp}-{label}.json").write_text(json.dumps(manifest, indent=2))
    return archive


def _run_candidate_tests(cfg: Config, root: Path, fetched: str, rel: str) -> None:
    tmp = Path(tempfile.mkdtemp(prefix="nova-candidate-"))
    try:
        archive = subprocess.run(["git", "-C", str(root), "archive", "--format=tar", fetched, rel],
                                 capture_output=True, check=False)
        if archive.returncode != 0:
            raise UpdateError("could not export candidate version")
        (tmp / "candidate.tar").write_bytes(archive.stdout)
        with tarfile.open(tmp / "candidate.tar") as tar:
            if hasattr(tarfile, "data_filter"):
                tar.extractall(tmp, filter="data")
            else:  # Python builds without extraction filters: refuse absolute/parent paths ourselves
                for member in tar.getmembers():
                    if member.name.startswith("/") or ".." in Path(member.name).parts:
                        raise UpdateError("unsafe path in candidate archive")
                tar.extractall(tmp)
        candidate = tmp / rel
        env = sanitized_env()
        env["NOVA_HOME"] = str(tmp / "home")
        env["PYTHONPATH"] = str(candidate)
        env["NOVA_CANDIDATE_TEST"] = "1"  # lets the update test-suite skip recursive update tests
        proc = subprocess.run(["python3", "-m", "unittest", "discover", "-s", str(candidate / "tests"),
                               "-t", str(candidate)], capture_output=True, text=True, env=env,
                              timeout=600, cwd=str(candidate))
        if proc.returncode != 0:
            raise UpdateError("candidate update FAILED its tests; your installation was not changed:\n"
                              + (proc.stderr or proc.stdout)[-800:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def apply(cfg: Config, confirm: bool = False) -> UpdateReport:
    info = check(cfg)
    steps = [f"remote trusted: {info['remote_url']}", f"behind by {info['behind']} commit(s)"]
    if info["ahead"]:
        raise UpdateError("local commits exist that are not upstream; merge manually instead of auto-update")
    if info["behind"] == 0:
        return UpdateReport(True, "already up to date", steps)
    if not info["fast_forward"]:
        raise UpdateError("upstream is not a fast-forward of your branch; refusing automatic update")
    if info["local_changes_in_nova"]:
        raise UpdateError("uncommitted local changes in nova-phone-ai; commit or stash them first")
    if not confirm:
        return UpdateReport(False, "update available; re-run with --yes to test and apply", steps)

    root = repo_root(cfg)
    rel = info["project_path"]
    _run_candidate_tests(cfg, root, info["upstream"], rel)
    steps.append("candidate tests passed in an isolated copy")
    archive = _backup(cfg, root, info["head"], "pre-update")
    steps.append(f"backup written: {archive}")
    _git(root, "merge", "--ff-only", info["upstream"])
    now_head = _git(root, "rev-parse", "HEAD")
    if now_head != info["upstream"]:
        raise UpdateError("post-update HEAD does not match the verified candidate")
    manifest_path = max(cfg.backup_dir.glob("*-pre-update.json"))
    manifest = json.loads(manifest_path.read_text())
    manifest.update({"status": "applied", "head_after": now_head})
    manifest_path.write_text(json.dumps(manifest, indent=2))
    steps.append(f"applied: HEAD {info['head'][:8]} -> {now_head[:8]}")
    return UpdateReport(True, "update applied and verified", steps)


def rollback(cfg: Config) -> UpdateReport:
    manifests = sorted(cfg.backup_dir.glob("*-pre-update.json")) if cfg.backup_dir.exists() else []
    applied = [p for p in manifests if json.loads(p.read_text()).get("status") == "applied"]
    if not applied:
        raise UpdateError("no applied update found to roll back")
    manifest = json.loads(applied[-1].read_text())
    root = repo_root(cfg)
    _git(root, "reset", "--keep", manifest["head_before"])
    if _git(root, "rev-parse", "HEAD") != manifest["head_before"]:
        raise UpdateError("rollback did not reach the previous commit")
    manifest["status"] = "rolled_back"
    applied[-1].write_text(json.dumps(manifest, indent=2))
    return UpdateReport(True, f"rolled back to {manifest['head_before'][:8]}",
                        [f"backup kept at {manifest['archive']}"])
