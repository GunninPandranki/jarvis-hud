"""
Thin wrapper around Groq's OpenAI-compatible chat completions API.
Used for reply generation instead of Gemini - Groq's inference hardware is
dramatically faster (~0.1-0.2s generation vs Gemini's ~3s floor on free tier).
"""
import os
import time
import requests

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-20b"


def _load_api_key():
    env_key = os.environ.get("GROQ_API_KEY")
    if env_key:
        return env_key
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("GROQ_API_KEY="):
                    return line.strip().split("=", 1)[1]
    raise RuntimeError("GROQ_API_KEY not set (checked environment and .env)")


def generate_reply(system_prompt, conversation_history, user_message, max_retries=2):
    """conversation_history: list of {"role": "user"|"model", "text": str}
    (matches the shape used by gemini_client.generate_reply for a drop-in swap)."""
    api_key = _load_api_key()

    messages = [{"role": "system", "content": system_prompt}]
    for turn in conversation_history[-20:]:
        role = "assistant" if turn["role"] == "model" else "user"
        messages.append({"role": role, "content": turn["text"]})
    messages.append({"role": "user", "content": user_message})

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": GROQ_MODEL, "messages": messages}

    last_err = None
    for attempt in range(max_retries + 1):
        try:
            resp = requests.post(GROQ_URL, headers=headers, json=payload, timeout=10)
            if resp.status_code == 429:
                # Groq's free tier has short token/request-per-minute windows that
                # usually reset within seconds - worth a short wait rather than
                # failing outright. The header can occasionally report a much
                # longer reset (e.g. a per-day window) - always cap what we
                # actually sleep, and log the capped value, not the raw header,
                # so this doesn't look like a multi-minute hang when it isn't.
                retry_after = resp.headers.get("retry-after")
                raw_wait_s = float(retry_after) if retry_after else 2.0
                capped_wait_s = min(raw_wait_s, 5.0)
                print(f"[groq rate limit] waiting {capped_wait_s:.1f}s before retry {attempt + 1}/{max_retries} "
                      f"(server suggested {raw_wait_s:.1f}s, capped)")
                if attempt < max_retries:
                    time.sleep(capped_wait_s)
                    continue
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            last_err = e
    raise RuntimeError(f"Groq request failed after {max_retries + 1} attempts: {last_err}")


GUARD_PROMPT = """You are a strict quality checker for a cold-calling AI's draft reply. \
Given what the customer just said and the AI's draft reply, answer with EXACTLY one line:
VALID
or
INVALID: <short reason, under 12 words>

Checks (reject if ANY fail):
- Does it directly address what the customer just said (not generic/ignoring it)?
- Is it free of repeating a phrase it (or you can infer it) already said?
- Is it 1-3 sentences, not a long speech?
- Does it ask only ONE question, not several stacked together?
- Does it avoid inventing specific facts (price, ingredients, delivery time) it wasn't given?
- If the customer already agreed to the sample, does it move to collecting delivery info \
instead of re-pitching?
- If the customer asked not to be called again or firmly declined twice, does it end the \
call gracefully instead of continuing to sell?

Customer said: {user_text}
AI draft reply: {reply_text}
"""


def guard_reply(user_text, reply_text, timeout=8):
    """Fast validity check on a generated reply before it gets spoken.
    Returns (is_valid: bool, reason: str|None). Fails open (treats as valid)
    on any error - a guard that can't run should never block the call."""
    try:
        api_key = _load_api_key()
        prompt = GUARD_PROMPT.format(user_text=user_text, reply_text=reply_text)
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": GROQ_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }
        resp = requests.post(GROQ_URL, headers=headers, json=payload, timeout=timeout)
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip()
        if text.upper().startswith("VALID"):
            return True, None
        return False, text
    except Exception as e:
        print(f"[response guard] check itself failed, failing open: {e}")
        return True, None
