# Additional Requirements

## Metadata Copy Panel
- Keep the existing copy sections and add new individually copyable fields (suggest a better UI/UX approach if one exists)
  1. Artist name
  2. Song title
  3. Album name
  4. Lyrics => add a copy button directly on the existing lyrics panel
  5. Composer
  6. Lyricist

## YouTube Audio Download
1. Download both the original audio and a 60-second sample
2. The 60-second sample must have a fade-out applied from 55s to 60s
3. Prompt the user to specify a save directory before downloading

## File Naming Rules
1. Original audio file: `<ArtistName>-<SongTitle>.mp3` (preserve spaces as-is)
2. 60-second sample file: `s<ArtistName>-<SongTitle>.mp3` (preserve spaces as-is)
