"use client";

// Monthly budget preference (D5, 2026-10-27): a plain USD number, 0 disables
// the alert. Same zustand + persist pattern as the format-preferences store
// but with no legacy history to migrate.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const STORAGE_KEY = "token-usage.budget";

interface PersistedBudgetState {
  monthlyBudgetUsd: number;
}

interface BudgetState {
  /** Monthly spend cap in USD; 0 disables the alert. */
  monthlyBudgetUsd: number;
  setMonthlyBudgetUsd: (value: number) => void;
}

function sanitizeBudget(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      monthlyBudgetUsd: 0,
      setMonthlyBudgetUsd: (value) =>
        set({ monthlyBudgetUsd: sanitizeBudget(value) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      version: 1,
      partialize: (state) => ({ monthlyBudgetUsd: state.monthlyBudgetUsd }),
      migrate: (persisted) => {
        const state = persisted as Partial<PersistedBudgetState> | undefined;

        return { monthlyBudgetUsd: sanitizeBudget(state?.monthlyBudgetUsd) };
      },
    },
  ),
);
