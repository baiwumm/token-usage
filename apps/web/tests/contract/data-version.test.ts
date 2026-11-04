// Contract test for the dashboard's data-version signal (2026-11-01 cache
// gate, extended 2026-11-04): version = the newest of the latest NON-EMPTY
// sync run, the latest credits-bearing run, and the latest device updated_at.
// Empty runs without credits, other users' rows and unrelated devices never
// count; nothing qualifying → null.

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

  it("counts a credits-only empty run", async () => {
    fake.tables.token_sync_runs.rows.push(
      runRow({
        empty: true,
        credits_ingested: 12.5,
        created_at: "2026-11-02T12:00:00.000Z",
      }),
    );

    const response = await dataVersionForUser(USER_ID);

    expect(await response.json()).toEqual({
      version: "2026-11-02T12:00:00.000Z",
    });
  });

  it("counts a device rename/revoke as a change, newest wins", async () => {
    fake.tables.token_sync_runs.rows.push(
      runRow({ created_at: "2026-10-30T08:00:00.000Z" }),
    );
    fake.tables.token_devices.rows.push({
      id: "22222222-2222-4222-8222-222222222222",
      user_id: USER_ID,
      device_name: "renamed",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-11-03T07:00:00.000Z",
    });
    fake.tables.token_devices.rows.push({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: "99999999-9999-4999-8999-999999999999",
      device_name: "other",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-12-01T00:00:00.000Z",
    });

    const response = await dataVersionForUser(USER_ID);

    expect(await response.json()).toEqual({
      version: "2026-11-03T07:00:00.000Z",
    });
  });
});
