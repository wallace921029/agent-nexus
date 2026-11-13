# Changelog

## 0.5.0

### Changed

- Distribute the shared AGENTS.md directly instead of generating per-tool instruction files.
- Enable backend hot reload during web development.

### Breaking changes

- DeepSeek Harness, ZCode, and Claude Desktop are no longer supported. Existing files and links for these tools must be managed manually.
- Per-tool overlays are no longer applied. Move any needed instructions into AGENTS.md and run `sync-agents` again; review the reported actions and backups.
- Object-form instruction path overrides are no longer supported. Replace them with a string containing the desired file path.

## 0.4.0

- Generate OpenCode V2 MCP snippets with the official schema and server structure.
- Detect OpenCode V2 MCP entries in JSONC files with comments, URLs, and trailing commas.
