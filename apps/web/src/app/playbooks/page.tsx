"use client";

import { Suspense, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdherenceReport } from "@/components/adherence-report";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postJson, useApi } from "@/lib/use-api";

interface Playbook {
  id: string;
  name: string;
  description: string;
  rules: string[];
  tradeCount: number;
}

export default function PlaybooksPage() {
  return (
    <Suspense>
      <Playbooks />
    </Suspense>
  );
}

function Playbooks() {
  const { data, error, refresh } = useApi<{ playbooks: Playbook[] }>("/api/playbooks");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");

  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setFailure("");
    try {
      await postJson("/api/playbooks", {
        name: name.trim(),
        description,
        rules: rules
          .split("\n")
          .map((rule) => rule.trim())
          .filter(Boolean),
      });
      setOpen(false);
      setName("");
      setDescription("");
      setRules("");
      refresh();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Could not create the playbook.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <FilterBar
        title="Playbooks"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus />
            New playbook
          </Button>
        }
      />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {error && (
          <p role="alert" className="col-span-full text-sm text-destructive">
            {error}
          </p>
        )}
        {data?.playbooks.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            A playbook is a setup you trade on purpose: name it, write its rules, then tag trades
            with it and let Reports tell you if it actually pays.
          </p>
        )}
        {data?.playbooks.map((playbook) => (
          <Card key={playbook.id}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-foreground text-base font-semibold">
                {playbook.name}
              </CardTitle>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{playbook.tradeCount} trades</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete playbook ${playbook.name}`}
                  title="Delete playbook"
                  onClick={async () => {
                    if (
                      confirm(
                        `Delete "${playbook.name}"? Trades keep their data, just lose the link.`,
                      )
                    ) {
                      try {
                        await postJson(`/api/playbooks/${playbook.id}`, undefined, "DELETE");
                      } catch (error) {
                        alert(
                          error instanceof Error ? error.message : "Could not delete the playbook.",
                        );
                      }
                      refresh();
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {playbook.description && (
                <p className="text-sm text-muted-foreground">{playbook.description}</p>
              )}
              {playbook.rules.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {playbook.rules.map((rule, index) => (
                    <li key={index} className="flex min-w-0 gap-2 break-words">
                      <span className="text-muted-foreground">{index + 1}.</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
              <AdherenceReport bookId={playbook.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New playbook</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Input
              aria-label="Playbook name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name (e.g. Opening range breakout)"
            />
            <Input
              aria-label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="One-line description"
            />
            <Textarea
              aria-label="Rules, one per line"
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              placeholder={
                "One rule per line:\nOnly A+ setups\nRisk max 1R\nNo entries after 11:30"
              }
              className="min-h-32"
            />
            {failure && (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            )}
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
