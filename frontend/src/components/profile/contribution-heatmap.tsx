"use client";

import * as React from "react";
import { ActivityCalendar } from "react-activity-calendar";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export type ContributionDay = {
  date: string; // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function localDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function makeEmptyRange(start: Date, end: Date): ContributionDay[] {
  const startDay = startOfLocalDay(start);
  const endDay = startOfLocalDay(end);
  const days =
    Math.max(
      1,
      Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    );
  const out: ContributionDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(startDay, i);
    out.push({ date: localDateString(d), count: 0, level: 0 });
  }
  return out;
}

function computeLevels(days: Array<{ date: string; count: number }>): ContributionDay[] {
  const max = Math.max(0, ...days.map((d) => d.count));
  return days.map((d) => {
    const level =
      d.count <= 0 || max <= 0
        ? 0
        : (Math.min(4, Math.ceil((d.count / max) * 4)) as 1 | 2 | 3 | 4);
    return { date: d.date, count: d.count, level };
  });
}

type CourseOption = { id: string; name: string };

export function ContributionHeatmap({
  title = "Contribution heatmap",
  subtitle = "Jan 1 – Dec 31",
  userId,
}: {
  title?: string;
  subtitle?: string;
  userId: string;
}) {
  const currentYear = new Date().getFullYear();
  const [data, setData] = React.useState<ContributionDay[]>(() =>
    makeEmptyRange(new Date(currentYear, 0, 1), new Date(currentYear, 11, 31)),
  );
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = React.useState(true);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>("all");
  const [blockSize, setBlockSize] = React.useState(12);
  const [blockMargin, setBlockMargin] = React.useState(4);
  const [range, setRange] = React.useState<string>(String(currentYear));

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setCoursesLoading(true);
      const { data: rows, error } = await supabase
        .from("user_courses")
        .select("id, name")
        .eq("user_id", userId)
        .order("name", { ascending: true });
      if (error) throw error;
      if (!cancelled) setCourses((rows ?? []) as CourseOption[]);
    }
    run()
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  React.useEffect(() => {
    // Simple responsive tuning to keep the 365-day grid readable on mobile.
    function update() {
      const w = window.innerWidth;
      if (w < 420) {
        setBlockSize(9);
        setBlockMargin(3);
      } else if (w < 640) {
        setBlockSize(10);
        setBlockMargin(3);
      } else {
        setBlockSize(12);
        setBlockMargin(4);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const today = startOfLocalDay(new Date());
      const year = Number(range);
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);

      // Start with an empty range so the calendar always renders.
      const empty = makeEmptyRange(start, end);
      const map = new Map(empty.map((d) => [d.date, { date: d.date, count: 0 }]));

      let q = supabase
        .from("user_daily_contributions")
        .select("date, count")
        .eq("user_id", userId)
        .gte("date", localDateString(start))
        .lte("date", localDateString(end))
        .order("date", { ascending: true });

      if (selectedCourseId !== "all") {
        q = q.eq("course_id", selectedCourseId);
      }

      const { data: rows, error } = await q;

      if (error) throw error;

      for (const r of (rows ?? []) as Array<{ date: string; count: number }>) {
        // Supabase returns date as `YYYY-MM-DD` for `date` columns.
        map.set(r.date, { date: r.date, count: Number(r.count) || 0 });
      }

      const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      const withLevels = computeLevels(merged);
      const sum = merged.reduce((acc, d) => acc + (d.count || 0), 0);

      if (!cancelled) {
        setData(withLevels);
        setTotal(sum);
      }
    }

    run()
      .catch(() => {
        // If table isn't ready yet or RLS blocks it, fall back to 0 contributions.
        if (!cancelled) {
          const today = startOfLocalDay(new Date());
          setData(makeEmptyRange(new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31)));
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, selectedCourseId, range]);

  // White → black scale (darker = more).
  const theme = React.useMemo(
    () => ({
      light: [
        "#ffffff",
        "#e5e5e5",
        "#bdbdbd",
        "#737373",
        "#000000",
      ],
      dark: [
        "#ffffff",
        "#e5e5e5",
        "#bdbdbd",
        "#737373",
        "#000000",
      ],
    }),
    [],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {total === 0 && !loading ? (
            <CardDescription>No contributions yet</CardDescription>
          ) : (
            <CardDescription className={loading ? "opacity-70" : undefined}>
              {`Year ${range}`} · {subtitle}
            </CardDescription>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="heatmap-range">
            Year
          </label>
          <select
            id="heatmap-range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={String(currentYear)}>{currentYear}</option>
            <option value={String(currentYear - 1)}>{currentYear - 1}</option>
            <option value={String(currentYear - 2)}>{currentYear - 2}</option>
          </select>
          <label className="text-xs text-muted-foreground" htmlFor="heatmap-course">
            Course
          </label>
          <select
            id="heatmap-course"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            disabled={coursesLoading}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="all">All contributions</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border bg-background p-3">
          <ActivityCalendar
            data={data}
            theme={theme}
            loading={loading}
            showTotalCount={false}
            showColorLegend
            showMonthLabels
            weekStart={6}
            showWeekdayLabels={["sat", "sun", "mon", "tue", "wed", "thu", "fri"]}
            labels={{
              legend: { less: "Less", more: "More" },
            }}
            tooltips={{
              activity: {
                text: (a) => `${a.date}: ${a.count} XP`,
              },
            }}
            renderBlock={(block, activity) => {
              // react-activity-calendar sets stroke via inline style; override style (not SVG attrs)
              // so borders remain visible when blocks are white.
              const prevStyle = (block.props as { style?: React.CSSProperties }).style;
              return React.cloneElement(block, {
                style: {
                  ...prevStyle,
                  stroke: "rgba(0,0,0,0.28)",
                  strokeWidth: 1,
                  shapeRendering: "crispEdges",
                },
                // More readable tooltip target.
                "aria-label": `${activity.date}: ${activity.count} XP`,
              });
            }}
            blockSize={blockSize}
            blockMargin={blockMargin}
            fontSize={12}
          />
        </div>
      </CardContent>
    </Card>
  );
}

