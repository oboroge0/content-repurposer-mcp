# Content Repurposer MCP Server

Transform long-form content into platform-optimized formats with a single command.

## Features

- **8 output formats**: X threads, Instagram captions, LinkedIn posts, newsletters, YouTube scripts, short-form video scripts, blog summaries, and Japanese X threads
- **Smart analysis**: Automatically recommends the best formats for your content
- **Batch processing**: Transform into multiple formats at once
- **Customizable**: Adjust tone, language, and add custom instructions

## Installation

```bash
npm install @moneypj/mcp-content-repurposer
```

## Usage with Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "content-repurposer": {
      "command": "npx",
      "args": ["@moneypj/mcp-content-repurposer"]
    }
  }
}
```

## Available Tools

### `list-formats`
Lists all available transformation formats with descriptions.

### `repurpose`
Transforms content into a specific format.

```
Input: Blog post about AI trends
Format: x-twitter
Output: Engaging X thread (3-7 posts)
```

### `repurpose-batch`
Transforms content into multiple formats at once (up to 5).

### `analyze-content`
Analyzes your content and recommends the best formats for repurposing.

## Formats

| Format | Description | Tier |
|--------|-------------|------|
| `x-twitter` | X/Twitter thread (3-7 posts) | Free |
| `blog-summary` | Structured summary with key takeaways | Free |
| `thread-japanese` | Japanese X thread | Free |
| `instagram` | Instagram caption with hashtags | Pro |
| `linkedin` | LinkedIn thought leadership post | Pro |
| `newsletter` | Email newsletter section | Pro |
| `youtube-script` | YouTube video script with visual cues | Pro |
| `short-video` | TikTok/Reels/Shorts scripts | Pro |

## License

MIT
