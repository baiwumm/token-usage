"use client";

// Budget card: the monthly spend cap (D5) is a local preference — it feeds
// the dashboard's exceeded-budget warning and lives in localStorage, not in
// the database.

import { Card, Form, Label, NumberField, toast } from "@heroui/react";
import { useEffect, useState } from "react";

import { PendingButton } from "@/components/pending-button";
import { useLocale } from "@/lib/copy/locale";
import { SETTINGS_COPY } from "@/lib/copy/settings";
import { MAX_MONTHLY_BUDGET_USD, useBudgetStore } from "@/stores/budget-store";

export function BudgetCard() {
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  const monthlyBudgetUsd = useBudgetStore((state) => state.monthlyBudgetUsd);
  const setMonthlyBudgetUsd = useBudgetStore(
    (state) => state.setMonthlyBudgetUsd,
  );
  // Draft, not a direct store binding: typing stays local until save. The
  // effect also re-syncs after hydration — the first client render replays the
  // SSR snapshot (0), so an initializer alone leaves the field empty even
  // though the saved budget is already in localStorage. NaN is react-aria's
  // empty number-field value.
  const [draft, setDraft] = useState(
    monthlyBudgetUsd > 0 ? monthlyBudgetUsd : Number.NaN,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(monthlyBudgetUsd > 0 ? monthlyBudgetUsd : Number.NaN);
  }, [monthlyBudgetUsd]);

  function save() {
    if (saving) return;
    setSaving(true);
    setMonthlyBudgetUsd(Number.isFinite(draft) && draft > 0 ? draft : 0);
    setSaving(false);
    toast.success(copy.budgetSaved);
  }

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.budgetHeading}</Card.Title>
        <Card.Description>{copy.budgetHint}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form
          className="flex w-full flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <NumberField
            fullWidth
            formatOptions={{ maximumFractionDigits: 0 }}
            maxValue={MAX_MONTHLY_BUDGET_USD}
            minValue={0}
            name="monthly_budget_usd"
            step={1}
            value={draft}
            variant="secondary"
            onChange={setDraft}
          >
            <Label>{copy.budgetLabel}</Label>
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input placeholder="0" />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
          <div>
            <PendingButton pending={saving} type="submit">
              {copy.budgetSave}
            </PendingButton>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}
