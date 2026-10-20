#!/usr/bin/env bash
# demo-feature/SKILL.md §3: the recording as an MP4 and a GIF, its length, and frames to look at.
#   .agents/skills/demo-feature/finish.sh <feature-slug> [output dir]
# Output dir: $AIR_ARTIFACTS_DIR when set (kept as a session artifact), otherwise ~/Desktop or ~.
# GIF knobs: DEMO_GIF_FPS (default 12) and DEMO_GIF_WIDTH (default 960).
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

# The GIF starts where record.mjs's markStart() said the page was ready, so its first frame,
# the preview a PR or a chat shows, is the feature and not the blank page before it. No mark,
# or one that isn't a time inside the video: from the beginning.
START=0
if [ -f /tmp/skill-atlas-demo/start-offset ]; then
  START=$(awk -v s="$(cat /tmp/skill-atlas-demo/start-offset)" -v d="$DURATION" \
    'BEGIN { if (s ~ /^[0-9]+(\.[0-9]+)?$/ && s + 1 < d) printf "%.2f", s; else print 0 }')
fi

# Two passes over the video for a palette of its own: without it, the dark gradient background
# bands badly.
FPS=${DEMO_GIF_FPS:-12}
WIDTH=${DEMO_GIF_WIDTH:-960}
GIF="$OUT_DIR/$SLUG-demo.gif"
ffmpeg -loglevel error -y -ss "$START" -i "$MP4" \
  -vf "fps=$FPS,scale=$WIDTH:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$GIF"
GIF_SIZE=$(wc -c < "$GIF" | tr -d ' ')
ffmpeg -loglevel error -y -i "$GIF" -frames:v 1 "$FRAMES/gif-first.png"

echo "video=$MP4"
echo "duration=$DURATION"
echo "frames=$FRAMES/1.png … $FRAMES/5.png"
echo "gif=$GIF"
echo "gif_size=$GIF_SIZE"
echo "gif_start=$START"
echo "gif_first_frame=$FRAMES/gif-first.png"
if [ "$GIF_SIZE" -gt 8000000 ]; then
  echo "hint: the GIF is over 8 MB; try DEMO_GIF_FPS=8 or DEMO_GIF_WIDTH=720, or a shorter demo" >&2
fi
