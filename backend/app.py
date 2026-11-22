"""
Claude Control — local config control-plane for Claude Code.

Reads and writes the REAL ~/.claude files:
  - settings.json          (full object round-tripped; nothing dropped)
  - agents/*.md            (YAML frontmatter + markdown body)
  - projects/*/memory/*    (MEMORY.md index + entry files)

Safety model:
  - Binds to 127.0.0.1 only (see run.sh / uvicorn invocation).
  - Every write is JSON/format validated BEFORE it touches disk.
  - Every overwrite is preceded by a timestamped backup in
    ~/.claude/.claude-control-backups/.
  - All write paths are jailed under ~/.claude — traversal is rejected.
  - Writes happen only on explicit Save from the UI, never implicitly.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

HOME = Path.home()
CLAUDE_DIR = HOME / ".claude"
SETTINGS = CLAUDE_DIR / "settings.json"
AGENTS_DIR = CLAUDE_DIR / "agents"
PROJECTS_DIR = CLAUDE_DIR / "projects"
BACKUP_DIR = CLAUDE_DIR / ".claude-control-backups"

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

app = FastAPI(title="Claude Control", version="1.0.0")
# Permissive CORS is harmless here: the server is bound to loopback only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _jail(path: Path) -> Path:
    """Resolve and ensure the path stays under ~/.claude."""
    p = path.resolve()
    if CLAUDE_DIR.resolve() not in p.parents and p != CLAUDE_DIR.resolve():
        raise HTTPException(400, f"refused: path escapes {CLAUDE_DIR}")
    return p


def _backup(path: Path) -> str | None:
    if not path.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
    # prefix the owning project/user folder so per-scope backups don't collide
    prefix = ""
    if ".claude" in path.parts:
        i = path.parts.index(".claude")
        prefix = f"{path.parts[i - 1] if i > 0 else 'root'}__"
    dest = BACKUP_DIR / f"{prefix}{path.name}.{ts}.bak"
    shutil.copy2(path, dest)
    return str(dest)


def _settings_scope_ok(p: Path) -> Path:
    """Allow only <...>/.claude/settings.json|settings.local.json under HOME."""
    rp = p.resolve()
    if HOME.resolve() not in rp.parents:
        raise HTTPException(400, "refused: settings path is outside your home directory")
    if rp.name not in ("settings.json", "settings.local.json"):
        raise HTTPException(400, "refused: not a settings.json / settings.local.json file")
    if rp.parent.name != ".claude":
        raise HTTPException(400, "refused: file is not inside a .claude directory")
    return rp


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (flat frontmatter dict, body). Tolerant of the simple YAML
    subset used by agent and memory files, including one level of nesting
    (metadata: / type:)."""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
    if not m:
        return {}, text
    raw, body = m.group(1), m.group(2)
    fm: dict = {}
    current_parent: str | None = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        indented = line[0] in " \t"
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip()
        if indented and current_parent:
            fm.setdefault(current_parent, {})
            if isinstance(fm[current_parent], dict):
                fm[current_parent][key] = val
            continue
        if val == "":
            current_parent = key
            fm[key] = {}
        else:
            current_parent = None
            fm[key] = val
    return fm, body


def _parse_agent(path: Path) -> dict:
    fm, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
    tools_raw = fm.get("tools", "")
    tools = [t.strip() for t in str(tools_raw).split(",") if t.strip()] if tools_raw else []
    return {
        "name": fm.get("name", path.stem),
        "description": fm.get("description", ""),
        "tools": tools,
        "model": fm.get("model", ""),
        "effort": fm.get("effort", ""),
        "body": body.strip(),
        "path": str(path),
        "source": "user",
    }


def _render_agent(name: str, data: dict) -> str:
    lines = ["---", f"name: {name}"]
    desc = (data.get("description") or "").strip().replace("\n", " ")
    if desc:
        lines.append(f"description: {desc}")
    tools = data.get("tools") or []
    if tools:
        lines.append("tools: " + ", ".join(tools))
    if data.get("model"):
        lines.append(f"model: {data['model']}")
    if data.get("effort"):
        lines.append(f"effort: {data['effort']}")
    lines.append("---")
    body = (data.get("body") or "").strip()
    return "\n".join(lines) + "\n" + body + "\n"


def _parse_memory_entry(path: Path) -> dict:
    fm, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
    meta = fm.get("metadata") if isinstance(fm.get("metadata"), dict) else {}
    return {
        "file": path.name,
        "name": fm.get("name", path.stem),
        "description": fm.get("description", ""),
        "type": (meta or {}).get("type", ""),
        "body": body.strip(),
        "path": str(path),
    }


# --------------------------------------------------------------------------- #
# meta
# --------------------------------------------------------------------------- #
@app.get("/api/meta")
def meta():
    try:
        ver = subprocess.run(
            ["claude", "--version"], capture_output=True, text=True, timeout=5
        ).stdout.strip()
    except Exception:
        ver = "unknown"
    return {
        "claudeVersion": ver,
        "models": [
            "fable", "opus", "sonnet", "haiku",
            "claude-fable-5-2", "claude-opus-5-5",
            "claude-sonnet-5-5", "claude-haiku-5-5",
        ],
        "efforts": ["low", "medium", "high", "xhigh", "max"],
        "modes": ["default", "plan", "acceptEdits", "bypassPermissions", "dontAsk"],
        "toolNames": [
            "Read", "Edit", "Write", "Grep", "Glob", "Bash", "WebSearch",
            "WebFetch", "ToolSearch", "Agent", "SendMessage", "NotebookEdit", "*",
        ],
        "hookEvents": [
            "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest",
            "Notification", "Stop", "PreCompact", "PostCompact",
            "UserPromptSubmit", "SessionStart",
        ],
        "paths": {
            "settings": str(SETTINGS),
            "agents": str(AGENTS_DIR),
            "backups": str(BACKUP_DIR),
            "projects": str(PROJECTS_DIR),
            "home": str(HOME),
        },
    }


# --------------------------------------------------------------------------- #
# system / machine-aware recommendations
# --------------------------------------------------------------------------- #
def _cpu_counts() -> tuple[int, int]:
    """(logical, physical) CPU counts. Physical derived from unique
    (physical id, core id) pairs in /proc/cpuinfo; falls back to logical."""
    logical = os.cpu_count() or 1
    physical = logical
    try:
        pairs: set[tuple[str, str]] = set()
        cur_phys = "0"
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if ":" not in line:
                continue
            k, v = (x.strip() for x in line.split(":", 1))
            if k == "physical id":
                cur_phys = v
            elif k == "core id":
                pairs.add((cur_phys, v))
        if pairs:
            physical = len(pairs)
    except Exception:
        pass
    return logical, physical


def _mem_gb() -> tuple[float, float]:
    """(total, available) RAM in GB from /proc/meminfo."""
    tot = avail = 0.0
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                tot = int(line.split()[1]) / 1024 / 1024
            elif line.startswith("MemAvailable:"):
                avail = int(line.split()[1]) / 1024 / 1024
    except Exception:
        pass
    return tot, avail


def _cpu_model() -> str:
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return "unknown"


def _clamp(x: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, x))


@app.get("/api/system")
def system_info():
    """Detected hardware + machine-aware recommended concurrency knobs.

    These knobs gate LOCAL orchestration (the Node coordinator + any tools the
    agents run); the model itself runs in Anthropic's cloud, so specs don't
    drive model choice — only how many agents run in parallel.
    """
    logical, physical = _cpu_counts()
    tot, avail = _mem_gb()
    load1 = 0.0
    try:
        load1 = os.getloadavg()[0]
    except Exception:
        pass

    # Workflow agents: leave ~2 logical cores for the main loop + OS, cap at the
    # platform ceiling of 16, and keep ~2 GB RAM of headroom per concurrent agent.
    wf_cpu = _clamp(logical - 2, 2, 16)
    wf_ram = _clamp(int(tot // 2) if tot else 16, 2, 16)
    workflow = min(wf_cpu, wf_ram)

    # Session-wide Agent-tool cap (Claude Code default 20). Broader than one
    # workflow; ~1.5 GB/agent and 2x logical cores, capped at the default 20.
    sub_cpu = _clamp(logical * 2, 4, 20)
    sub_ram = _clamp(int(tot // 1.5) if tot else 20, 4, 20)
    subagents = min(sub_cpu, sub_ram)

    return {
        "cpu": {"logical": logical, "physical": physical, "model": _cpu_model()},
        "mem": {"totalGB": round(tot, 1), "availGB": round(avail, 1)},
        "load1": round(load1, 2),
        "recommended": {
            "CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS": workflow,
            "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": subagents,
        },
        # Raw numbers so the UI can build a localized rationale (no prose here).
        "detail": {
            "logical": logical,
            "totalGB": round(tot, 1),
            "wfCpu": wf_cpu, "wfRam": wf_ram,
            "subCpu": sub_cpu, "subRam": int(tot // 1.5) if tot else 20,
        },
    }


# --------------------------------------------------------------------------- #
# settings.json
# --------------------------------------------------------------------------- #
def _project_roots() -> list[Path]:
    """Directories to scan for projects (any dir with a .claude dir or a git
    repo). Override with CLAUDE_CONTROL_PROJECT_ROOTS — an os.pathsep-separated
    list of absolute paths. Default: common dev-folder names under $HOME that
    actually exist, falling back to $HOME itself."""
    raw = os.environ.get("CLAUDE_CONTROL_PROJECT_ROOTS", "").strip()
    if raw:
        roots = [Path(p).expanduser() for p in raw.split(os.pathsep) if p.strip()]
        return [p for p in roots if p.is_dir()] or [HOME]
    candidates = [
        HOME / "Desktop", HOME / "Documents", HOME / "Projects", HOME / "projects",
        HOME / "Development", HOME / "dev", HOME / "Code", HOME / "code",
        HOME / "src", HOME / "git", HOME / "repos", HOME / "workspace",
        HOME / "PycharmProjects", HOME / "IdeaProjects",
    ]
    found = [p for p in candidates if p.is_dir()]
    return found or [HOME]


_SCOPE_ROOTS = _project_roots()
# Longest path first so _short() strips the most specific matching root.
_SCOPE_BASES = [str(p) + "/" for p in sorted(_SCOPE_ROOTS, key=lambda p: -len(str(p)))] + [str(HOME) + "/"]


def _short(projdir: Path) -> str:
    s = str(projdir)
    for b in _SCOPE_BASES:
        if s.startswith(b):
            return s[len(b):]
    return projdir.name


def _discover_claude_dirs() -> set[Path]:
    out: set[Path] = set()
    for root in _SCOPE_ROOTS:
        if not root.exists():
            continue
        for depth in range(1, 5):
            for d in root.glob("/".join(["*"] * depth) + "/.claude"):
                if d.is_dir() and d.resolve() != CLAUDE_DIR.resolve():
                    out.add(d)
    return out


def _discover_project_dirs() -> set[Path]:
    """Any project = a dir with a .claude dir OR a git repo, under the roots."""
    projs: set[Path] = {d.parent for d in _discover_claude_dirs()}
    for root in _SCOPE_ROOTS:
        if not root.exists():
            continue
        for depth in range(1, 4):
            for g in root.glob("/".join(["*"] * depth) + "/.git"):
                if g.exists():
                    projs.add(g.parent)
    return projs


@app.get("/api/scopes")
def list_scopes():
    """Global user settings + every project .claude/settings(.local).json."""
    scopes = [{
        "id": str(SETTINGS), "path": str(SETTINGS), "label": "Global (user)",
        "kind": "user", "project": "", "exists": SETTINGS.exists(),
    }]
    rows = []
    for pd in _discover_project_dirs():
        d = pd / ".claude"
        proj = _short(pd)
        sj, sl = d / "settings.json", d / "settings.local.json"
        if sj.exists():
            rows.append({"id": str(sj), "path": str(sj), "label": f"{proj} · project",
                         "kind": "project", "project": proj, "exists": True})
        rows.append({"id": str(sl), "path": str(sl),
                     "label": f"{proj} · local" + ("" if sl.exists() else " (new)"),
                     "kind": "local", "project": proj, "exists": sl.exists()})
    rows.sort(key=lambda s: (s["project"].lower(), s["kind"]))
    return {"scopes": scopes + rows}


@app.get("/api/projects")
def list_projects():
    """Auto-detected projects (global + any .claude/git dir), with agent info."""
    out = [{
        "id": str(CLAUDE_DIR), "label": "Global (user)", "isGlobal": True,
        "projectDir": str(HOME), "claudeDir": str(CLAUDE_DIR), "agentDir": str(AGENTS_DIR),
        "hasClaude": True, "hasSettings": SETTINGS.exists(),
        "agentCount": len(list(AGENTS_DIR.glob("*.md"))) if AGENTS_DIR.exists() else 0,
    }]
    rows = []
    for pd in _discover_project_dirs():
        cd = pd / ".claude"
        ad = cd / "agents"
        sj, sl = cd / "settings.json", cd / "settings.local.json"
        rows.append({
            "id": str(cd), "label": _short(pd), "isGlobal": False,
            "projectDir": str(pd), "claudeDir": str(cd), "agentDir": str(ad),
            "hasClaude": cd.exists(), "hasSettings": sj.exists() or sl.exists(),
            "agentCount": len(list(ad.glob("*.md"))) if ad.exists() else 0,
        })
    rows.sort(key=lambda r: r["label"].lower())
    return {"projects": out + rows}


@app.get("/api/settings")
def get_settings(path: str | None = None):
    target = _settings_scope_ok(Path(path)) if path else SETTINGS
    if not target.exists():
        return {"data": {}, "raw": "{}\n", "path": str(target), "exists": False}
    text = target.read_text(encoding="utf-8")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"{target.name} is not valid JSON: {e}")
    return {"data": data, "raw": text, "path": str(target), "exists": True}


@app.put("/api/settings")
def put_settings(payload: dict = Body(...)):
    target = _settings_scope_ok(Path(payload["path"])) if payload.get("path") else SETTINGS
    if "raw" in payload and payload["raw"] is not None:
        try:
            data = json.loads(payload["raw"])
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"invalid JSON: {e}")
    else:
        data = payload.get("data")
    if not isinstance(data, dict):
        raise HTTPException(400, "settings must be a JSON object")
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    json.loads(text)  # paranoia round-trip
    target.parent.mkdir(parents=True, exist_ok=True)
    b = _backup(target)
    target.write_text(text, encoding="utf-8")
    return {"ok": True, "backup": b, "path": str(target)}


# --------------------------------------------------------------------------- #
# agents
# --------------------------------------------------------------------------- #
def _agents_dir_ok(p: Path) -> Path:
    """Allow the global agents dir, or any <project>/.claude/agents under HOME."""
    rp = p.resolve()
    if rp == AGENTS_DIR.resolve():
        return rp
    if HOME.resolve() not in rp.parents:
        raise HTTPException(400, "refused: agents dir outside your home directory")
    if rp.name != "agents" or rp.parent.name != ".claude":
        raise HTTPException(400, "refused: not a .claude/agents directory")
    return rp


@app.get("/api/agents")
def list_agents(dir: str | None = None):
    adir = _agents_dir_ok(Path(dir)) if dir else AGENTS_DIR
    src = "user" if adir.resolve() == AGENTS_DIR.resolve() else "project"
    if not adir.exists():
        return {"agents": [], "dir": str(adir)}
    agents = []
    for p in sorted(adir.glob("*.md")):
        a = _parse_agent(p)
        a["source"] = src
        agents.append(a)
    return {"agents": agents, "dir": str(adir)}


@app.put("/api/agents/{name}")
def save_agent(name: str, data: dict = Body(...)):
    if not NAME_RE.match(name):
        raise HTTPException(400, "invalid agent name (use a-z, 0-9, -, _)")
    adir = _agents_dir_ok(Path(data["dir"])) if data.get("dir") else AGENTS_DIR
    path = adir / f"{name}.md"
    adir.mkdir(parents=True, exist_ok=True)
    _backup(path)
    path.write_text(_render_agent(name, data), encoding="utf-8")
    return {"ok": True, "path": str(path), "agent": _parse_agent(path)}


@app.delete("/api/agents/{name}")
def delete_agent(name: str, dir: str | None = None):
    if not NAME_RE.match(name):
        raise HTTPException(400, "invalid agent name")
    adir = _agents_dir_ok(Path(dir)) if dir else AGENTS_DIR
    path = adir / f"{name}.md"
    if not path.exists():
        raise HTTPException(404, "agent not found")
    b = _backup(path)
    path.unlink()
    return {"ok": True, "backup": b}


# --------------------------------------------------------------------------- #
# memory
# --------------------------------------------------------------------------- #
@app.get("/api/memory")
def get_memory():
    groups = []
    if PROJECTS_DIR.exists():
        for md in sorted(PROJECTS_DIR.glob("*/memory/MEMORY.md")):
            mdir = md.parent
            entries = [
                _parse_memory_entry(f)
                for f in sorted(mdir.glob("*.md"))
                if f.name != "MEMORY.md"
            ]
            groups.append({
                "project": mdir.parent.name,
                "dir": str(mdir),
                "index": md.read_text(encoding="utf-8"),
                "indexPath": str(md),
                "entries": entries,
            })
    return {"groups": groups}


@app.put("/api/memory")
def put_memory(payload: dict = Body(...)):
    raw_path = payload.get("path")
    content = payload.get("content")
    if not raw_path or content is None:
        raise HTTPException(400, "path and content required")
    path = _jail(Path(raw_path))
    if "memory" not in path.parts or not str(path).endswith(".md"):
        raise HTTPException(400, "refused: not a memory .md file")
    _backup(path)
    path.write_text(content, encoding="utf-8")
    return {"ok": True, "path": str(path)}


# --------------------------------------------------------------------------- #
# backups
# --------------------------------------------------------------------------- #
@app.get("/api/backups")
def list_backups():
    if not BACKUP_DIR.exists():
        return {"backups": []}
    items = []
    for p in sorted(BACKUP_DIR.glob("*.bak"), reverse=True):
        st = p.stat()
        items.append({
            "name": p.name,
            "path": str(p),
            "size": st.st_size,
            "mtime": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        })
    return {"backups": items[:200]}


# --------------------------------------------------------------------------- #
# sessions
# --------------------------------------------------------------------------- #
def _running_claude() -> list[dict]:
    procs: list[dict] = []
    try:
        out = subprocess.run(
            ["ps", "-eo", "pid=,etimes=,args="],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception:
        return procs
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        pid, etimes, args = parts
        low = args.lower()
        if "claude" not in low:
            continue
        if any(x in low for x in ("claude-control", "uvicorn", "app:app", "/api/", "ps -eo", "grep ")):
            continue
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except Exception:
            cwd = ""
        if not cwd or cwd.startswith(("/proc", "/dev", "/sys")):
            continue  # helper/child process, not a real session working dir
        procs.append({
            "pid": int(pid) if pid.isdigit() else pid,
            "uptimeSec": int(etimes) if etimes.isdigit() else 0,
            "cwd": cwd,
            "encoded": cwd.replace("/", "-"),
        })
    # collapse a session's child processes: one entry per working directory
    by_cwd: dict[str, dict] = {}
    for p in procs:
        cur = by_cwd.get(p["cwd"])
        if cur is None or p["uptimeSec"] > cur["uptimeSec"]:
            by_cwd[p["cwd"]] = p
    return sorted(by_cwd.values(), key=lambda p: -p["uptimeSec"])


def _decode_cwd(name: str) -> str:
    # project dirs encode cwd with '/'->'-' (lossy for real dashes); display-only
    return ("/" + name[1:].replace("-", "/")) if name.startswith("-") else name.replace("-", "/")


def _session_title(path: Path) -> str:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            for _ in range(60):
                line = f.readline()
                if not line:
                    break
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                msg = obj.get("message") or {}
                if obj.get("type") == "user" or msg.get("role") == "user":
                    content = msg.get("content")
                    text = ""
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, list):
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                text = c.get("text", ""); break
                            if isinstance(c, str):
                                text = c; break
                    text = (text or "").strip()
                    if text and not text.startswith("<") and "caveat" not in text.lower()[:30]:
                        return text[:100]
    except Exception:
        pass
    return "(no prompt captured)"


def _count_lines(path: Path, max_bytes: int = 25 * 1024 * 1024) -> int:
    try:
        if path.stat().st_size > max_bytes:
            return -1
        n = 0
        with path.open("rb") as f:
            while True:
                b = f.read(1 << 16)
                if not b:
                    break
                n += b.count(b"\n")
        return n
    except Exception:
        return 0


@app.get("/api/sessions")
def get_sessions(limit: int = 20, offset: int = 0):
    now = datetime.now().timestamp()
    running = _running_claude()
    live_dirs = {p["encoded"] for p in running if p["encoded"]}
    files = []
    if PROJECTS_DIR.exists():
        for jf in PROJECTS_DIR.glob("*/*.jsonl"):
            try:
                st = jf.stat()
            except Exception:
                continue
            files.append((st.st_mtime, st.st_size, jf))
    files.sort(key=lambda x: x[0], reverse=True)
    # newest live file per running-cwd (cheap: just stat/sort above)
    newest_live: dict[str, Path] = {}
    for mt, sz, jf in files:
        d = jf.parent.name
        if d in live_dirs and d not in newest_live:
            newest_live[d] = jf
    offset = max(0, offset)
    window = files[offset: offset + max(1, limit)]
    sessions = []
    for mt, sz, jf in window:  # heavy parsing (title/line-count) only for this page
        d = jf.parent.name
        sessions.append({
            "id": jf.stem,
            "projectDir": d,
            "project": _decode_cwd(d),
            "path": str(jf),
            "mtime": datetime.fromtimestamp(mt).isoformat(timespec="seconds"),
            "ageSec": int(now - mt),
            "size": sz,
            "events": _count_lines(jf),
            "title": _session_title(jf),
            "working": (now - mt) < 120,
            "live": d in live_dirs and newest_live.get(d) == jf,
        })
    working_total = sum(1 for mt, sz, jf in files if (now - mt) < 120)
    return {
        "sessions": sessions, "running": running,
        "total": len(files), "offset": offset, "limit": limit,
        "workingTotal": working_total,
    }


# --------------------------------------------------------------------------- #
# activity — "who is working now", live per-session, with a stop control
# --------------------------------------------------------------------------- #
_TOOL_PHASE = {
    "Edit": "Implementing", "Write": "Implementing", "NotebookEdit": "Implementing",
    "MultiEdit": "Implementing",
    "Bash": "Running / testing",
    "Read": "Exploring", "Grep": "Exploring", "Glob": "Exploring", "LS": "Exploring",
    "WebFetch": "Researching", "WebSearch": "Researching",
    "Task": "Delegating", "Agent": "Delegating",
}


def _content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                return c.get("text", "")
            if isinstance(c, str):
                return c
    return ""


def _tail_lines(path: Path, max_bytes: int = 256 * 1024) -> list[str]:
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            if size > max_bytes:
                f.seek(size - max_bytes)
                f.readline()  # drop the partial first line
            data = f.read()
        return data.decode("utf-8", "ignore").splitlines()
    except Exception:
        return []


def _session_activity(path: Path) -> dict:
    """Extract the live picture from the tail of a session transcript."""
    last_user = ""
    last_text = ""
    recent_tools: list[str] = []
    model = ""
    tin = tout = 0
    for ln in _tail_lines(path):
        try:
            obj = json.loads(ln)
        except Exception:
            continue
        typ = obj.get("type")
        msg = obj.get("message") or {}
        role = msg.get("role")
        content = msg.get("content")
        if typ == "user" or role == "user":
            t = _content_text(content).strip()
            if t and not t.startswith("<") and "caveat" not in t.lower()[:30]:
                last_user = t[:240]
        elif typ == "assistant" or role == "assistant":
            if msg.get("model"):
                model = msg["model"]
            usage = msg.get("usage") or {}
            if usage:
                full_in = (usage.get("input_tokens", 0)
                           + usage.get("cache_read_input_tokens", 0)
                           + usage.get("cache_creation_input_tokens", 0))
                if full_in:
                    tin = full_in           # last turn's real context footprint
                tout += usage.get("output_tokens", 0)  # cumulative output over the tail
            if isinstance(content, list):
                for c in content:
                    if not isinstance(c, dict):
                        continue
                    if c.get("type") == "tool_use":
                        recent_tools.append(c.get("name", ""))
                    elif c.get("type") == "text" and c.get("text", "").strip():
                        last_text = c["text"].strip()[:240]
    recent_tools = [t for t in recent_tools if t][-14:]
    counts: dict[str, int] = {}
    for t in recent_tools[-6:]:
        p = _TOOL_PHASE.get(t)
        if p:
            counts[p] = counts.get(p, 0) + 1
    phase = max(counts, key=counts.get) if counts else "Thinking"
    return {
        "currentTask": last_user,
        "lastText": last_text,
        "lastTool": recent_tools[-1] if recent_tools else "",
        "recentTools": recent_tools,
        "phase": phase,
        "model": model,
        "tokensIn": tin,
        "tokensOut": tout,
    }


@app.get("/api/activity")
def get_activity():
    now = datetime.now().timestamp()
    running = _running_claude()
    by_dir = {p["encoded"]: p for p in running if p["encoded"]}
    newest: dict[str, tuple[float, Path]] = {}
    if PROJECTS_DIR.exists():
        for jf in PROJECTS_DIR.glob("*/*.jsonl"):
            d = jf.parent.name
            if d not in by_dir:
                continue
            try:
                mt = jf.stat().st_mtime
            except Exception:
                continue
            if d not in newest or mt > newest[d][0]:
                newest[d] = (mt, jf)
    workers = []
    for d, (mt, jf) in newest.items():
        proc = by_dir[d]
        act = _session_activity(jf)
        age = int(now - mt)
        status = "working" if age < 45 else ("idle" if age < 900 else "stale")
        phase = "Idle" if status != "working" else act["phase"]
        workers.append({
            "pid": proc["pid"],
            "cwd": proc["cwd"],
            "project": _decode_cwd(d),
            "uptimeSec": proc["uptimeSec"],
            "sessionId": jf.stem,
            "firstTask": _session_title(jf),
            "ageSec": age,
            "status": status,
            "phase": phase,
            "currentTask": act["currentTask"],
            "lastText": act["lastText"],
            "lastTool": act["lastTool"],
            "recentTools": act["recentTools"],
            "model": act["model"],
            "tokensIn": act["tokensIn"],
            "tokensOut": act["tokensOut"],
        })
    workers.sort(key=lambda w: w["ageSec"])
    return {"workers": workers, "count": len(workers),
            "now": datetime.now().isoformat(timespec="seconds")}


@app.post("/api/sessions/stop")
def stop_session(payload: dict = Body(...)):
    try:
        pid = int(payload.get("pid"))
    except Exception:
        raise HTTPException(400, "pid must be an integer")
    # Safety: only ever signal a PID that is a live Claude session right now.
    valid = {p["pid"] for p in _running_claude()}
    if pid not in valid:
        raise HTTPException(404, "no live Claude session with that pid (it may have already exited)")
    import signal
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return {"ok": True, "pid": pid, "note": "already exited"}
    except PermissionError:
        raise HTTPException(403, "not permitted to signal that process")
    except Exception as e:
        raise HTTPException(500, f"could not stop: {e}")
    return {"ok": True, "pid": pid, "signal": "SIGTERM"}


# --------------------------------------------------------------------------- #
# self-hosted sandboxes (Managed Agents) — local readiness + worker control
# --------------------------------------------------------------------------- #
_SANDBOX_LOG = CLAUDE_DIR / ".claude-control-sandbox-worker.log"


def _ant_version():
    """Version of the Anthropic `ant` CLI, or None. Rejects Apache Ant (same name)."""
    try:
        r = subprocess.run(["ant", "--version"], capture_output=True, text=True, timeout=5)
    except Exception:
        return None
    out = ((r.stdout or "") + (r.stderr or "")).strip()
    if "Apache Ant" in out:
        return None  # the Java build tool, not Anthropic's CLI
    if r.returncode == 0 and out:
        return out.splitlines()[0][:80]
    return None


def _sandbox_worker_pids():
    pids = []
    try:
        out = subprocess.run(["ps", "-eo", "pid=,args="], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return pids
    for line in out.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) < 2:
            continue
        pid, args = parts
        if "beta:worker" in args and ("ant" in args.split()[0] or "/ant " in args or args.strip().startswith("ant ")):
            if pid.isdigit():
                pids.append(int(pid))
    return pids


def _anthropic_get(path: str):
    """GET the Managed Agents API with the user's key. Never returns the key."""
    import urllib.request
    import urllib.error
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None, "no ANTHROPIC_API_KEY"
    req = urllib.request.Request(
        "https://api.anthropic.com" + path,
        headers={
            "x-api-key": key,
            "anthropic-version": "2026-10-21",
            "anthropic-beta": "managed-agents-2026-04-01",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")[:300]
        except Exception:
            body = ""
        return None, f"HTTP {e.code}: {body}"
    except Exception as e:
        return None, str(e)


@app.get("/api/sandbox/status")
def sandbox_status():
    import platform
    ant = _ant_version()
    worker_pids = _sandbox_worker_pids()
    system = platform.system()
    return {
        "antInstalled": ant is not None,
        "antVersion": ant,
        "apiKey": bool(os.environ.get("ANTHROPIC_API_KEY")),          # presence only
        "envId": os.environ.get("ANTHROPIC_ENVIRONMENT_ID", ""),      # an id, not a secret
        "envKey": bool(os.environ.get("ANTHROPIC_ENVIRONMENT_KEY")),  # presence only
        "workerRunning": len(worker_pids) > 0,
        "workerPids": worker_pids,
        "os": system,
        "defaultWorkdir": "/workspace" if system == "Linux" else os.path.expanduser("~/workspace"),
        "installCmd": "go install github.com/anthropics/anthropic-cli/v2/cmd/ant@latest",
        "installNote": "needs Go 1.26.10+; macOS: brew install anthropics/tap/ant. See the docs for the curl method.",
        "docsUrl": "https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes",
        "logPath": str(_SANDBOX_LOG),
    }


@app.get("/api/sandbox/stats")
def sandbox_stats():
    env_id = os.environ.get("ANTHROPIC_ENVIRONMENT_ID", "").strip()
    if not re.match(r"^env_[A-Za-z0-9_-]+$", env_id):
        return {"configured": False, "reason": "set ANTHROPIC_ENVIRONMENT_ID (env_…) to read health"}
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"configured": False, "reason": "set ANTHROPIC_API_KEY to read health"}
    data, err = _anthropic_get(f"/v1/environments/{env_id}/work/stats")
    if err:
        return {"configured": True, "ok": False, "error": err}
    return {"configured": True, "ok": True,
            "workersPolling": data.get("workers_polling", 0), "raw": data}


@app.post("/api/sandbox/worker/start")
def sandbox_worker_start(payload: dict = Body(...)):
    if not _ant_version():
        raise HTTPException(400, "the Anthropic `ant` CLI is not installed")
    workdir = (payload.get("workdir") or "/workspace").strip()
    if not re.match(r"^[A-Za-z0-9_./~ -]{1,256}$", workdir):
        raise HTTPException(400, "invalid workdir")
    workdir = os.path.expanduser(workdir)
    if _sandbox_worker_pids():
        return {"ok": True, "note": "a worker is already running", "pids": _sandbox_worker_pids()}
    if not os.environ.get("ANTHROPIC_ENVIRONMENT_KEY"):
        raise HTTPException(400, "ANTHROPIC_ENVIRONMENT_KEY is not set in the panel's environment — the worker needs it to authenticate")
    try:
        os.makedirs(workdir, exist_ok=True)
    except Exception as e:
        raise HTTPException(400, f"cannot create workdir {workdir}: {e}")
    try:
        lf = open(_SANDBOX_LOG, "ab")
        p = subprocess.Popen(
            ["ant", "beta:worker", "poll", "--workdir", workdir],
            stdout=lf, stderr=lf, stdin=subprocess.DEVNULL, start_new_session=True,
        )
    except FileNotFoundError:
        raise HTTPException(400, "the Anthropic `ant` CLI is not installed")
    except Exception as e:
        raise HTTPException(500, f"could not start worker: {e}")
    return {"ok": True, "pid": p.pid, "workdir": workdir, "log": str(_SANDBOX_LOG)}


@app.post("/api/sandbox/worker/stop")
def sandbox_worker_stop():
    pids = _sandbox_worker_pids()
    if not pids:
        return {"ok": True, "note": "no worker running"}
    import signal
    stopped = []
    for pid in pids:
        try:
            os.kill(int(pid), signal.SIGTERM)
            stopped.append(pid)
        except Exception:
            pass
    return {"ok": True, "stopped": stopped}


# --------------------------------------------------------------------------- #
# plugins: catalog + install + marketplace add
# --------------------------------------------------------------------------- #
@app.get("/api/plugins/catalog")
def plugins_catalog():
    settings = json.loads(SETTINGS.read_text(encoding="utf-8"))
    enabled = settings.get("enabledPlugins", {}) or {}
    markets = settings.get("extraKnownMarketplaces", {}) or {}
    out = []
    for mname, mval in markets.items():
        src = (mval or {}).get("source", {}) or {}
        entry = {"marketplace": mname, "sourceType": src.get("source", "?"),
                 "location": src.get("path") or src.get("repo") or "",
                 "plugins": [], "readable": False}
        if src.get("source") == "directory":
            mf = Path(src.get("path", "")) / ".claude-plugin" / "marketplace.json"
            if mf.exists():
                try:
                    data = json.loads(mf.read_text(encoding="utf-8"))
                    entry["readable"] = True
                    for p in data.get("plugins", []):
                        key = f"{p['name']}@{mname}"
                        entry["plugins"].append({
                            "name": p.get("name"),
                            "description": p.get("description", ""),
                            "key": key,
                            "enabled": bool(enabled.get(key, False)),
                        })
                except Exception:
                    pass
        out.append(entry)
    return {"catalog": out}


@app.post("/api/plugins/install")
def plugins_install(payload: dict = Body(...)):
    spec = (payload.get("spec") or "").strip()
    if not re.match(r"^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$", spec):
        raise HTTPException(400, "spec must look like name@marketplace")
    try:
        r = subprocess.run(
            ["claude", "plugin", "install", spec],
            capture_output=True, text=True, timeout=180,
        )
    except Exception as e:
        raise HTTPException(500, f"could not run install: {e}")
    return {"ok": r.returncode == 0, "code": r.returncode,
            "stdout": (r.stdout or "")[-4000:], "stderr": (r.stderr or "")[-4000:]}


@app.post("/api/marketplaces/add")
def marketplace_add(payload: dict = Body(...)):
    source = (payload.get("source") or "").strip()
    if not source or len(source) > 400:
        raise HTTPException(400, "source required")
    try:
        r = subprocess.run(
            ["claude", "plugin", "marketplace", "add", source],
            capture_output=True, text=True, timeout=180,
        )
    except Exception as e:
        raise HTTPException(500, f"could not run: {e}")
    return {"ok": r.returncode == 0, "code": r.returncode,
            "stdout": (r.stdout or "")[-4000:], "stderr": (r.stderr or "")[-4000:]}


@app.post("/api/plugins/uninstall")
def plugins_uninstall(payload: dict = Body(...)):
    spec = (payload.get("spec") or "").strip()
    if not re.match(r"^[A-Za-z0-9._-]+(@[A-Za-z0-9._-]+)?$", spec):
        raise HTTPException(400, "invalid plugin spec")
    try:
        r = subprocess.run(
            ["claude", "plugin", "uninstall", spec, "-y"],
            capture_output=True, text=True, timeout=180,
        )
    except Exception as e:
        raise HTTPException(500, f"could not run uninstall: {e}")
    return {"ok": r.returncode == 0, "code": r.returncode,
            "stdout": (r.stdout or "")[-4000:], "stderr": (r.stderr or "")[-4000:]}


@app.post("/api/marketplaces/remove")
def marketplace_remove(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    if not re.match(r"^[A-Za-z0-9._-]+$", name):
        raise HTTPException(400, "invalid marketplace name")
    try:
        r = subprocess.run(
            ["claude", "plugin", "marketplace", "remove", name],
            capture_output=True, text=True, timeout=180,
        )
    except Exception as e:
        raise HTTPException(500, f"could not run: {e}")
    return {"ok": r.returncode == 0, "code": r.returncode,
            "stdout": (r.stdout or "")[-4000:], "stderr": (r.stderr or "")[-4000:]}


# --------------------------------------------------------------------------- #
# hooks — AI example generator
# --------------------------------------------------------------------------- #
_HOOK_EVENTS = (
    "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest",
    "PreCompact", "PostCompact", "Stop", "Notification",
    "SessionStart", "UserPromptSubmit",
)

_HOOK_PROMPT = (
    "You generate ONE Claude Code hooks configuration fragment and nothing else.\n"
    "Output ONLY a compact JSON object — no prose, no explanation, no markdown fences.\n"
    "Top-level keys must be hook event names from: " + ", ".join(_HOOK_EVENTS) + ".\n"
    "Each value is an array of groups: {\"matcher\": \"Tool|Tool\", "
    "\"hooks\": [{\"type\": \"command\", \"command\": \"<shell one-liner>\"}]}.\n"
    "Omit \"matcher\" for events that have none (Stop, SessionStart, UserPromptSubmit, "
    "Pre/PostCompact, Notification). The command receives the hook event JSON on stdin — "
    "use `jq -r` to read fields like .tool_input.file_path or .tool_input.command.\n"
    "The command MUST be safe and non-destructive: never delete, overwrite, push, or send "
    "data anywhere; prefer read-only logging, formatting, notifications, or a deny decision. "
    "End risky pipelines with `|| true` so a failure never blocks the tool.\n"
    "Request: "
)


def _extract_json_object(text: str):
    """Pull the first balanced {...} JSON object out of model output."""
    t = (text or "").strip()
    if t.startswith("```"):
        parts = t.split("```")
        if len(parts) >= 2:
            t = parts[1]
            if t.lstrip().lower().startswith("json"):
                t = t.lstrip()[4:]
    i, j = t.find("{"), t.rfind("}")
    if i == -1 or j == -1 or j < i:
        return None
    try:
        obj = json.loads(t[i:j + 1])
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    # keep only recognised event keys so junk never reaches the draft
    clean = {k: v for k, v in obj.items() if k in _HOOK_EVENTS and isinstance(v, list)}
    return clean or None


def _classify_claude_error(stderr: str, stdout: str):
    """Map a failed `claude` run to a (reason, message) the UI can act on."""
    blob = ((stderr or "") + "\n" + (stdout or "")).lower()
    auth = (
        "not logged in", "logged out", "log in", "login", "sign in", "signed in",
        "unauthorized", "401", "invalid api key", "api key", "credential",
        "authenticate", "authentication", "setup-token", "oauth",
        "token has expired", "session has expired", "please run claude",
    )
    limit = (
        "usage limit", "rate limit", "rate-limit", "quota", "credit balance",
        "too many requests", "429", "overloaded", "insufficient", "billing",
    )
    if any(m in blob for m in auth):
        return ("not_authenticated",
                "The claude CLI is not signed in on this device. Run `claude auth login` "
                "in a terminal (or `claude setup-token` for unattended use), then try again.")
    if any(m in blob for m in limit):
        return ("usage_limit",
                "Claude is unavailable right now (usage or rate limit). Try again later.")
    return ("error", "The claude CLI returned an error — see the details below.")


@app.post("/api/hooks/generate")
def hooks_generate(payload: dict = Body(...)):
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(400, "prompt required")
    if len(prompt) > 800:
        raise HTTPException(400, "prompt too long (max 800 chars)")
    model = (payload.get("model") or "haiku").strip()
    if not re.match(r"^[A-Za-z0-9._-]+$", model):
        raise HTTPException(400, "invalid model")

    def fail(reason, message, raw="", stderr=""):
        # 200 with ok=False so the UI can show a precise, actionable reason
        return {"ok": False, "reason": reason, "message": message,
                "hooks": None, "code": None, "raw": raw, "stderr": stderr}

    try:
        r = subprocess.run(
            ["claude", "-p", _HOOK_PROMPT + prompt, "--model", model],
            capture_output=True, text=True, timeout=120,
        )
    except FileNotFoundError:
        return fail("not_installed",
                    "The `claude` CLI isn’t installed on this machine. Install Claude Code, "
                    "or use the ready-made examples above.")
    except subprocess.TimeoutExpired:
        return fail("timeout",
                    "Generation timed out after 120s. Try again, or simplify the request.")
    except Exception as e:
        return fail("error", f"Could not run the claude CLI: {e}")

    raw = (r.stdout or "").strip()[-4000:]
    stderr = (r.stderr or "")[-2000:]
    obj = _extract_json_object(r.stdout or "")
    if obj is not None:
        return {"ok": True, "reason": "ok", "message": "", "hooks": obj,
                "code": r.returncode, "raw": raw, "stderr": stderr}
    if r.returncode == 0:
        return fail("parse_failed",
                    "claude ran but didn’t return a usable hook. See the raw output below, "
                    "or rephrase your request.", raw, stderr)
    reason, message = _classify_claude_error(r.stderr or "", r.stdout or "")
    return fail(reason, message, raw, stderr)


# --------------------------------------------------------------------------- #
# skills
# --------------------------------------------------------------------------- #
SKILLS_DIR = CLAUDE_DIR / "skills"


def _parse_skill(md: Path) -> dict:
    fm, _ = _parse_frontmatter(md.read_text(encoding="utf-8", errors="ignore"))
    d = md.parent
    synced = "synced" in d.parts
    return {
        "name": fm.get("name", d.name),
        "description": fm.get("description", ""),
        "dir": str(d),
        "path": str(md),
        "source": "synced" if synced else "user",
    }


@app.get("/api/skills")
def list_skills():
    skills = []
    if SKILLS_DIR.exists():
        seen = set()
        for pat in ("SKILL.md", "skill.md"):
            for md in SKILLS_DIR.rglob(pat):
                if str(md) in seen:
                    continue
                seen.add(str(md))
                try:
                    skills.append(_parse_skill(md))
                except Exception:
                    continue
    skills.sort(key=lambda s: (s["source"], s["name"].lower()))
    return {"skills": skills, "dir": str(SKILLS_DIR)}


@app.post("/api/skills/delete")
def delete_skill(payload: dict = Body(...)):
    d = _jail(Path(payload.get("dir") or ""))
    if SKILLS_DIR.resolve() not in d.parents:
        raise HTTPException(400, "not inside the skills directory")
    if "synced" in d.parts:
        raise HTTPException(400, "refused: synced skills are managed by sync settings")
    if not d.is_dir():
        raise HTTPException(404, "skill directory not found")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = BACKUP_DIR / f"skill-{d.name}-{ts}"
    shutil.copytree(d, dest)
    shutil.rmtree(d)
    return {"ok": True, "backup": str(dest)}


# --------------------------------------------------------------------------- #
# memory: delete (edit is PUT /api/memory above)
# --------------------------------------------------------------------------- #
@app.post("/api/memory/delete")
def delete_memory(payload: dict = Body(...)):
    path = _jail(Path(payload.get("path") or ""))
    if "memory" not in path.parts or not str(path).endswith(".md") or path.name == "MEMORY.md":
        raise HTTPException(400, "refused: not a deletable memory entry")
    if not path.exists():
        raise HTTPException(404, "entry not found")
    b = _backup(path)
    fname = path.name
    path.unlink()
    idx = path.parent / "MEMORY.md"
    if idx.exists():
        _backup(idx)
        lines = idx.read_text(encoding="utf-8").splitlines()
        kept = [ln for ln in lines if f"({fname})" not in ln]
        idx.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    return {"ok": True, "backup": b}


# --------------------------------------------------------------------------- #
# static (production): serve the built SPA if present. Mounted LAST so the
# /api routes above always win.
# --------------------------------------------------------------------------- #
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="spa")
