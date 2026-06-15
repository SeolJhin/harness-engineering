@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

if not defined SEOLLY_HARNESS_ROOT (
  set "SEOLLY_HARNESS_ROOT=%SCRIPT_DIR%..\.."
)

for %%I in ("%SEOLLY_HARNESS_ROOT%") do set "SEOLLY_HARNESS_ROOT=%%~fI"

node "%SCRIPT_DIR%index.mjs"
