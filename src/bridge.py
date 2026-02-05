#!/usr/bin/env python3
"""
Claude Relay - Python Bridge
Handles Claude Code CLI and Anthropic API interactions
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

# Add parent dir to path for config
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import anthropic

    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


class Config:
    """Configuration from environment"""

    # Anthropic API key for direct API calls
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

    # Model for direct API calls
    API_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")

    # tmux session name for Claude Code
    TMUX_SESSION = os.environ.get("TMUX_SESSION", "claude-relay")

    # Working directory for Claude Code
    WORKSPACE = os.environ.get("CLAUDE_WORKSPACE", os.path.expanduser("~/claude-workspace"))

    # Timeout for reading tmux output
    READ_TIMEOUT = int(os.environ.get("READ_TIMEOUT", "30"))

    # Max output length
    MAX_OUTPUT = int(os.environ.get("MAX_OUTPUT", "3000"))

    # Path to audio transcriber
    TRANSCRIBER_PATH = os.environ.get(
        "TRANSCRIBER_PATH", os.path.expanduser("~/git/audio-transcriber")
    )

    # Transcription engine (whisper, google, vosk)
    TRANSCRIBER_ENGINE = os.environ.get("TRANSCRIBER_ENGINE", "google")

    # Supervisor mode - post-process Claude Code output through API
    SUPERVISOR_ENABLED = os.environ.get("SUPERVISOR_ENABLED", "").lower() in ("true", "1", "yes")
    SUPERVISOR_MODEL = os.environ.get("SUPERVISOR_MODEL", "claude-sonnet-4-20250514")


class TmuxSession:
    """Manage tmux session for Claude Code"""

    def __init__(self, session_name: str = Config.TMUX_SESSION):
        self.session = session_name
        self.pane = f"{session_name}:0.0"

    def exists(self) -> bool:
        """Check if session exists"""
        result = subprocess.run(["tmux", "has-session", "-t", self.session], capture_output=True)
        return result.returncode == 0

    def create(self, workspace: str = Config.WORKSPACE) -> bool:
        """Create new tmux session"""
        if self.exists():
            return True

        # Ensure workspace exists
        Path(workspace).mkdir(parents=True, exist_ok=True)

        # Create session
        result = subprocess.run(
            ["tmux", "new-session", "-d", "-s", self.session, "-c", workspace], capture_output=True
        )

        if result.returncode != 0:
            return False

        # Give it a moment
        time.sleep(0.5)
        return True

    @staticmethod
    def list_sessions() -> list[dict[str, str]]:
        """List all tmux sessions"""
        result = subprocess.run(
            ["tmux", "list-sessions", "-F", "#{session_name}:#{session_path}"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return []

        sessions = []
        for line in result.stdout.strip().split("\n"):
            if ":" in line:
                name, path = line.split(":", 1)
                sessions.append({"name": name, "path": path})
        return sessions

    @staticmethod
    def session_name_from_path(path: str) -> str:
        """Generate a valid tmux session name from a path"""
        # Use the last directory component, sanitized for tmux
        name = os.path.basename(path.rstrip("/"))
        # tmux doesn't like dots and colons in session names
        name = name.replace(".", "-").replace(":", "-")
        return f"cc-{name}" if name else "cc-default"

    def send_keys(self, keys: str, enter: bool = True) -> bool:
        """Send keys to tmux pane"""
        if not self.exists():
            self.create()

        # Send the text with -l flag (literal) to avoid interpretation
        cmd = ["tmux", "send-keys", "-t", self.pane, "-l", keys]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            return False

        # Send Enter as separate command
        if enter:
            result = subprocess.run(
                ["tmux", "send-keys", "-t", self.pane, "Enter"], capture_output=True
            )

        return result.returncode == 0

    def capture_pane(self, lines: int = 100) -> str:
        """Capture recent output from pane"""
        if not self.exists():
            return "(no session)"

        result = subprocess.run(
            ["tmux", "capture-pane", "-t", self.pane, "-p", "-S", f"-{lines}"],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return "(capture failed)"

        return result.stdout

    def get_status(self) -> dict[str, Any]:
        """Get session status"""
        if not self.exists():
            return {"running": False, "session": self.session, "message": "No active session"}

        # Check if Claude Code is running
        output = self.capture_pane(20)

        claude_running = any(
            x in output.lower()
            for x in ["claude", ">", "thinking", "working", "reading", "writing"]
        )

        # Check for pending approval
        needs_approval = any(
            x in output.lower()
            for x in ["[1]", "[2]", "approve", "reject", "y/n", "yes/no", "continue?"]
        )

        return {
            "running": True,
            "session": self.session,
            "claude_active": claude_running,
            "needs_input": needs_approval,
            "recent_output": output[-500:] if len(output) > 500 else output,
        }

    def kill(self) -> bool:
        """Kill the session"""
        if not self.exists():
            return True

        result = subprocess.run(["tmux", "kill-session", "-t", self.session], capture_output=True)
        return result.returncode == 0


class ClaudeCodeBridge:
    """Interface with Claude Code CLI"""

    # Track current active session (class-level for persistence across calls)
    _current_session_name: str = Config.TMUX_SESSION
    _current_workspace: str = Config.WORKSPACE

    def __init__(self, session_name: str | None = None, workspace: str | None = None):
        # Use provided session or fall back to class-level current session
        if session_name:
            self._current_session_name = session_name
            ClaudeCodeBridge._current_session_name = session_name
        if workspace:
            self._current_workspace = workspace
            ClaudeCodeBridge._current_workspace = workspace

        self.tmux = TmuxSession(self._current_session_name)

    def ensure_session(self, use_continue: bool = True) -> bool:
        """Ensure Claude Code session is running"""
        if not self.tmux.exists():
            if not self.tmux.create(self._current_workspace):
                return False
            # Start Claude Code with --continue to resume previous conversation
            time.sleep(0.5)
            if use_continue:
                self.tmux.send_keys("claude --continue")
            else:
                self.tmux.send_keys("claude")
            time.sleep(3)  # Wait for Claude to start
        return True

    @classmethod
    def get_current_session(cls) -> tuple[str, str]:
        """Get current session name and workspace"""
        return cls._current_session_name, cls._current_workspace

    @classmethod
    def set_current_session(cls, session_name: str, workspace: str):
        """Set current session name and workspace"""
        cls._current_session_name = session_name
        cls._current_workspace = workspace

    def send_prompt(self, prompt: str) -> str:
        """Send prompt to Claude Code and get response"""
        if not self.ensure_session():
            return "❌ Failed to start Claude Code session"

        # Capture current state
        before = self.tmux.capture_pane(50)

        # Send the prompt (tmux -l flag handles literal text safely)
        self.tmux.send_keys(prompt)

        # Wait for response
        time.sleep(2)

        # Poll for changes
        max_wait = Config.READ_TIMEOUT
        waited = 0
        last_output = ""
        stable_count = 0

        while waited < max_wait:
            time.sleep(1)
            waited += 1

            current = self.tmux.capture_pane(100)

            # Check if output changed
            if current == last_output:
                stable_count += 1
                # If stable for 3 seconds, probably done
                if stable_count >= 3:
                    break
            else:
                stable_count = 0
                last_output = current

            # Check for approval prompts - return immediately
            if any(x in current.lower() for x in ["[1]", "[2]", "y/n", "approve"]):
                break

        # Extract new content (after our prompt)
        after = self.tmux.capture_pane(100)

        # Try to extract just the response
        response = self._extract_response(before, after, prompt)

        if len(response) > Config.MAX_OUTPUT:
            response = response[: Config.MAX_OUTPUT] + "\n\n... (truncated)"

        return response if response.strip() else "(no visible response - check /status)"

    def _extract_response(self, before: str, after: str, prompt: str) -> str:
        """Extract the new response from tmux output"""
        # Simple approach: find content after the prompt
        lines_after = after.split("\n")
        lines_before = set(before.split("\n"))

        new_lines = [line for line in lines_after if line not in lines_before]

        # Filter out the prompt itself
        new_lines = [line for line in new_lines if prompt[:30] not in line]

        # Filter empty lines at start/end
        while new_lines and not new_lines[0].strip():
            new_lines.pop(0)
        while new_lines and not new_lines[-1].strip():
            new_lines.pop()

        return "\n".join(new_lines)

    def send_approval(self, value: str) -> str:
        """Send approval (1/yes or 2/no)"""
        if not self.tmux.exists():
            return "No active session"

        key = "1" if value.lower() in ["yes", "1", "y", "approve"] else "2"
        self.tmux.send_keys(key)

        time.sleep(1)
        output = self.tmux.capture_pane(30)
        return f"Sent: {key}\n\nRecent output:\n{output[-500:]}"

    def send_continue(self) -> str:
        """Send continue command"""
        if not self.tmux.exists():
            return "No active session"

        self.tmux.send_keys("continue")
        time.sleep(1)
        output = self.tmux.capture_pane(30)
        return f"Sent: continue\n\nRecent output:\n{output[-500:]}"

    def change_directory(self, path: str) -> str:
        """Switch to a project directory (creates or resumes session)"""
        # Expand user home directory
        expanded_path = os.path.expanduser(path)

        # If path exists as-is, use it
        if os.path.isdir(expanded_path):
            target_path = expanded_path
        else:
            # Search for the directory in common locations
            found_paths = self._find_directory(path)

            if not found_paths:
                return f"❌ Directory not found: {path}\n\nSearched in: ~, ~/git, ~/projects, ~/code, ~/work"
            elif len(found_paths) == 1:
                target_path = found_paths[0]
            else:
                # Multiple matches - show options
                matches = "\n".join([f"  • {p}" for p in found_paths[:10]])
                return (
                    f"📂 Multiple matches for '{path}':\n\n{matches}\n\nUse full path: /cd <path>"
                )

        # Generate session name for this project
        session_name = TmuxSession.session_name_from_path(target_path)

        # Update current session tracking
        ClaudeCodeBridge.set_current_session(session_name, target_path)
        self.tmux = TmuxSession(session_name)

        # Check if session already exists (persistent session)
        if self.tmux.exists():
            output = self.tmux.capture_pane(20)
            return f"📂 Switched to existing session: {session_name}\nPath: {target_path}\n\nRecent output:\n{output[-400:]}"

        # Create new session in target directory
        if not self.tmux.create(workspace=target_path):
            return f"❌ Failed to create session in {target_path}"

        # Start Claude Code with --continue to resume any previous conversation
        time.sleep(0.5)
        self.tmux.send_keys("claude --continue")
        time.sleep(3)  # Wait for Claude to start

        output = self.tmux.capture_pane(20)
        return f"📂 Started Claude Code in: {target_path}\n\nRecent output:\n{output[-400:]}"

    def _find_directory(self, name: str) -> list[str]:
        """Search for a directory by name in common locations"""
        search_roots = [
            os.path.expanduser("~"),
            os.path.expanduser("~/git"),
            os.path.expanduser("~/projects"),
            os.path.expanduser("~/code"),
            os.path.expanduser("~/work"),
            os.path.expanduser("~/repos"),
            os.path.expanduser("~/src"),
        ]

        found = []
        name_lower = name.lower()

        for root in search_roots:
            if not os.path.isdir(root):
                continue

            # Check direct children (one level deep for speed)
            try:
                for entry in os.listdir(root):
                    entry_path = os.path.join(root, entry)
                    if os.path.isdir(entry_path):
                        # Exact match (case-insensitive)
                        if entry.lower() == name_lower:
                            found.append(entry_path)
                        # Partial match
                        elif name_lower in entry.lower():
                            found.append(entry_path)
            except PermissionError:
                continue

        # Remove duplicates and sort by relevance (exact matches first)
        seen = set()
        unique = []
        # First add exact matches
        for p in found:
            if os.path.basename(p).lower() == name_lower and p not in seen:
                unique.append(p)
                seen.add(p)
        # Then add partial matches
        for p in found:
            if p not in seen:
                unique.append(p)
                seen.add(p)

        return unique

    def get_working_directory(self) -> str:
        """Get current session and directory info"""
        session_name, workspace = ClaudeCodeBridge.get_current_session()

        lines = [
            "📂 *Current Session*",
            f"Session: {session_name}",
            f"Workspace: {workspace}",
            f"Status: {'🟢 Running' if self.tmux.exists() else '⚪ Not started'}",
        ]

        if self.tmux.exists():
            output = self.tmux.capture_pane(20)
            lines.append(f"\nRecent output:\n{output[-400:]}")

        return "\n".join(lines)

    def list_sessions(self) -> str:
        """List all Claude Code sessions"""
        sessions = TmuxSession.list_sessions()

        # Filter to only cc-* sessions (Claude Code sessions)
        cc_sessions = [s for s in sessions if s["name"].startswith("cc-")]

        if not cc_sessions:
            return "📂 No active Claude Code sessions.\n\nUse /cd <project> to start one."

        current_session, _ = ClaudeCodeBridge.get_current_session()

        lines = ["📂 *Active Sessions*\n"]
        for s in cc_sessions:
            marker = "→ " if s["name"] == current_session else "  "
            lines.append(f"{marker}{s['name']}")

        lines.append(f"\nCurrent: {current_session}")
        lines.append("\nUse /cd <project> to switch sessions")

        return "\n".join(lines)

    def stop(self) -> str:
        """Send Ctrl+C to stop current operation"""
        if not self.tmux.exists():
            return "No active session"

        # Send Ctrl+C
        subprocess.run(["tmux", "send-keys", "-t", self.tmux.pane, "C-c"], capture_output=True)

        time.sleep(0.5)
        return "Stop signal sent (Ctrl+C)"

    def get_status(self) -> str:
        """Get formatted status"""
        status = self.tmux.get_status()

        lines = [
            f"Session: {status['session']}",
            f"Running: {'✅ Yes' if status['running'] else '❌ No'}",
        ]

        if status["running"]:
            lines.append(f"Claude active: {'✅' if status.get('claude_active') else '❓'}")
            lines.append(f"Needs input: {'⚠️ Yes' if status.get('needs_input') else 'No'}")
            lines.append(f"\n📺 Recent output:\n{status.get('recent_output', '')[-400:]}")

        return "\n".join(lines)


class AudioTranscriber:
    """Transcribe audio files using audio-transcriber"""

    def __init__(self):
        self.transcriber_path = Path(Config.TRANSCRIBER_PATH)
        self.engine = Config.TRANSCRIBER_ENGINE

    def is_available(self) -> bool:
        """Check if audio-transcriber is set up"""
        transcriber_script = self.transcriber_path / "transcribe.py"
        return transcriber_script.exists()

    def transcribe(self, audio_path: str) -> str:
        """Transcribe an audio file to text"""
        audio_file = Path(audio_path)
        if not audio_file.exists():
            return f"❌ Audio file not found: {audio_path}"

        # Choose script based on engine
        if self.engine in ("openai", "whisper-api"):
            transcriber_script = self.transcriber_path / "transcribe_openai.py"
        else:
            transcriber_script = self.transcriber_path / "transcribe.py"

        if not transcriber_script.exists():
            return (
                "❌ Voice transcription not configured.\n\n"
                "To enable, set up audio-transcriber:\n"
                "1. Clone: git clone https://github.com/just-another-dude/audio-transcriber\n"
                "2. Set TRANSCRIBER_PATH in .env\n\n"
                "Or send text messages instead."
            )

        try:
            # Use venv Python if available, otherwise system python3
            venv_python = self.transcriber_path / "venv" / "bin" / "python"
            python_cmd = str(venv_python) if venv_python.exists() else "python3"

            # Build command based on engine type
            output_file = audio_file.with_suffix(".txt")
            if self.engine in ("openai", "whisper-api"):
                cmd = [
                    python_cmd,
                    str(transcriber_script),
                    str(audio_file),
                    "--format",
                    "text",
                    "--output",
                    str(output_file),
                ]
            else:
                cmd = [
                    python_cmd,
                    str(transcriber_script),
                    str(audio_file),
                    "--engine",
                    self.engine,
                    "--output-format",
                    "txt",
                ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,  # 2 minute timeout for transcription
                cwd=str(self.transcriber_path),
            )

            if result.returncode != 0:
                error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                return f"❌ Transcription failed: {error_msg}"

            # Read transcription from output file
            if output_file.exists():
                text = output_file.read_text().strip()
                # Clean up the output file
                output_file.unlink()
                return text
            else:
                # Try to extract from stdout if file wasn't created
                if result.stdout.strip():
                    return result.stdout.strip()
                return "❌ Transcription produced no output"

        except subprocess.TimeoutExpired:
            return "❌ Transcription timed out"
        except Exception as e:
            return f"❌ Transcription error: {str(e)}"


class AnthropicAPI:
    """Direct Anthropic API calls"""

    def __init__(self):
        if not HAS_ANTHROPIC:
            raise ImportError("anthropic package not installed")
        if not Config.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)

    def ask(self, prompt: str) -> str:
        """Send a question to Claude API"""
        try:
            response = self.client.messages.create(
                model=Config.API_MODEL,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )

            return response.content[0].text

        except Exception as e:
            return f"❌ API Error: {str(e)}"


class Supervisor:
    """
    AI Supervisor (Opus) that orchestrates all actions.
    Receives user messages first and decides what to do.
    """

    TOOLS = [
        {
            "name": "send_to_claude_code",
            "description": "Send a prompt to Claude Code CLI for coding tasks, file operations, git commands, or any development work. Claude Code has full access to the filesystem and can execute commands.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The prompt to send to Claude Code",
                    }
                },
                "required": ["prompt"],
            },
        },
        {
            "name": "run_shell_command",
            "description": "Run a shell command directly on the system. Use for quick commands that don't need Claude Code's intelligence (ls, cat, git status, etc).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds (default 30)",
                        "default": 30,
                    },
                },
                "required": ["command"],
            },
        },
        {
            "name": "change_directory",
            "description": "Change the working directory for Claude Code. Use when user wants to work on a different project.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The directory path or project name to switch to",
                    }
                },
                "required": ["path"],
            },
        },
        {
            "name": "get_session_status",
            "description": "Get the current status of the Claude Code session, including working directory and recent output.",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "name": "send_approval",
            "description": "Send an approval (yes/no) to a pending Claude Code action.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "approved": {
                        "type": "boolean",
                        "description": "True to approve, False to reject",
                    }
                },
                "required": ["approved"],
            },
        },
        {
            "name": "stop_claude_code",
            "description": "Send Ctrl+C to stop the current Claude Code operation.",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
    ]

    SYSTEM_PROMPT = """You are an AI supervisor coordinating tasks on a developer's machine via WhatsApp.

You have access to:
1. Claude Code CLI - for coding, file editing, git operations, complex tasks
2. Direct shell commands - for quick operations
3. Session management - change directories, check status

Guidelines:
- For coding/development tasks: use send_to_claude_code
- For simple queries (file listing, git status): use run_shell_command
- For quick questions that don't need system access: just respond directly
- Always provide clean, mobile-friendly responses
- If Claude Code asks for approval, clearly present the options
- Keep responses concise - the user is on mobile

Current workspace info will be provided with each request."""

    def __init__(self):
        if not HAS_ANTHROPIC:
            raise ImportError("anthropic package not installed")
        if not Config.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.bridge = ClaudeCodeBridge()

    def _execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """Execute a tool and return the result"""
        try:
            if tool_name == "send_to_claude_code":
                return self.bridge.send_prompt(tool_input["prompt"])

            elif tool_name == "run_shell_command":
                # Shell command execution - intentional for supervisor to run user commands
                timeout = tool_input.get("timeout", 30)
                result = subprocess.run(  # noqa: S602
                    tool_input["command"],
                    shell=True,  # nosec B602
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=self.bridge._current_workspace,
                )
                output = result.stdout + result.stderr
                return output[: Config.MAX_OUTPUT] if output else "(no output)"

            elif tool_name == "change_directory":
                return self.bridge.change_directory(tool_input["path"])

            elif tool_name == "get_session_status":
                return self.bridge.get_status()

            elif tool_name == "send_approval":
                value = "yes" if tool_input["approved"] else "no"
                return self.bridge.send_approval(value)

            elif tool_name == "stop_claude_code":
                return self.bridge.stop()

            else:
                return f"Unknown tool: {tool_name}"

        except subprocess.TimeoutExpired:
            return "⚠️ Command timed out"
        except Exception as e:
            return f"❌ Tool error: {str(e)}"

    def process(self, user_message: str) -> str:
        """Process a user message and return a response"""
        try:
            # Add context about current state
            workspace = self.bridge._current_workspace
            session = self.bridge._current_session_name

            context = f"[Current workspace: {workspace}, Session: {session}]\n\nUser message: {user_message}"

            messages = [{"role": "user", "content": context}]

            # Initial API call
            response = self.client.messages.create(
                model=Config.SUPERVISOR_MODEL,
                max_tokens=4096,
                system=self.SYSTEM_PROMPT,
                tools=self.TOOLS,
                messages=messages,
            )

            # Handle tool use loop
            while response.stop_reason == "tool_use":
                # Extract tool calls and serialize content for messages
                tool_results = []
                assistant_content = []

                for block in response.content:
                    if block.type == "tool_use":
                        assistant_content.append(
                            {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
                        )
                        tool_result = self._execute_tool(block.name, block.input)
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": tool_result,
                            }
                        )
                    elif block.type == "text":
                        assistant_content.append({"type": "text", "text": block.text})

                # Continue conversation with tool results
                messages.append({"role": "assistant", "content": assistant_content})
                messages.append({"role": "user", "content": tool_results})

                response = self.client.messages.create(
                    model=Config.SUPERVISOR_MODEL,
                    max_tokens=4096,
                    system=self.SYSTEM_PROMPT,
                    tools=self.TOOLS,
                    messages=messages,
                )

            # Extract final text response
            for block in response.content:
                if hasattr(block, "text"):
                    return block.text

            return "No response generated"

        except Exception as e:
            return f"❌ Supervisor error: {str(e)}"


def main():
    """Main entry point - reads JSON from stdin, writes JSON to stdout"""

    # Read input
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        sys.exit(1)

    command = input_data.get("command", "")

    try:
        if command == "status":
            bridge = ClaudeCodeBridge()
            response = bridge.get_status()

        elif command == "claude-code":
            prompt = input_data.get("prompt", "")
            if not prompt:
                response = "No prompt provided"
            else:
                bridge = ClaudeCodeBridge()
                raw_response = bridge.send_prompt(prompt)

                # Supervisor mode: post-process through API for clean output
                if Config.SUPERVISOR_ENABLED and HAS_ANTHROPIC and Config.ANTHROPIC_API_KEY:
                    try:
                        api = AnthropicAPI()
                        response = api.summarize_claude_output(prompt, raw_response)
                    except Exception as e:
                        # Fall back to raw response if supervisor fails
                        response = f"⚠️ Supervisor error: {e}\n\n{raw_response}"
                else:
                    response = raw_response

        elif command == "api":
            prompt = input_data.get("prompt", "")
            if not prompt:
                response = "No prompt provided"
            elif not HAS_ANTHROPIC:
                response = "❌ anthropic package not installed. Run: pip install anthropic"
            elif not Config.ANTHROPIC_API_KEY:
                response = "❌ ANTHROPIC_API_KEY not set in .env"
            else:
                api = AnthropicAPI()
                response = api.ask(prompt)

        elif command == "supervisor":
            prompt = input_data.get("prompt", "")
            if not prompt:
                response = "No message provided"
            elif not HAS_ANTHROPIC:
                response = "❌ anthropic package not installed. Run: pip install anthropic"
            elif not Config.ANTHROPIC_API_KEY:
                response = "❌ ANTHROPIC_API_KEY not set in .env"
            else:
                supervisor = Supervisor()
                response = supervisor.process(prompt)

        elif command == "approve":
            value = input_data.get("value", "yes")
            bridge = ClaudeCodeBridge()
            response = bridge.send_approval(value)

        elif command == "continue":
            bridge = ClaudeCodeBridge()
            response = bridge.send_continue()

        elif command == "stop":
            bridge = ClaudeCodeBridge()
            response = bridge.stop()

        elif command == "cd":
            path = input_data.get("path", "")
            if not path:
                response = "No path provided. Usage: /cd <path>"
            else:
                bridge = ClaudeCodeBridge()
                response = bridge.change_directory(path)

        elif command == "pwd":
            bridge = ClaudeCodeBridge()
            response = bridge.get_working_directory()

        elif command == "sessions":
            bridge = ClaudeCodeBridge()
            response = bridge.list_sessions()

        elif command == "transcribe":
            audio_path = input_data.get("audio_path", "")
            if not audio_path:
                response = "No audio path provided"
            else:
                transcriber = AudioTranscriber()
                response = transcriber.transcribe(audio_path)

        else:
            response = f"Unknown command: {command}"

        print(json.dumps({"response": response}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
