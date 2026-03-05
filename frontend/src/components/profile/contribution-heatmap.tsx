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

  const fetchCourses = React.useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("user_courses")
      .select("id, name")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as CourseOption[];
  }, [userId]);

  React.useEffect(() => {
    let cancelled = false;
    setCoursesLoading(true);
    fetchCourses()
      .then((rows) => {
        if (!cancelled) setCourses(rows);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchCourses]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`heatmap-courses-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_courses",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchCourses()
            .then(setCourses)
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchCourses]);

  React.useEffect(() => {
    // Simple responsive tuning to keep the 365-day grid readable with room for scrollbar.
    function update() {
      const w = window.innerWidth;
      if (w < 420) {
        setBlockSize(10);
        setBlockMargin(4);
      } else if (w < 640) {
        setBlockSize(11);
        setBlockMargin(4);
      } else {
        setBlockSize(14);
        setBlockMargin(5);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const fetchHeatmapData = React.useCallback(async () => {
    const year = Number(range);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
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
      map.set(r.date, { date: r.date, count: Number(r.count) || 0 });
    }

    const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    const withLevels = computeLevels(merged);
    const sum = merged.reduce((acc, d) => acc + (d.count || 0), 0);
    return { data: withLevels, total: sum };
  }, [userId, selectedCourseId, range]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHeatmapData()
      .then(({ data: nextData, total: nextTotal }) => {
        if (!cancelled) {
          setData(nextData);
          setTotal(nextTotal);
        }
      })
      .catch(() => {
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
  }, [fetchHeatmapData]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`heatmap-contributions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_daily_contributions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchHeatmapData()
            .then(({ data: nextData, total: nextTotal }) => {
              setData(nextData);
              setTotal(nextTotal);
            })
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchHeatmapData]);

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
    <Card className="min-w-0">
      <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-6">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
          {total === 0 && !loading ? (
            <CardDescription>No contributions yet</CardDescription>
          ) : (
            <CardDescription className={loading ? "opacity-70" : undefined}>
              {`Year ${range}`} · {subtitle}
            </CardDescription>
          )}
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          <label className="sr-only text-xs text-muted-foreground" htmlFor="heatmap-range">
            Year
          </label>
          <select
            id="heatmap-range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            <option value={String(currentYear)}>{currentYear}</option>
            <option value={String(currentYear - 1)}>{currentYear - 1}</option>
            <option value={String(currentYear - 2)}>{currentYear - 2}</option>
          </select>
          <label className="sr-only text-xs text-muted-foreground" htmlFor="heatmap-course">
            Course
          </label>
          <select
            id="heatmap-course"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            disabled={coursesLoading}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:w-auto"
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
      <CardContent className="min-w-0 p-4 pb-6 sm:p-6 sm:pb-8">
        <div className="min-w-0 overflow-x-hidden rounded-md border border-border bg-background p-4 pr-6 sm:p-5 sm:pr-8">
          <ActivityCalendar
            data={data}
            theme={theme}
            loading={loading}
            showTotalCount={false}
            showColorLegend
            showMonthLabels
            weekStart={0}
            showWeekdayLabels={["sun", "mon", "tue", "wed", "thu", "fri", "sat"]}
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

