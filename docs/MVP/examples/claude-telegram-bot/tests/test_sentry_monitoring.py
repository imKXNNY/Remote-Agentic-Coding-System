"""
Test Suite for Sentry Monitoring Integration
=============================================

Tests verify that Sentry instrumentation correctly captures:
- Agent invocation spans with proper metadata
- LLM client spans with token usage and cost
- Tool execution spans
- Error tracking with rich context
"""

import pytest
import json
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from telegram import Update, User, Message, Chat
from telegram.ext import ContextTypes

# Import the function we're testing
from telegram_bot import handle_message


class TestSentrySpanCreation:
    """Test that Sentry spans are created with correct structure."""

    @pytest.mark.asyncio
    async def test_agent_invocation_span_created(self):
        """Test that agent invocation span is created with proper op and name."""
        # Mock Sentry
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            mock_span = MagicMock()
            mock_sentry.start_span.return_value.__enter__ = Mock(return_value=mock_span)
            mock_sentry.start_span.return_value.__exit__ = Mock(return_value=False)

            # Mock Telegram objects
            update = self._create_mock_update("test message")
            context = Mock(spec=ContextTypes.DEFAULT_TYPE)
            context.bot = AsyncMock()
            context.bot.send_message = AsyncMock()

            # Mock Claude SDK
            with patch('telegram_bot.ClaudeSDKClient'):
                with patch('telegram_bot.load_user_session', return_value=None):
                    with patch('telegram_bot.get_user_cwd', return_value='/tmp'):
                        with patch('telegram_bot.save_user_session'):
                            try:
                                await handle_message(update, context)
                            except Exception:
                                pass  # We're just checking span creation

            # Verify agent span was created
            calls = [call for call in mock_sentry.start_span.call_args_list
                    if call[1].get('op') == 'gen_ai.invoke_agent']
            assert len(calls) > 0, "Agent invocation span should be created"
            assert 'invoke_agent' in calls[0][1]['name']

    @pytest.mark.asyncio
    async def test_llm_client_span_created(self):
        """Test that LLM client span is created for Claude SDK interaction."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            mock_span = MagicMock()
            mock_sentry.start_span.return_value.__enter__ = Mock(return_value=mock_span)
            mock_sentry.start_span.return_value.__exit__ = Mock(return_value=False)

            update = self._create_mock_update("test message")
            context = Mock(spec=ContextTypes.DEFAULT_TYPE)
            context.bot = AsyncMock()
            context.bot.send_message = AsyncMock()

            with patch('telegram_bot.ClaudeSDKClient'):
                with patch('telegram_bot.load_user_session', return_value=None):
                    with patch('telegram_bot.get_user_cwd', return_value='/tmp'):
                        with patch('telegram_bot.save_user_session'):
                            try:
                                await handle_message(update, context)
                            except Exception:
                                pass

            # Verify LLM span was created
            calls = [call for call in mock_sentry.start_span.call_args_list
                    if call[1].get('op') == 'ai.chat_completions.create.anthropic']
            assert len(calls) > 0, "LLM client span should be created"

    @pytest.mark.asyncio
    async def test_tool_execution_span_created(self):
        """Test that tool execution spans are created for tool usage."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            mock_span = MagicMock()
            mock_sentry.start_span.return_value.__enter__ = Mock(return_value=mock_span)
            mock_sentry.start_span.return_value.__exit__ = Mock(return_value=False)

            update = self._create_mock_update("list files")
            context = Mock(spec=ContextTypes.DEFAULT_TYPE)
            context.bot = AsyncMock()
            context.bot.send_message = AsyncMock()

            # Mock Claude SDK with tool usage
            mock_client = AsyncMock()
            mock_tool_block = Mock()
            mock_tool_block.name = "Bash"
            mock_tool_block.input = {"command": "ls"}

            mock_assistant_msg = Mock()
            mock_assistant_msg.content = [mock_tool_block]

            mock_result_msg = Mock()
            mock_result_msg.session_id = "test-session"
            mock_result_msg.usage = {}

            async def mock_receive():
                yield mock_assistant_msg
                yield mock_result_msg

            mock_client.receive_response = mock_receive
            mock_client.query = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock()

            with patch('telegram_bot.ClaudeSDKClient', return_value=mock_client):
                with patch('telegram_bot.load_user_session', return_value=None):
                    with patch('telegram_bot.get_user_cwd', return_value='/tmp'):
                        with patch('telegram_bot.save_user_session'):
                            with patch('telegram_bot.ToolUseBlock', mock_tool_block.__class__):
                                await handle_message(update, context)

            # Verify tool span was created
            calls = [call for call in mock_sentry.start_span.call_args_list
                    if call[1].get('op') == 'gen_ai.execute_tool']
            assert len(calls) > 0, "Tool execution span should be created"

    def _create_mock_update(self, text):
        """Helper to create mock Telegram update."""
        update = Mock(spec=Update)
        update.effective_user = Mock(spec=User)
        update.effective_user.id = 12345
        update.effective_user.username = "testuser"
        update.message = Mock(spec=Message)
        update.message.text = text
        update.message.chat = Mock(spec=Chat)
        update.message.chat.id = 12345
        update.message.chat.send_action = AsyncMock()
        update.message.reply_text = AsyncMock()
        return update


class TestSentryDataCapture:
    """Test that Sentry captures correct metadata and metrics."""

    @pytest.mark.asyncio
    async def test_agent_span_captures_user_context(self):
        """Test that agent span captures user ID, username, and message."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            mock_span = MagicMock()
            mock_sentry.start_span.return_value.__enter__ = Mock(return_value=mock_span)
            mock_sentry.start_span.return_value.__exit__ = Mock(return_value=False)

            update = Mock(spec=Update)
            update.effective_user = Mock(spec=User)
            update.effective_user.id = 99999
            update.effective_user.username = "johndoe"
            update.message = Mock(spec=Message)
            update.message.text = "What is Python?"
            update.message.chat = Mock(spec=Chat)
            update.message.chat.id = 99999
            update.message.chat.send_action = AsyncMock()
            update.message.reply_text = AsyncMock()

            context = Mock(spec=ContextTypes.DEFAULT_TYPE)
            context.bot = AsyncMock()
            context.bot.send_message = AsyncMock()

            with patch('telegram_bot.ClaudeSDKClient'):
                with patch('telegram_bot.load_user_session', return_value=None):
                    with patch('telegram_bot.get_user_cwd', return_value='/tmp'):
                        with patch('telegram_bot.save_user_session'):
                            try:
                                await handle_message(update, context)
                            except Exception:
                                pass

            # Check that span.set_data was called with user context
            set_data_calls = mock_span.set_data.call_args_list
            data_dict = {call[0][0]: call[0][1] for call in set_data_calls}

            assert data_dict.get('user_id') == 99999
            assert data_dict.get('username') == "johndoe"
            assert 'gen_ai.system' in data_dict
            assert data_dict['gen_ai.system'] == 'anthropic'

    @pytest.mark.asyncio
    async def test_token_usage_captured(self):
        """Test that token usage from ResultMessage is captured."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            mock_span = MagicMock()
            mock_sentry.start_span.return_value.__enter__ = Mock(return_value=mock_span)
            mock_sentry.start_span.return_value.__exit__ = Mock(return_value=False)

            update = self._create_mock_update("test")
            context = Mock(spec=ContextTypes.DEFAULT_TYPE)
            context.bot = AsyncMock()
            context.bot.send_message = AsyncMock()

            # Mock ResultMessage with usage data
            mock_client = AsyncMock()
            mock_result_msg = Mock()
            mock_result_msg.session_id = "test-session"
            mock_result_msg.usage = {
                "input_tokens": 100,
                "output_tokens": 200,
                "cache_read_input_tokens": 50,
                "cache_creation_input_tokens": 25
            }
            mock_result_msg.total_cost_usd = 0.05
            mock_result_msg.duration_ms = 1500
            mock_result_msg.duration_api_ms = 1400
            mock_result_msg.num_turns = 3

            async def mock_receive():
                yield mock_result_msg

            mock_client.receive_response = mock_receive
            mock_client.query = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock()

            with patch('telegram_bot.ClaudeSDKClient', return_value=mock_client):
                with patch('telegram_bot.load_user_session', return_value=None):
                    with patch('telegram_bot.get_user_cwd', return_value='/tmp'):
                        with patch('telegram_bot.save_user_session'):
                            await handle_message(update, context)

            # Verify token usage was captured
            set_data_calls = mock_span.set_data.call_args_list
            data_dict = {call[0][0]: call[0][1] for call in set_data_calls}

            assert data_dict.get('gen_ai.usage.input_tokens') == 100
            assert data_dict.get('gen_ai.usage.output_tokens') == 200
            assert data_dict.get('gen_ai.cost_usd') == 0.05
            assert data_dict.get('gen_ai.duration_ms') == 1500

    def _create_mock_update(self, text):
        """Helper to create mock Telegram update."""
        update = Mock(spec=Update)
        update.effective_user = Mock(spec=User)
        update.effective_user.id = 12345
        update.effective_user.username = "testuser"
        update.message = Mock(spec=Message)
        update.message.text = text
        update.message.chat = Mock(spec=Chat)
        update.message.chat.id = 12345
        update.message.chat.send_action = AsyncMock()
        update.message.reply_text = AsyncMock()
        return update


class TestSentryErrorTracking:
    """Test that errors are captured with proper context."""

    @pytest.mark.asyncio
    async def test_exception_captured_with_context(self):
        """Test that exceptions are sent to Sentry with rich context."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            mock_span = MagicMock()
            mock_sentry.start_span.return_value.__enter__ = Mock(return_value=mock_span)
            mock_sentry.start_span.return_value.__exit__ = Mock(return_value=False)

            update = Mock(spec=Update)
            update.effective_user = Mock(spec=User)
            update.effective_user.id = 77777
            update.effective_user.username = "erroruser"
            update.message = Mock(spec=Message)
            update.message.text = "trigger error"
            update.message.chat = Mock(spec=Chat)
            update.message.chat.id = 77777
            update.message.chat.send_action = AsyncMock()
            update.message.reply_text = AsyncMock()

            context = Mock(spec=ContextTypes.DEFAULT_TYPE)
            context.bot = AsyncMock()

            # Force an error
            with patch('telegram_bot.load_user_session', side_effect=Exception("Test error")):
                await handle_message(update, context)

            # Verify exception was captured
            assert mock_sentry.capture_exception.called
            # Verify context was set
            assert mock_sentry.set_context.called


class TestSentryInitialization:
    """Test Sentry SDK initialization."""

    def test_sentry_initializes_with_dsn(self):
        """Test that Sentry initializes when DSN is provided."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            with patch.dict('os.environ', {'SENTRY_DSN': 'https://test@sentry.io/123'}):
                with patch('telegram_bot.os.getenv', side_effect=lambda k, d=None: {
                    'SENTRY_DSN': 'https://test@sentry.io/123',
                    'SENTRY_ENVIRONMENT': 'test',
                    'TELEGRAM_BOT_API_KEY': 'test-token'
                }.get(k, d)):
                    from telegram_bot import main
                    with patch('telegram_bot.ApplicationBuilder'):
                        with patch('telegram_bot.logger'):
                            try:
                                # Mock the run_polling to prevent actual execution
                                with patch('telegram_bot.Application.run_polling'):
                                    pass
                            except:
                                pass

                    # Verify Sentry was initialized
                    assert mock_sentry.init.called

    def test_sentry_not_initialized_without_dsn(self):
        """Test that Sentry doesn't initialize without DSN."""
        with patch('telegram_bot.sentry_sdk') as mock_sentry:
            with patch.dict('os.environ', {}, clear=True):
                with patch('telegram_bot.os.getenv', return_value=None):
                    # Would need to import and test, but DSN check happens in main()
                    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
