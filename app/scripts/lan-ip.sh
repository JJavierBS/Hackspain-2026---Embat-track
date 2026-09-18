#!/usr/bin/env bash
# Prints this Mac's LAN IP address — the one your phone needs to reach
# the API, since "localhost" on the phone means the phone itself.
set -euo pipefail

# Check Linux commands first (or if not macOS)
if command -v ip >/dev/null 2>&1; then
  ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || true)
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
fi

if command -v hostname >/dev/null 2>&1; then
  ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
fi

# macOS ipconfig fallback
for iface in en0 en1 en2 wlan0 eth0; do
  ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
done

echo "Could not find a LAN IP." >&2
echo "Run 'ip addr' or 'ifconfig' and look for your Wi-Fi/Ethernet address." >&2
exit 1
