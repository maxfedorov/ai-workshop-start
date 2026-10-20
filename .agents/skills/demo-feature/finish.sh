#!/usr/bin/env bash
# demo-feature/SKILL.md §3: the recording as an MP4, its length, and frames to look at.
#   .agents/skills/demo-feature/finish.sh <feature-slug> [output dir]
# Output dir: $AIR_ARTIFACTS_DIR when set (kept as a session artifact), otherwise ~/Desktop or ~.
set -euo pipefail

SLUG=${1:?usage: finish.sh <feature-slug> [output dir]}
DEFAULT_OUT=${AIR_ARTIFACTS_DIR:-$([ -d "$HOME/Desktop" ] && echo "$HOME/Desktop" || echo "$HOME")}
OUT_DIR=${2:-$DEFAULT_OUT}
WEBM=$(ls -t /tmp/skill-atlas-demo/*.webm 2>/dev/null | head -1)
[ -n "$WEBM" ] || { echo 'no recording in /tmp/skill-atlas-demo' >&2; exit 1; }

mkdir -p "$OUT_DIR"
MP4="$OUT_DIR/$SLUG-demo.mp4"
ffmpeg -loglevel error -y -i "$WEBM" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$MP4"
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MP4")

# Five frames spread over the video, to check what it shows before reporting it.
FRAMES=/tmp/skill-atlas-demo/frames
mkdir -p "$FRAMES"
for i in 1 2 3 4 5; do
  AT=$(awk -v d="$DURATION" -v i="$i" 'BEGIN { printf "%.2f", d * (i - 0.5) / 5 }')
  ffmpeg -loglevel error -y -ss "$AT" -i "$MP4" -frames:v 1 -vf scale=800:-1 "$FRAMES/$i.png"
done

echo "video=$MP4"
echo "duration=$DURATION"
echo "frames=$FRAMES/1.png … $FRAMES/5.png"
