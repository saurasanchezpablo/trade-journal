"use client";
import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { OptionSelect } from "./ui/option-select";
import { DatePicker } from "./ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, fieldClass } from "./filter-fields";
import { Attachments } from "./attachments";
import { useApi, postJson } from "@/lib/use-api";
import { decodeImportFile } from "@/lib/decode-import";
import {
  fromMinor,
  label,
  PROP_PROGRAMS,
  PROP_STATES,
  PAYOUT_STATES,
  EXPENSE_CATEGORIES,
  type PropAccount,
  type PropEntry,
  type PropData,
  type PropAudit,
} from "@/lib/prop-firms";
import { randomId } from "@/lib/random-id";
import { useI18n } from "./i18n";
export type PropModal =
  | { kind: "account"; account?: PropAccount; parent?: PropAccount }
  | {
      kind: "entry";
      entry?: PropEntry;
      type: PropEntry["kind"];
      accountId?: string;
      category?: string;
      expense?: PropEntry;
    }
  | { kind: "receipt"; payout: PropEntry }
  | { kind: "detail"; type: "account" | "entry"; id: string }
  | {
      kind: "change";
      action: string;
      id: string;
      revision: number;
      payoutId?: string;
      value: boolean;
      name: string;
    }
  | { kind: "import" };
/** Titles per entry kind, kept whole so each translates as one sentence. */
const EDIT_TITLES: Record<PropEntry["kind"], string> = {
  expense: "Edit expense",
  refund: "Edit refund",
  payout: "Edit payout",
};
const DETAIL_TITLES: Record<PropEntry["kind"], string> = {
  expense: "Expense details",
  refund: "Refund details",
  payout: "Payout details",
};
type Props = { modal: PropModal; data: PropData; close: () => void; refresh: () => void };
export function PropFirmModal(props: Props) {
  const { modal, close } = props;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-2xl">
        {modal.kind === "account" ? (
          <AccountForm {...props} modal={modal} />
        ) : modal.kind === "entry" ? (
          <EntryForm {...props} modal={modal} />
        ) : modal.kind === "receipt" ? (
          <ReceiptForm {...props} modal={modal} />
        ) : modal.kind === "change" ? (
          <ChangeForm {...props} modal={modal} />
        ) : modal.kind === "import" ? (
          <ImportForm {...props} />
        ) : (
          <Detail {...props} modal={modal} />
        )}
      </DialogContent>
    </Dialog>
  );
}
function useSave(close: () => void, refresh: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/prop-firms", body);
      refresh();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}
function Form({
  title,
  description,
  busy,
  error,
  children,
  submit,
}: {
  title: string;
  description: string;
  busy: boolean;
  error: string;
  children: ReactNode;
  submit: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) submit();
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? t("Saving…") : t("Save record")}
        </Button>
      </form>
    </>
  );
}
const blankAccount = (today: string, parent?: PropAccount) => ({
  firm: parent?.firm ?? "",
  name: "",
  program: "evaluation",
  status: "active",
  currency: parent?.currency ?? "",
  size: parent?.sizeMinor == null ? "" : fromMinor(parent.sizeMinor, parent.currency),
  parentId: parent?.id ?? "",
  journalAccountId: "",
  openedOn: today,
  closedOn: "",
  renewalOn: "",
  renewalAmount: "",
  notes: "",
  reason: "",
});
function AccountForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "account" }> }) {
  const old = modal.account;
  const { t, tx } = useI18n();
  const show = (value: string) => tx("prop", label(value));
  const [id] = useState(() => old?.id ?? randomId());
  const [values, set] = useState(() =>
    old
      ? {
          firm: old.firm,
          name: old.name,
          program: old.program,
          status: old.status,
          currency: old.currency,
          size: old.sizeMinor == null ? "" : fromMinor(old.sizeMinor, old.currency),
          parentId: old.parentId ?? "",
          journalAccountId: old.journalAccountId ?? "",
          openedOn: old.openedOn,
          closedOn: old.closedOn ?? "",
          renewalOn: old.renewalOn ?? "",
          renewalAmount: old.renewalMinor == null ? "" : fromMinor(old.renewalMinor, old.currency),
          notes: old.notes,
          reason: "",
        }
      : blankAccount(data.today, modal.parent),
  );
  const { data: journal } = useApi<{ accounts: { id: string; name: string }[] }>(
    "/api/accounts?summary=1",
  );
  const { busy, error, save } = useSave(close, refresh);
  const input = (key: keyof typeof values, title: string, required = false) => (
    <Field label={t(title)}>
      <Input
        value={values[key]}
        required={required}
        onChange={(e) =>
          set({
            ...values,
            [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <Form
      title={
        old
          ? t("Edit prop account")
          : modal.parent
            ? t("Track next attempt or phase")
            : t("Track a prop account")
      }
      description={t(
        "Keep each evaluation, reset attempt and funding phase as its own record. Account size is nominal capital, not money you spent.",
      )}
      busy={busy}
      error={error}
      submit={() =>
        void save({ action: "account.save", id, revision: old?.revision ?? 0, ...values })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {input("firm", "Firm name", true)}
        {input("name", "Account / attempt name", true)}
        <Field label={t("Program")}>
          <OptionSelect
            value={values.program}
            onValueChange={(program) => set({ ...values, program })}
          >
            {PROP_PROGRAMS.map((v) => (
              <option key={v} value={v}>
                {show(v)}
              </option>
            ))}
          </OptionSelect>
        </Field>
        <Field label={t("Status")}>
          <OptionSelect
            value={values.status}
            onValueChange={(status) =>
              set({
                ...values,
                status,
                closedOn: status === "active" ? "" : values.closedOn || data.today,
                renewalOn: status === "active" ? values.renewalOn : "",
              })
            }
          >
            {PROP_STATES.map((v) => (
              <option key={v} value={v}>
                {show(v)}
              </option>
            ))}
          </OptionSelect>
        </Field>
        {input("currency", "Currency code", true)}
        {input("size", "Nominal account size (optional)")}
        <Field label={t("Opened on")}>
          <DatePicker
            label={t("Prop account opening date")}
            value={values.openedOn}
            max={data.today}
            onValueChange={(openedOn) => set({ ...values, openedOn })}
          />
        </Field>
        {values.status !== "active" && (
          <Field label={t("Resolved on")}>
            <DatePicker
              label={t("Prop account closing date")}
              value={values.closedOn}
              max={data.today}
              onValueChange={(closedOn) => set({ ...values, closedOn })}
            />
          </Field>
        )}
        <Field label={t("Previous attempt / phase")}>
          <OptionSelect
            value={values.parentId}
            onValueChange={(parentId) => set({ ...values, parentId })}
          >
            <option value="">{t("None")}</option>
            {data.accounts
              .filter(
                (a) =>
                  a.id !== id &&
                  a.firm.toLowerCase() === values.firm.trim().toLowerCase() &&
                  a.currency === values.currency,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </OptionSelect>
        </Field>
        <Field label={t("Link journal account (optional)")}>
          <OptionSelect
            value={values.journalAccountId}
            onValueChange={(journalAccountId) => set({ ...values, journalAccountId })}
          >
            <option value="">{t("No journal link")}</option>
            {journal?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </OptionSelect>
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">{t("Renewal reminder")}</summary>
        <p className="my-2 text-xs text-muted-foreground">
          {t(
            "A reminder only. Record an expense when charged; nothing is charged or added automatically.",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Next renewal")}>
            <DatePicker
              label={t("Next renewal date")}
              value={values.renewalOn}
              onValueChange={(renewalOn) => set({ ...values, renewalOn })}
            />
          </Field>
          {input("renewalAmount", "Expected renewal amount")}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => set({ ...values, renewalOn: "", renewalAmount: "" })}
        >
          {t("Clear reminder")}
        </Button>
      </details>
      <Field label={t("Notes / rules / breach reason")}>
        <textarea
          className={`${fieldClass} h-24 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      {old && input("reason", "Reason for change", true)}
    </Form>
  );
}
function EntryForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "entry" }> }) {
  const old = modal.entry,
    expense = modal.expense;
  const { t, tx } = useI18n();
  const show = (value: string) => tx("prop", label(value));
  const [id] = useState(() => old?.id ?? randomId());
  const initialAccount = data.accounts.find(
    (a) => a.id === (old?.accountId ?? expense?.accountId ?? modal.accountId),
  );
  const [values, set] = useState({
    accountId: old?.accountId ?? expense?.accountId ?? initialAccount?.id ?? "",
    firm: old?.firm ?? expense?.firm ?? initialAccount?.firm ?? "",
    currency: old?.currency ?? expense?.currency ?? initialAccount?.currency ?? "",
    category: old?.category ?? modal.category ?? "evaluation",
    amount: old ? fromMinor(old.amountMinor, old.currency) : "",
    splitPercent: old ? (old.splitBps / 100).toFixed(2) : "",
    fee: old ? fromMinor(old.feeMinor, old.currency) : "0",
    occurredOn: old?.occurredOn ?? data.today,
    dueOn: old?.dueOn ?? "",
    status: old?.status ?? "requested",
    parentId: old?.parentId ?? expense?.id ?? "",
    reference: old?.reference ?? "",
    notes: old?.notes ?? "",
    reason: "",
  });
  const kind = old?.kind ?? modal.type,
    payout = kind === "payout",
    refund = kind === "refund";
  const { busy, error, save } = useSave(close, refresh);
  const input = (key: keyof typeof values, title: string, required = false, disabled = false) => (
    <Field label={t(title)}>
      <Input
        required={required}
        disabled={disabled}
        value={values[key]}
        onChange={(e) =>
          set({
            ...values,
            [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <Form
      title={
        old
          ? t(EDIT_TITLES[kind])
          : payout
            ? t("Log a payout request")
            : refund
              ? t("Record an expense refund")
              : t("Record prop spending")
      }
      description={
        payout
          ? t(
              "A request is not income. Record actual bank receipts separately, including partial payments. This does not request a payout from your firm.",
            )
          : t(
              "Record cash that actually changed hands. Include taxes and fees in the amount paid. Do not duplicate trading commissions already included elsewhere.",
            )
      }
      busy={busy}
      error={error}
      submit={() =>
        void save({ action: "entry.save", id, revision: old?.revision ?? 0, kind, ...values })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Prop account")}>
          <OptionSelect
            disabled={Boolean(old || refund)}
            value={values.accountId}
            onValueChange={(accountId) => {
              const a = data.accounts.find((a) => a.id === accountId);
              set({ ...values, accountId, firm: a?.firm ?? "", currency: a?.currency ?? "" });
            }}
          >
            <option value="">
              {payout ? t("Choose a funded account") : t("Shared firm expense")}
            </option>
            {data.accounts
              .filter((a) => !payout || ["funded", "instant_funded", "live"].includes(a.program))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firm} · {a.name}
                  {a.archived ? ` ${t("(archived)")}` : ""}
                </option>
              ))}
          </OptionSelect>
        </Field>
        {input("firm", "Firm", true, Boolean(values.accountId || old || refund))}
        {input("currency", "Currency", true, Boolean(values.accountId || old || refund))}
        {!payout && !refund && (
          <Field label={t("Expense category")}>
            <OptionSelect
              value={values.category}
              onValueChange={(category) => set({ ...values, category })}
            >
              {EXPENSE_CATEGORIES.map((v) => (
                <option key={v} value={v}>
                  {show(v)}
                </option>
              ))}
            </OptionSelect>
          </Field>
        )}
        {input("amount", payout ? "Gross requested amount (before split)" : "Actual amount", true)}
        {payout && (
          <>
            {input("splitPercent", "Your share (%)", true)}
            {input("fee", "Fees withheld from your share", true)}
            <p className="col-span-full text-xs text-muted-foreground">
              {t(
                "If your amount is already after the firm split, enter 100% and only fees still to be deducted. Never deduct the split twice.",
              )}
            </p>
          </>
        )}
        <Field label={payout ? t("Request date") : t("Cash date")}>
          <DatePicker
            label={payout ? t("Payout request date") : t("Transaction date")}
            value={values.occurredOn}
            max={data.today}
            onValueChange={(occurredOn) => set({ ...values, occurredOn })}
          />
        </Field>
        {payout && (
          <>
            <Field label={t("Expected payment date (optional)")}>
              <DatePicker
                label={t("Expected payout date")}
                value={values.dueOn}
                onValueChange={(dueOn) => set({ ...values, dueOn })}
              />
            </Field>
            <Field label={t("Payout status")}>
              <OptionSelect
                value={values.status}
                onValueChange={(status) =>
                  set({ ...values, status: status as PropEntry["status"] })
                }
              >
                {PAYOUT_STATES.filter((s) => old || s !== "completed").map((v) => (
                  <option key={v} value={v}>
                    {show(v)}
                  </option>
                ))}
              </OptionSelect>
            </Field>
          </>
        )}
        {input("reference", "Invoice / payment reference")}
      </div>
      <Field label={t("Notes")}>
        <textarea
          className={`${fieldClass} h-20 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      {refund && (
        <p className="text-xs text-muted-foreground">
          {t(
            "Linked expense: {id}. Refunds reduce costs and are shown separately from payout income.",
            { id: values.parentId },
          )}
        </p>
      )}
      {old && input("reason", "Reason for change", true)}
    </Form>
  );
}
function ReceiptForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "receipt" }> }) {
  const { payout } = modal;
  const { t } = useI18n();
  const [id] = useState(() => randomId());
  const [values, set] = useState({
    kind: "receipt",
    amount: "",
    occurredOn: data.today,
    reference: "",
    notes: "",
  });
  const { busy, error, save } = useSave(close, refresh);
  return (
    <Form
      title={t("Record payout cash movement")}
      description={t(
        "Record the actual net amount credited or returned in {currency}. If your bank converted currencies, use the statement's original-currency amount; this tracker does not invent an exchange rate.",
        { currency: payout.currency },
      )}
      busy={busy}
      error={error}
      submit={() =>
        void save({
          action: "receipt.add",
          id,
          payoutId: payout.id,
          revision: payout.revision,
          ...values,
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Movement")}>
          <OptionSelect value={values.kind} onValueChange={(kind) => set({ ...values, kind })}>
            <option value="receipt">{t("Money received")}</option>
            <option value="reversal">{t("Money returned / reversed")}</option>
          </OptionSelect>
        </Field>
        <Field label={t("Actual amount ({currency})", { currency: payout.currency })}>
          <Input
            required
            value={values.amount}
            onChange={(e) => set({ ...values, amount: e.target.value })}
          />
        </Field>
        <Field label={t("Settlement date")}>
          <DatePicker
            label={t("Settlement date")}
            value={values.occurredOn}
            max={data.today}
            onValueChange={(occurredOn) => set({ ...values, occurredOn })}
          />
        </Field>
        <Field label={t("Bank reference")}>
          <Input
            value={values.reference}
            onChange={(e) => set({ ...values, reference: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t("Notes")}>
        <textarea
          className={`${fieldClass} h-20 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        {t(
          "Keep the request open for partial payments. Once the final payment arrives, edit the payout status to Completed; a difference from the expected amount remains visible.",
        )}
      </p>
    </Form>
  );
}
function ChangeForm({
  modal,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "change" }> }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const { busy, error, save } = useSave(close, refresh);
  return (
    <Form
      title={t(modal.name)}
      description={
        modal.action === "account.archive"
          ? t(
              "Archiving hides the account from the active list. Its cash history remains in returns. You can restore it later.",
            )
          : t(
              "Voided records stay in the audit trail and are excluded from cash totals. They can be restored. Voiding a payout also excludes its receipts.",
            )
      }
      busy={busy}
      error={error}
      submit={() =>
        void save({
          action: modal.action,
          id: modal.id,
          revision: modal.revision,
          payoutId: modal.payoutId,
          [modal.action === "account.archive" ? "archived" : "voided"]: modal.value,
          reason,
        })
      }
    >
      <Field label={t("Reason")}>
        <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Form>
  );
}
function Detail({ modal, data }: Props & { modal: Extract<PropModal, { kind: "detail" }> }) {
  const { t } = useI18n();
  const account = modal.type === "account" ? data.accounts.find((a) => a.id === modal.id) : null;
  const entry = modal.type === "entry" ? data.entries.find((e) => e.id === modal.id) : null;
  const { data: history } = useApi<{ history: PropAudit[] }>(
    `/api/prop-firms?type=${modal.type}&history=${encodeURIComponent(modal.id)}`,
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {account?.name ?? t(entry ? DETAIL_TITLES[entry.kind] : "Entry details")}
        </DialogTitle>
        <DialogDescription>
          {account?.firm ?? entry?.firm} · {modal.id}
        </DialogDescription>
      </DialogHeader>
      <p className="whitespace-pre-wrap text-sm">
        {account?.notes || entry?.notes || t("No notes added.")}
      </p>
      {account && (
        <>
          <p className="break-all text-xs text-muted-foreground">
            {t("Account ID for CSV imports: {id}", { id: account.id })}
          </p>
          {account.parentId && (
            <p className="text-sm">
              {t("Previous attempt / phase: {name}", {
                name:
                  data.accounts.find((a) => a.id === account.parentId)?.name ?? account.parentId,
              })}
            </p>
          )}
          {account.journalAccountId && (
            <a
              className="text-sm underline"
              href={`/trades?accounts=${encodeURIComponent(account.journalAccountId)}`}
            >
              {t("Open linked journal trades")}
            </a>
          )}
        </>
      )}
      <Attachments type={modal.type === "account" ? "prop-account" : "prop-entry"} id={modal.id} />
      <details>
        <summary className="cursor-pointer text-sm">
          {t("Edit history · latest 100 changes")}
        </summary>
        <div className="mt-3 space-y-3">
          {history?.history.map((item) => (
            <details key={item.id} className="rounded-md border p-2 text-xs">
              <summary className="cursor-pointer">
                {item.createdAt} ·{" "}
                {item.reason.startsWith("CSV import") ? t("CSV import") : item.reason}
              </summary>
              <p className="my-2 font-medium">{t("Before")}</p>
              <pre className="whitespace-pre-wrap break-all">
                {item.beforeJson
                  ? JSON.stringify(JSON.parse(item.beforeJson), null, 2)
                  : t("New record")}
              </pre>
              <p className="my-2 font-medium">{t("After")}</p>
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(JSON.parse(item.afterJson), null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </details>
    </>
  );
}
function ImportForm({ close, refresh }: Props) {
  const { t, tn } = useI18n();
  const [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      imported: number;
      skipped: number;
      sample: Record<string, string>[];
    } | null>(null);
  const act = async (action: "preview" | "import") => {
    setBusy(true);
    setError("");
    try {
      const data = await postJson<typeof result>("/api/prop-firms/csv", { action, content });
      if (action === "preview") setResult(data);
      else {
        refresh();
        close();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("Import prop cash CSV")}</DialogTitle>
        <DialogDescription>
          {t(
            "Import settled expenses, refunds and net payouts. Preview validates every row; an import is all-or-nothing and repeated stable IDs are skipped.",
          )}
        </DialogDescription>
      </DialogHeader>
      <a className="text-sm underline" href="/prop-cash-template.csv" download>
        {t("Download generic cash header template")}
      </a>
      <p className="text-xs text-muted-foreground">
        {t(
          "Use kind expense, refund or payout; date YYYY-MM-DD; positive amount in currency units. A payout amount is cash already received after splits and fees. Payouts need account_id from an account’s Details. A refund’s expense_id references its original CSV row ID. Put expenses before their refunds. This is not a broker statement importer.",
        )}
      </p>
      <Input
        type="file"
        aria-label={t("Prop cash CSV file")}
        accept=".csv,text/csv"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setContent("");
          setResult(null);
          setError("");
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            setError(t("Use a CSV up to 2 MB / 1,000 rows."));
            return;
          }
          try {
            setContent(decodeImportFile(await file.arrayBuffer()));
          } catch {
            setError(t("Could not read CSV."));
          }
        }}
      />
      <Button variant="outline" disabled={!content || busy} onClick={() => void act("preview")}>
        {busy ? t("Validating…") : t("Validate & preview")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="text-sm">
            {t("{imported} new records · {skipped} already imported.", {
              imported: result.imported,
              skipped: result.skipped,
            })}
          </p>
          <div className="space-y-2">
            {result.sample.map((row) => (
              <p key={row.id} className="rounded border p-2 text-xs">
                {row.date} · {row.firm} · {row.kind} · {row.amount} {row.currency}
              </p>
            ))}
          </div>
          <Button disabled={busy || result.imported === 0} onClick={() => void act("import")}>
            {tn(result.imported, "Import {count} record", "Import {count} records")}
          </Button>
        </>
      )}
    </>
  );
}
