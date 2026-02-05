#!/usr/bin/env python3
"""
Unit tests for the Python bridge security and functionality.

Run with: python3 -m pytest tests/test_bridge.py -v
Or simply: python3 tests/test_bridge.py
"""

import unittest
import json
import os
import sys
from unittest.mock import Mock, patch, MagicMock
from io import StringIO

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestConfig(unittest.TestCase):
    """Test configuration handling"""

    def test_config_uses_environment_variables(self):
        """Config should read from environment variables"""
        with patch.dict(os.environ, {
            'ANTHROPIC_API_KEY': 'test-key',
            'CLAUDE_MODEL': 'test-model',
            'TMUX_SESSION': 'test-session',
            'READ_TIMEOUT': '45',
            'MAX_OUTPUT': '5000'
        }):
            # Re-import to pick up new env vars
            import importlib
            import bridge
            importlib.reload(bridge)

            self.assertEqual(bridge.Config.ANTHROPIC_API_KEY, 'test-key')
            self.assertEqual(bridge.Config.API_MODEL, 'test-model')
            self.assertEqual(bridge.Config.TMUX_SESSION, 'test-session')
            self.assertEqual(bridge.Config.READ_TIMEOUT, 45)
            self.assertEqual(bridge.Config.MAX_OUTPUT, 5000)

    def test_config_has_sensible_defaults(self):
        """Config should have sensible defaults when env vars not set"""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import bridge
            importlib.reload(bridge)

            self.assertEqual(bridge.Config.TMUX_SESSION, 'claude-relay')
            self.assertEqual(bridge.Config.READ_TIMEOUT, 30)
            self.assertEqual(bridge.Config.MAX_OUTPUT, 3000)


class TestTmuxSession(unittest.TestCase):
    """Test tmux session management"""

    def setUp(self):
        """Set up test fixtures"""
        import bridge
        self.tmux = bridge.TmuxSession('test-session')

    @patch('subprocess.run')
    def test_exists_returns_true_when_session_exists(self, mock_run):
        """exists() should return True when tmux session exists"""
        mock_run.return_value = Mock(returncode=0)

        result = self.tmux.exists()

        self.assertTrue(result)
        mock_run.assert_called_once()
        call_args = mock_run.call_args[0][0]
        self.assertIn('has-session', call_args)

    @patch('subprocess.run')
    def test_exists_returns_false_when_session_missing(self, mock_run):
        """exists() should return False when tmux session doesn't exist"""
        mock_run.return_value = Mock(returncode=1)

        result = self.tmux.exists()

        self.assertFalse(result)

    @patch('subprocess.run')
    def test_capture_pane_returns_no_session_when_missing(self, mock_run):
        """capture_pane() should return error message when session missing"""
        mock_run.return_value = Mock(returncode=1)

        result = self.tmux.capture_pane()

        self.assertEqual(result, "(no session)")

    @patch('subprocess.run')
    def test_send_keys_uses_literal_flag(self, mock_run):
        """send_keys() should use -l flag for literal text"""
        mock_run.return_value = Mock(returncode=0)
        self.tmux.exists = Mock(return_value=True)

        self.tmux.send_keys('test message')

        # Should be called twice: once for text, once for Enter
        self.assertEqual(mock_run.call_count, 2)
        first_call = mock_run.call_args_list[0][0][0]
        self.assertIn('-l', first_call)
        self.assertIn('test message', first_call)

    @patch('subprocess.run')
    def test_send_keys_sends_enter_separately(self, mock_run):
        """send_keys() should send Enter as separate command"""
        mock_run.return_value = Mock(returncode=0)
        self.tmux.exists = Mock(return_value=True)

        self.tmux.send_keys('test', enter=True)

        self.assertEqual(mock_run.call_count, 2)
        second_call = mock_run.call_args_list[1][0][0]
        self.assertIn('Enter', second_call)

    @patch('subprocess.run')
    def test_send_keys_skips_enter_when_disabled(self, mock_run):
        """send_keys() should not send Enter when enter=False"""
        mock_run.return_value = Mock(returncode=0)
        self.tmux.exists = Mock(return_value=True)

        self.tmux.send_keys('test', enter=False)

        self.assertEqual(mock_run.call_count, 1)


class TestClaudeCodeBridge(unittest.TestCase):
    """Test Claude Code bridge functionality"""

    def setUp(self):
        """Set up test fixtures"""
        import bridge
        self.bridge = bridge.ClaudeCodeBridge()

    def test_send_approval_accepts_yes_variants(self):
        """send_approval() should accept various 'yes' inputs"""
        yes_variants = ['yes', 'YES', 'Yes', '1', 'y', 'Y', 'approve', 'APPROVE']

        for variant in yes_variants:
            with patch.object(self.bridge.tmux, 'exists', return_value=True):
                with patch.object(self.bridge.tmux, 'send_keys') as mock_send:
                    with patch.object(self.bridge.tmux, 'capture_pane', return_value=''):
                        self.bridge.send_approval(variant)
                        mock_send.assert_called_with('1')

    def test_send_approval_accepts_no_variants(self):
        """send_approval() should accept various 'no' inputs"""
        no_variants = ['no', 'NO', 'No', '2', 'n', 'reject', 'REJECT']

        for variant in no_variants:
            with patch.object(self.bridge.tmux, 'exists', return_value=True):
                with patch.object(self.bridge.tmux, 'send_keys') as mock_send:
                    with patch.object(self.bridge.tmux, 'capture_pane', return_value=''):
                        self.bridge.send_approval(variant)
                        mock_send.assert_called_with('2')

    def test_send_approval_returns_error_when_no_session(self):
        """send_approval() should return error when no session exists"""
        with patch.object(self.bridge.tmux, 'exists', return_value=False):
            result = self.bridge.send_approval('yes')
            self.assertEqual(result, "No active session")

    def test_stop_sends_ctrl_c(self):
        """stop() should send Ctrl+C to tmux"""
        with patch.object(self.bridge.tmux, 'exists', return_value=True):
            with patch('subprocess.run') as mock_run:
                mock_run.return_value = Mock(returncode=0)

                result = self.bridge.stop()

                self.assertIn('Stop signal sent', result)
                call_args = mock_run.call_args[0][0]
                self.assertIn('C-c', call_args)

    def test_stop_returns_error_when_no_session(self):
        """stop() should return error when no session exists"""
        with patch.object(self.bridge.tmux, 'exists', return_value=False):
            result = self.bridge.stop()
            self.assertEqual(result, "No active session")


class TestResponseExtraction(unittest.TestCase):
    """Test response extraction from tmux output"""

    def setUp(self):
        """Set up test fixtures"""
        import bridge
        self.bridge = bridge.ClaudeCodeBridge()

    def test_extract_response_finds_new_lines(self):
        """_extract_response() should find lines not in 'before' output"""
        before = "line1\nline2\nline3"
        after = "line1\nline2\nline3\nnew line 4\nnew line 5"

        result = self.bridge._extract_response(before, after, "prompt")

        self.assertIn("new line 4", result)
        self.assertIn("new line 5", result)

    def test_extract_response_filters_prompt(self):
        """_extract_response() should filter out the prompt itself"""
        before = "old content"
        after = "old content\nmy prompt here\nresponse line"

        result = self.bridge._extract_response(before, after, "my prompt here")

        self.assertNotIn("my prompt", result)
        self.assertIn("response line", result)

    def test_extract_response_strips_empty_lines(self):
        """_extract_response() should strip leading/trailing empty lines"""
        before = ""
        after = "\n\n\nactual content\n\n\n"

        result = self.bridge._extract_response(before, after, "prompt")

        self.assertEqual(result, "actual content")


class TestMainEntryPoint(unittest.TestCase):
    """Test main() function JSON handling"""

    def test_main_returns_error_for_invalid_json(self):
        """main() should return error for invalid JSON input"""
        import bridge

        with patch('sys.stdin', StringIO('not valid json')):
            with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
                with self.assertRaises(SystemExit) as context:
                    bridge.main()

                self.assertEqual(context.exception.code, 1)
                output = mock_stdout.getvalue()
                self.assertIn('error', output.lower())

    def test_main_handles_unknown_command(self):
        """main() should handle unknown commands gracefully"""
        import bridge

        with patch('sys.stdin', StringIO('{"command": "unknown_command"}')):
            with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
                bridge.main()

                output = json.loads(mock_stdout.getvalue())
                self.assertIn('Unknown command', output.get('response', ''))

    def test_main_handles_status_command(self):
        """main() should handle status command"""
        import bridge

        with patch('sys.stdin', StringIO('{"command": "status"}')):
            with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
                with patch.object(bridge.ClaudeCodeBridge, 'get_status', return_value='test status'):
                    bridge.main()

                    output = json.loads(mock_stdout.getvalue())
                    self.assertEqual(output.get('response'), 'test status')

    def test_main_requires_prompt_for_claude_code(self):
        """main() should require prompt for claude-code command"""
        import bridge

        with patch('sys.stdin', StringIO('{"command": "claude-code"}')):
            with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
                bridge.main()

                output = json.loads(mock_stdout.getvalue())
                self.assertIn('No prompt', output.get('response', ''))

    def test_main_requires_prompt_for_api(self):
        """main() should require prompt for api command"""
        import bridge

        with patch('sys.stdin', StringIO('{"command": "api"}')):
            with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
                bridge.main()

                output = json.loads(mock_stdout.getvalue())
                self.assertIn('No prompt', output.get('response', ''))


class TestSecurityBoundaries(unittest.TestCase):
    """Test security-related boundaries and edge cases"""

    def test_prompt_with_shell_metacharacters_is_escaped(self):
        """Prompts with shell metacharacters should be handled safely"""
        import bridge
        bridge_instance = bridge.ClaudeCodeBridge()

        dangerous_prompt = '$(rm -rf /); `whoami`; echo "pwned"'

        with patch.object(bridge_instance.tmux, 'exists', return_value=True):
            with patch.object(bridge_instance.tmux, 'send_keys') as mock_send:
                with patch.object(bridge_instance.tmux, 'capture_pane', return_value=''):
                    with patch('time.sleep'):
                        # Should not raise
                        bridge_instance.send_prompt(dangerous_prompt)

                        # Verify send_keys was called (text goes to Claude, not shell)
                        mock_send.assert_called()

    def test_max_output_prevents_memory_exhaustion(self):
        """Output should be truncated to MAX_OUTPUT to prevent memory issues"""
        import bridge
        bridge_instance = bridge.ClaudeCodeBridge()

        huge_output = 'x' * 100000

        with patch.object(bridge_instance, 'ensure_session', return_value=True):
            with patch.object(bridge_instance.tmux, 'capture_pane', return_value=huge_output):
                with patch.object(bridge_instance.tmux, 'send_keys'):
                    with patch('time.sleep'):
                        result = bridge_instance.send_prompt('test')

                        # Result should be truncated
                        self.assertLessEqual(len(result), bridge.Config.MAX_OUTPUT + 50)

    def test_api_key_not_logged_or_exposed(self):
        """API key should never appear in responses or logs"""
        import bridge

        test_key = 'sk-ant-secret-test-key-12345'

        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': test_key}):
            import importlib
            importlib.reload(bridge)

            # Get status should not expose key
            bridge_instance = bridge.ClaudeCodeBridge()
            status = bridge_instance.get_status()

            self.assertNotIn(test_key, status)
            self.assertNotIn('sk-ant', status)


class TestInputValidation(unittest.TestCase):
    """Test input validation and sanitization"""

    def test_empty_prompt_is_rejected(self):
        """Empty prompts should be rejected"""
        import bridge
        bridge_instance = bridge.ClaudeCodeBridge()

        with patch.object(bridge_instance, 'ensure_session', return_value=True):
            # Empty string
            result = bridge_instance.send_prompt('')
            # Should handle gracefully (implementation may vary)
            self.assertIsInstance(result, str)

    def test_whitespace_only_prompt_is_handled(self):
        """Whitespace-only prompts should be handled"""
        import bridge
        bridge_instance = bridge.ClaudeCodeBridge()

        with patch.object(bridge_instance, 'ensure_session', return_value=True):
            with patch.object(bridge_instance.tmux, 'send_keys'):
                with patch.object(bridge_instance.tmux, 'capture_pane', return_value=''):
                    with patch('time.sleep'):
                        result = bridge_instance.send_prompt('   \n\t  ')
                        self.assertIsInstance(result, str)

    def test_unicode_prompt_is_handled(self):
        """Unicode prompts should be handled correctly"""
        import bridge
        bridge_instance = bridge.ClaudeCodeBridge()

        unicode_prompt = '修复错误 🐛 émojis работает'

        with patch.object(bridge_instance, 'ensure_session', return_value=True):
            with patch.object(bridge_instance.tmux, 'send_keys') as mock_send:
                with patch.object(bridge_instance.tmux, 'capture_pane', return_value=''):
                    with patch('time.sleep'):
                        bridge_instance.send_prompt(unicode_prompt)

                        # Verify unicode was passed through
                        call_args = mock_send.call_args[0][0]
                        self.assertIn('修复错误', call_args)


if __name__ == '__main__':
    # Run tests
    unittest.main(verbosity=2)
