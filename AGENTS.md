# AGENTS.md
# Repository guidance for agentic coding tools

Overview
- This repository root is currently empty (no build files detected).
- No Cursor or Copilot rule files were found in the root.
- If you add project files later, update this document accordingly.

Detected project metadata
- Files in root: none
- Package managers: not detected
- Build scripts: not detected
- Test frameworks: not detected
- Lint/format tools: not detected
- Language: not detected

Build / lint / test commands
- No commands can be inferred because no config files exist.
- Add one or more of the following to enable detection:
  - package.json (Node/Electron)
  - pyproject.toml / requirements.txt (Python)
  - go.mod (Go)
  - Cargo.toml (Rust)
  - pom.xml / build.gradle (Java)
  - Makefile / CMakeLists.txt (C/C++)

Command placeholders (replace when available)
- Build: <fill in your build command>
- Lint: <fill in your lint command>
- Format: <fill in your format command>
- Test: <fill in your test command>
- Single test: <fill in single-test command>

Examples of single-test commands (choose what fits your stack)
- Jest: `npm test -- path/to/test.test.ts`
- Vitest: `npx vitest path/to/test.test.ts`
- Pytest: `pytest path/to/test_file.py::test_case`
- Go: `go test ./pkg -run TestName`
- Rust: `cargo test test_name`
- .NET: `dotnet test --filter FullyQualifiedName~TestName`
- Java (Maven): `mvn -Dtest=TestName test`
- Java (Gradle): `./gradlew test --tests TestName`

Code style guidelines
General
- Keep files ASCII unless the project already uses Unicode.
- Prefer small, focused modules over large files.
- Avoid global state; pass explicit dependencies.
- Document non-obvious behavior with short comments only.
- Keep functions under ~50 lines when possible.

Imports and module boundaries
- Use absolute imports if a module system exists.
- Group imports by standard, third-party, local.
- Avoid circular dependencies.
- Keep import lists minimal; remove unused imports.

Formatting
- Use the project formatter if defined; otherwise follow defaults.
- Indent with 2 or 4 spaces consistently (match existing files).
- Use trailing commas in multi-line literals if the language supports it.
- Keep line length near 100 chars unless tooling says otherwise.

Types and data modeling
- Prefer explicit types on public APIs.
- Avoid overly broad types (e.g., any, object) when possible.
- Favor immutable data structures unless mutation is required.
- Use enums/union types for known finite sets.

Naming conventions
- Use descriptive names; avoid abbreviations.
- Functions: verbs (e.g., fetchUser, parseInput).
- Types/classes: nouns (e.g., DownloadTask, ConfigStore).
- Constants: SCREAMING_SNAKE_CASE or project standard.
- File names: kebab-case or project standard.

Error handling
- Fail fast on invalid input.
- Return rich error messages; include context.
- Prefer typed errors/exceptions if the stack supports it.
- Avoid swallowing errors; log or propagate them.

Testing guidelines
- Follow arrange-act-assert structure.
- Keep tests deterministic and isolated.
- Name tests by behavior and expected outcome.
- Use test helpers for repeated setup.

Logging and diagnostics
- Use structured logs where possible.
- Avoid logging secrets or credentials.
- Make logs actionable: include IDs and key parameters.

Security and secrets
- Never hardcode secrets, tokens, or API keys.
- Use env vars or config files ignored by VCS.
- Validate external inputs before use.

Performance
- Avoid O(n^2) in hot paths.
- Cache expensive computations when safe.
- Batch I/O and network calls where possible.

Electron-specific (if applicable)
- Keep heavy work in the main process or background workers.
- Use IPC with explicit channel names and payload schemas.
- Never expose Node APIs directly to the renderer unless required.
- Enable contextIsolation and disable remote module by default.
- Validate all IPC inputs from renderer.

Windows-specific (if applicable)
- Use backslashes for display; normalize paths internally.
- Quote paths with spaces when spawning processes.
- Prefer app data directories for config storage.

Repository hygiene
- Do not modify files unrelated to the task.
- Avoid mass reformatting without explicit request.
- Keep commits scoped and descriptive.

Cursor and Copilot rules
- No `.cursor/rules/` directory found.
- No `.cursorrules` file found.
- No `.github/copilot-instructions.md` file found.

How to update this document
- After adding project files, re-run detection and replace placeholders.
- Keep the command section current with the actual scripts.
- Update style rules to match lint/format config.

Suggested files to add for better guidance
- README.md with build/test instructions
- .editorconfig for formatting rules
- .eslintrc/.prettierrc or equivalent
- CONTRIBUTING.md with workflow details

Change log
- Initial AGENTS.md created for empty repository state.
