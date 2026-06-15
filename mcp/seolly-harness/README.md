# seolly-harness MCP

Small custom MCP server for the `harness-engineering` repository.

`harness-engineering` 저장소를 IntelliJ 같은 클라이언트에서 구조화된 도구로 다루기 위한 커스텀 MCP 서버입니다.

It exposes a narrow set of high-value tools instead of turning the whole repo into a generic file API.

저장소 전체를 범용 파일 API로 여는 대신, 가치가 높은 몇 가지 도구만 의도적으로 노출합니다.

This is a dieted, MCP-ified slice of `everything-claude-code`, the Anthropic harness-engineering competition winning project.

엔트로픽에서 개최한 하네스엔지니어링 대회 우승 작품 `everything-claude-code`를 다이어트하고 MCP화한 버전입니다.

## Tools

- `repo_surface_summary`
- `list_skills`
- `list_agents`
- `read_skill`
- `read_command`
- `find_relevant_workflows`
- `run_harness_audit`
- `list_mcp_configs`

## Install

Install dependencies from the package directory.

패키지 디렉터리에서 의존성을 설치합니다.

```powershell
cd mcp\seolly-harness
npm install
```

## Run Manually

Run the server directly to verify stdio startup.

표준 입출력 기반 MCP 서버가 정상 구동하는지 직접 확인할 수 있습니다.

```powershell
node .\mcp\seolly-harness\index.mjs
```

On Windows, prefer the committed launcher for IntelliJ.

Windows에서는 IntelliJ 연결 시 커밋된 launcher를 쓰는 편이 가장 안정적입니다.

```powershell
.\mcp\seolly-harness\start.cmd
```

## IntelliJ MCP Config

Add this in `Settings > Tools > AI Assistant > Model Context Protocol (MCP)` as a `STDIO` server.

IntelliJ의 `Settings > Tools > AI Assistant > Model Context Protocol (MCP)`에 아래 JSON을 `STDIO` 서버로 추가하면 됩니다.

For a single machine, the quickest setup is a direct absolute path.

개인 로컬에서 바로 테스트할 때는 절대경로가 가장 빠릅니다.

```json
{
  "mcpServers": {
    "seolly-harness": {
      "command": "cmd",
      "args": [
        "/c",
        "E:\\projects\\git\\harness-engineering\\mcp\\seolly-harness\\start.cmd"
      ]
    }
  }
}
```

For a shared team setup, use a machine-local environment variable instead of committing absolute paths.

팀 공유용으로는 절대경로를 커밋하지 말고, 각 컴퓨터의 환경 변수를 통해 경로를 주는 편이 낫습니다.

```json
{
  "mcpServers": {
    "seolly-harness": {
      "command": "cmd",
      "args": [
        "/c",
        "\"%SEOLLY_HARNESS_HOME%\\mcp\\seolly-harness\\start.cmd\""
      ]
    }
  }
}
```

Set the repo root once on each machine:

각 컴퓨터에서 repo root를 한 번만 지정하면 됩니다.

```powershell
setx SEOLLY_HARNESS_HOME "E:\projects\git\harness-engineering"
```

Restart IntelliJ after changing environment variables.

환경 변수를 바꾼 뒤에는 IntelliJ를 재시작해야 합니다.

## Why This Approach

- `STDIO` stays local and avoids opening an HTTP port.
- The launcher computes the repo root from its own location by default.
- Each developer can keep the repo in a different path.

- `STDIO`는 로컬 프로세스만 사용하므로 HTTP 포트를 열지 않습니다.
- launcher는 기본적으로 자기 위치를 기준으로 repo root를 계산합니다.
- 개발자마다 repo 위치가 달라도 그대로 쓸 수 있습니다.

## Notes

- Use `console.error()` only for server logs. `stdout` is reserved for MCP transport traffic.
- This package is repo-local. It is intentionally not wired into the root npm package.
- Override `SEOLLY_HARNESS_ROOT` only when you need to point the server at a different checkout.

- 서버 로그는 `console.error()`만 사용해야 합니다. `stdout`은 MCP 통신 전용입니다.
- 이 패키지는 저장소 로컬 구성입니다. 의도적으로 루트 npm 패키지에 연결하지 않았습니다.
- 다른 체크아웃을 가리킬 때만 `SEOLLY_HARNESS_ROOT`를 override 하면 됩니다.
