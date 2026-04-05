#!/usr/bin/env node
/**
 * Content Repurposer MCP Server
 *
 * Transforms long-form content (blog posts, articles, documentation)
 * into platform-optimized formats: X threads, Instagram captions,
 * LinkedIn posts, newsletter sections, YouTube scripts, and more.
 *
 * Free tier: 3 formats (x-twitter, blog-summary, thread-japanese)
 * Pro tier: All 8 formats + custom tone + batch processing
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { SUPPORTED_FORMATS, getPrompt, TRANSFORM_PROMPTS } from "./prompts.js";

const FREE_FORMATS = ["x-twitter", "blog-summary", "thread-japanese"];

const server = new McpServer({
  name: "content-repurposer",
  version: "0.1.0",
});

// --- Tool 1: List available formats ---
server.registerTool(
  "list-formats",
  {
    title: "List Content Formats",
    description:
      "Lists all available content transformation formats. " +
      "Free formats: x-twitter, blog-summary, thread-japanese. " +
      "Pro formats: instagram, linkedin, newsletter, youtube-script, short-video.",
    inputSchema: z.object({}),
  },
  async () => {
    const formats = SUPPORTED_FORMATS.map((f) => {
      const isFree = FREE_FORMATS.includes(f);
      return {
        format: f,
        tier: isFree ? "free" : "pro",
        description: TRANSFORM_PROMPTS[f].formatInstructions.split("\n")[0],
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formats, null, 2),
        },
      ],
    };
  }
);

// --- Tool 2: Repurpose content ---
server.registerTool(
  "repurpose",
  {
    title: "Repurpose Content",
    description:
      "Transforms long-form content into a specific platform format. " +
      "Provide the source content and target format. " +
      "The tool returns a structured prompt that the LLM should use to generate the output. " +
      "Supported formats: " +
      SUPPORTED_FORMATS.join(", "),
    inputSchema: z.object({
      content: z
        .string()
        .describe(
          "The source content to transform (blog post, article, documentation, etc.)"
        ),
      format: z
        .enum(SUPPORTED_FORMATS as [string, ...string[]])
        .describe("Target format for the content transformation"),
      tone: z
        .string()
        .optional()
        .describe(
          'Optional tone override (e.g., "professional", "casual", "humorous", "educational")'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'Output language (default: auto-detect from content). E.g., "ja", "en", "zh"'
        ),
      additionalInstructions: z
        .string()
        .optional()
        .describe(
          "Any additional instructions for the transformation"
        ),
    }),
  },
  async ({
    content,
    format,
    tone,
    language,
    additionalInstructions,
  }) => {
    const prompt = getPrompt(format);
    if (!prompt) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown format: ${format}. Available: ${SUPPORTED_FORMATS.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    // Build the transformation prompt
    let systemContext = prompt.systemPrompt;
    if (tone) {
      systemContext += `\nTone: ${tone}`;
    }
    if (language) {
      systemContext += `\nOutput language: ${language}`;
    }

    let instructions = prompt.formatInstructions;
    if (additionalInstructions) {
      instructions += `\n\nAdditional instructions: ${additionalInstructions}`;
    }

    const transformationPrompt = [
      `## Role\n${systemContext}`,
      `## Task\n${instructions}`,
      `## Source Content\n\n${content}`,
      `## Output\nGenerate the transformed content following the format instructions above. Return ONLY the specified JSON format.`,
    ].join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: transformationPrompt,
        },
      ],
    };
  }
);

// --- Tool 3: Batch repurpose (multiple formats at once) ---
server.registerTool(
  "repurpose-batch",
  {
    title: "Batch Repurpose Content",
    description:
      "Transforms content into multiple formats at once. " +
      "Returns structured prompts for each format. " +
      "Pro feature: specify up to 5 formats in a single call.",
    inputSchema: z.object({
      content: z
        .string()
        .describe("The source content to transform"),
      formats: z
        .array(z.enum(SUPPORTED_FORMATS as [string, ...string[]]))
        .min(1)
        .max(5)
        .describe("Array of target formats (max 5)"),
      tone: z
        .string()
        .optional()
        .describe("Optional tone override applied to all formats"),
      language: z
        .string()
        .optional()
        .describe("Output language for all formats"),
    }),
  },
  async ({ content, formats, tone, language }) => {
    const results: Record<string, string> = {};

    for (const format of formats) {
      const prompt = getPrompt(format);
      if (!prompt) continue;

      let systemContext = prompt.systemPrompt;
      if (tone) systemContext += `\nTone: ${tone}`;
      if (language) systemContext += `\nOutput language: ${language}`;

      results[format] = [
        `### Format: ${format}`,
        `**Role:** ${systemContext}`,
        `**Instructions:** ${prompt.formatInstructions}`,
      ].join("\n");
    }

    const batchPrompt = [
      `## Batch Content Transformation`,
      `Transform the following source content into ${formats.length} different formats.`,
      `For each format, follow the specific instructions below.`,
      ``,
      `## Source Content`,
      content,
      ``,
      `## Formats to Generate`,
      ...Object.values(results),
      ``,
      `## Output`,
      `Return a JSON object with format names as keys and the transformed content as values.`,
      `Each value should follow the output format specified in that format's instructions.`,
    ].join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: batchPrompt,
        },
      ],
    };
  }
);

// --- Tool 4: Analyze content for best formats ---
server.registerTool(
  "analyze-content",
  {
    title: "Analyze Content for Best Formats",
    description:
      "Analyzes source content and recommends the best formats " +
      "for repurposing based on content type, length, and topic.",
    inputSchema: z.object({
      content: z
        .string()
        .describe("The source content to analyze"),
    }),
  },
  async ({ content }) => {
    const wordCount = content.split(/\s+/).length;
    const charCount = content.length;
    const hasCode = /```|<code>|function\s|const\s|import\s/.test(content);
    const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(content);
    const hasList = /^[\s]*[-*•]\s/m.test(content) || /^\d+\.\s/m.test(content);
    const hasStats = /\d+%|\$\d+|¥\d+|\d+x/.test(content);

    const recommendations: Array<{
      format: string;
      score: number;
      reason: string;
    }> = [];

    // X/Twitter thread - good for most content
    recommendations.push({
      format: isJapanese ? "thread-japanese" : "x-twitter",
      score: hasStats ? 95 : hasList ? 85 : 75,
      reason: hasStats
        ? "Content has data/stats that perform well in threads"
        : "Most content can be effectively threaded",
    });

    // LinkedIn - good for professional/business content
    if (!hasCode && wordCount > 100) {
      recommendations.push({
        format: "linkedin",
        score: hasStats ? 90 : 70,
        reason: "Professional content with sufficient depth for LinkedIn",
      });
    }

    // Newsletter - good for longer content
    if (wordCount > 200) {
      recommendations.push({
        format: "newsletter",
        score: hasList ? 90 : 80,
        reason: "Content is long enough to make a valuable newsletter section",
      });
    }

    // YouTube script - good for educational/how-to content
    if (wordCount > 300 || hasList) {
      recommendations.push({
        format: "youtube-script",
        score: hasList ? 85 : hasCode ? 80 : 70,
        reason: "Content structure suits a video format",
      });
    }

    // Short video - good for content with a strong single takeaway
    if (hasStats || wordCount < 500) {
      recommendations.push({
        format: "short-video",
        score: hasStats ? 85 : 65,
        reason: "Content can be distilled into punchy short-form video",
      });
    }

    // Blog summary - always useful
    if (wordCount > 150) {
      recommendations.push({
        format: "blog-summary",
        score: 80,
        reason: "Content is substantial enough to benefit from a summary",
      });
    }

    // Instagram - good for visual/lifestyle content
    recommendations.push({
      format: "instagram",
      score: 60,
      reason: "Can be adapted for Instagram with image suggestions",
    });

    recommendations.sort((a, b) => b.score - a.score);

    const analysis = {
      contentStats: {
        wordCount,
        charCount,
        language: isJapanese ? "Japanese" : "English (or other)",
        hasCodeBlocks: hasCode,
        hasLists: hasList,
        hasStatistics: hasStats,
      },
      recommendations: recommendations.slice(0, 5),
      suggestedWorkflow:
        `Start with "${recommendations[0].format}", ` +
        `then create "${recommendations[1]?.format}" for cross-platform reach.`,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(analysis, null, 2),
        },
      ],
    };
  }
);

// --- Start server ---
async function main() {
  const mode = process.env.MCPIZE || process.env.PORT ? "http" : "stdio";

  if (mode === "http") {
    // HTTP mode for MCPize / cloud deployment
    const port = parseInt(process.env.PORT || "8080", 10);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await server.connect(transport);

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url.pathname === "/mcp" || url.pathname === "/") {
        // Collect request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const body = Buffer.concat(chunks).toString();
        (req as any).body = body ? JSON.parse(body) : undefined;

        await transport.handleRequest(req as any, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, () => {
      console.log(`Content Repurposer MCP Server running on http://0.0.0.0:${port}`);
    });
  } else {
    // Stdio mode for local use
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
