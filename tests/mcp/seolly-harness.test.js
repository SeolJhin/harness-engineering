/**
 * Tests for mcp/seolly-harness helper functions.
 */

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..', '..');
const modulePath = path.join(repoRoot, 'mcp', 'seolly-harness', 'lib', 'repo-tools.mjs');

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  PASS ${name}`);
      return true;
    })
    .catch(error => {
      console.log(`  FAIL ${name}`);
      console.log(`    Error: ${error.message}`);
      return false;
    });
}

async function loadModule() {
  return import(pathToFileURL(modulePath).href);
}

async function runTests() {
  console.log('\n=== Testing seolly-harness helpers ===\n');

  const helpers = await loadModule();
  let passed = 0;
  let failed = 0;

  if (await test('repo surface summary reports the repository identity', async () => {
    const summary = helpers.getRepoSurfaceSummary(repoRoot);
    assert.strictEqual(summary.repoName, 'harness-engineering');
    assert.ok(summary.counts.skills > 50, 'Expected many skills in the repository');
    assert.ok(summary.keyFiles.includes('AGENTS.md'));
  })) passed++; else failed++;

  if (await test('listSkills can filter down to a specific skill family', async () => {
    const payload = helpers.listSkills(repoRoot, { query: 'documentation', limit: 10 });
    assert.ok(payload.totalMatches >= 1, 'Expected at least one matching skill');
    assert.ok(payload.skills.some(skill => skill.id === 'documentation-lookup'));
  })) passed++; else failed++;

  if (await test('listAgents can find architecture-oriented agents', async () => {
    const payload = helpers.listAgents(repoRoot, { query: 'architect', limit: 10 });
    assert.ok(payload.totalMatches >= 1, 'Expected at least one matching agent');
    assert.ok(payload.agents.some(agent => agent.id === 'architect'));
  })) passed++; else failed++;

  if (await test('readSkill returns the requested skill excerpt', async () => {
    const skill = helpers.readSkill(repoRoot, 'documentation-lookup', { excerptLines: 20 });
    assert.strictEqual(skill.id, 'documentation-lookup');
    assert.match(skill.excerpt, /Context7/i);
  })) passed++; else failed++;

  if (await test('findRelevantWorkflows ranks skill matches for an MCP query', async () => {
    const payload = helpers.findRelevantWorkflows(repoRoot, { query: 'MCP server', limit: 10, includeDocs: true });
    assert.ok(payload.totalMatches >= 1, 'Expected relevant workflow matches');
    assert.ok(payload.matches.some(match => match.path.includes('skills/mcp-server-patterns/SKILL.md')));
  })) passed++; else failed++;

  if (await test('readCommand returns the requested command excerpt', async () => {
    const command = helpers.readCommand(repoRoot, 'checkpoint', { excerptLines: 20 });
    assert.strictEqual(command.id, 'checkpoint');
    assert.ok(command.excerpt.length > 0, 'Expected non-empty command excerpt');
  })) passed++; else failed++;

  if (await test('listMcpConfigs returns both project and bundled MCP definitions', async () => {
    const payload = helpers.listMcpConfigs(repoRoot);
    assert.ok(payload.projectServerCount >= 1, 'Expected project-scoped MCP servers');
    assert.ok(payload.bundledServerCount >= payload.projectServerCount, 'Expected bundled MCP catalog');
    assert.ok(payload.projectServers.some(server => server.name === 'context7'));
    assert.ok(payload.bundledServers.some(server => server.name === 'filesystem'));
  })) passed++; else failed++;

  if (await test('runHarnessAudit can return the compact top-actions view', async () => {
    const payload = await helpers.runHarnessAudit(repoRoot, { scope: 'repo', topActionsOnly: true });
    assert.strictEqual(payload.scope, 'repo');
    assert.ok(Array.isArray(payload.top_actions));
    assert.ok(typeof payload.overall_score === 'number');
  })) passed++; else failed++;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
