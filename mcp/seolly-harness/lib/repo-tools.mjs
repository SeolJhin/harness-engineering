import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SEARCH_FILE_EXTENSIONS = new Set(['.md', '.js', '.json', '.toml', '.yaml', '.yml']);

export function resolveRepoRoot(repoRoot) {
  const resolved = path.resolve(repoRoot);
  const packageJsonPath = path.join(resolved, 'package.json');

  if (!fs.existsSync(resolved)) {
    throw new Error(`Repository root does not exist: ${resolved}`);
  }

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Repository root is missing package.json: ${resolved}`);
  }

  return resolved;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? readText(filePath) : null;
}

function safeParseJson(text) {
  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function listEntries(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true });
}

function walkFiles(dirPath, visitor) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else if (entry.isFile()) {
        visitor(nextPath);
      }
    }
  }
}

function countFiles(dirPath, matcher = () => true) {
  let count = 0;
  walkFiles(dirPath, filePath => {
    if (matcher(filePath)) {
      count += 1;
    }
  });
  return count;
}

function firstHeading(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return {};
  }

  const endIndex = markdown.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return {};
  }

  const block = markdown.slice(4, endIndex).trim();
  const metadata = {};

  for (const line of block.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    metadata[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }

  return metadata;
}

function summarizeText(text, maxLength = 220) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function buildSnippet(text, query, maxLength = 220) {
  const compact = text.replace(/\s+/g, ' ').trim();
  const normalizedQuery = query.toLowerCase();
  const matchIndex = compact.toLowerCase().indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return summarizeText(compact, maxLength);
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(compact.length, matchIndex + normalizedQuery.length + 120);
  const snippet = compact.slice(start, end).trim();

  return `${start > 0 ? '...' : ''}${snippet}${end < compact.length ? '...' : ''}`;
}

function scoreWorkflowMatch(relativePath, text, query) {
  const normalizedQuery = query.toLowerCase();
  const haystack = `${relativePath}\n${text}`.toLowerCase();
  let score = 0;
  let searchFrom = 0;

  while (true) {
    const nextIndex = haystack.indexOf(normalizedQuery, searchFrom);
    if (nextIndex === -1) {
      break;
    }

    score += 1;
    searchFrom = nextIndex + normalizedQuery.length;
  }

  if (relativePath.startsWith('skills/')) {
    score += 3;
  } else if (relativePath.startsWith('commands/')) {
    score += 2;
  } else if (relativePath.startsWith('agents/')) {
    score += 2;
  } else if (relativePath.startsWith('docs/')) {
    score += 1;
  }

  if (path.basename(relativePath).toLowerCase().includes(normalizedQuery)) {
    score += 2;
  }

  return score;
}

function normalizeSkillName(skillName) {
  return String(skillName || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/');
}

function getSkillFiles(repoRoot) {
  return listEntries(path.join(repoRoot, 'skills'))
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const skillDir = path.join(repoRoot, 'skills', entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');
      return fs.existsSync(skillFile) ? skillFile : null;
    })
    .filter(Boolean);
}

function getAgentFiles(repoRoot) {
  return listEntries(path.join(repoRoot, 'agents'))
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => path.join(repoRoot, 'agents', entry.name));
}

function getCommandFiles(repoRoot) {
  return listEntries(path.join(repoRoot, 'commands'))
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => path.join(repoRoot, 'commands', entry.name));
}

function resolveDeclaredName(markdown, fallbackName) {
  const metadata = parseFrontmatter(markdown);
  return metadata.name || fallbackName;
}

export function getRepoSurfaceSummary(repoRoot, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const includeHidden = Boolean(options.includeHidden);
  const topLevelEntries = listEntries(resolvedRoot)
    .filter(entry => includeHidden || !entry.name.startsWith('.'))
    .filter(entry => !['node_modules'].includes(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  const directories = topLevelEntries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  const files = topLevelEntries.filter(entry => entry.isFile()).map(entry => entry.name);

  const counts = {
    agents: countFiles(path.join(resolvedRoot, 'agents'), filePath => filePath.endsWith('.md')),
    skills: getSkillFiles(resolvedRoot).length,
    commands: countFiles(path.join(resolvedRoot, 'commands'), filePath => filePath.endsWith('.md')),
    hooks: countFiles(path.join(resolvedRoot, 'scripts', 'hooks'), filePath => filePath.endsWith('.js')),
    docs: countFiles(path.join(resolvedRoot, 'docs'), filePath => filePath.endsWith('.md')),
    tests: countFiles(path.join(resolvedRoot, 'tests'), filePath => filePath.endsWith('.js') || filePath.endsWith('.py')),
    mcpConfigs: countFiles(path.join(resolvedRoot, 'mcp-configs'), filePath => filePath.endsWith('.json')),
  };

  return {
    repoName: path.basename(resolvedRoot),
    repoRoot: resolvedRoot,
    topLevel: {
      directoryCount: directories.length,
      fileCount: files.length,
      directories: directories.slice(0, 25),
      files: files.slice(0, 25),
    },
    keyFiles: ['AGENTS.md', 'README.md', '.mcp.json'].filter(fileName =>
      fs.existsSync(path.join(resolvedRoot, fileName)),
    ),
    counts,
    highlights: [
      'skills/ is the canonical workflow surface',
      'mcp-configs/ and .mcp.json define MCP integrations',
      'scripts/harness-audit.js is the main harness scoring entrypoint',
    ],
  };
}

export function listSkills(repoRoot, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const normalizedQuery = normalizeSkillName(options.query);
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);

  const results = getSkillFiles(resolvedRoot)
    .map(skillFile => {
      const text = readText(skillFile);
      const metadata = parseFrontmatter(text);
      const directory = path.basename(path.dirname(skillFile));
      return {
        id: directory,
        name: metadata.name || directory,
        description: metadata.description || '',
        origin: metadata.origin || null,
        title: firstHeading(text),
        path: path.relative(resolvedRoot, skillFile).split(path.sep).join('/'),
      };
    })
    .filter(skill => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${skill.id}\n${skill.name}\n${skill.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, limit);

  return {
    query: options.query || null,
    totalMatches: results.length,
    skills: results,
  };
}

export function listAgents(repoRoot, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const normalizedQuery = normalizeSkillName(options.query);
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);

  const results = getAgentFiles(resolvedRoot)
    .map(agentFile => {
      const text = readText(agentFile);
      const metadata = parseFrontmatter(text);
      const id = path.basename(agentFile, '.md');
      return {
        id,
        name: resolveDeclaredName(text, id),
        description: metadata.description || '',
        title: firstHeading(text),
        path: path.relative(resolvedRoot, agentFile).split(path.sep).join('/'),
      };
    })
    .filter(agent => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${agent.id}\n${agent.name}\n${agent.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, limit);

  return {
    query: options.query || null,
    totalMatches: results.length,
    agents: results,
  };
}

export function readSkill(repoRoot, skillName, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const normalizedSkill = normalizeSkillName(skillName);
  if (!normalizedSkill) {
    throw new Error('skillName is required');
  }

  const skillFile = getSkillFiles(resolvedRoot).find(filePath => {
    const text = readText(filePath);
    const metadata = parseFrontmatter(text);
    const directory = path.basename(path.dirname(filePath)).toLowerCase();
    const declaredName = String(metadata.name || '').toLowerCase();
    return directory === normalizedSkill || declaredName === normalizedSkill;
  });

  if (!skillFile) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const text = readText(skillFile);
  const metadata = parseFrontmatter(text);
  const excerptLineCount = Math.min(Math.max(Number(options.excerptLines || 60), 10), 160);
  const excerpt = text.split('\n').slice(0, excerptLineCount).join('\n').trim();

  return {
    id: path.basename(path.dirname(skillFile)),
    name: metadata.name || path.basename(path.dirname(skillFile)),
    description: metadata.description || '',
    origin: metadata.origin || null,
    title: firstHeading(text),
    path: path.relative(resolvedRoot, skillFile).split(path.sep).join('/'),
    excerpt,
  };
}

export function readCommand(repoRoot, commandName, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const normalizedCommand = normalizeSkillName(commandName);
  if (!normalizedCommand) {
    throw new Error('commandName is required');
  }

  const commandFile = getCommandFiles(resolvedRoot).find(filePath => {
    const text = readText(filePath);
    const declaredName = String(parseFrontmatter(text).name || '').toLowerCase();
    const id = path.basename(filePath, '.md').toLowerCase();
    return id === normalizedCommand || declaredName === normalizedCommand;
  });

  if (!commandFile) {
    throw new Error(`Command not found: ${commandName}`);
  }

  const text = readText(commandFile);
  const metadata = parseFrontmatter(text);
  const excerptLineCount = Math.min(Math.max(Number(options.excerptLines || 60), 10), 160);
  const excerpt = text.split('\n').slice(0, excerptLineCount).join('\n').trim();

  return {
    id: path.basename(commandFile, '.md'),
    name: metadata.name || path.basename(commandFile, '.md'),
    description: metadata.description || '',
    title: firstHeading(text),
    path: path.relative(resolvedRoot, commandFile).split(path.sep).join('/'),
    excerpt,
  };
}

export function listMcpConfigs(repoRoot) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const projectConfigPath = path.join(resolvedRoot, '.mcp.json');
  const bundledConfigPath = path.join(resolvedRoot, 'mcp-configs', 'mcp-servers.json');
  const projectConfig = safeParseJson(readIfExists(projectConfigPath) || '');
  const bundledConfig = safeParseJson(readIfExists(bundledConfigPath) || '');

  const projectServers = Object.entries(projectConfig?.mcpServers || {}).map(([name, config]) => ({
    name,
    transport: config.type || 'stdio',
    command: config.command || null,
    url: config.url || null,
    source: '.mcp.json',
  }));

  const bundledServers = Object.entries(bundledConfig?.mcpServers || {}).map(([name, config]) => ({
    name,
    transport: config.type || 'stdio',
    command: config.command || null,
    url: config.url || null,
    source: 'mcp-configs/mcp-servers.json',
  }));

  return {
    projectServerCount: projectServers.length,
    bundledServerCount: bundledServers.length,
    projectServers,
    bundledServers,
  };
}

export function findRelevantWorkflows(repoRoot, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const query = String(options.query || '').trim();
  if (!query) {
    throw new Error('query is required');
  }

  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 25);
  const includeDocs = options.includeDocs !== false;
  const candidatePaths = [
    path.join(resolvedRoot, 'skills'),
    path.join(resolvedRoot, 'commands'),
    path.join(resolvedRoot, 'agents'),
  ];

  if (includeDocs) {
    candidatePaths.push(path.join(resolvedRoot, 'docs'));
  }

  const rootFiles = ['AGENTS.md', 'README.md', '.mcp.json']
    .map(fileName => path.join(resolvedRoot, fileName))
    .filter(filePath => fs.existsSync(filePath));

  const results = [];
  for (const rootFile of rootFiles) {
    const relativePath = path.relative(resolvedRoot, rootFile).split(path.sep).join('/');
    const text = readText(rootFile);
    const score = scoreWorkflowMatch(relativePath, text, query);
    if (score > 0) {
      results.push({
        kind: 'root-file',
        id: path.basename(rootFile),
        path: relativePath,
        title: firstHeading(text) || path.basename(rootFile),
        score,
        snippet: buildSnippet(text, query),
      });
    }
  }

  for (const candidatePath of candidatePaths) {
    walkFiles(candidatePath, filePath => {
      if (!SEARCH_FILE_EXTENSIONS.has(path.extname(filePath))) {
        return;
      }

      const relativePath = path.relative(resolvedRoot, filePath).split(path.sep).join('/');
      const text = readText(filePath);
      const score = scoreWorkflowMatch(relativePath, text, query);
      if (score <= 0) {
        return;
      }

      results.push({
        kind: relativePath.split('/')[0].replace(/s$/, ''),
        id: path.basename(path.dirname(filePath)) === 'skills'
          ? path.basename(filePath, path.extname(filePath))
          : path.basename(filePath, path.extname(filePath)),
        path: relativePath,
        title: firstHeading(text) || path.basename(filePath),
        score,
        snippet: buildSnippet(text, query),
      });
    });
  }

  results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  return {
    query,
    totalMatches: results.length,
    matches: results.slice(0, limit),
  };
}

export async function runHarnessAudit(repoRoot, options = {}) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const scope = String(options.scope || 'repo').toLowerCase();
  const commandArgs = [
    path.join(resolvedRoot, 'scripts', 'harness-audit.js'),
    '--format',
    'json',
    '--scope',
    scope,
    '--root',
    resolvedRoot,
  ];

  const { stdout, stderr } = await execFileAsync(process.execPath, commandArgs, {
    cwd: resolvedRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr && stderr.trim()) {
    throw new Error(stderr.trim());
  }

  const payload = JSON.parse(stdout);
  if (options.topActionsOnly === true) {
    return {
      scope: payload.scope,
      overall_score: payload.overall_score,
      max_score: payload.max_score,
      target_mode: payload.target_mode,
      top_actions: payload.top_actions,
    };
  }

  return payload;
}

export function getRepoFileRole(repoRoot, relativePath) {
  const resolvedRoot = resolveRepoRoot(repoRoot);
  const absolutePath = path.join(resolvedRoot, relativePath);
  const text = readIfExists(absolutePath);

  if (text == null) {
    throw new Error(`File not found: ${relativePath}`);
  }

  return {
    path: relativePath,
    title: firstHeading(text),
    summary: summarizeText(text, 180),
  };
}
