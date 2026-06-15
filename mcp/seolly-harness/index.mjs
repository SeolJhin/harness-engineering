import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  findRelevantWorkflows,
  getRepoSurfaceSummary,
  listAgents,
  listMcpConfigs,
  listSkills,
  readCommand,
  readSkill,
  resolveRepoRoot,
  runHarnessAudit,
} from './lib/repo-tools.mjs';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(serverDir, '..', '..');
const repoRoot = resolveRepoRoot(process.env.SEOLLY_HARNESS_ROOT || process.env.HE_HARNESS_ROOT || defaultRepoRoot);

const server = new McpServer({
  name: 'seolly-harness',
  version: '0.1.0',
});

function toText(payload) {
  return JSON.stringify(payload, null, 2);
}

function ok(payload, summary) {
  return {
    content: [
      {
        type: 'text',
        text: summary ? `${summary}\n\n${toText(payload)}` : toText(payload),
      },
    ],
    structuredContent: payload,
  };
}

function failure(error) {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

server.registerTool(
  'repo_surface_summary',
  {
    title: 'Repo Surface Summary',
    description: 'Summarize the harness-engineering repository surface and key workflow areas.',
    inputSchema: {
      includeHidden: z.boolean().optional(),
    },
  },
  async ({ includeHidden }) => {
    try {
      const payload = getRepoSurfaceSummary(repoRoot, { includeHidden });
      return ok(payload, `Summarized ${payload.repoName} at ${payload.repoRoot}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'list_skills',
  {
    title: 'List Skills',
    description: 'List available ECC skills, optionally filtered by a keyword.',
    inputSchema: {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ query, limit }) => {
    try {
      const payload = listSkills(repoRoot, { query, limit });
      return ok(payload, `Found ${payload.totalMatches} matching skills`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'list_agents',
  {
    title: 'List Agents',
    description: 'List available ECC agents, optionally filtered by a keyword.',
    inputSchema: {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ query, limit }) => {
    try {
      const payload = listAgents(repoRoot, { query, limit });
      return ok(payload, `Found ${payload.totalMatches} matching agents`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'read_skill',
  {
    title: 'Read Skill',
    description: 'Read a specific skill definition by directory name or declared skill name.',
    inputSchema: {
      skillName: z.string(),
      excerptLines: z.number().int().min(10).max(160).optional(),
    },
  },
  async ({ skillName, excerptLines }) => {
    try {
      const payload = readSkill(repoRoot, skillName, { excerptLines });
      return ok(payload, `Loaded skill ${payload.name}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'read_command',
  {
    title: 'Read Command',
    description: 'Read a specific legacy command document by file name or declared command name.',
    inputSchema: {
      commandName: z.string(),
      excerptLines: z.number().int().min(10).max(160).optional(),
    },
  },
  async ({ commandName, excerptLines }) => {
    try {
      const payload = readCommand(repoRoot, commandName, { excerptLines });
      return ok(payload, `Loaded command ${payload.name}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'find_relevant_workflows',
  {
    title: 'Find Relevant Workflows',
    description: 'Search skills, commands, agents, and docs for workflows related to a query.',
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(25).optional(),
      includeDocs: z.boolean().optional(),
    },
  },
  async ({ query, limit, includeDocs }) => {
    try {
      const payload = findRelevantWorkflows(repoRoot, { query, limit, includeDocs });
      return ok(payload, `Found ${payload.totalMatches} workflow matches`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'run_harness_audit',
  {
    title: 'Run Harness Audit',
    description: 'Run the repository harness audit and return either the top actions or the full JSON payload.',
    inputSchema: {
      scope: z.enum(['repo', 'hooks', 'skills', 'commands', 'agents']).optional(),
      topActionsOnly: z.boolean().optional(),
    },
  },
  async ({ scope, topActionsOnly }) => {
    try {
      const payload = await runHarnessAudit(repoRoot, { scope, topActionsOnly });
      return ok(payload, `Harness audit score ${payload.overall_score}/${payload.max_score}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'list_mcp_configs',
  {
    title: 'List MCP Configs',
    description: 'List project-scoped and bundled MCP server definitions from this repository.',
    inputSchema: {},
  },
  async () => {
    try {
      const payload = listMcpConfigs(repoRoot);
      return ok(
        payload,
        `Loaded ${payload.projectServerCount} project MCP servers and ${payload.bundledServerCount} bundled MCP servers`,
      );
    } catch (error) {
      return failure(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[seolly-harness] MCP server ready for ${repoRoot}`);
}

main().catch(error => {
  console.error(`[seolly-harness] Fatal error: ${error.message}`);
  process.exit(1);
});
