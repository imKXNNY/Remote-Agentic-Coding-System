"""
Telegram Bot for Claude Agent SDK
==================================

A Telegram bot that enables users to interact with Claude Code through
direct messages. Features include:
- Per-user session management
- Per-user working directory configuration
- Streaming responses from Claude
- Persistent conversation context

Usage:
    python telegram_bot.py
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Tuple

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes
)

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Configuration
SESSIONS_DIR = Path("telegram_sessions")
SESSIONS_DIR.mkdir(exist_ok=True)

# Telegram message length limit
MAX_TELEGRAM_MESSAGE_LENGTH = 4096


# ==================== Session Management ====================

def save_user_session(user_id: int, session_id: str, cwd: Optional[str] = None):
    """
    Save session data for a Telegram user.

    Args:
        user_id: Telegram user ID
        session_id: Claude SDK session ID
        cwd: Working directory path (optional)
    """
    session_file = SESSIONS_DIR / f"{user_id}.json"

    # Load existing data to preserve fields
    existing_data = {}
    if session_file.exists():
        with open(session_file, "r") as f:
            existing_data = json.load(f)

    # Update session data
    session_data = {
        "session_id": session_id,
        "cwd": cwd or existing_data.get("cwd"),
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

    # Preserve created_at timestamp
    if "created_at" in existing_data:
        session_data["created_at"] = existing_data["created_at"]
    else:
        session_data["created_at"] = session_data["last_updated"]

    with open(session_file, "w") as f:
        json.dump(session_data, f, indent=2)

    logger.info(f"Saved session for user {user_id}")


def load_user_session(user_id: int) -> Optional[Tuple[str, str]]:
    """
    Load session data for a Telegram user.

    Args:
        user_id: Telegram user ID

    Returns:
        Tuple of (session_id, cwd) if session exists, None otherwise
    """
    session_file = SESSIONS_DIR / f"{user_id}.json"

    if not session_file.exists():
        return None

    try:
        with open(session_file, "r") as f:
            data = json.load(f)
            session_id = data.get("session_id")
            cwd = data.get("cwd")
            return (session_id, cwd) if session_id else None
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Error loading session for user {user_id}: {e}")
        return None


def set_user_cwd(user_id: int, cwd: str):
    """
    Set the working directory for a user.

    Args:
        user_id: Telegram user ID
        cwd: Working directory path
    """
    session_file = SESSIONS_DIR / f"{user_id}.json"

    # Load existing data or create new
    session_data = {}
    if session_file.exists():
        with open(session_file, "r") as f:
            session_data = json.load(f)

    # Update cwd
    session_data["cwd"] = cwd
    session_data["last_updated"] = datetime.utcnow().isoformat() + "Z"

    if "created_at" not in session_data:
        session_data["created_at"] = session_data["last_updated"]

    with open(session_file, "w") as f:
        json.dump(session_data, f, indent=2)

    logger.info(f"Set cwd for user {user_id}: {cwd}")


def get_user_cwd(user_id: int) -> str:
    """
    Get the working directory for a user.

    Args:
        user_id: Telegram user ID

    Returns:
        Working directory path (falls back to WORKING_DIRECTORY env or cwd)
    """
    session_file = SESSIONS_DIR / f"{user_id}.json"

    if session_file.exists():
        try:
            with open(session_file, "r") as f:
                data = json.load(f)
                if data.get("cwd"):
                    return data["cwd"]
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback to environment variable or current directory
    return os.getenv("WORKING_DIRECTORY", os.getcwd())


def clear_user_session(user_id: int):
    """
    Clear the session for a user (keeps cwd configuration).

    Args:
        user_id: Telegram user ID
    """
    session_file = SESSIONS_DIR / f"{user_id}.json"

    if session_file.exists():
        try:
            with open(session_file, "r") as f:
                data = json.load(f)

            # Keep only cwd, remove session_id
            new_data = {
                "cwd": data.get("cwd"),
                "created_at": data.get("created_at"),
                "last_updated": datetime.utcnow().isoformat() + "Z"
            }

            with open(session_file, "w") as f:
                json.dump(new_data, f, indent=2)

            logger.info(f"Cleared session for user {user_id}")
        except Exception as e:
            logger.error(f"Error clearing session for user {user_id}: {e}")


# ==================== Command Handlers ====================

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command - welcome message."""
    user = update.effective_user
    logger.info(f"User {user.id} ({user.username}) started the bot")

    welcome_message = f"""👋 Welcome to Claude Code Bot!

I'm powered by Claude Sonnet 4.5 and the Claude Agent SDK. I can help you with:
• Code analysis and development
• File operations in your working directory
• Multi-turn conversations with context
• Tool usage (Read, Write, Bash, Edit)

**Getting Started:**
1. Set your working directory: /setcwd <path>
2. Check your current directory: /getcwd
3. Start chatting! Just send me a message

**Commands:**
/help - Show available commands
/setcwd - Set working directory
/getcwd - Show current working directory
/searchcwd - Search for directories
/reset - Clear conversation history

Let's get started! What would you like to do?"""

    await update.message.reply_text(welcome_message)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command - show available commands."""
    help_message = """🤖 **Claude Code Bot - Commands**

**Setup Commands:**
/setcwd <path> - Set your working directory for file operations
/getcwd - Show your current working directory
/searchcwd <query> - Search for directories matching a pattern

**Conversation Commands:**
/reset - Clear your conversation history (keeps cwd setting)
/start - Show welcome message
/help - Show this help message

**How to Use:**
Just send me a regular message to chat! I'll remember the context of our conversation and can perform file operations in your configured working directory.

**Examples:**
• "List all Python files in the current directory"
• "Read the contents of README.md"
• "Create a new file called test.py with a hello world function"
• "What's the difference between these two files?"

Your conversations are private and stored locally per user."""

    await update.message.reply_text(help_message, parse_mode='Markdown')


async def setcwd_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /setcwd command - set working directory."""
    user_id = update.effective_user.id

    # Check if path argument provided
    if not context.args or len(context.args) == 0:
        await update.message.reply_text(
            "⚠️ Please provide a directory path.\n\n"
            "Usage: /setcwd <path>\n"
            "Example: /setcwd C:\\Users\\YourName\\Projects"
        )
        return

    # Get the path (join args in case path has spaces)
    path = " ".join(context.args)

    # Validate path exists and is a directory
    if not os.path.exists(path):
        await update.message.reply_text(
            f"❌ Path does not exist: {path}\n\n"
            "Please check the path and try again.\n"
            "Tip: Use /searchcwd to find directories"
        )
        return

    if not os.path.isdir(path):
        await update.message.reply_text(
            f"❌ Path is not a directory: {path}\n\n"
            "Please provide a valid directory path."
        )
        return

    # Convert to absolute path
    abs_path = os.path.abspath(path)

    # Save the working directory
    set_user_cwd(user_id, abs_path)

    await update.message.reply_text(
        f"✅ Working directory set to:\n{abs_path}\n\n"
        "You can now chat with me and I'll use this directory for file operations!"
    )


async def getcwd_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /getcwd command - show current working directory."""
    user_id = update.effective_user.id
    cwd = get_user_cwd(user_id)

    await update.message.reply_text(
        f"📁 Your current working directory:\n{cwd}\n\n"
        "Use /setcwd to change it."
    )


async def reset_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /reset command - clear conversation session."""
    user_id = update.effective_user.id

    clear_user_session(user_id)

    await update.message.reply_text(
        "🔄 Conversation cleared!\n\n"
        "Your working directory setting has been preserved.\n"
        "We can start a fresh conversation now."
    )


async def searchcwd_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /searchcwd command - search for directories."""
    user_id = update.effective_user.id

    # Check if search query provided
    if not context.args or len(context.args) == 0:
        await update.message.reply_text(
            "⚠️ Please provide a search query.\n\n"
            "Usage: /searchcwd <query>\n"
            "Examples:\n"
            "  /searchcwd Projects\n"
            "  /searchcwd Documents\n"
            "  /searchcwd workspace"
        )
        return

    query = " ".join(context.args).lower()

    await update.message.reply_text(
        f"🔍 Searching for directories matching '{query}'...\n"
        "This may take a moment..."
    )

    try:
        # Search common locations
        search_paths = []

        # Add user home directory
        home = Path.home()
        search_paths.append(home)

        # Add common Windows locations if on Windows
        if os.name == 'nt':
            search_paths.extend([
                Path("C:\\Users"),
                Path("C:\\Projects"),
                Path("D:\\") if Path("D:\\").exists() else None,
            ])
        else:
            # Add common Unix/Linux locations
            search_paths.extend([
                Path("/home"),
                Path("/opt"),
                Path("/var"),
            ])

        # Remove None values
        search_paths = [p for p in search_paths if p and p.exists()]

        # Search for matching directories
        matches = []
        max_depth = 3  # Limit search depth for performance
        max_results = 15  # Limit number of results

        for base_path in search_paths:
            if len(matches) >= max_results:
                break

            try:
                # Search with depth limit
                for depth in range(max_depth):
                    if len(matches) >= max_results:
                        break

                    # Build glob pattern for current depth
                    pattern = "/".join(["*"] * depth) + "/*" if depth > 0 else "*"

                    for item in base_path.glob(pattern):
                        if len(matches) >= max_results:
                            break

                        if item.is_dir() and query in item.name.lower():
                            matches.append(str(item))

            except (PermissionError, OSError):
                # Skip directories we can't access
                continue

        # Format results
        if matches:
            response = f"📁 Found {len(matches)} matching directories:\n\n"

            for i, match in enumerate(matches, 1):
                response += f"{i}. {match}\n"

            response += (
                "\n💡 To set one as your working directory:\n"
                "/setcwd <path>\n\n"
                "Example:\n"
                f"/setcwd {matches[0]}"
            )

            await update.message.reply_text(response)
        else:
            await update.message.reply_text(
                f"❌ No directories found matching '{query}'.\n\n"
                "Tips:\n"
                "• Try a shorter search term\n"
                "• Check the spelling\n"
                "• Use a more general term (e.g., 'work' instead of 'workspace2024')"
            )

    except Exception as e:
        logger.error(f"Error searching directories for user {user_id}: {e}", exc_info=True)
        await update.message.reply_text(
            "⚠️ An error occurred while searching for directories.\n"
            "Please try again or specify the full path using /setcwd"
        )


# ==================== Message Handler ====================

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handle regular text messages and interface with Claude SDK.

    This function:
    1. Loads user's session and cwd configuration
    2. Configures ClaudeAgentOptions with user's settings
    3. Sends message to Claude via SDK
    4. Streams response back to Telegram
    5. Saves updated session
    """
    user = update.effective_user
    user_id = user.id
    user_message = update.message.text

    if user_message.startswith("~"):
        user_message = "/" + user_message[1:]

    logger.info(f"Received message from user {user_id} ({user.username}): {user_message[:50]}...")

    # Create Sentry transaction for this message handling
    with sentry_sdk.start_transaction(op="telegram.message", name="handle_message") as transaction:
        # Set user context
        sentry_sdk.set_user({"id": str(user_id), "username": user.username or "unknown"})

        # Create Sentry span for agent invocation
        with sentry_sdk.start_span(op="gen_ai.invoke_agent", name="invoke_agent Claude Code Bot") as agent_span:
            # Set initial context
            agent_span.set_data("gen_ai.system", "anthropic")
            agent_span.set_data("gen_ai.request.model", "claude-sonnet-4-5")
            agent_span.set_data("gen_ai.prompt", user_message[:200])  # Truncate for privacy
            agent_span.set_data("user_id", user_id)
            agent_span.set_data("username", user.username or "unknown")

            try:
                # Load user's session and working directory
                session_data = load_user_session(user_id)
                session_id = None
                cwd = None

                if session_data:
                    session_id, cwd = session_data
                    if session_id:
                        logger.info(f"Resuming session for user {user_id}: {session_id}")
                        agent_span.set_data("resumed_session_id", session_id)

                # Get working directory (from session or default)
                if not cwd:
                    cwd = get_user_cwd(user_id)

                logger.info(f"Using working directory for user {user_id}: {cwd}")
                agent_span.set_data("working_directory", cwd)

                # Configure Claude Agent options
                options_dict = {
                    "cwd": cwd,
                    "system_prompt": "You are Claude Code, a helpful AI assistant powered by Claude Sonnet 4.5. You help users with code, file operations, and technical tasks.",
                    "allowed_tools": ["Read", "Write", "Bash", "Edit", "mcp__sequential-thinking"],
                    "mcp_servers": {
                        "sequential-thinking": {
                            "command": "npx",
                            "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
                        }
                    }
                }

                # Add resume parameter if we have a session ID
                if session_id:
                    options_dict["resume"] = session_id

                options = ClaudeAgentOptions(**options_dict)
                agent_span.set_data("allowed_tools", options_dict["allowed_tools"])

                # Send "typing" indicator
                await update.message.chat.send_action("typing")

                # Initialize response collectors
                new_session_id = None
                total_response_length = 0
                num_tools_used = 0

                # Create Claude SDK client and send query
                with sentry_sdk.start_span(op="ai.chat_completions.create.anthropic", name="Claude SDK Query") as llm_span:
                    # Set LLM request metadata
                    llm_span.set_data("gen_ai.request.streaming", True)
                    llm_span.set_data("gen_ai.request.model", "claude-sonnet-4-5")
                    llm_span.set_data("gen_ai.system", "anthropic")

                    async with ClaudeSDKClient(options=options) as client:
                        await client.query(user_message)

                        # Stream response from Claude
                        async for message in client.receive_response():
                            if isinstance(message, AssistantMessage):
                                for block in message.content:
                                    if isinstance(block, TextBlock):
                                        # Send text block immediately as a separate message
                                        if block.text.strip():
                                            await send_long_message(update.message.chat_id, block.text, context)
                                            total_response_length += len(block.text)
                                            logger.info(f"Sent text block to user {user_id}, length: {len(block.text)}")
                                    elif isinstance(block, ToolUseBlock):
                                        # Create span for tool execution (retroactive - tool already executed)
                                        logger.info(f"Creating Sentry span for tool: {block.name}")
                                        with sentry_sdk.start_span(op="gen_ai.execute_tool", name=f"execute_tool {block.name}") as tool_span:
                                            tool_span.set_data("gen_ai.operation.name", "execute_tool")
                                            tool_span.set_data("tool_name", block.name)
                                            tool_span.set_data("gen_ai.system", "anthropic")

                                            # Serialize tool input (truncate if too large)
                                            tool_input_str = json.dumps(block.input) if hasattr(block, 'input') else "{}"
                                            if len(tool_input_str) > 1000:
                                                tool_input_str = tool_input_str[:1000] + "... (truncated)"
                                            tool_span.set_data("tool_input", tool_input_str)

                                            # Add small delay to give span measurable duration
                                            await asyncio.sleep(0.001)

                                        logger.info(f"Sentry tool span created for: {block.name}")

                                        # Format tool usage message with brief command info
                                        tool_message = f"🔧 {block.name.upper()}"

                                        # Add brief command/input info (truncated)
                                        if hasattr(block, 'input') and block.input:
                                            tool_input = block.input
                                            brief_info = None

                                            # Extract relevant info based on tool type
                                            if block.name == "Bash" and "command" in tool_input:
                                                cmd = tool_input["command"]
                                                brief_info = cmd[:100] + "..." if len(cmd) > 100 else cmd
                                            elif block.name == "Read" and "file_path" in tool_input:
                                                brief_info = f"Reading: {tool_input['file_path']}"
                                            elif block.name == "Write" and "file_path" in tool_input:
                                                brief_info = f"Writing: {tool_input['file_path']}"
                                            elif block.name == "Edit" and "file_path" in tool_input:
                                                brief_info = f"Editing: {tool_input['file_path']}"
                                            else:
                                                # Generic handling for other tools
                                                tool_input_str = json.dumps(tool_input)
                                                if len(tool_input_str) > 80:
                                                    brief_info = tool_input_str[:80] + "..."
                                                else:
                                                    brief_info = tool_input_str

                                            if brief_info:
                                                tool_message += f"\n{brief_info}"

                                        # Send tool message immediately
                                        await context.bot.send_message(chat_id=update.message.chat_id, text=tool_message)
                                        num_tools_used += 1
                                        logger.info(f"Sent tool usage to user {user_id}: {tool_message[:50]}...")
                                    elif isinstance(block, ToolResultBlock):
                                        # Log tool results for debugging
                                        logger.info(f"Tool result received: tool_use_id={block.tool_use_id if hasattr(block, 'tool_use_id') else 'unknown'}")

                            elif isinstance(message, ResultMessage):
                                # Capture session ID for persistence
                                new_session_id = message.session_id
                                logger.info(f"Received session ID: {new_session_id}")

                                # Capture token usage and cost metrics in Sentry
                                if hasattr(message, 'usage') and message.usage:
                                    llm_span.set_data("gen_ai.usage.input_tokens", message.usage.get("input_tokens", 0))
                                    llm_span.set_data("gen_ai.usage.output_tokens", message.usage.get("output_tokens", 0))
                                    llm_span.set_data("gen_ai.usage.cache_read_input_tokens", message.usage.get("cache_read_input_tokens", 0))
                                    llm_span.set_data("gen_ai.usage.cache_creation_input_tokens", message.usage.get("cache_creation_input_tokens", 0))

                                if hasattr(message, 'total_cost_usd') and message.total_cost_usd:
                                    llm_span.set_data("gen_ai.cost_usd", message.total_cost_usd)

                                if hasattr(message, 'duration_ms') and message.duration_ms:
                                    llm_span.set_data("gen_ai.duration_ms", message.duration_ms)

                                if hasattr(message, 'duration_api_ms') and message.duration_api_ms:
                                    llm_span.set_data("gen_ai.api_duration_ms", message.duration_api_ms)

                                if hasattr(message, 'num_turns') and message.num_turns:
                                    llm_span.set_data("gen_ai.num_turns", message.num_turns)

                # Set final span data
                agent_span.set_data("response_length", total_response_length)
                agent_span.set_data("num_tools", num_tools_used)

                # Save session for future interactions
                if new_session_id:
                    save_user_session(user_id, new_session_id, cwd)
                    logger.info(f"Saved session for user {user_id}")

            except Exception as e:
                logger.error(f"Error handling message from user {user_id}: {e}", exc_info=True)

                # Set rich context for error tracking in Sentry
                sentry_sdk.set_context("user", {
                    "id": user_id,
                    "username": user.username or "unknown",
                })

                sentry_sdk.set_context("session", {
                    "session_id": session_id if 'session_id' in locals() else None,
                    "cwd": cwd if 'cwd' in locals() else None,
                })

                sentry_sdk.set_context("message", {
                    "preview": user_message[:100] if user_message else "",
                    "length": len(user_message) if user_message else 0,
                })

                sentry_sdk.set_context("bot_config", {
                    "allowed_tools": ["Read", "Write", "Bash", "Edit", "mcp__sequential-thinking"],
                })

                # Capture exception in Sentry with context
                sentry_sdk.capture_exception(e)

                error_message = (
                    "⚠️ Sorry, I encountered an error processing your message.\n\n"
                    f"Error: {str(e)}\n\n"
                    "Please try again or use /reset to start a fresh conversation."
                )

                await update.message.reply_text(error_message)


async def send_long_message(chat_id: int, text: str, context: ContextTypes.DEFAULT_TYPE):
    """
    Send a long message, splitting it if necessary due to Telegram's 4096 character limit.

    Args:
        chat_id: Telegram chat ID
        text: Message text to send
        context: Bot context for sending messages
    """
    if len(text) <= MAX_TELEGRAM_MESSAGE_LENGTH:
        await context.bot.send_message(chat_id=chat_id, text=text)
    else:
        # Split message into chunks
        chunks = []
        current_chunk = ""

        # Split by lines to avoid breaking mid-sentence
        lines = text.split("\n")

        for line in lines:
            # If adding this line would exceed limit, start new chunk
            if len(current_chunk) + len(line) + 1 > MAX_TELEGRAM_MESSAGE_LENGTH - 100:  # Leave buffer
                if current_chunk:
                    chunks.append(current_chunk)
                    current_chunk = line
            else:
                if current_chunk:
                    current_chunk += "\n" + line
                else:
                    current_chunk = line

        # Add remaining chunk
        if current_chunk:
            chunks.append(current_chunk)

        # Send all chunks
        for i, chunk in enumerate(chunks):
            if i > 0:
                # Add indicator for continued messages
                chunk = f"(continued {i+1}/{len(chunks)})\n\n{chunk}"
            await context.bot.send_message(chat_id=chat_id, text=chunk)


def main():
    """Main entry point for the Telegram bot."""
    # Get bot token from environment
    bot_token = os.getenv("TELEGRAM_BOT_API_KEY")
    if not bot_token:
        logger.error("TELEGRAM_BOT_API_KEY not found in environment variables")
        logger.error("Please set TELEGRAM_BOT_API_KEY in your .env file")
        return

    # Initialize Sentry monitoring (optional)
    sentry_dsn = os.getenv("SENTRY_DSN")
    if sentry_dsn:
        sentry_sdk.init(
            dsn=sentry_dsn,
            traces_sample_rate=1.0,  # 100% of transactions for performance monitoring
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            send_default_pii=False,  # Privacy-first: don't send user data by default
            enable_tracing=True,  # Enable performance monitoring
            # Integrate Python logging as breadcrumbs
            integrations=[
                LoggingIntegration(
                    level=logging.INFO,  # Capture info and above as breadcrumbs
                    event_level=logging.ERROR  # Send errors as events
                ),
            ],
        )
        logger.info("Sentry monitoring initialized")
    else:
        logger.info("SENTRY_DSN not set, monitoring disabled")

    # Build the application
    logger.info("Initializing Telegram bot...")
    application = ApplicationBuilder().token(bot_token).build()

    # Add command handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("setcwd", setcwd_command))
    application.add_handler(CommandHandler("getcwd", getcwd_command))
    application.add_handler(CommandHandler("searchcwd", searchcwd_command))
    application.add_handler(CommandHandler("reset", reset_command))

    # Add message handler for regular text messages
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Start the bot
    logger.info("Starting Telegram bot polling...")
    logger.info("Bot is ready to receive messages!")
    application.run_polling()


if __name__ == "__main__":
    main()
