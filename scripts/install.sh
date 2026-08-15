#!/usr/bin/env bash

# Docket installer for macOS and Linux.
# Downloads a release binary, verifies SHA-256, and installs atomically.
# Set DOCKET_REPOSITORY and DOCKET_VERSION to install from a fork or pin a release.

set -Eeuo pipefail

readonly DEFAULT_REPOSITORY="ezhilsivaraj/docket"
repository="${DOCKET_REPOSITORY:-$DEFAULT_REPOSITORY}"
version="${DOCKET_VERSION:-latest}"
home_dir="${HOME:-}"
install_dir="${DOCKET_INSTALL_DIR:-}"
use_bun="${DOCKET_USE_BUN:-0}"
force=0
temp_dir=""

die() {
  printf 'docket installer: error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Installs the latest signed-by-checksum Docket release for macOS or Linux.

Options:
  --version VERSION   Release tag or version (default: latest)
  --dir DIRECTORY     Installation directory (default: ~/.local/bin)
  --use-bun           Install the TypeScript package through Bun globally
  --force             Replace an existing docket executable
  -h, --help          Show this help

Environment:
  DOCKET_REPOSITORY   GitHub repository in owner/name form
  DOCKET_VERSION      Same as --version
  DOCKET_INSTALL_DIR  Same as --dir
  DOCKET_USE_BUN=1    Same as --use-bun
EOF
}

on_error() {
  local line="$1"
  local command_text="$2"
  printf 'docket installer: failed near line %s while running: %s\n' "$line" "$command_text" >&2
  printf 'docket installer: no existing installation was replaced.\n' >&2
}

cleanup() {
  if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
    rm -rf -- "$temp_dir"
  fi
}

trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || die "--version requires a value"
      version="$2"
      shift 2
      ;;
    --dir)
      [[ $# -ge 2 ]] || die "--dir requires a value"
      install_dir="$2"
      shift 2
      ;;
    --use-bun)
      use_bun=1
      shift
      ;;
    --force)
      force=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option '$1' (use --help for usage)"
      ;;
  esac
done

if [[ -z "$install_dir" ]]; then
  [[ -n "$home_dir" ]] || die "HOME is not set; pass --dir explicitly"
  install_dir="${home_dir}/.local/bin"
fi

command_exists() { command -v "$1" >/dev/null 2>&1; }

install_with_bun() {
  command_exists bun || die "--use-bun requires Bun to be installed; see https://bun.sh/docs/installation"
  local ref="${DOCKET_BUN_REF:-$version}"
  [[ "$ref" == "latest" ]] && ref="main"
  printf 'Installing Docket globally through Bun from %s#%s...\n' "$repository" "$ref"
  bun install --global "github:${repository}#${ref}"
  printf 'Docket was installed through Bun. Verify with: docket --help\n'
}

detect_target() {
  local os
  local arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Darwin:arm64) printf 'darwin-arm64\n' ;;
    Darwin:x86_64) printf 'darwin-x64\n' ;;
    Linux:x86_64|Linux:amd64) printf 'linux-x64\n' ;;
    Linux:aarch64|Linux:arm64) die "Linux ARM64 release binaries are not published yet; use --use-bun or set DOCKET_INSTALL_DIR with a compatible build" ;;
    *) die "unsupported platform '$os/$arch'; use --use-bun or install a supported release" ;;
  esac
}

download() {
  local url="$1"
  local destination="$2"
  if command_exists curl; then
    curl --fail --silent --show-error --location --retry 3 --retry-delay 1 --connect-timeout 15 --output "$destination" "$url"
  elif command_exists wget; then
    wget --https-only --tries=3 --timeout=15 --output-document="$destination" "$url"
  else
    die "curl or wget is required to download Docket"
  fi
}

sha256() {
  local file="$1"
  if command_exists sha256sum; then
    sha256sum "$file" | awk '{print $1}'
  elif command_exists shasum; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    die "sha256sum or shasum is required to verify the release"
  fi
}

verify_checksum() {
  local checksum_file="$1"
  local artifact="$2"
  local expected
  local actual
  expected="$(awk -v filename="$artifact" '$2 == filename || $2 == "*" filename { print $1; exit }' "$checksum_file")"
  [[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || die "release checksum for '$artifact' was not found"
  actual="$(sha256 "$temp_dir/$artifact")"
  [[ "$actual" == "$expected" ]] || die "checksum verification failed for '$artifact'"
}

install_binary() {
  local target="$1"
  local artifact="docket-${target}"
  local base_url
  local binary_url
  local checksum_url
  local destination="$install_dir/docket"
  local staged="$install_dir/.docket.tmp.$$"

  if [[ "$version" == "latest" ]]; then
    base_url="https://github.com/${repository}/releases/latest/download"
  else
    base_url="https://github.com/${repository}/releases/download/${version}"
  fi
  binary_url="${base_url}/${artifact}"
  checksum_url="${base_url}/SHA256SUMS"
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/docket-install.XXXXXX")"

  printf 'Downloading Docket %s for %s...\n' "$version" "$target"
  download "$binary_url" "$temp_dir/$artifact"
  download "$checksum_url" "$temp_dir/SHA256SUMS"
  verify_checksum "$temp_dir/SHA256SUMS" "$artifact"

  if [[ -e "$destination" && "$force" -ne 1 ]]; then
    die "'$destination' already exists; rerun with --force to replace it"
  fi
  mkdir -p "$install_dir"
  cp "$temp_dir/$artifact" "$staged"
  chmod 0755 "$staged"
  mv -f "$staged" "$destination"
  printf 'Installed Docket at %s\n' "$destination"
  case ":${PATH}:" in
    *":${install_dir}:"*) ;;
    *) printf 'Add this directory to your PATH: export PATH="%s:$PATH"\n' "$install_dir" ;;
  esac
  printf 'Verify with: docket --help\n'
}

if [[ "$use_bun" == "1" ]]; then
  install_with_bun
else
  install_binary "$(detect_target)"
fi
