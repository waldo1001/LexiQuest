# Plan — Phase 12 Slice 1: ClaudeClient seam

## Task
Create the ClaudeClient seam: interface + real wrapper + fake + tests.
Install @anthropic-ai/sdk. Add ANTHROPIC_API_KEY placeholder to
local.settings.json.example.

## Files
- `api/src/shared/claude.ts` — interface + AnthropicClaudeClient (real)
- `api/src/shared/claude.test.ts` — unit tests for markdown-fence stripping,
  JSON parse, error paths (no real API calls)
- `api/testing/fake-claude-client.ts` — FakeClaudeClient
- `api/local.settings.json.example` — add ANTHROPIC_API_KEY placeholder
- `api/package.json` — @anthropic-ai/sdk already installed

## RED test list
- AC1: stripFences removes ```json...``` wrapper
- AC2: stripFences is no-op when no fences
- AC3: parseCards returns CardCandidate[] on valid JSON
- AC4: parseCards throws ClaudeJsonParseError on invalid JSON
- AC5: parseCards throws ClaudeJsonParseError on wrong shape (not array)
- AC6: FakeClaudeClient.extractCards returns canned output
- AC7: FakeClaudeClient.extractCards can throw simulated error
- AC8: FakeClaudeClient.enrichDistractors returns canned output
