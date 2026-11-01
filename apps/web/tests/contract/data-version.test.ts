// Contract test for the dashboard's data-version signal (2026-11-01 cache
// gate): version = created_at of the latest NON-EMPTY sync run of the user.
// Empty runs and other users' runs never count; no qualifying run → null.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dataVersionForUser } from "@/lib/api/account-series-handlers";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";
import { USER_ID, initContractEnv } from "./helpers";

const fake = new FakeSupabase();

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
});

function runRow(over: Partial<Row>): Row {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: USER_ID,
    device_id: "22222222-2222-4222-8222-222222222222",
    run_id: "run-1",
    empty: false,
    created_at: "2026-10-30T08:00:00.000Z",
    ...over,
  };
}

describe("dataVersionForUser", () => {
  it("answers the latest non-empty run's created_at", async () => {
    fake.tables.token_sync_runs.rows.push(
      runRow({ created_at: "2026-10-30T08:00:00.000Z" }),
      runRow({ run_id: "run-2", created_at: "2026-10-31T09:30:00.000Z" }),
    );

    const response = await dataVersionForUser(USER_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: "2026-10-31T09:30:00.000Z",
    });
  });

  it("ignores empty runs and other users' runs", async () => {
    fake.tables.token_sync_runs.rows.push(
      runRow({ empty: true, created_at: "2026-11-01T10:00:00.000Z" }),
      runRow({
        user_id: "99999999-9999-4999-8999-999999999999",
        created_at: "2026-11-01T11:00:00.000Z",
      }),
    );

    const response = await dataVersionForUser(USER_ID);
    const { version } = (await response.json()) as { version: string | null };

    expect(version).toBeNull();
  });

  it("answers null with no qualifying runs", async () => {
    const response = await dataVersionForUser(USER_ID);
    const { version } = (await response.json()) as { version: string | null };

    expect(version).toBeNull();
  });
});
