"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Study Progress Dashboard — mock data only. Premium dark UI, single file.
 */

const MOCK = {
  displayName: "M. Chen",
  totalXp: 4250,
  streakDays: 14,
  quizzesCompleted: 47,
  studyTime: { hours: 36, minutes: 20 },
  lastUpdated: "Mar 9, 2025 · 09:41",
  topics: [
    { id: "1", label: "Cell biology", percent: 92 },
    { id: "2", label: "Organic chemistry", percent: 64 },
    { id: "3", label: "Statistics", percent: 38 },
    { id: "4", label: "Physiology", percent: 81 },
  ],
  /** Hardcoded sparkline points (normalized 0–40 viewBox height) */
  sparklinePoints: [8, 14, 11, 22, 18, 28, 24, 32, 29, 36, 34, 38],
};

const STAGGER_MS = 95;
const BAR_BASE_DELAY_MS = 520;

export default function StudyProgressDashboard() {
  const [streakDisplay, setStreakDisplay] = useState(0);
  const [barPhase, setBarPhase] = useState(0); // 0 = hidden, 1 = ready to fill
  const rafRef = useRef(null);

  useEffect(() => {
    const target = MOCK.streakDays;
    const duration = 900;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setStreakDisplay(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBarPhase(1), BAR_BASE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap");

        .spd-root {
          --bg: #0b1114;
          --bg-warm: #12100e;
          --bg-teal: #0c1618;
          --surface: rgba(232, 228, 220, 0.04);
          --surface-hover: rgba(232, 228, 220, 0.07);
          --border: rgba(232, 228, 220, 0.09);
          --border-hover: rgba(200, 240, 74, 0.35);
          --text: #e4e0d8;
          --text-dim: #8a8680;
          --text-muted: #5c5954;
          --accent: #c8f04a;
          --accent-dim: rgba(200, 240, 74, 0.12);
          --font-display: "Syne", system-ui, sans-serif;
          --font-data: "IBM Plex Mono", ui-monospace, monospace;
          --ease: cubic-bezier(0.22, 1, 0.36, 1);
          --shadow-hover: 0 18px 48px rgba(0, 0, 0, 0.45);

          min-height: 100%;
          font-family: var(--font-data);
          color: var(--text);
          background: var(--bg);
          background-image:
            radial-gradient(ellipse 100% 80% at 0% 0%, rgba(18, 16, 14, 0.9) 0%, transparent 55%),
            radial-gradient(ellipse 80% 60% at 100% 100%, rgba(12, 22, 24, 0.85) 0%, transparent 50%),
            linear-gradient(180deg, var(--bg-teal) 0%, var(--bg) 40%, var(--bg-warm) 100%);
        }

        .spd-grain {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.055;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          mix-blend-mode: overlay;
        }

        .spd-shell {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: clamp(0.75rem, 2vw, 1.25rem) clamp(1rem, 3vw, 2rem) clamp(2rem, 5vw, 4rem);
        }

        /* ——— Nav ——— */
        .spd-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: clamp(1.25rem, 3vw, 2rem);
          border-bottom: 1px solid var(--border);
          margin-bottom: clamp(1.25rem, 3vw, 2rem);
          opacity: 0;
          animation: spd-enter 0.55s var(--ease) forwards;
        }

        .spd-logo {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 0.95rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-dim);
        }

        .spd-logo span { color: var(--accent); }

        .spd-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: linear-gradient(135deg, var(--surface-hover), transparent);
          box-shadow: inset 0 0 0 1px rgba(232, 228, 220, 0.06);
        }

        /* ——— Asymmetric grid ——— */
        .spd-grid {
          display: grid;
          gap: clamp(0.75rem, 2vw, 1rem);
          grid-template-columns: 1fr;
          grid-template-areas:
            "xp"
            "streak"
            "pair"
            "topics"
            "spark";
        }

        @media (min-width: 900px) {
          .spd-grid {
            grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.55fr) minmax(0, 0.95fr);
            grid-template-rows: auto auto 1fr;
            grid-template-areas:
              "xp      xp      streak"
              "xp      pair    topics"
              "spark   spark   topics";
            align-items: stretch;
          }
        }

        .spd-card {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          transition:
            box-shadow 0.35s var(--ease),
            border-color 0.35s var(--ease),
            background 0.35s var(--ease);
        }

        .spd-card:hover {
          border-color: var(--border-hover);
          box-shadow:
            inset 0 0 0 1px rgba(200, 240, 74, 0.08),
            inset 0 0 32px rgba(200, 240, 74, 0.04);
          background: var(--surface-hover);
        }

        .spd-meta {
          font-size: 0.62rem;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-top: 0.75rem;
        }

        @keyframes spd-enter {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* stagger: 1–6 */
        .spd-s1 { animation: spd-enter 0.6s var(--ease) calc(${STAGGER_MS * 0}ms) both; }
        .spd-s2 { animation: spd-enter 0.6s var(--ease) calc(${STAGGER_MS * 1}ms) both; }
        .spd-s3 { animation: spd-enter 0.6s var(--ease) calc(${STAGGER_MS * 2}ms) both; }
        .spd-s4 { animation: spd-enter 0.6s var(--ease) calc(${STAGGER_MS * 3}ms) both; }
        .spd-s5 { animation: spd-enter 0.6s var(--ease) calc(${STAGGER_MS * 4}ms) both; }

        /* ——— XP hero ——— */
        .spd-xp {
          grid-area: xp;
          padding: clamp(1.25rem, 3.5vw, 2rem);
          min-height: 200px;
        }

        @media (min-width: 900px) {
          .spd-xp { min-height: 280px; }
        }

        .spd-xp-ghost {
          position: absolute;
          right: -5%;
          top: 50%;
          transform: translateY(-50%);
          font-family: var(--font-display);
          font-weight: 800;
          font-size: clamp(7rem, 22vw, 14rem);
          line-height: 1;
          color: rgba(232, 228, 220, 0.04);
          pointer-events: none;
          user-select: none;
        }

        .spd-xp-radial {
          position: absolute;
          left: -20%;
          bottom: -30%;
          width: 70%;
          height: 80%;
          background: radial-gradient(circle, var(--accent-dim) 0%, transparent 65%);
          pointer-events: none;
          opacity: 0.7;
        }

        .spd-xp-kicker {
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
          position: relative;
          z-index: 1;
        }

        .spd-xp-value {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(3rem, 10vw, 4.75rem);
          line-height: 0.95;
          letter-spacing: -0.03em;
          color: var(--text);
          position: relative;
          z-index: 1;
        }

        .spd-xp-value small {
          font-family: var(--font-data);
          font-size: 0.35em;
          font-weight: 500;
          letter-spacing: 0.08em;
          color: var(--accent);
          vertical-align: 0.35em;
          margin-left: 0.15em;
        }

        /* ——— Streak editorial ——— */
        .spd-streak {
          grid-area: streak;
          padding: clamp(1rem, 2.5vw, 1.5rem);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .spd-streak-num {
          font-family: var(--font-display);
          font-weight: 800;
          font-size: clamp(4rem, 14vw, 6.5rem);
          line-height: 0.85;
          letter-spacing: -0.04em;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }

        .spd-streak-num .spd-accent { color: var(--accent); }

        .spd-streak-label {
          font-size: 0.62rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-top: 0.5rem;
        }

        /* ——— Pair: quizzes + time ——— */
        .spd-pair {
          grid-area: pair;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.65rem;
        }

        @media (max-width: 899px) {
          .spd-pair { grid-template-columns: 1fr; }
        }

        .spd-mini {
          padding: 1rem 1.1rem;
        }

        .spd-mini-val {
          font-family: var(--font-data);
          font-size: 1.35rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
          color: var(--text);
        }

        .spd-mini-label {
          font-size: 0.58rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-top: 0.35rem;
        }

        /* ——— Topics ——— */
        .spd-topics {
          grid-area: topics;
          padding: clamp(1rem, 2.5vw, 1.35rem);
        }

        .spd-topics-h {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 1rem;
          letter-spacing: -0.02em;
          margin: 0 0 1rem;
          color: var(--text-dim);
        }

        .spd-topic {
          margin-bottom: 1rem;
        }

        .spd-topic:last-child { margin-bottom: 0; }

        .spd-topic-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }

        .spd-topic-name {
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--text-dim);
        }

        .spd-topic-pct {
          font-family: var(--font-data);
          font-size: 0.7rem;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--accent);
        }

        .spd-bar-wrap {
          height: 2px;
          border-radius: 1px;
          background: rgba(232, 228, 220, 0.08);
          overflow: hidden;
          position: relative;
        }

        .spd-bar-fill {
          height: 100%;
          width: 0%;
          border-radius: 1px;
          background: linear-gradient(90deg, rgba(200, 240, 74, 0.35), var(--accent));
          transition: width 1s cubic-bezier(0.33, 1, 0.68, 1);
          position: relative;
        }

        .spd-bar-fill.spd-bar-on {
          width: var(--w, 0%);
        }

        .spd-bar-fill::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(228, 224, 216, 0.22) 45%,
            transparent 90%
          );
          background-size: 200% 100%;
          animation: spd-shimmer 2.8s ease-in-out infinite;
          opacity: 0.9;
        }

        @keyframes spd-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* ——— Sparkline card ——— */
        .spd-spark {
          grid-area: spark;
          padding: clamp(1rem, 2.5vw, 1.35rem);
        }

        .spd-spark-h {
          font-size: 0.58rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.65rem;
        }

        .spd-spark-svg {
          width: 100%;
          height: 72px;
          display: block;
        }

        .spd-spark-line {
          fill: none;
          stroke: var(--accent);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0.85;
        }

        .spd-spark-dots circle {
          fill: var(--accent);
          opacity: 0.35;
        }

        .spd-spark-note {
          font-size: 0.6rem;
          color: var(--text-muted);
          margin-top: 0.5rem;
          letter-spacing: 0.04em;
        }
      `}</style>

      <div className="spd-root">
        <div className="spd-grain" aria-hidden />

        <div className="spd-shell">
          <header className="spd-nav">
            <div className="spd-logo">
              Socr<span>ato</span>
            </div>
            <div className="spd-avatar" aria-hidden title="Profile" />
          </header>

          <div className="spd-grid">
            <article className="spd-card spd-xp spd-s1">
              <div className="spd-xp-radial" aria-hidden />
              <span className="spd-xp-ghost" aria-hidden>
                P
              </span>
              <p className="spd-xp-kicker">Total points</p>
              <p className="spd-xp-value">
                {MOCK.totalXp.toLocaleString()}
                <small>XP</small>
              </p>
              <p className="spd-meta">Last updated · {MOCK.lastUpdated}</p>
            </article>

            <article className="spd-card spd-streak spd-s2">
              <div
                className="spd-streak-num"
                aria-live="polite"
              >
                <span className="spd-accent">{streakDisplay}</span>
              </div>
              <p className="spd-streak-label">Day streak</p>
              <p className="spd-meta">Rolling · resets at midnight local</p>
            </article>

            <div className="spd-pair spd-s3">
              <article className="spd-card spd-mini">
                <div className="spd-mini-val">{MOCK.quizzesCompleted}</div>
                <div className="spd-mini-label">Quizzes</div>
                <p className="spd-meta">All-time</p>
              </article>
              <article className="spd-card spd-mini">
                <div className="spd-mini-val">
                  {MOCK.studyTime.hours}h {MOCK.studyTime.minutes}m
                </div>
                <div className="spd-mini-label">Focus time</div>
                <p className="spd-meta">Tracked</p>
              </article>
            </div>

            <article className="spd-card spd-topics spd-s4">
              <h2 className="spd-topics-h">Topics</h2>
              {MOCK.topics.map((topic, i) => (
                <div key={topic.id} className="spd-topic">
                  <div className="spd-topic-row">
                    <span className="spd-topic-name">{topic.label}</span>
                    <span className="spd-topic-pct">{topic.percent}%</span>
                  </div>
                  <div className="spd-bar-wrap">
                    <div
                      className={`spd-bar-fill ${barPhase ? "spd-bar-on" : ""}`}
                      style={{
                        "--w": `${topic.percent}%`,
                        transitionDelay: barPhase ? `${i * 110}ms` : "0ms",
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="spd-meta">Coverage vs. your study plan · mock</p>
            </article>

            <article className="spd-card spd-spark spd-s5">
              <p className="spd-spark-h">7-day activity</p>
              <Sparkline points={MOCK.sparklinePoints} />
              <p className="spd-spark-note">Dots · sessions logged · sample series</p>
              <p className="spd-meta">Ref. {MOCK.lastUpdated}</p>
            </article>
          </div>
        </div>
      </div>
    </>
  );
}

function Sparkline({ points }) {
  const w = 280;
  const h = 40;
  const pad = 4;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const pathD = points
    .map((p, i) => {
      const x = pad + i * step;
      const y = h - pad - ((p - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="spd-spark-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <g className="spd-spark-dots">
        {points.map((p, i) => {
          const x = pad + i * step;
          const y = h - pad - ((p - min) / range) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r={1.2} />;
        })}
      </g>
      <path className="spd-spark-line" d={pathD} />
    </svg>
  );
}
