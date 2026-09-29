"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilters } from "./filter-bar";
import { JournalChat } from "./journal-chat";

const SUGGESTIONS = [
  "What's my most expensive mistake?",
  "Which weekday should I stop trading?",
  "Am I better at longs or shorts?",
  "What do my five worst trades have in common?",
];

/** Ask your journal, as a chat: the model looks up what it needs within the page's filters. */
export function AskJournalChat() {
  const { values, timeZone } = useFilters();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask your journal</CardTitle>
      </CardHeader>
      <CardContent>
        <JournalChat
          key={timeZone}
          target={{ kind: "journal", filters: values, timeZone }}
          suggestions={SUGGESTIONS}
          placeholder="Why do my Monday shorts keep failing?"
          intro="A new chat uses the selected accounts and filters. The AI looks up trades, stats, notes and charts within them; follow-ups keep that scope."
        />
      </CardContent>
    </Card>
  );
}
