const COLORS = ["#8B7CFF", "#D6F15C", "#C4B5FF", "#FF6D57", "#A9C92E"];

export function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 22 }).map((_, i) => (
        <span
          key={i}
          className="confetti-bit absolute top-1/3 h-2.5 w-2.5 rounded-sm"
          style={{
            left: `${8 + ((i * 17) % 84)}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${i * 28}ms`,
            transform: `rotate(${i * 24}deg)`,
          }}
        />
      ))}
    </div>
  );
}
