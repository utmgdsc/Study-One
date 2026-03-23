"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import type { Flashcard } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FlashcardSetRow = {
  id: string;
  topic: string | null;
  source_text: string | null;
  created_at: string;
  cards: Flashcard[];
};

/** First non-empty line from notes or topic, max 50 chars. */
function setTitle(notes: string | null, topic: string | null): string {
  const text = (notes ?? "").trim() || (topic ?? "").trim();
  if (!text) return "Untitled set";
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  return !line ? "Untitled set" : line.length > 50 ? line.slice(0, 50) + "…" : line;
}

type SortOption = "recent" | "oldest" | "shortest" | "longest";

export default function FlashcardGalleryPage() {
  const { user } = useAuth();
  const [sets, setSets] = useState<FlashcardSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) {
      setSets([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: dbError } = await supabase
          .from("flashcards")
          .select("id, topic, source_text, created_at, cards")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (dbError) {
          throw dbError;
        }
        if (!cancelled) {
          setSets((data ?? []) as unknown as FlashcardSetRow[]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load flashcard sets:", err);
          setError("Could not load your flashcards. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const topics = useMemo(() => {
    const all = new Set<string>();
    for (const set of sets) {
      if (set.topic && set.topic.trim()) {
        all.add(set.topic.trim());
      }
    }
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [sets]);

  const filteredSets = useMemo(() => {
    let next = sets;
    const q = search.trim().toLowerCase();
    if (q) {
      next = next.filter((set) => {
        const topic = set.topic ?? "";
        const previewQuestions = (set.cards ?? [])
          .slice(0, 3)
          .map((c) => c.question)
          .join(" ");
        return (
          topic.toLowerCase().includes(q) ||
          previewQuestions.toLowerCase().includes(q)
        );
      });
    }
    if (topicFilter !== "all") {
      next = next.filter((set) => (set.topic ?? "").trim() === topicFilter);
    }

    const setsCopy = [...next];
    setsCopy.sort((a, b) => {
      if (sortBy === "recent") {
        return b.created_at.localeCompare(a.created_at);
      }
      if (sortBy === "oldest") {
        return a.created_at.localeCompare(b.created_at);
      }
      const lenA = a.cards?.length ?? 0;
      const lenB = b.cards?.length ?? 0;
      if (sortBy === "shortest") {
        return lenA - lenB;
      }
      return lenB - lenA;
    });
    return setsCopy;
  }, [sets, search, sortBy, topicFilter]);

  if (!user) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-2xl font-semibold">Flashcards</h1>
          <p className="text-muted-foreground text-sm">
            Sign in to save flashcard sets and review them later.
          </p>
          <Link
            href="/profile"
            className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Go to profile to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Flashcard sets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All the flashcard decks generated from your notes, grouped by topic.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="sr-only" htmlFor="flashcards-search">
                Search flashcards
              </label>
              <input
                id="flashcards-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by topic or question…"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All topics</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="shortest">Shortest set</option>
              <option value="longest">Longest set</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your flashcards…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : filteredSets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No flashcard sets yet. Generate a study pack from your notes and the flashcards
            will appear here automatically.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSets.map((set) => (
              <Link key={set.id} href={`/flashcards/${set.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {setTitle(set.source_text, set.topic)}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(set.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground space-y-1.5">
                    <p>{set.cards?.length ?? 0} cards</p>
                    {set.topic && (
                      <p className="truncate">
                        Topic: <span className="font-medium text-foreground">{set.topic}</span>
                      </p>
                    )}
                    {set.cards?.[0] && (
                      <p className="line-clamp-2">
                        First question:{" "}
                        <span className="text-foreground">{set.cards[0].question}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <Link
          href="/profile"
          className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
        >
          ← Back to profile
        </Link>
      </div>
    </main>
  );
}

