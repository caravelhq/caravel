#!/bin/bash
# transcribe.sh — Extract audio from video and transcribe using OpenAI Whisper
#
# Usage:
#   bash transcribe.sh <video_file> [options]
#   bash transcribe.sh <directory> [options]    # transcribe all videos in directory
#
# Options:
#   --model <name>      Whisper model: tiny, base, small, medium, large (default: small)
#   --language <code>   Language code, e.g. en, fr, de (default: en)
#   --output <dir>      Output directory for transcripts (default: same as input)
#   --format <fmt>      Output format: txt, srt, vtt, json, all (default: txt)
#   --keep-audio        Keep extracted WAV files (default: delete after transcription)
#
# Supported formats:
#   Video: mp4, mov, avi, mkv, webm, m4v
#   Audio: mp3, wav, m4a, aac, ogg, flac, wma

set -euo pipefail

# --- Defaults ---
MODEL="small"
LANGUAGE="en"
OUTPUT_DIR=""
FORMAT="md"
KEEP_AUDIO=false
INPUT=""

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)     MODEL="$2"; shift 2 ;;
    --language)  LANGUAGE="$2"; shift 2 ;;
    --output)    OUTPUT_DIR="$2"; shift 2 ;;
    --format)    FORMAT="$2"; shift 2 ;;
    --keep-audio) KEEP_AUDIO=true; shift ;;
    -*)          echo "Unknown option: $1" >&2; exit 1 ;;
    *)           INPUT="$1"; shift ;;
  esac
done

if [[ -z "$INPUT" ]]; then
  echo "Usage: bash transcribe.sh <video_file_or_directory> [options]" >&2
  exit 1
fi

# --- Check dependencies ---
for cmd in ffmpeg whisper; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed." >&2
    if [[ "$cmd" == "whisper" ]]; then
      echo "  Install with: pip3 install openai-whisper" >&2
    else
      echo "  Install with: brew install ffmpeg" >&2
    fi
    exit 1
  fi
done

# --- Build file list ---
FILES=()

MEDIA_EXTENSIONS=(mp4 mov avi mkv webm m4v mp3 wav m4a aac ogg flac wma)
AUDIO_ONLY_EXTENSIONS=(mp3 wav m4a aac ogg flac wma)

if [[ -d "$INPUT" ]]; then
  for ext in "${MEDIA_EXTENSIONS[@]}"; do
    for f in "$INPUT"/*."$ext" "$INPUT"/*."${ext^^}"; do
      [[ -f "$f" ]] && FILES+=("$f")
    done
  done
elif [[ -f "$INPUT" ]]; then
  FILES=("$INPUT")
else
  echo "Error: $INPUT is not a file or directory" >&2
  exit 1
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No video files found in: $INPUT" >&2
  exit 1
fi

echo "Found ${#FILES[@]} video file(s) to transcribe"
echo "Model: $MODEL | Language: $LANGUAGE | Format: $FORMAT"
echo ""

# --- Temp directory for audio ---
AUDIO_DIR=$(mktemp -d)
trap '[[ "$KEEP_AUDIO" == false ]] && rm -rf "$AUDIO_DIR"' EXIT

# --- Process each file ---
COMPLETED=0
FAILED=0

for VIDEO in "${FILES[@]}"; do
  BASENAME=$(basename "$VIDEO")
  NAME="${BASENAME%.*}"

  # Determine output directory
  if [[ -n "$OUTPUT_DIR" ]]; then
    OUT="$OUTPUT_DIR"
  else
    OUT="$(dirname "$VIDEO")"
  fi
  mkdir -p "$OUT"

  echo "--- [$((COMPLETED + FAILED + 1))/${#FILES[@]}] $BASENAME ---"

  # Extract/convert audio to 16kHz mono WAV
  AUDIO_FILE="$AUDIO_DIR/${NAME}.wav"
  FILE_EXT="${BASENAME##*.}"
  FILE_EXT_LOWER=$(echo "$FILE_EXT" | tr '[:upper:]' '[:lower:]')
  IS_AUDIO=false
  for aext in "${AUDIO_ONLY_EXTENSIONS[@]}"; do
    [[ "$FILE_EXT_LOWER" == "$aext" ]] && IS_AUDIO=true && break
  done

  if [[ "$IS_AUDIO" == true ]]; then
    echo "  Converting audio to WAV..."
  else
    echo "  Extracting audio from video..."
  fi
  if ! ffmpeg -i "$VIDEO" -vn -acodec pcm_s16le -ar 16000 -ac 1 "$AUDIO_FILE" -y -loglevel error 2>&1; then
    echo "  ERROR: Failed to extract audio from $BASENAME" >&2
    ((FAILED++))
    continue
  fi

  # Check if audio has content
  DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null || echo "0")
  if [[ "$DURATION" == "0" ]]; then
    echo "  WARNING: No audio track in $BASENAME, skipping" >&2
    ((FAILED++))
    continue
  fi

  # Transcribe — Whisper outputs .txt, we rename to target format
  WHISPER_FMT="$FORMAT"
  [[ "$FORMAT" == "md" ]] && WHISPER_FMT="txt"

  echo "  Transcribing (model: $MODEL)..."
  if ! whisper "$AUDIO_FILE" --model "$MODEL" --output_dir "$OUT" --output_format "$WHISPER_FMT" --language "$LANGUAGE" 2>&1 | grep -v "^$"; then
    echo "  ERROR: Transcription failed for $BASENAME" >&2
    ((FAILED++))
    continue
  fi

  # Rename .txt to .md if markdown output requested
  if [[ "$FORMAT" == "md" && -f "$OUT/${NAME}.txt" ]]; then
    mv "$OUT/${NAME}.txt" "$OUT/${NAME}.md"
  fi

  # Report output files
  if [[ "$FORMAT" == "all" ]]; then
    for ext in txt srt vtt json; do
      [[ -f "$OUT/${NAME}.${ext}" ]] && echo "  Output: $OUT/${NAME}.${ext}"
    done
  else
    [[ -f "$OUT/${NAME}.${FORMAT}" ]] && echo "  Output: $OUT/${NAME}.${FORMAT}"
  fi

  ((COMPLETED++))
  echo ""
done

# --- If keeping audio, move from temp ---
if [[ "$KEEP_AUDIO" == true && -d "$AUDIO_DIR" ]]; then
  AUDIO_OUT="${OUTPUT_DIR:-$(dirname "${FILES[0]}")}/audio"
  mkdir -p "$AUDIO_OUT"
  cp "$AUDIO_DIR"/*.wav "$AUDIO_OUT"/ 2>/dev/null || true
  echo "Audio files saved to: $AUDIO_OUT"
fi

echo "=== Complete: $COMPLETED succeeded, $FAILED failed out of ${#FILES[@]} ==="
