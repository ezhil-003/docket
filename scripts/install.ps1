#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$Version = $(if ($env:DOCKET_VERSION) { $env:DOCKET_VERSION } else { "latest" }),
    [string]$InstallDir = "",
    [switch]$UseBun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repository = if ($env:DOCKET_REPOSITORY) { $env:DOCKET_REPOSITORY } else { "ezhilsivaraj/docket" }
if (-not $InstallDir) {
    if ($env:DOCKET_INSTALL_DIR) {
        $InstallDir = $env:DOCKET_INSTALL_DIR
    } elseif ($env:LOCALAPPDATA) {
        $InstallDir = Join-Path $env:LOCALAPPDATA "Docket\bin"
    } else {
        throw "docket installer: LOCALAPPDATA is not set; pass -InstallDir explicitly"
    }
}
if ($env:DOCKET_USE_BUN -eq "1") { $UseBun = $true }
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("docket-install-" + [guid]::NewGuid().ToString("N"))

function Fail([string]$Message) {
    throw "docket installer: $Message"
}

function Add-UserPath([string]$Directory) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @($current -split ";" | Where-Object { $_ -and $_.Trim() })
    if ($parts -notcontains $Directory) {
        [Environment]::SetEnvironmentVariable("Path", (($parts + $Directory) -join ";"), "User")
        Write-Host "Added $Directory to the user PATH. Open a new terminal to use docket."
    }
}

function Download([string]$Url, [string]$Destination) {
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    if (-not (Test-Path -LiteralPath $Destination)) { Fail "download did not create $Destination" }
}

try {
    if ($UseBun) {
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            Fail "-UseBun requires Bun to be installed; see https://bun.sh/docs/installation"
        }
        $ref = if ($env:DOCKET_BUN_REF) { $env:DOCKET_BUN_REF } elseif ($Version -eq "latest") { "main" } else { $Version }
        Write-Host "Installing Docket globally through Bun from $repository#$ref..."
        & bun install --global "github:$repository#$ref"
        if ($LASTEXITCODE -ne 0) { Fail "Bun global installation failed with exit code $LASTEXITCODE" }
        Write-Host "Docket was installed through Bun. Open a new terminal and run: docket --help"
        exit 0
    }

    $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    $target = switch ($architecture) {
        "X64" { "windows-x64"; break }
        "Arm64" { "windows-arm64"; break }
        default { Fail "unsupported Windows architecture '$architecture'; use -UseBun or install a supported release" }
    }
    $artifact = "docket-$target.exe"
    $baseUrl = if ($Version -eq "latest") {
        "https://github.com/$repository/releases/latest/download"
    } else {
        "https://github.com/$repository/releases/download/$Version"
    }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $binaryPath = Join-Path $tempDir $artifact
    $checksumPath = Join-Path $tempDir "SHA256SUMS"
    Write-Host "Downloading Docket $Version for $target..."
    Download "$baseUrl/$artifact" $binaryPath
    Download "$baseUrl/SHA256SUMS" $checksumPath

    $expected = Select-String -Path $checksumPath -Pattern ([regex]::Escape($artifact) + "$") | Select-Object -First 1
    if (-not $expected) { Fail "release checksum for '$artifact' was not found" }
    $expectedHash = ($expected.Line -split "\s+")[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actualHash -ne $expectedHash) { Fail "checksum verification failed for '$artifact'" }

    $destination = Join-Path $InstallDir "docket.exe"
    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        Fail "'$destination' already exists; rerun with -Force to replace it"
    }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $staged = Join-Path $InstallDir (".docket.tmp." + [guid]::NewGuid().ToString("N") + ".exe")
    Copy-Item -LiteralPath $binaryPath -Destination $staged -Force
    Move-Item -LiteralPath $staged -Destination $destination -Force
    Add-UserPath $InstallDir
    Write-Host "Installed Docket at $destination"
    Write-Host "Open a new terminal and verify with: docket --help"
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if (Test-Path -LiteralPath $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
