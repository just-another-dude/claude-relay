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

    def __init__(self):
        self.tmux = TmuxSession()

    def ensure_session(self) -> bool:
        """Ensure Claude Code session is running"""
        if not self.tmux.exists():
            if not self.tmux.create():
                return False
            # Start Claude Code
            time.sleep(0.5)
            self.tmux.send_keys("claude")
            time.sleep(2)  # Wait for Claude to start
        return True

    def send_prompt(self, prompt: str) -> str:
        """Send prompt to Claude Code and get response"""
        if not self.ensure_session():
            return "❌ Failed to start Claude Code session"

        # Capture current state
        before = self.tmux.capture_pane(50)

        # Send the prompt
        # Escape special characters for tmux
        safe_prompt = prompt.replace('"', '\\"').replace("'", "\\'")
        self.tmux.send_keys(safe_prompt)

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
            result = subprocess.run(
                [
                    "python3",
                    str(transcriber_script),
                    str(audio_file),
                    "--engine",
                    self.engine,
                    "--output-format",
                    "txt",
                ],
                capture_output=True,
                text=True,
                timeout=120,  # 2 minute timeout for transcription
                cwd=str(self.transcriber_path),
            )

            if result.returncode != 0:
                error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                return f"❌ Transcription failed: {error_msg}"

            # The transcriber outputs to a .txt file, read it
            output_file = audio_file.with_suffix(".txt")
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
                response = bridge.send_prompt(prompt)

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
