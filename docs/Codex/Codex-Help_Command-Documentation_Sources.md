# Codex Help Command & Codex Documentation Sources

## Codex Help Command:
```powershell
PS D:\VSCode Projects\Personal Projects\Remote-Agentic-Coding-System> codex --help

Codex CLI

If no subcommand is specified, options will be forwarded to the interactive CLI.

Usage: codex [OPTIONS] [PROMPT]
       codex [OPTIONS] <COMMAND> [ARGS]

Commands:
  exec        Run Codex non-interactively [aliases: e]
  review      Run a code review non-interactively
  login       Manage login
  logout      Remove stored authentication credentials
  mcp         [experimental] Run Codex as an MCP server and manage MCP servers
  mcp-server  [experimental] Run the Codex MCP server (stdio transport)
  app-server  [experimental] Run the app server or related tooling
  completion  Generate shell completion scripts
  sandbox     Run commands within a Codex-provided sandbox [aliases: debug]
  apply       Apply the latest diff produced by Codex agent as a `git apply` to your local working tree [aliases: a]
  resume      Resume a previous interactive session (picker by default; use --last to continue the most recent)
  cloud       [EXPERIMENTAL] Browse tasks from Codex Cloud and apply changes locally
  features    Inspect feature flags
  help        Print this message or the help of the given subcommand(s)

Arguments:
  [PROMPT]
          Optional user prompt to start the session

Options:
  -c, --config <key=value>
          Override a configuration value that would otherwise be loaded from `~/.codex/config.toml`. Use a dotted path (`foo.bar.baz`) to override nested     
          values. The `value` portion is parsed as TOML. If it fails to parse as TOML, the raw string is used as a literal.

          Examples: - `-c model="o3"` - `-c 'sandbox_permissions=["disk-full-read-access"]'` - `-c shell_environment_policy.inherit=all`

      --enable <FEATURE>
          Enable a feature (repeatable). Equivalent to `-c features.<name>=true`

      --disable <FEATURE>
          Disable a feature (repeatable). Equivalent to `-c features.<name>=false`

  -i, --image <FILE>...
          Optional image(s) to attach to the initial prompt

  -m, --model <MODEL>
          Model the agent should use

      --oss
          Convenience flag to select the local open source model provider. Equivalent to -c model_provider=oss; verifies a local LM Studio or Ollama server is
          running

      --local-provider <OSS_PROVIDER>
          Specify which local provider to use (lmstudio or ollama). If not specified with --oss, will use config default or show selection

  -p, --profile <CONFIG_PROFILE>
          Configuration profile from config.toml to specify default options

  -s, --sandbox <SANDBOX_MODE>
          Select the sandbox policy to use when executing model-generated shell commands

          [possible values: read-only, workspace-write, danger-full-access]

  -a, --ask-for-approval <APPROVAL_POLICY>
          Configure when the model requires human approval before executing a command

          Possible values:
          - untrusted:  Only run "trusted" commands (e.g. ls, cat, sed) without asking for user approval. Will escalate to the user if the model proposes a   
            command that is not in the "trusted" set
          - on-failure: Run all commands without asking for user approval. Only asks for approval if a command fails to execute, in which case it will        
            escalate to the user to ask for un-sandboxed execution
          - on-request: The model decides when to ask the user for approval
          - never:      Never ask for user approval Execution failures are immediately returned to the model

      --full-auto
          Convenience alias for low-friction sandboxed automatic execution (-a on-request, --sandbox workspace-write)

      --dangerously-bypass-approvals-and-sandbox
          Skip all confirmation prompts and execute commands without sandboxing. EXTREMELY DANGEROUS. Intended solely for running in environments that are
          externally sandboxed

  -C, --cd <DIR>
          Tell the agent to use the specified directory as its working root

      --search
          Enable web search (off by default). When enabled, the native Responses `web_search` tool is available to the model (no per‑call approval)

      --add-dir <DIR>
          Additional directories that should be writable alongside the primary workspace

  -h, --help
          Print help (see a summary with '-h')

  -V, --version
          Print version
```

## Codex Documentation Sources:
### Getting Started:
- **Overview:** https://developers.openai.com/codex
- **Quickstart:** https://developers.openai.com/codex/quickstart
- **Pricing:** https://developers.openai.com/codex/pricing
- **Concepts:**
    - **Prompting:** https://developers.openai.com/codex/prompting
    - **Workflows:** https://developers.openai.com/codex/workflows
    - **Models:** https://developers.openai.com/codex/models
    - **AI-Native Teams:** https://developers.openai.com/codex/guides/build-ai-native-engineering-team
- **Cookbooks:** https://developers.openai.com/cookbook/topic/codex
### CLI References:
- **Overview:** https://developers.openai.com/codex/cli/
- **Features:** https://developers.openai.com/codex/cli/features
- **Command Line Options:** https://developers.openai.com/codex/cli/reference
- **Slash Commands:** https://developers.openai.com/codex/cli/slash-commands
### Integration References:
- **GitHub:** https://developers.openai.com/codex/integrations/github
### Configuration References:
- **Config Basics:** https://developers.openai.com/codex/config-basic
- **Advanced Configuration:** https://developers.openai.com/codex/config-advanced
- **Config Reference:** https://developers.openai.com/codex/config-reference
- **Sample Config:** https://developers.openai.com/codex/config-sample
### Rules Reference:
- **Rules:** https://developers.openai.com/codex/rules
### AGENTS.md Reference:
- **AGENTS.md:** https://developers.openai.com/codex/guides/agents-md
### MCP Reference:
- **MCP:** https://developers.openai.com/codex/guides/mcp
### Skills References:
- **Overview:** https://developers.openai.com/codex/guides/skills
- **Create Skills:** https://developers.openai.com/codex/skills/create-skill
### Administration References:
- **Authentication:** https://developers.openai.com/codex/auth
- **Security:** https://developers.openai.com/codex/security
- **Windows:** https://developers.openai.com/codex/windows
### Automation References:
- **Non-interactive Mode:** https://developers.openai.com/codex/noninteractive
- **Codex SDK:** https://developers.openai.com/codex/sdk
- **App Server:** https://developers.openai.com/codex/app-server
- **MCP Server:** https://developers.openai.com/codex/guides/agents-sdk
- **GitHub Actions:** https://developers.openai.com/codex/github-action

## Next Steps (Simplified):
- Find out how exactly Codex is setup & how it works within the Remote Agentic Coding System
- Find out how well/seamless which features & functionality exactly are already implemented in the current version of the Remote Agentic Coding System
- Research "missing" features/functionality & evaluate if they are worth implementing
- Plan each feature's implementation worth integrating into the Remote Agentic Coding System