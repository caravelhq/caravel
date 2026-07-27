---
name: transcribe
description: Transcribe audio from video or audio files using OpenAI Whisper (local, offline)
argument-hint: "<video_or_directory> [--model small] [--output <dir>]"
---

# Transcription

Transcribe audio from video or audio files using OpenAI Whisper (local, offline — no API key).

## When to use

When the user has video or audio files and wants text transcripts of the spoken content — walkthrough videos, meeting recordings, presentations, voice memos, podcasts, etc.

## Supported formats

- **Video:** mp4, mov, avi, mkv, webm, m4v
- **Audio:** mp3, wav, m4a, aac, ogg, flac, wma

## Script

```bash
SCRIPT=".claude/skills/transcribe/script/transcribe.sh"
```

### Single file

```bash
bash $SCRIPT /path/to/video.mp4
bash $SCRIPT /path/to/video.mp4 --model medium --output /path/to/output
```

### Batch (all videos in a directory)

```bash
bash $SCRIPT /path/to/video/directory --output /path/to/transcripts
```

### Options

| Option | Default | Description |
|---|---|---|
| `--model <name>` | small | Whisper model: tiny, base, small, medium, large |
| `--language <code>` | en | Language code (en, fr, de, etc.) |
| `--output <dir>` | same as input | Output directory for transcript files |
| `--format <fmt>` | md | Output format: md (default, for frontmatter), txt, srt, vtt, json, all |
| `--keep-audio` | false | Keep extracted WAV files after transcription |

### Model selection guide

| Model | Size | Speed | Accuracy | Use case |
|---|---|---|---|---|
| tiny | 39MB | Very fast | Basic | Quick check, clear audio |
| base | 74MB | Fast | Good | Simple narration |
| **small** | 461MB | Moderate | **Good** | **Default — good balance for most spoken content** |
| medium | 1.5GB | Slow | Very good | Accented speech, background noise |
| large | 2.9GB | Very slow | Best | Difficult audio, multiple speakers |

## Dependencies

- **ffmpeg** — audio extraction (`brew install ffmpeg`, `apt install ffmpeg`, or your platform's package manager)
- **openai-whisper** — transcription (`pip3 install openai-whisper`)

Whisper downloads the selected model on first use (see sizes above) and runs on CPU by default — the first run of a given model is slower while it downloads.

## Post-processing: add frontmatter

After transcription, read each `.md` output and prepend YAML frontmatter with metadata. This makes transcripts searchable and gives future context without reading the full text. Generate the frontmatter by reading the raw transcript and inferring the subject, summary, and tags from the content.

```markdown
---
title: "Product Onboarding Walkthrough"
source: "local — recordings/onboarding.mp4"
date: 2026-07-09
duration: "8:32"
subject: "How to set up a new account and navigate the main dashboard"
summary: |
  Walks through account creation, the main dashboard layout, and where to
  find the most common actions for a first-time user.
tags: [walkthrough, onboarding, dashboard]
---

[transcript text here]
```

**Frontmatter fields:**
| Field | Description |
|---|---|
| `title` | Human-readable title derived from filename and content |
| `source` | Where the file came from (URL, cloud path, local path) |
| `date` | Recording/upload date |
| `duration` | Length (from ffprobe or filename metadata) |
| `subject` | One-line description of what the recording covers |
| `summary` | 2–4 sentence summary of key topics |
| `tags` | Relevant tags for search/filtering |

## Output

Markdown transcript files (`.md` by default) with YAML frontmatter added in post-processing, one per input, named to match the input filename. For subtitle formats, use `--format srt` or `--format vtt`.

## Troubleshooting

### SSL certificate error on first run
Whisper downloads models on first use. If Python has SSL issues on macOS:
```bash
/Applications/Python\ 3.12/Install\ Certificates.command
```

### No audio in file
Some screen recordings have no audio track. The script warns and skips these.

### Slow transcription
Whisper runs on CPU by default. For faster processing use a smaller model (`--model base`) or install PyTorch with GPU support if available.
