// useReplay.ts — plays the stored monitor alerts month by month (SPEC §8.5, GET /api/monitor/replay, SSE).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "../hooks/useGlobalParams";
import { MONTHS } from "../hooks/useGlobalParams";
import { USE_MOCKS } from "./queries";
import type { ReplayFrame } from "./types";

export type ReplayState = "idle" | "playing" | "paused" | "done" | "error";

/** SPEC §8.5: the replay starts at M06. */
export const REPLAY_FROM = MONTHS[6];

export function useReplay(profile: Profile) {
  const [state, setState] = useState<ReplayState>("idle");
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [speedMs, setSpeedMs] = useState(1200);
  const source = useRef<EventSource | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const onFrame = useCallback((f: ReplayFrame) => setFrames((prev) => [...prev, f]), []);

  const play = useCallback(
    async (from?: string) => {
      stop();
      const start = from ?? REPLAY_FROM;
      if (!from) setFrames([]);
      setState("playing");
      if (USE_MOCKS) {
        const all = (await import("../mocks/generate")).mockReplayFrames(profile, start, MONTHS[MONTHS.length - 1]);
        let i = 0;
        timer.current = window.setInterval(() => {
          if (i < all.length) onFrame(all[i++]);
          else {
            stop();
            setState("done");
          }
        }, speedMs);
        return;
      }
      const es = new EventSource(`/api/monitor/replay?profile=${profile}&from=${start}&stepMs=${speedMs}`);
      source.current = es;
      es.addEventListener("month", (e) => onFrame(JSON.parse((e as MessageEvent<string>).data) as ReplayFrame));
      es.addEventListener("done", () => {
        stop();
        setState("done");
      });
      es.onerror = () => {
        // EventSource reconnects by itself; for a replay that would restart the stream. Close instead.
        stop();
        setState((s) => (s === "playing" ? "error" : s));
      };
    },
    [profile, speedMs, stop, onFrame],
  );

  /** Pause closes the stream. Resume re-opens it from the month after the last frame. */
  const pause = useCallback(() => {
    stop();
    setState("paused");
  }, [stop]);

  const resume = useCallback(() => {
    const last = frames.at(-1)?.month;
    const next = last ? MONTHS[MONTHS.indexOf(last) + 1] : undefined;
    if (last && !next) setState("done");
    else void play(next);
  }, [frames, play]);

  const reset = useCallback(() => {
    stop();
    setFrames([]);
    setState("idle");
  }, [stop]);

  // A profile switch (or leaving the page) ends the replay.
  useEffect(() => () => reset(), [profile, reset]);

  const last = frames.at(-1);
  return {
    state,
    frames,
    month: last?.month ?? null,
    watchlistSize: last?.watchlistSize ?? null,
    speedMs,
    setSpeed: setSpeedMs,
    play,
    pause,
    resume,
    reset,
  };
}
