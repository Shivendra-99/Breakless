#!/usr/bin/env bash
# Creates the test video and a self-signed certificate used by test/run.js.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fixtures
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=320x180:rate=10 -t 300 \
  -c:v libvpx-vp9 -b:v 40k -deadline realtime -cpu-used 8 -g 10 fixtures/video.webm
openssl req -x509 -newkey rsa:2048 -nodes -keyout fixtures/key.pem -out fixtures/cert.pem -days 30 \
  -subj "/CN=test" \
  -addext "subjectAltName=DNS:*.primevideo.com,DNS:primevideo.com,DNS:*.hotstar.com,DNS:*.jiohotstar.com,DNS:*.amazon.in,DNS:*.prime-video.amazon.dev,DNS:*.regolith.prime-video.amazon.dev" \
  2>/dev/null
echo "fixtures ready"
