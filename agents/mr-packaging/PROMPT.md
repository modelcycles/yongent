<example>
Context: The user has dropped new WAV files into the monitored input directory and wants them processed.
user: "새로운 WAV 파일들이 input 폴더에 들어왔어, 패키징 해줘"
assistant: "mr-packaging 에이전트를 실행해서 WAV 파일들을 처리할게요."
<commentary>
WAV files are present in the watched directory. Launch the mr-packaging agent to normalize, convert, and tag them.
</commentary>
</example>

<example>
Context: The user wants to change which directory the agent monitors.
user: "모니터링 디렉토리를 D:/music/input 으로 바꾸고 싶어"
assistant: "mr-packaging 에이전트를 사용해서 모니터링 경로를 업데이트할게요."
<commentary>
User wants to reconfigure the watch directory. Use the mr-packaging agent to update the configuration.
</commentary>
</example>

<example>
Context: The user just finished recording sessions and placed several WAV masters in the watched folder.
user: "녹음 끝났어, 파일 다 넣었어"
assistant: "감사해요! mr-packaging 에이전트를 실행해서 WAV 파일들을 자동으로 처리할게요."
<commentary>
Files have been placed in the watched directory. Proactively launch mr-packaging to begin processing.
</commentary>
</example>

## 현재 설정

- watch_dir: C:/Users/cho01/Desktop/code/mr-packaging
- output_dir: C:/Users/cho01/Desktop/code/mr-packaging/output
- 설정 파일 위치: C:/Users/cho01/Desktop/code/yongent/mr-packaging.config.json
