# @tokenring-ai/github

GitHub repository search and documentation retrieval for Token Ring.

## Overview

The `@tokenring-ai/github` package provides comprehensive GitHub API integration for the Token Ring AI ecosystem. It enables agents and users to search repositories, retrieve documentation, and fetch files from GitHub repositories through a configurable service with both tool-based and command-line interfaces.

This package integrates seamlessly with the Token Ring framework through its plugin system, offering:

- **GitHubService** for authenticated GitHub API access with configurable base URL and token support
- **Three AI tools** for agent-driven repository search, documentation retrieval, and file retrieval
- **Three agent commands** for interactive CLI-based operations
- **Stateless design** with no persistent state requirements

## Installation

```bash
bun add @tokenring-ai/github
```

## Dependencies

- `@tokenring-ai/agent` - For agent integration and service management
- `@tokenring-ai/app` - For plugin architecture and service registration
- `@tokenring-ai/chat` - For tool registration and chat integration
- `@tokenring-ai/utility` - For HTTP service base class and utilities
- `zod` - For configuration schema validation

## Features

- **Repository Search**: Search GitHub repositories by keyword with sorting by stars or updated date
- **Documentation Retrieval**: Automatically fetch and rank documentation files (README.md, docs/*.md, etc.)
- **File Retrieval**: Get individual files from repositories with support for branches, tags, and commits
- **Configurable API**: Support for custom GitHub Enterprise URLs and authentication tokens
- **Rate Limit Handling**: Built-in HTTP service with error handling and retry capabilities

## Core Components

### GitHubService

The main service class that extends `HttpService` and implements `TokenRingService`.

**Constructor:**

```typescript
constructor(options: {
  baseUrl: string;        // GitHub API base URL (default: https://api.github.com)
  token?: string;         // Optional authentication token
  userAgent: string;      // User-Agent header (default: TokenRing/0.2.0)
})

class GitHubService extends HttpService implements TokenRingService {
  readonly name = "GitHubService";
  readonly description = "Search GitHub repositories and retrieve repository documentation and files";
```

**Methods:**

#### `searchRepositories(query, options)`

Search GitHub repositories by keyword.

**Parameters:**

- `query` (string): Search query string
- `options` (object, optional):
  - `limit` (number): Maximum results (default: 10, max: 50)
  - `sort` (string): Sort field - "stars" or "updated"
  - `order` (string): Sort order - "asc" or "desc"

**Returns:** `Promise<GitHubRepoSearchResult[]>`

**Example:**

```typescript
const github = new GitHubService({baseUrl: "https://api.github.com"});
const results = await github.searchRepositories("token ring", {
  limit: 10,
  sort: "stars",
  order: "desc"
});

results.forEach(repo => {
  console.log(`${repo.full_name}: ${repo.stargazers_count} stars`);
});
```

#### `getRepository(owner, repo)`

Get detailed information about a specific repository.

**Parameters:**

- `owner` (string): Repository owner or organization
- `repo` (string): Repository name

**Returns:** `Promise<GitHubRepository>`

#### `getFile(owner, repo, path, ref)`

Retrieve a file from a repository.

**Parameters:**

- `owner` (string): Repository owner or organization
- `repo` (string): Repository name
- `path` (string): Path to the file within the repository
- `ref` (string, optional): Branch, tag, or commit SHA

**Returns:** `Promise<{path: string; content: string; sha: string; size: number}>`

**Throws:** Error if path is not a file or if base64 encoding fails

#### `getRepositoryDocumentation(owner, repo, options)`

Retrieve key documentation files from a repository.

**Parameters:**

- `owner` (string): Repository owner or organization
- `repo` (string): Repository name
- `options` (object, optional):
  - `ref` (string): Branch, tag, or commit SHA (uses default branch if not specified)
  - `maxFiles` (number): Maximum files to retrieve (default: 5, max: 10)

**Returns:** `Promise<{repository: string; branch: string; files: Array<{path: string; size: number; content: string}>}>`

**Documentation File Ranking:**

Files are ranked by importance:

1. `README.md` or `README.mdx`
2. `docs/README.md` or `docs/README.mdx`
3. `docs/index.md` or `docs/index.mdx`
4. Other files in `docs/` directory
5. Any `.md` or `.mdx` files

### Configuration Schema

```typescript
const GitHubConfigSchema = z.object({
  baseUrl: z.string().default("https://api.github.com"),
  token: z.string().optional(),
  userAgent: z.string().default("TokenRing/0.2.0"),
});
```

## Usage Examples

### Plugin Installation

Install the plugin in your TokenRing application:

```typescript
import {App} from "@tokenring-ai/app";
import githubPlugin from "@tokenring-ai/github/plugin";

const app = new App();

await app.install(githubPlugin, {
  github: {
    baseUrl: "https://api.github.com",
    token: process.env.GITHUB_TOKEN,  // Optional for private repos
    userAgent: "TokenRing/0.2.0"
  }
});
```

### Programmatic Service Usage

```typescript
import {App} from "@tokenring-ai/app";
import GitHubService, {GitHubConfigSchema} from "@tokenring-ai/github";
import {z} from "zod";

const app = new App();

// Register service directly
const githubService = new GitHubService({
  baseUrl: "https://api.github.com",
  token: process.env.GITHUB_TOKEN,
  userAgent: "TokenRing/0.2.0"
});
app.addServices(githubService);

// Use in agent
const agent = await app.createAgent();
const github = agent.requireServiceByType(GitHubService);

// Search repositories
const results = await github.searchRepositories("token ring", {limit: 10});

// Get documentation
const docs = await github.getRepositoryDocumentation("vercel", "ai", {maxFiles: 5});

// Get file
const file = await github.getFile("vercel", "ai", "README.md");
```

### AI Tool Usage

The package provides three tools for AI agents:

#### `github_searchRepositories`

**Description:** Search GitHub repositories by keyword

**Input Schema:**

```typescript
{
  query: string.min(1).describe("GitHub repository search query"),
  limit: number.int().positive().max(50).default(10).optional(),
  sort: enum(["stars", "updated"]).optional(),
  order: enum(["asc", "desc"]).optional()
}
```

**Example Output:**

```
Repository search results for "token ring":

| Repository | Stars | Language | Description |
|------------|-------|----------|-------------|
| tokenring-ai/core | 150 | TypeScript | Token Ring core |
| tokenring-ai/writer | 120 | TypeScript | Token Ring writer |
```

#### `github_getRepoDocumentation`

**Description:** Retrieve key documentation files for a GitHub repository

**Input Schema:**

```typescript
{
  owner: string.min(1).describe("GitHub repository owner or org"),
  repo: string.min(1).describe("GitHub repository name"),
  ref: string.optional().describe("Optional branch, tag, or commit"),
  maxFiles: number.int().positive().max(10).default(5).optional()
}
```

**Example Output:**

```
## README.md

```md
# Vercel AI SDK

The AI SDK provides utilities for building AI applications...
```

## docs/getting-started.md

```md
# Getting Started

Install the AI SDK...
```
```

#### `github_getRepoFile`

**Description:** Retrieve a file from a GitHub repository

**Input Schema:**

```typescript
{
  owner: string.min(1).describe("GitHub repository owner or org"),
  repo: string.min(1).describe("GitHub repository name"),
  path: string.min(1).describe("Path to the file inside the repository"),
  ref: string.optional().describe("Optional branch, tag, or commit")
}
```

**Example Output:**

```
Path: README.md
SHA: abc123def456
Size: 2048

# Vercel AI SDK

The AI SDK provides utilities for building AI applications...
```

## Agent Commands

### `/github search <query>`

Search GitHub repositories by keyword.

**Example:**

```
/github search token ring
```

**Output:**

```
GitHub repositories for "token ring":

| Repository | Stars | Language | Description |
|------------|-------|----------|-------------|
| tokenring-ai/core | 150 | TypeScript | Token Ring core |
| tokenring-ai/writer | 120 | TypeScript | Token Ring writer |
```

### `/github docs <owner>/<repo>`

Retrieve the main documentation files for a GitHub repository.

**Example:**

```
/github docs vercel/ai
```

**Output:**

```
## README.md

# Vercel AI SDK

The AI SDK provides utilities for building AI applications...

## docs/getting-started.md

# Getting Started

Install the AI SDK...
```

### `/github file <owner>/<repo> <path> [ref]`

Retrieve a file from a GitHub repository.

**Examples:**

```
/github file vercel/ai README.md
/github file vercel/ai packages/core/package.json main
```

**Output:**

```
Path: README.md
SHA: abc123def456
Size: 2048

# Vercel AI SDK

The AI SDK provides utilities for building AI applications...
```

## Integration

### Plugin Registration

The package exports a plugin that automatically registers:

1. `GitHubService` with the app
2. Three tools with the `ChatService`
3. Three commands with the `AgentCommandService`

```typescript
import githubPlugin from "@tokenring-ai/github/plugin";

await app.install(githubPlugin, {
  github: {
    baseUrl: "https://api.github.com",
    token: process.env.GITHUB_TOKEN
  }
});
```

### Service Registration

You can also register the service directly:

```typescript
import GitHubService from "@tokenring-ai/github";

const githubService = new GitHubService({
  baseUrl: "https://api.github.com",
  token: process.env.GITHUB_TOKEN
});
app.addServices(githubService);

// Then register tools and commands manually
import tools from "@tokenring-ai/github/tools";
import commands from "@tokenring-ai/github/commands";

app.waitForService(ChatService, chat => chat.addTools(tools));
app.waitForService(AgentCommandService, agent => agent.addAgentCommands(commands));
```

## State Management

This package is **stateless** and does not require state persistence. All operations are performed against the GitHub API with no local state maintenance.

## Error Handling

The service uses the `HttpService` base class which provides:

- Automatic error handling for HTTP requests
- JSON response parsing with type safety
- Descriptive error messages with context
- Support for GitHub API rate limiting and authentication errors

Example error handling:

```typescript
try {
  const results = await github.searchRepositories("invalid query");
} catch (error) {
  if (error instanceof Error) {
    console.error("GitHub API error:", error.message);
  }
}
```

## Testing

Run tests:

```bash
bun test
```

Run tests in watch mode:

```bash
bun test:watch
```

Generate coverage:

```bash
bun test:coverage
```

## License

MIT License - see LICENSE file for details.
