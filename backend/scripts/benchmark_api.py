#!/usr/bin/env python3
"""Quick API benchmark - measures response times for key endpoints."""
import asyncio
import statistics
import time
import httpx

BASE = "http://127.0.0.1:19425/api/v1"


def timed_sync(name: str, fn, n=5):
    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        times.append((time.perf_counter() - t0) * 1000)
    avg = statistics.mean(times)
    std = statistics.stdev(times) if len(times) > 1 else 0
    print(f"  {name}: avg={avg:.1f}ms std={std:.1f}ms")
    return avg


async def timed_async(name: str, coro_fn, n=5):
    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        await coro_fn()
        times.append((time.perf_counter() - t0) * 1000)
    avg = statistics.mean(times)
    std = statistics.stdev(times) if len(times) > 1 else 0
    print(f"  {name}: avg={avg:.1f}ms std={std:.1f}ms")
    return avg


async def main():
    async with httpx.AsyncClient(timeout=60) as c:
        print("=== Optimized API timings (5 runs each) ===\n")

        # 1. Dashboard summary (N+1 fixed)
        async def dash_summary():
            r = await c.get(f"{BASE}/dashboard/summary")
            r.raise_for_status()

        await timed_async("GET /dashboard/summary", dash_summary)

        # 2. Dashboard me (N+1 fixed)
        async def dash_me():
            r = await c.get(f"{BASE}/dashboard/me?user_id=1")
            r.raise_for_status()

        await timed_async("GET /dashboard/me?user_id=1", dash_me)

        # 3. TestRunDetails: Sequential vs Parallel (need valid run_id)
        runs_res = await c.get(f"{BASE}/runs/project/1")
        runs_res.raise_for_status()
        runs = runs_res.json()
        run_id = runs[0]["id"] if runs else None

        if not run_id:
            print("\n=== TestRunDetails: skip (no runs in project 1) ===")
            return

        print(f"\n=== TestRunDetails fetch pattern (run_id={run_id}) ===")

        # Sequential (old): run -> results -> users -> folders (4 round-trips in series)
        async def seq():
            r1 = await c.get(f"{BASE}/runs/{run_id}")
            r1.raise_for_status()
            pid = r1.json().get("project_id", 1)
            await c.get(f"{BASE}/results/run/{run_id}")
            await c.get(f"{BASE}/users/")
            await c.get(f"{BASE}/run-folders/project/{pid}")

        seq_time = await timed_async("Sequential (old)", seq)

        # Parallel (new): run first, then results+users+folders in parallel
        async def par():
            r1 = await c.get(f"{BASE}/runs/{run_id}")
            r1.raise_for_status()
            pid = r1.json().get("project_id", 1)
            await asyncio.gather(
                c.get(f"{BASE}/results/run/{run_id}"),
                c.get(f"{BASE}/users/"),
                c.get(f"{BASE}/run-folders/project/{pid}"),
            )

        par_time = await timed_async("Parallel (new)", par)

        print(f"\n  Sequential: ~{seq_time:.0f}ms")
        print(f"  Parallel:   ~{par_time:.0f}ms")
        if seq_time > 0:
            pct = 100 * (1 - par_time / seq_time)
            print(f"  Improvement: ~{pct:.0f}% faster (saves ~{seq_time - par_time:.0f}ms per page load)")


if __name__ == "__main__":
    asyncio.run(main())
