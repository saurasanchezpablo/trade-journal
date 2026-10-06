"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ManualTradeEntry } from "./manual-trade-entry";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { useT } from "./i18n";

export function AddTradeDialog({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          {t("Add trade")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Add trade")}</DialogTitle>
          <DialogDescription>
            {t(
              "Choose an account and enter your buys and sells. Save an entry alone for an open position, or include the exit to record a closed trade.",
            )}
          </DialogDescription>
        </DialogHeader>
        <ManualTradeEntry
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
