"""
Extreme stress test for the backend pipeline - simulates rapid-fire barge-in
style interruptions (start a turn, abort it mid-stream, immediately start
another) plus back-to-back turns with no pause, to check for crashes, hung
requests, or corrupted session state under load well beyond normal usage.

Run: python stress_test.py
"""
import time
import threading
import requests

BASE_URL = "http://127.0.0.1:5000"

RESULTS = {"ok": 0, "aborted_cleanly": 0, "errors": 0, "exceptions": 0}
LOCK = threading.Lock()


def fire_and_abort(text, abort_after=0.3):
    """Start a turn, then abruptly close the connection partway through -
    simulating what a real barge-in does to an in-flight request."""
    try:
        resp = requests.post(
            f"{BASE_URL}/api/turn_stream",
            headers={"Content-Type": "application/json"},
            json={"text": text},
            stream=True,
            timeout=15,
        )
        t0 = time.time()
        for chunk in resp.iter_content(chunk_size=256):
            if time.time() - t0 > abort_after:
                resp.close()  # simulates AbortController.abort()
                with LOCK:
                    RESULTS["aborted_cleanly"] += 1
                return
        with LOCK:
            RESULTS["ok"] += 1
    except Exception as e:
        with LOCK:
            RESULTS["exceptions"] += 1
        print(f"  [exception] {e}")


def fire_full_turn(text):
    try:
        resp = requests.post(
            f"{BASE_URL}/api/turn_stream",
            headers={"Content-Type": "application/json"},
            json={"text": text},
            timeout=20,
        )
        if resp.status_code == 200:
            with LOCK:
                RESULTS["ok"] += 1
        else:
            with LOCK:
                RESULTS["errors"] += 1
    except Exception as e:
        with LOCK:
            RESULTS["exceptions"] += 1
        print(f"  [exception] {e}")


def phase_1_rapid_interrupts(n=10):
    """Simulate rapid-fire barge-in: start a turn, cut it off almost
    immediately, repeat - this is the harshest real-world pattern (someone
    repeatedly interrupting before Asha finishes even one sentence)."""
    print(f"\n=== Phase 1: {n} rapid interrupt-and-abort cycles (0.2-0.5s each) ===")
    requests.post(f"{BASE_URL}/api/start", timeout=15)
    texts = [
        "wait what", "no hold on", "actually never mind", "sorry go back",
        "wait say that again", "hold on a sec", "no wait", "actually yes",
        "hang on", "one sec",
    ]
    t0 = time.time()
    for i in range(n):
        fire_and_abort(texts[i % len(texts)], abort_after=0.2 + (i % 4) * 0.1)
    print(f"  {n} cycles in {time.time()-t0:.2f}s -> ok={RESULTS['ok']} aborted={RESULTS['aborted_cleanly']} errors={RESULTS['errors']} exceptions={RESULTS['exceptions']}")


def phase_2_concurrent_turns(n=6):
    """Fire several turns at literally the same time from different threads -
    a pathological case (shouldn't happen from one browser tab, but tests
    whether shared SESSION state corrupts under true concurrency)."""
    print(f"\n=== Phase 2: {n} truly concurrent turn requests (same session) ===")
    before = dict(RESULTS)
    threads = [threading.Thread(target=fire_full_turn, args=(f"concurrent test message {i}",)) for i in range(n)]
    t0 = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=25)
    alive = [t for t in threads if t.is_alive()]
    print(f"  {n} concurrent requests in {time.time()-t0:.2f}s, {len(alive)} still hung")
    print(f"  delta -> ok={RESULTS['ok']-before['ok']} errors={RESULTS['errors']-before['errors']} exceptions={RESULTS['exceptions']-before['exceptions']}")


def phase_3_zero_gap_turns(n=8):
    """Back-to-back full turns with zero pause between them - no human pacing
    at all, the fastest a real (non-concurrent) conversation could possibly go."""
    print(f"\n=== Phase 3: {n} full turns back-to-back with zero pause ===")
    before = dict(RESULTS)
    t0 = time.time()
    for i in range(n):
        fire_full_turn(f"quick test message number {i}")
    elapsed = time.time() - t0
    print(f"  {n} turns in {elapsed:.2f}s ({elapsed/n:.2f}s/turn avg)")
    print(f"  delta -> ok={RESULTS['ok']-before['ok']} errors={RESULTS['errors']-before['errors']} exceptions={RESULTS['exceptions']-before['exceptions']}")


def check_session_sanity():
    """After all that abuse, verify the server is still responsive and a
    normal turn still works cleanly - the real pass/fail signal."""
    print("\n=== Sanity check: does a normal turn still work after all that? ===")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/turn_stream",
            headers={"Content-Type": "application/json"},
            json={"text": "hi are you still working okay"},
            timeout=15,
        )
        ok = resp.status_code == 200 and b'"type": "reply"' in resp.content
        print(f"  status={resp.status_code}  looks_healthy={ok}")
        return ok
    except Exception as e:
        print(f"  [FAILED] server did not respond: {e}")
        return False


def main():
    print("STRESS TEST - pushing the backend well beyond normal usage patterns")
    phase_1_rapid_interrupts(10)
    phase_2_concurrent_turns(6)
    phase_3_zero_gap_turns(8)
    requests.post(f"{BASE_URL}/api/end", timeout=10)

    healthy = check_session_sanity()
    requests.post(f"{BASE_URL}/api/end", timeout=10)

    print("\n========== FINAL RESULTS ==========")
    for k, v in RESULTS.items():
        print(f"  {k}: {v}")
    print(f"  server survived and still healthy: {healthy}")


if __name__ == "__main__":
    main()
