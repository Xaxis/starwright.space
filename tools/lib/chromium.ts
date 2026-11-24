// How every browser run here launches Chromium: on SwiftShader, never the box's GPU, which other
// projects' renders hold. From Jokewright tools/lib/chromium.ts.
export const CHROMIUM_ARGS = ["--use-angle=swiftshader", "--disable-gpu-watchdog"];
