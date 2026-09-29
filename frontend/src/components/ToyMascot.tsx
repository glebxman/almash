import clsx from "clsx";
import { useEffect, useRef, type CSSProperties } from "react";

type Mood = "idle" | "yay" | "sad" | "wave";

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

type Face = "front" | "back" | "right" | "left" | "top" | "bottom";

// Brand palette; opposite faces share a hue family like a real cube.
const STICKER: Record<Face, string> = {
  front: "#8B7CFF",
  back: "#C4B5FF",
  right: "#FF6D57",
  left: "#FFFDF7",
  top: "#D6F15C",
  bottom: "#A9C92E",
};

const FACES: Face[] = ["front", "back", "right", "left", "top", "bottom"];

// 27 cubies of a 3×3×3 cube; CSS y grows downwards, so y = -1 is the top layer.
const CUBIES = Array.from({ length: 27 }, (_, i) => {
  const x = (i % 3) - 1;
  const y = (Math.floor(i / 3) % 3) - 1;
  const z = Math.floor(i / 9) - 1;
  const outside: Record<Face, boolean> = {
    front: z === 1,
    back: z === -1,
    right: x === 1,
    left: x === -1,
    top: y === -1,
    bottom: y === 1,
  };
  // Scramble moves (see mc-twist): 1) top layer +90° around Y, 2) bottom layer
  // -90° around Y, 3) right column +90° around X (turns up). A cubie joins the
  // column by where it sits AFTER the Y twists: rotateY(90°) maps x' = z,
  // rotateY(-90°) maps x' = -z.
  const a1 = y === -1 ? 90 : 0;
  const a2 = y === 1 ? -90 : 0;
  const inColumn = y === -1 ? z === 1 : y === 1 ? z === -1 : x === 1;
  const style = {
    "--x": x,
    "--y": y,
    "--z": z,
    "--a1": `${a1}deg`,
    "--ty": `${a1 + a2}deg`,
    "--cx": inColumn ? "90deg" : "0deg",
  } as CSSProperties;
  return { key: i, outside, style };
});

/**
 * Rubik's-cube mascot built with CSS 3D transforms. Its horizontal layers
 * twist left and right to scramble, then twist back until it is solved again.
 * The scene tilts slightly toward the pointer through `--lx` / `--ly`.
 * `reverse` plays the twists the other way round.
 */
export function ToyMascot({
  mood = "idle",
  reverse = false,
  className,
}: {
  mood?: Mood;
  reverse?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const lx = clamp((px - (r.left + r.width / 2)) / (window.innerWidth * 0.5));
      const ly = clamp((py - (r.top + r.height / 2)) / (window.innerHeight * 0.5));
      el.style.setProperty("--lx", lx.toFixed(3));
      el.style.setProperty("--ly", ly.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={clsx("mascot-cube", className)}
      data-mood={mood}
      data-reverse={reverse || undefined}
      aria-hidden
    >
      <div className="mc-shadow" />
      <div className="mc-float">
        <div className="mc-tilt">
          <div className="mc-spin">
            {CUBIES.map((c) => (
              <div key={c.key} className="mc-cubie" style={c.style}>
                {FACES.map((f) => (
                  <div key={f} className={`mc-face mc-${f}`}>
                    {c.outside[f] && (
                      <span className="mc-sticker" style={{ backgroundColor: STICKER[f] }} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
