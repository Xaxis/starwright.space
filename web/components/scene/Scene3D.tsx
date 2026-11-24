"use client";
/**
 * A 3D scene on the page. The page's one canvas comes here while this scene is the one the reader
 * is looking at; otherwise the scene shows a still of its last frame. A scene with a story shows
 * its captions, a play button and a slider. "Explore in 3D" opens it full screen, where the reader
 * can turn and zoom it.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Engine } from "./engine.ts";
import type { KindName } from "./kinds/index.ts";
import type { Beat, Params } from "./types.ts";

export interface SceneProps {
  kind: KindName;
  params?: Params;
  colour: string;
  /** Kind-specific data; beats for the story go in data.beats. */
  data?: { beats?: Omit<Beat, "at">[] } & Record<string, unknown>;
  /** The scene's name, for the button and the dialog. */
  title: string;
  /** A sentence for readers who cannot see the scene. */
  alt: string;
  autoplay?: boolean;
  duration?: number;
  variant?: "hero" | "panel";
}

type Mode = "loading" | "live" | "still" | "none";

interface Claimant {
  id: string;
  release(): void;
}
let holder: Claimant | undefined;
let enginePromise: Promise<Engine> | undefined;
function getEngine(): Promise<Engine> {
  enginePromise ??= import("./engine.ts").then((m) => m.theEngine());
  return enginePromise;
}

export function Scene3D(p: SceneProps) {
  const id = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogHostRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<Engine | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("loading");
  const [still, setStill] = useState("");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);
  const progressRef = useRef(0);
  const propsRef = useRef(p);
  propsRef.current = p;

  const claim = useCallback(async () => {
    if (holder?.id === id) return;
    holder?.release();
    const me: Claimant = {
      id,
      release() {
        const e = engineRef.current;
        if (e) setStill(e.snapshot());
        e?.pause();
        setPlaying(false);
        setMode("still");
        if (holder?.id === id) holder = undefined;
      },
    };
    holder = me;
    const e = await getEngine();
    if (holder !== me) return;
    engineRef.current = e;
    const host = hostRef.current;
    if (!host) return;
    e.attach(host);
    e.setInteractive(false);
    const q = propsRef.current;
    const first = !shownRef.current;
    shownRef.current = true;
    await e.show({
      kind: q.kind,
      params: q.params ?? {},
      colour: q.colour,
      data: q.data,
      progress: progressRef.current,
      autoplay: first && !!q.autoplay,
      duration: q.duration,
    });
    if (holder !== me) return;
    setBeats(e.beats());
    setMode("live");
  }, [id]);

  // Follow the engine's clock while this scene holds it.
  useEffect(() => {
    if (mode !== "live") return;
    const e = engineRef.current;
    if (!e) return;
    return e.on(({ progress: x, playing: pl }) => {
      progressRef.current = x;
      setProgress(x);
      setPlaying(pl);
    });
  }, [mode]);

  // Claim the canvas when this scene is the one in view.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let gl = false;
    try {
      gl = !!document.createElement("canvas").getContext("webgl2");
    } catch {}
    if (!gl) {
      setMode("none");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.intersectionRatio >= 0.45) void claim();
          else if (holder?.id === id && en.intersectionRatio === 0 && !open) {
            engineRef.current?.setVisible(false);
          } else if (holder?.id === id) engineRef.current?.setVisible(true);
        }
      },
      { threshold: [0, 0.45, 0.7] },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      if (holder?.id === id) holder.release();
    };
  }, [claim, id, open]);

  const showDialog = async () => {
    await claim();
    setOpen(true);
  };
  // Move the canvas into the dialog while it is open, and back when it closes.
  useEffect(() => {
    const e = engineRef.current;
    const d = dialogRef.current;
    if (!e || !d) return;
    if (open) {
      if (!d.open) d.showModal();
      if (dialogHostRef.current) e.attach(dialogHostRef.current);
      e.setVisible(true);
      e.setInteractive(true);
    } else {
      e.setInteractive(false);
      if (hostRef.current && holder?.id === id) e.attach(hostRef.current);
    }
  }, [open, id]);
  const close = () => {
    dialogRef.current?.close();
    setOpen(false);
    openerRef.current?.focus();
  };

  const beat = beats.length
    ? beats.reduce((best, b) => (b.at <= progress + 1e-6 ? b : best), beats[0] as Beat)
    : undefined;
  const e = engineRef.current;
  const story = beats.length > 0 && (
    <StoryBar
      beats={beats}
      beat={beat}
      progress={progress}
      playing={playing}
      disabled={mode !== "live"}
      onToggle={() => (playing ? e?.pause() : e?.play())}
      onScrub={(x) => {
        e?.pause();
        e?.setProgress(x);
      }}
    />
  );

  return (
    <figure className={`scene scene-${p.variant ?? "panel"}`} data-mode={mode} data-kind={p.kind}>
      <div className="scene-stage" ref={hostRef}>
        {mode === "still" && still ? <img className="scene-still" src={still} alt="" /> : null}
        {mode === "none" ? (
          <p className="scene-none">
            This 3D scene needs WebGL 2, which this browser does not offer. {p.alt}
          </p>
        ) : null}
        {mode !== "none" ? (
          <button
            type="button"
            className="scene-open"
            ref={openerRef}
            onClick={showDialog}
            aria-label={`Explore ${p.title} in 3D, full screen`}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
            </svg>
            Explore in 3D
          </button>
        ) : null}
        {mode === "still" ? (
          <button type="button" className="scene-wake" onClick={claim} aria-label={`Show ${p.title} live`}>
            <span aria-hidden="true">▶</span>
          </button>
        ) : null}
      </div>
      <figcaption className="scene-alt">{p.alt}</figcaption>
      {story}
      <dialog
        ref={dialogRef}
        className="scene-dialog"
        aria-label={`${p.title}, in 3D`}
        onCancel={(ev) => {
          ev.preventDefault();
          close();
        }}
      >
        <div className="scene-dialog-stage" ref={dialogHostRef} />
        <div className="scene-dialog-bar">
          <h2 className="scene-dialog-title">{p.title}</h2>
          <p className="scene-dialog-hint">Drag to turn, scroll or pinch to zoom.</p>
          <button type="button" className="scene-reset" onClick={() => e?.resetView()}>
            Reset view
          </button>
          <button type="button" className="scene-close" onClick={close} aria-label="Close the 3D view">
            Close
          </button>
        </div>
        {open ? story : null}
      </dialog>
    </figure>
  );
}

function StoryBar(p: {
  beats: Beat[];
  beat: Beat | undefined;
  progress: number;
  playing: boolean;
  disabled: boolean;
  onToggle(): void;
  onScrub(x: number): void;
}) {
  const i = p.beat ? p.beats.indexOf(p.beat) : 0;
  const step = (d: number) => {
    const next = p.beats[Math.min(p.beats.length - 1, Math.max(0, i + d))];
    if (next) p.onScrub(next.at);
  };
  return (
    <div className="story">
      <p className="story-caption" aria-live="off">
        <span className="story-title">{p.beat?.title}</span>
        <span className="story-text">{p.beat?.caption}</span>
      </p>
      <div className="story-controls">
        <button
          type="button"
          className="story-play"
          onClick={p.onToggle}
          disabled={p.disabled}
          aria-label={p.playing ? "Pause" : p.progress >= 1 ? "Play again" : "Play"}
        >
          {p.playing ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 3h3v10H4zM9 3h3v10H9z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </button>
        <div className="story-track">
          <input
            type="range"
            min={0}
            max={1}
            step="any"
            value={p.progress}
            disabled={p.disabled}
            aria-label="Where in the story"
            aria-valuetext={p.beat ? `${p.beat.title}: ${p.beat.caption}` : undefined}
            onChange={(ev) => p.onScrub(Number(ev.currentTarget.value))}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
                ev.preventDefault();
                step(1);
              } else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
                ev.preventDefault();
                step(-1);
              }
            }}
          />
          <span className="story-marks" aria-hidden="true">
            {p.beats.map((b) => (
              <span
                key={b.at}
                className={b.at <= p.progress + 1e-6 ? "story-mark is-past" : "story-mark"}
                style={{ left: `${(b.at * 100).toFixed(3)}%` }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
