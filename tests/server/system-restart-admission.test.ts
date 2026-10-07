/** #6643: active-turn grace must not consume the whole restart cleanup budget. */
import { afterEach, expect, spyOn, test } from "bun:test";
import {
  acceptSystemRestart,
  setSystemRestartIoForTests,
  noteExplicitShutdownRequested,
} from "../../src/server/management/system-restart";

import {
  abortAndReleaseAllTurns,
  acquireTemporaryDrain,
  drainAndShutdown,
  getActiveTurnCount,
  isDraining,
  registerTurn,
  resetLifecycleDrainStateForTests,
  stopServerListener,
  tryAdmitTurn,
} from "../../src/server/lifecycle";

afterEach(() => setSystemRestartIoForTests());

test("restart spends at most two seconds on active turns, including the response-flush delay", async () => {
  let now = 10_000;
  let scheduled!: () => void | Promise<void>;
  let turnWaitMs = -1;
  let cleanupWaitMs = -1;
  acceptSystemRestart({
    now: () => now,
    isDraining: () => false,
    getActiveTurnCount: () => 1,
    setDraining: () => {},
    schedule: fn => { scheduled = fn; },
    scheduleDeadline: (_fn, ms) => { cleanupWaitMs = ms; return () => {}; },
    drainAndShutdown: async (_server, ms) => { turnWaitMs = ms; },
    isDesktopSupervised: () => false,
    isSupervisedServiceChild: () => false,
    listenPort: () => 10123,
    stopListener: () => {},
    spawnStart: () => {},
    markRecycling: () => {},
    exitProcess: () => {},
  });
  now += 200;
  await scheduled();
  expect(turnWaitMs).toBe(1_800);
  expect(cleanupWaitMs).toBe(59_800);
});


class RestartClock {
  now = 10_000;
  private timers = new Set<{ at: number; run: () => void }>();
  schedule = (run: () => void, ms: number) => {
    const timer = { at: this.now + ms, run };
    this.timers.add(timer);
    return () => { this.timers.delete(timer); };
  };
  async settle() {
    // Let real shutdown cleanup promises settle without advancing virtual time.
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  }
  async advance(ms: number) {
    const until = this.now + ms;
    while (true) {
      const next = [...this.timers].filter(timer => timer.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.now = next.at;
      this.timers.delete(next);
      next.run();
      await this.settle();
    }
    this.now = until;
    await this.settle();
  }
}

const restore: Array<() => void> = [];
afterEach(() => {
  for (const reset of restore.splice(0)) reset();
  abortAndReleaseAllTurns();
  resetLifecycleDrainStateForTests();
});

function restartFixture(options: { automatic?: boolean; holdCleanup?: boolean; holdReadiness?: boolean; failSpawn?: boolean; flushDelayMs?: number } = {}) {
  const clock = new RestartClock();
  const date = spyOn(Date, "now").mockImplementation(() => clock.now);
  const sleep = spyOn(Bun, "sleep").mockImplementation((ms) => new Promise(resolve => {
    clock.schedule(resolve, typeof ms === "number" ? ms : ms.getTime() - clock.now);
  }));
  restore.push(() => date.mockRestore(), () => sleep.mockRestore());
  const calls: string[] = [];
  let finishCleanup!: () => void;
  const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
  let finishReadiness!: () => void;
  const readiness = new Promise<void>(resolve => { finishReadiness = resolve; });
  let veto!: () => void;
  let running: void | Promise<void>;
  const server = {
    stop: () => { calls.push(`stop:${clock.now}`); },
  } as unknown as ReturnType<typeof Bun.serve>;
  const accept = () => acceptSystemRestart({
    now: () => clock.now,
    getActiveTurnCount,
    schedule: (fn, ms) => { clock.schedule(() => { running = fn(); }, options.flushDelayMs ?? ms); },
    scheduleDeadline: clock.schedule,
    drainAndShutdown: async (_server, ms) => {
      calls.push(`drain:${ms}`);
      const result = await drainAndShutdown(server, ms);
      if (options.holdCleanup) await cleanup;
      return result;
    },
    stopListener: () => stopServerListener(server),
    listenPort: () => 10123,
    isDesktopSupervised: () => false,
    isSupervisedServiceChild: () => false,
    spawnStart: async (port, waitForHealth) => {
      calls.push(`spawn:${port}:${waitForHealth}:${clock.now}`);
      if (options.failSpawn) throw Object.assign(new Error("fixture"), { code: "EACCES" });
      if (options.holdReadiness) await readiness;
    },
    markRecycling: () => { calls.push("recycle"); },
    isClientConnected: () => false,
    exitProcess: code => { calls.push(`exit:${code}`); },
  }, options.automatic ? { onAccepted: callback => { veto = callback; } } : {});
  return { clock, calls, accept, finishCleanup, finishReadiness, veto: () => veto(), running: () => running };
}

function upstreamTurn(bindController = true) {
  const lease = tryAdmitTurn();
  expect(lease).not.toBeNull();
  const controller = new AbortController();
  if (bindController) registerTurn(controller, lease!);
  // The admitted handler may have sent work whose upstream outcome is not yet known.
  return { lease: lease!, controller };
}

for (const automatic of [false, true]) {
  const mode = automatic ? "automatic" : "manual";
  test(`${mode} restart preserves a completed turn and hands off without spending the grace`, async () => {
    const fixture = restartFixture({ automatic });
    const turn = upstreamTurn();
    turn.lease.release();
    expect(fixture.accept().drainTimeoutMs).toBe(2_000);
    expect(tryAdmitTurn()).toBeNull();
    await fixture.clock.advance(200);
    await fixture.running();
    expect(fixture.calls).toContain("spawn:10123:true:10200");
    expect(turn.controller.signal.aborted).toBe(false);
  });

  test(`${mode} restart lets a turn finish inside the grace without abort`, async () => {
    const fixture = restartFixture({ automatic });
    const turn = upstreamTurn();
    fixture.accept();
    await fixture.clock.advance(700);
    expect(turn.controller.signal.aborted).toBe(false);
    expect(fixture.calls.some(call => call.startsWith("spawn:"))).toBe(false);
    turn.lease.release();
    await fixture.clock.advance(100);
    await fixture.running();
    expect(fixture.calls).toContain("spawn:10123:true:10800");
    expect(turn.controller.signal.aborted).toBe(false);
  });

  test(`${mode} restart cuts an ambiguous active turn at grace expiry`, async () => {
    const fixture = restartFixture({ automatic });
    const turn = upstreamTurn();
    fixture.accept();
    await fixture.clock.advance(1_999);
    expect(turn.controller.signal.aborted).toBe(false);
    expect(getActiveTurnCount()).toBe(1);
    await fixture.clock.advance(1);
    await fixture.running();
    expect(turn.controller.signal.aborted).toBe(true);
    expect(getActiveTurnCount()).toBe(0);
    expect(fixture.calls).toContain("spawn:10123:true:12000");
    // Successful cleanup/readiness does not reopen admission in the old process.
    expect(tryAdmitTurn()).toBeNull();
  });
}

test("an admitted turn without a controller is released at the same deadline", async () => {
  const fixture = restartFixture();
  upstreamTurn(false);
  fixture.accept();
  await fixture.clock.advance(2_000);
  await fixture.running();
  expect(getActiveTurnCount()).toBe(0);
  expect(fixture.calls).toContain("exit:0");
});

test("client cancellation finishes the drain without waiting out the grace", async () => {
  const fixture = restartFixture();
  const turn = upstreamTurn();
  turn.controller.signal.addEventListener("abort", () => turn.lease.release(), { once: true });
  fixture.accept();
  await fixture.clock.advance(300);
  turn.controller.abort(new Error("client cancelled"));
  await fixture.clock.advance(100);
  await fixture.running();
  expect(fixture.calls).toContain("spawn:10123:true:10400");
});

test("held cleanup retains the original 60s watchdog and ignores late completion", async () => {
  const fixture = restartFixture({ holdCleanup: true });
  fixture.accept();
  await fixture.clock.advance(2_000);
  expect(fixture.calls.some(call => call.startsWith("spawn:"))).toBe(false);
  expect(isDraining()).toBe(true);
  await fixture.clock.advance(58_000);
  await fixture.running();
  expect(fixture.calls).toContain("spawn:10123:false:70000");
  fixture.finishCleanup();
  await fixture.clock.settle();
  expect(fixture.calls.filter(call => call.startsWith("spawn:"))).toHaveLength(1);
  expect(fixture.calls.filter(call => call.startsWith("exit:"))).toEqual(["exit:0"]);
});

test("delayed replacement readiness does not reopen the old process while a cut turn stays aborted", async () => {
  const fixture = restartFixture({ holdReadiness: true });
  const turn = upstreamTurn();
  fixture.accept();
  await fixture.clock.advance(2_000);
  expect(fixture.calls).toContain("spawn:10123:true:12000");
  await fixture.clock.advance(65_000);
  expect(fixture.calls.some(call => call.startsWith("exit:"))).toBe(false);
  expect(tryAdmitTurn()).toBeNull();
  expect(turn.controller.signal.aborted).toBe(true);
  fixture.finishReadiness();
  await fixture.running();
  expect(fixture.calls).toContain("exit:0");
});

test("automatic pending cancellation releases only its admission fence", async () => {
  const fixture = restartFixture({ automatic: true });
  fixture.accept();
  expect(isDraining()).toBe(true);
  fixture.veto();
  await fixture.clock.advance(2_000);
  expect(fixture.calls).toEqual([]);
  const admitted = tryAdmitTurn();
  expect(admitted).not.toBeNull();
  admitted?.release();
});

for (const automatic of [false, true]) {
  test(`explicit stop during ${automatic ? "automatic" : "manual"} grace preserves restart ownership`, async () => {
    const fixture = restartFixture({ automatic });
    upstreamTurn();
    fixture.accept();
    await fixture.clock.advance(200);
    noteExplicitShutdownRequested();
    await fixture.clock.advance(1_800);
    await fixture.running();
    expect(fixture.calls.filter(call => call.startsWith("spawn:"))).toHaveLength(automatic ? 0 : 1);
    expect(isDraining()).toBe(true);
  });
}

test("spawn failure after a cut turn exits once without recycling", async () => {
  const fixture = restartFixture({ failSpawn: true });
  upstreamTurn();
  fixture.accept();
  await fixture.clock.advance(2_000);
  await fixture.running();
  expect(fixture.calls.filter(call => call.startsWith("exit:"))).toEqual(["exit:1"]);
  expect(fixture.calls).not.toContain("recycle");
});

test("waiting to enter the drain microtask does not renew the acceptance-based grace", async () => {
  let now = 10_000;
  let scheduled!: () => void | Promise<void>;
  let turnWaitMs = -1;
  acceptSystemRestart({
    now: () => now,
    isDraining: () => false,
    getActiveTurnCount: () => 1,
    setDraining: () => {},
    schedule: fn => { scheduled = fn; },
    scheduleDeadline: () => () => {},
    drainAndShutdown: async (_server, ms) => { turnWaitMs = ms; },
    isDesktopSupervised: () => false,
    isSupervisedServiceChild: () => false,
    listenPort: () => 10123,
    stopListener: () => {},
    spawnStart: () => {},
    markRecycling: () => {},
    exitProcess: () => {},
  });
  now += 200;
  const running = scheduled();
  now += 350;
  await running;
  expect(turnWaitMs).toBe(1_450);
});

test("a non-round response-flush delay does not extend grace by a full lifecycle poll", async () => {
  const fixture = restartFixture({ flushDelayMs: 275 });
  const turn = upstreamTurn();
  fixture.accept();
  await fixture.clock.advance(1_999);
  expect(turn.controller.signal.aborted).toBe(false);
  await fixture.clock.advance(1);
  await fixture.running();
  expect(turn.controller.signal.aborted).toBe(true);
  expect(fixture.calls).toContain("drain:1725");
  expect(fixture.calls).toContain("spawn:10123:true:12000");
});

test("an existing scoped drain and active turn share the same grace", async () => {
  const fixture = restartFixture();
  const turn = upstreamTurn();
  const scoped = acquireTemporaryDrain("fixture-scoped-drain");
  expect(scoped).not.toBeNull();
  fixture.accept();
  await fixture.clock.advance(500);
  expect(fixture.calls).toEqual(["drain:1800"]);
  scoped!.release();
  await fixture.clock.settle();
  await fixture.clock.advance(1_499);
  expect(turn.controller.signal.aborted).toBe(false);
  await fixture.clock.advance(1);
  await fixture.running();
  expect(turn.controller.signal.aborted).toBe(true);
  expect(fixture.calls).toContain("spawn:10123:true:12000");
});
