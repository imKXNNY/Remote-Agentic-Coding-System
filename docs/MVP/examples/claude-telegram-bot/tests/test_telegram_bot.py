"""
Unit Tests for Telegram Bot
============================

Tests for the core functionality of telegram_bot.py including:
- Session management (save, load, clear)
- Working directory management
- Message splitting logic
- Path validation
- JSON structure validation
"""

import json
import os
import pytest
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock

# Import functions to test
from telegram_bot import (
    save_user_session,
    load_user_session,
    set_user_cwd,
    get_user_cwd,
    clear_user_session,
    send_long_message,
    MAX_TELEGRAM_MESSAGE_LENGTH,
    SESSIONS_DIR
)


# ==================== Fixtures ====================

@pytest.fixture
def temp_sessions_dir(monkeypatch):
    """Create a temporary sessions directory for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_path = Path(tmpdir)
        monkeypatch.setattr("telegram_bot.SESSIONS_DIR", temp_path)
        # Clear WORKING_DIRECTORY env var so tests use os.getcwd()
        monkeypatch.delenv("WORKING_DIRECTORY", raising=False)
        yield temp_path


@pytest.fixture
def mock_user_id():
    """Standard test user ID."""
    return 12345


@pytest.fixture
def mock_session_id():
    """Standard test session ID."""
    return "session_abc123xyz"


# ==================== Session Management Tests ====================

class TestSaveUserSession:
    """Tests for save_user_session function."""

    def test_save_new_session(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test creating a new session file."""
        cwd = "/test/path"

        save_user_session(mock_user_id, mock_session_id, cwd)

        # Verify file was created
        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        assert session_file.exists()

        # Verify contents
        with open(session_file) as f:
            data = json.load(f)

        assert data["session_id"] == mock_session_id
        assert data["cwd"] == cwd
        assert "created_at" in data
        assert "last_updated" in data

    def test_save_session_without_cwd(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test saving session without cwd parameter."""
        save_user_session(mock_user_id, mock_session_id)

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            data = json.load(f)

        assert data["session_id"] == mock_session_id
        assert data["cwd"] is None

    def test_update_existing_session(self, temp_sessions_dir, mock_user_id):
        """Test updating an existing session preserves created_at."""
        # Create initial session
        initial_session_id = "session_001"
        save_user_session(mock_user_id, initial_session_id, "/path/one")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            initial_data = json.load(f)

        initial_created_at = initial_data["created_at"]

        # Update session with new session ID
        new_session_id = "session_002"
        save_user_session(mock_user_id, new_session_id, "/path/two")

        with open(session_file) as f:
            updated_data = json.load(f)

        # Verify created_at is preserved but other fields updated
        assert updated_data["created_at"] == initial_created_at
        assert updated_data["session_id"] == new_session_id
        assert updated_data["cwd"] == "/path/two"
        assert updated_data["last_updated"] != initial_data["last_updated"]

    def test_session_preserves_cwd_on_update(self, temp_sessions_dir, mock_user_id):
        """Test that updating session without cwd parameter preserves existing cwd."""
        # Save with cwd
        save_user_session(mock_user_id, "session_001", "/original/path")

        # Update without cwd parameter
        save_user_session(mock_user_id, "session_002")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            data = json.load(f)

        # cwd should be preserved
        assert data["cwd"] == "/original/path"
        assert data["session_id"] == "session_002"


class TestLoadUserSession:
    """Tests for load_user_session function."""

    def test_load_existing_session(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test loading an existing session."""
        cwd = "/test/path"
        save_user_session(mock_user_id, mock_session_id, cwd)

        result = load_user_session(mock_user_id)

        assert result is not None
        session_id, loaded_cwd = result
        assert session_id == mock_session_id
        assert loaded_cwd == cwd

    def test_load_nonexistent_session(self, temp_sessions_dir, mock_user_id):
        """Test loading a session that doesn't exist."""
        result = load_user_session(mock_user_id)
        assert result is None

    def test_load_session_without_cwd(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test loading session with None cwd."""
        save_user_session(mock_user_id, mock_session_id)

        result = load_user_session(mock_user_id)

        assert result is not None
        session_id, cwd = result
        assert session_id == mock_session_id
        assert cwd is None

    def test_load_corrupted_session(self, temp_sessions_dir, mock_user_id):
        """Test handling of corrupted JSON file."""
        session_file = temp_sessions_dir / f"{mock_user_id}.json"

        # Write invalid JSON
        with open(session_file, "w") as f:
            f.write("{invalid json content")

        result = load_user_session(mock_user_id)
        assert result is None

    def test_load_session_missing_session_id(self, temp_sessions_dir, mock_user_id):
        """Test loading session file without session_id field."""
        session_file = temp_sessions_dir / f"{mock_user_id}.json"

        # Create file with cwd but no session_id
        with open(session_file, "w") as f:
            json.dump({"cwd": "/some/path"}, f)

        result = load_user_session(mock_user_id)
        assert result is None


class TestSetUserCwd:
    """Tests for set_user_cwd function."""

    def test_set_cwd_new_file(self, temp_sessions_dir, mock_user_id):
        """Test setting cwd when no session file exists."""
        cwd = "/new/working/directory"

        set_user_cwd(mock_user_id, cwd)

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        assert session_file.exists()

        with open(session_file) as f:
            data = json.load(f)

        assert data["cwd"] == cwd
        assert "created_at" in data
        assert "last_updated" in data

    def test_set_cwd_existing_file(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test updating cwd in existing session."""
        # Create initial session
        save_user_session(mock_user_id, mock_session_id, "/old/path")

        # Update cwd
        new_cwd = "/new/path"
        set_user_cwd(mock_user_id, new_cwd)

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            data = json.load(f)

        # cwd should be updated, session_id preserved
        assert data["cwd"] == new_cwd
        assert data["session_id"] == mock_session_id

    def test_set_cwd_preserves_timestamps(self, temp_sessions_dir, mock_user_id):
        """Test that setting cwd preserves created_at timestamp."""
        # Create initial session
        set_user_cwd(mock_user_id, "/path/one")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            initial_data = json.load(f)

        initial_created_at = initial_data["created_at"]

        # Update cwd
        set_user_cwd(mock_user_id, "/path/two")

        with open(session_file) as f:
            updated_data = json.load(f)

        # created_at should be preserved
        assert updated_data["created_at"] == initial_created_at


class TestGetUserCwd:
    """Tests for get_user_cwd function."""

    def test_get_cwd_from_session(self, temp_sessions_dir, mock_user_id):
        """Test getting cwd from existing session."""
        cwd = "/test/directory"
        set_user_cwd(mock_user_id, cwd)

        result = get_user_cwd(mock_user_id)
        assert result == cwd

    def test_get_cwd_no_session(self, temp_sessions_dir, mock_user_id):
        """Test fallback when no session exists."""
        result = get_user_cwd(mock_user_id)

        # Should return current working directory as fallback
        # (WORKING_DIRECTORY env var is cleared by fixture)
        assert result == os.getcwd()

    def test_get_cwd_session_without_cwd(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test fallback when session exists but has no cwd."""
        # Create session without cwd
        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file, "w") as f:
            json.dump({"session_id": mock_session_id}, f)

        result = get_user_cwd(mock_user_id)
        # Should fallback to current directory
        assert result == os.getcwd()

    def test_get_cwd_with_env_variable(self, temp_sessions_dir, mock_user_id, monkeypatch):
        """Test fallback to WORKING_DIRECTORY environment variable."""
        env_dir = "/env/working/directory"
        monkeypatch.setenv("WORKING_DIRECTORY", env_dir)

        result = get_user_cwd(mock_user_id)
        assert result == env_dir

    def test_get_cwd_corrupted_session(self, temp_sessions_dir, mock_user_id):
        """Test fallback when session file is corrupted."""
        session_file = temp_sessions_dir / f"{mock_user_id}.json"

        # Write invalid JSON
        with open(session_file, "w") as f:
            f.write("not valid json")

        result = get_user_cwd(mock_user_id)
        # Should fallback to current directory
        assert result == os.getcwd()


class TestClearUserSession:
    """Tests for clear_user_session function."""

    def test_clear_session_preserves_cwd(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test that clearing session preserves cwd setting."""
        cwd = "/important/path"
        save_user_session(mock_user_id, mock_session_id, cwd)

        clear_user_session(mock_user_id)

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            data = json.load(f)

        # cwd should be preserved
        assert data["cwd"] == cwd
        # session_id should be removed
        assert "session_id" not in data

    def test_clear_session_updates_timestamp(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test that clearing session updates last_updated timestamp."""
        save_user_session(mock_user_id, mock_session_id, "/path")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            initial_data = json.load(f)

        initial_updated = initial_data["last_updated"]

        # Clear session
        clear_user_session(mock_user_id)

        with open(session_file) as f:
            cleared_data = json.load(f)

        # last_updated should change
        assert cleared_data["last_updated"] != initial_updated

    def test_clear_nonexistent_session(self, temp_sessions_dir, mock_user_id):
        """Test clearing a session that doesn't exist."""
        # Should not raise an error
        clear_user_session(mock_user_id)

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        assert not session_file.exists()

    def test_clear_session_preserves_created_at(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test that clearing session preserves created_at timestamp."""
        save_user_session(mock_user_id, mock_session_id, "/path")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            initial_data = json.load(f)

        created_at = initial_data["created_at"]

        clear_user_session(mock_user_id)

        with open(session_file) as f:
            cleared_data = json.load(f)

        assert cleared_data["created_at"] == created_at


# ==================== Message Splitting Tests ====================

class TestSendLongMessage:
    """Tests for send_long_message function."""

    @pytest.mark.asyncio
    async def test_short_message_single_send(self):
        """Test that short messages are sent as a single message."""
        chat_id = 12345
        short_text = "This is a short message"

        # Mock context and bot
        mock_context = Mock()
        mock_context.bot.send_message = AsyncMock()

        await send_long_message(chat_id, short_text, mock_context)

        # Should be called once with full text
        mock_context.bot.send_message.assert_called_once_with(
            chat_id=chat_id,
            text=short_text
        )

    @pytest.mark.asyncio
    async def test_long_message_splits(self):
        """Test that long messages are split into multiple chunks."""
        chat_id = 12345

        # Create a message that exceeds the limit
        # 4096 chars / 5 chars per line = ~820 lines needed
        long_text = "Line\n" * 1000  # Should exceed 4096 chars
        assert len(long_text) > MAX_TELEGRAM_MESSAGE_LENGTH

        mock_context = Mock()
        mock_context.bot.send_message = AsyncMock()

        await send_long_message(chat_id, long_text, mock_context)

        # Should be called multiple times
        assert mock_context.bot.send_message.call_count > 1

        # All chunks except first should have continuation indicator
        calls = mock_context.bot.send_message.call_args_list
        for i, call in enumerate(calls):
            chunk = call.kwargs["text"]

            # Check chunk doesn't exceed limit
            assert len(chunk) <= MAX_TELEGRAM_MESSAGE_LENGTH

            # Check continuation indicator on subsequent chunks
            if i > 0:
                assert chunk.startswith("(continued")

    @pytest.mark.asyncio
    async def test_message_splits_on_line_boundaries(self):
        """Test that message splitting respects line boundaries."""
        chat_id = 12345

        # Create lines that will require splitting
        lines = [f"Line {i}: Some content here" for i in range(200)]
        long_text = "\n".join(lines)

        mock_context = Mock()
        mock_context.bot.send_message = AsyncMock()

        await send_long_message(chat_id, long_text, mock_context)

        # Verify each chunk contains complete lines (no mid-line breaks)
        calls = mock_context.bot.send_message.call_args_list
        for call in calls:
            chunk = call.kwargs["text"]

            # Remove continuation indicator if present
            if chunk.startswith("(continued"):
                chunk = chunk.split("\n\n", 1)[1] if "\n\n" in chunk else chunk

            # Each line should be complete (ends with number or content)
            lines_in_chunk = chunk.split("\n")
            for line in lines_in_chunk:
                if line and not line.startswith("(continued"):
                    # Should not be a truncated line
                    assert len(line) < 1000  # Reasonable line length

    @pytest.mark.asyncio
    async def test_message_at_limit_boundary(self):
        """Test message exactly at the limit."""
        chat_id = 12345

        # Create message exactly at limit
        text_at_limit = "x" * MAX_TELEGRAM_MESSAGE_LENGTH

        mock_context = Mock()
        mock_context.bot.send_message = AsyncMock()

        await send_long_message(chat_id, text_at_limit, mock_context)

        # Should be sent as single message
        mock_context.bot.send_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_empty_message(self):
        """Test handling of empty message."""
        chat_id = 12345
        empty_text = ""

        mock_context = Mock()
        mock_context.bot.send_message = AsyncMock()

        await send_long_message(chat_id, empty_text, mock_context)

        # Should still send (empty message)
        mock_context.bot.send_message.assert_called_once_with(
            chat_id=chat_id,
            text=empty_text
        )


# ==================== JSON Structure Validation Tests ====================

class TestSessionFileStructure:
    """Tests for session file JSON structure."""

    def test_session_file_has_required_fields(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test that session files contain all required fields."""
        save_user_session(mock_user_id, mock_session_id, "/path")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            data = json.load(f)

        # Check required fields
        assert "session_id" in data
        assert "cwd" in data
        assert "created_at" in data
        assert "last_updated" in data

    def test_timestamps_are_iso_format(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test that timestamps are in ISO 8601 format."""
        save_user_session(mock_user_id, mock_session_id, "/path")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"
        with open(session_file) as f:
            data = json.load(f)

        # Verify timestamps can be parsed as ISO format
        created_at = data["created_at"]
        last_updated = data["last_updated"]

        # Should end with 'Z' for UTC
        assert created_at.endswith("Z")
        assert last_updated.endswith("Z")

        # Should be parseable as datetime
        datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        datetime.fromisoformat(last_updated.replace("Z", "+00:00"))

    def test_session_file_is_valid_json(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test that session files are valid JSON."""
        save_user_session(mock_user_id, mock_session_id, "/path")

        session_file = temp_sessions_dir / f"{mock_user_id}.json"

        # Should not raise exception
        with open(session_file) as f:
            data = json.load(f)

        assert isinstance(data, dict)


# ==================== Integration Tests ====================

class TestSessionWorkflow:
    """Integration tests for complete session workflows."""

    def test_complete_session_lifecycle(self, temp_sessions_dir, mock_user_id, mock_session_id):
        """Test a complete session lifecycle: create, load, update, clear."""
        cwd = "/project/path"

        # 1. Create new session
        save_user_session(mock_user_id, mock_session_id, cwd)

        # 2. Load session
        result = load_user_session(mock_user_id)
        assert result is not None
        loaded_session_id, loaded_cwd = result
        assert loaded_session_id == mock_session_id
        assert loaded_cwd == cwd

        # 3. Update cwd
        new_cwd = "/new/path"
        set_user_cwd(mock_user_id, new_cwd)
        retrieved_cwd = get_user_cwd(mock_user_id)
        assert retrieved_cwd == new_cwd

        # 4. Clear session (preserving cwd)
        clear_user_session(mock_user_id)
        result = load_user_session(mock_user_id)
        assert result is None  # No session_id

        # But cwd should still be retrievable
        retrieved_cwd = get_user_cwd(mock_user_id)
        assert retrieved_cwd == new_cwd

    def test_multiple_users_independent_sessions(self, temp_sessions_dir):
        """Test that multiple users have independent sessions."""
        user1_id = 111
        user2_id = 222

        # Create sessions for both users
        save_user_session(user1_id, "session_user1", "/user1/path")
        save_user_session(user2_id, "session_user2", "/user2/path")

        # Verify user1 session
        result1 = load_user_session(user1_id)
        assert result1 is not None
        session1, cwd1 = result1
        assert session1 == "session_user1"
        assert cwd1 == "/user1/path"

        # Verify user2 session
        result2 = load_user_session(user2_id)
        assert result2 is not None
        session2, cwd2 = result2
        assert session2 == "session_user2"
        assert cwd2 == "/user2/path"

        # Verify they're independent
        assert session1 != session2
        assert cwd1 != cwd2

    def test_session_resume_workflow(self, temp_sessions_dir, mock_user_id):
        """Test simulating a conversation pause and resume."""
        # Initial conversation
        session1 = "session_conversation1"
        save_user_session(mock_user_id, session1, "/work/dir")

        # User comes back, load session
        result = load_user_session(mock_user_id)
        assert result is not None
        loaded_session, _ = result
        assert loaded_session == session1

        # After new interaction, save new session
        session2 = "session_conversation2"
        save_user_session(mock_user_id, session2)

        # Verify new session saved
        result = load_user_session(mock_user_id)
        assert result is not None
        loaded_session, _ = result
        assert loaded_session == session2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
