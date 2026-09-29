import { describe, expect, it } from "vitest";
import {
  chunkText,
  cosine,
  plainText,
  rankDocs,
  wordScores,
  type SearchDoc,
} from "../src/lib/note-search";

describe("note passages", () => {
  it("read as plain words, without images, links or markup", () => {
    expect(
      plainText("## Plan\n\n**Waited** for [the retest](/charts?id=1) ![chart](/api/x.png)"),
    ).toBe("Plan\n\nWaited for the retest");
  });

  it("are cut at paragraphs and sentences into bounded passages", () => {
    const text = ["First paragraph is short.", "Second one. ".repeat(20), "x".repeat(250)].join(
      "\n\n",
    );
    const chunks = chunkText(text, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    // Short paragraphs share a passage, on their own lines.
    expect(chunks[0]!.startsWith("First paragraph is short.\nSecond one.")).toBe(true);
    expect(chunks.join(" ")).toContain("xxxx");
  });
});

describe("searching by words", () => {
  it("scores the passages that share the rare words highest", () => {
    const scores = wordScores("froze after the stop", [
      "I froze after my stop was hit and missed the next move",
      "Good day, followed the plan",
      "The stop was fine",
    ]);
    expect(scores[0]).toBeGreaterThan(scores[2]!);
    expect(scores[1]).toBe(0);
  });

  it("keeps each note's best passage, best notes first", () => {
    const doc = (id: string): SearchDoc => ({
      kind: "day",
      id,
      title: id,
      url: `/journal/${id}`,
      date: id,
      text: "",
    });
    const hits = rankDocs(
      [
        { doc: doc("a"), text: "a1", score: 0.3 },
        { doc: doc("a"), text: "a2", score: 0.9 },
        { doc: doc("b"), text: "b1", score: 0.5 },
        { doc: doc("c"), text: "c1", score: 0.1 },
      ],
      5,
      0.2,
    );
    expect(hits.map((h) => [h.id, h.snippet])).toEqual([
      ["a", "a2"],
      ["b", "b1"],
    ]);
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});
