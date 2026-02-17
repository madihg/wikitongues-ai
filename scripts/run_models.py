"""Run prompts against multiple LLM providers (Anthropic, OpenAI, Google).

Reads prompt YAML files from data/prompts/, sends each prompt to the
configured models, and writes raw responses to data/results/.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import click
import yaml
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYSTEM_MESSAGE = (
    "You are a cultural and linguistic expert. Respond naturally and "
    "authentically in the requested language or about the requested culture. "
    "If you are uncertain about something, say so explicitly."
)

MODEL_REGISTRY: dict[str, dict] = {
    "claude": {
        "provider": "anthropic",
        "model_id": "claude-sonnet-4-5-20250929",
    },
    "chatgpt": {
        "provider": "openai",
        "model_id": "gpt-4o",
    },
    "gemini": {
        "provider": "google",
        "model_id": "gemini-2.0-flash",
    },
    "gemma": {
        "provider": "google",
        "model_id": "gemma-2-9b-it",
    },
}

PROMPT_CATALOGUE_VERSION = "1.0"

# Small delay (seconds) between consecutive calls to the same provider to
# respect rate limits without being overly slow.
PROVIDER_DELAY = 0.5

# ---------------------------------------------------------------------------
# Prompt loading
# ---------------------------------------------------------------------------


def load_prompts(prompts_dir: Path) -> list[dict]:
    """Load all prompt YAML files from *prompts_dir*, skipping schema.yaml."""
    prompts: list[dict] = []
    for yaml_path in sorted(prompts_dir.glob("*.yaml")):
        if yaml_path.name == "schema.yaml":
            continue
        with open(yaml_path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if data and "prompts" in data:
            for p in data["prompts"]:
                prompts.append(p)
    return prompts


# ---------------------------------------------------------------------------
# Model callers
# ---------------------------------------------------------------------------


async def call_anthropic(
    prompt_text: str,
    model_id: str,
    temperature: float,
    max_tokens: int,
) -> dict:
    """Call Anthropic Messages API and return result dict."""
    import anthropic

    client = anthropic.AsyncAnthropic()
    t0 = time.perf_counter()
    message = await client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        system=SYSTEM_MESSAGE,
        messages=[{"role": "user", "content": prompt_text}],
    )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    output_text = "".join(
        block.text for block in message.content if block.type == "text"
    )
    token_count = {
        "input": message.usage.input_tokens,
        "output": message.usage.output_tokens,
    }
    return {
        "output_text": output_text,
        "token_count": token_count,
        "latency_ms": latency_ms,
    }


async def call_openai(
    prompt_text: str,
    model_id: str,
    temperature: float,
    max_tokens: int,
) -> dict:
    """Call OpenAI Chat Completions API and return result dict."""
    import openai

    client = openai.AsyncOpenAI()
    t0 = time.perf_counter()
    response = await client.chat.completions.create(
        model=model_id,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": SYSTEM_MESSAGE},
            {"role": "user", "content": prompt_text},
        ],
    )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    choice = response.choices[0]
    output_text = choice.message.content or ""
    usage = response.usage
    token_count = {
        "input": usage.prompt_tokens if usage else 0,
        "output": usage.completion_tokens if usage else 0,
    }
    return {
        "output_text": output_text,
        "token_count": token_count,
        "latency_ms": latency_ms,
    }


async def call_google(
    prompt_text: str,
    model_id: str,
    temperature: float,
    max_tokens: int,
) -> dict:
    """Call Google Generative AI (Gemini / Gemma) and return result dict."""
    import google.generativeai as genai

    model = genai.GenerativeModel(
        model_name=model_id,
        system_instruction=SYSTEM_MESSAGE,
    )
    config = genai.types.GenerationConfig(
        temperature=temperature,
        max_output_tokens=max_tokens,
    )

    # google-generativeai is synchronous; run in a thread so we don't block
    # the event loop.
    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()
    response = await loop.run_in_executor(
        None,
        lambda: model.generate_content(prompt_text, generation_config=config),
    )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    output_text = response.text if response.text else ""
    usage_meta = getattr(response, "usage_metadata", None)
    token_count = {
        "input": getattr(usage_meta, "prompt_token_count", 0) or 0,
        "output": getattr(usage_meta, "candidates_token_count", 0) or 0,
    }
    return {
        "output_text": output_text,
        "token_count": token_count,
        "latency_ms": latency_ms,
    }


PROVIDER_CALLERS = {
    "anthropic": call_anthropic,
    "openai": call_openai,
    "google": call_google,
}


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def _generate_run_id() -> str:
    return "run_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def _load_existing_run(output_dir: Path, run_id: str | None) -> dict | None:
    """Load an existing results file for resumption."""
    if run_id:
        path = output_dir / f"{run_id}.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        return None

    # Find the most recent run file.
    candidates = sorted(output_dir.glob("run_*.json"), reverse=True)
    if not candidates:
        return None
    with open(candidates[0], "r", encoding="utf-8") as fh:
        return json.load(fh)


def _completed_keys(run_data: dict) -> set[tuple[str, str]]:
    """Return set of (prompt_id, model_alias) that already succeeded."""
    keys: set[tuple[str, str]] = set()
    for r in run_data.get("results", []):
        if r.get("error") is None:
            keys.add((r["prompt_id"], r["model_alias"]))
    return keys


def _save_results(path: Path, run_data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(run_data, fh, indent=2, ensure_ascii=False)


async def _run_single(
    prompt: dict,
    alias: str,
    model_info: dict,
    temperature: float,
    max_tokens: int,
) -> dict:
    """Run a single prompt against a single model and return a result dict."""
    caller = PROVIDER_CALLERS[model_info["provider"]]
    result_base = {
        "prompt_id": prompt["id"],
        "prompt_text": prompt["text"],
        "prompt_language": prompt["language"],
        "prompt_category": prompt["category"],
        "model": model_info["model_id"],
        "model_alias": alias,
    }

    try:
        resp = await caller(
            prompt_text=prompt["text"],
            model_id=model_info["model_id"],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        result_base.update(
            {
                "output_text": resp["output_text"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "token_count": resp["token_count"],
                "latency_ms": resp["latency_ms"],
                "error": None,
            }
        )
    except Exception as exc:  # noqa: BLE001
        result_base.update(
            {
                "output_text": "",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "token_count": {"input": 0, "output": 0},
                "latency_ms": 0,
                "error": f"{type(exc).__name__}: {exc}",
            }
        )

    return result_base


async def run_all(
    prompts: list[dict],
    model_aliases: list[str],
    temperature: float,
    max_tokens: int,
    output_dir: Path,
    resume: bool,
    run_id: str | None,
) -> None:
    """Run all prompt x model combinations, with optional resume."""

    # Build the work list.
    work: list[tuple[dict, str, dict]] = []
    for prompt in prompts:
        for alias in model_aliases:
            work.append((prompt, alias, MODEL_REGISTRY[alias]))

    total = len(work)

    # Resume support.
    existing_run: dict | None = None
    completed: set[tuple[str, str]] = set()
    if resume:
        existing_run = _load_existing_run(output_dir, run_id)
        if existing_run:
            completed = _completed_keys(existing_run)
            click.echo(
                f"Resuming {existing_run['run_id']} -- "
                f"{len(completed)} prompt-model pairs already done."
            )

    # Determine run id and initial data structure.
    if existing_run:
        rid = existing_run["run_id"]
        run_data = existing_run
    else:
        rid = run_id or _generate_run_id()
        run_data = {
            "run_id": rid,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "parameters": {"temperature": temperature, "max_tokens": max_tokens},
            "prompt_catalogue_version": PROMPT_CATALOGUE_VERSION,
            "results": [],
        }

    output_path = output_dir / f"{rid}.json"

    # Filter out already-completed pairs.
    remaining = [
        (p, a, m) for p, a, m in work if (p["id"], a) not in completed
    ]

    if not remaining:
        click.echo("All prompt-model pairs already completed. Nothing to do.")
        return

    done_so_far = total - len(remaining)
    click.echo(
        f"Run {rid}: {len(remaining)} tasks to run "
        f"({done_so_far} already done, {total} total)."
    )

    # Group remaining work by provider so we can throttle per-provider.
    provider_queues: dict[str, asyncio.Queue] = {}
    for item in remaining:
        provider = item[2]["provider"]
        if provider not in provider_queues:
            provider_queues[provider] = asyncio.Queue()
        provider_queues[provider].put_nowait(item)

    # Shared state for progress counter and result collection.
    counter_lock = asyncio.Lock()
    counter = {"n": done_so_far}
    results_lock = asyncio.Lock()

    async def provider_worker(queue: asyncio.Queue) -> None:
        while not queue.empty():
            try:
                prompt, alias, model_info = queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            async with counter_lock:
                counter["n"] += 1
                idx = counter["n"]

            click.echo(
                f"[{idx}/{total}] Running {prompt['id']} on {alias}... ",
                nl=False,
            )

            result = await _run_single(
                prompt, alias, model_info, temperature, max_tokens
            )

            if result["error"]:
                click.echo(f"ERROR ({result['error']})")
            else:
                click.echo(f"done ({result['latency_ms'] / 1000:.1f}s)")

            async with results_lock:
                run_data["results"].append(result)
                # Persist after each result so we can resume on crash.
                _save_results(output_path, run_data)

            # Small delay to be kind to rate limits.
            await asyncio.sleep(PROVIDER_DELAY)

    # Launch one worker per provider so providers run concurrently but
    # calls within the same provider are sequential.
    tasks = [
        asyncio.create_task(provider_worker(queue))
        for queue in provider_queues.values()
    ]
    await asyncio.gather(*tasks)

    # Final save (already saved incrementally, but ensure consistency).
    _save_results(output_path, run_data)

    completed_count = sum(
        1 for r in run_data["results"] if r["error"] is None
    )
    total_results = len(run_data["results"])
    click.echo(
        f"Completed {completed_count}/{total_results}. "
        f"Results saved to {output_path}"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


@click.command()
@click.option(
    "--prompts-dir",
    type=click.Path(exists=True, path_type=Path),
    default=Path("data/prompts"),
    show_default=True,
    help="Directory containing prompt YAML files.",
)
@click.option(
    "--models",
    type=str,
    default="claude,chatgpt,gemini,gemma",
    show_default=True,
    help="Comma-separated list of model aliases to run.",
)
@click.option(
    "--temperature",
    type=float,
    default=0.7,
    show_default=True,
    help="Sampling temperature.",
)
@click.option(
    "--max-tokens",
    type=int,
    default=1024,
    show_default=True,
    help="Maximum tokens for model response.",
)
@click.option(
    "--output-dir",
    type=click.Path(path_type=Path),
    default=Path("data/results"),
    show_default=True,
    help="Directory to write result JSON files.",
)
@click.option(
    "--resume",
    is_flag=True,
    default=False,
    help="Resume the latest (or --run-id specified) run.",
)
@click.option(
    "--run-id",
    type=str,
    default=None,
    help="Specific run ID to resume (implies --resume).",
)
def main(
    prompts_dir: Path,
    models: str,
    temperature: float,
    max_tokens: int,
    output_dir: Path,
    resume: bool,
    run_id: str | None,
) -> None:
    """Run prompts against LLM providers and save results."""
    load_dotenv()

    # Configure Google API key if set.
    google_key = os.environ.get("GOOGLE_API_KEY")
    if google_key:
        import google.generativeai as genai

        genai.configure(api_key=google_key)

    # Parse and validate model aliases.
    aliases = [m.strip() for m in models.split(",") if m.strip()]
    for alias in aliases:
        if alias not in MODEL_REGISTRY:
            raise click.BadParameter(
                f"Unknown model alias '{alias}'. "
                f"Choose from: {', '.join(MODEL_REGISTRY)}",
                param_hint="--models",
            )

    # If --run-id is given, imply --resume.
    if run_id:
        resume = True

    prompts = load_prompts(prompts_dir)
    if not prompts:
        click.echo("No prompts found. Exiting.")
        return

    click.echo(f"Loaded {len(prompts)} prompts from {prompts_dir}")
    click.echo(f"Models: {', '.join(aliases)}")

    asyncio.run(
        run_all(
            prompts=prompts,
            model_aliases=aliases,
            temperature=temperature,
            max_tokens=max_tokens,
            output_dir=output_dir,
            resume=resume,
            run_id=run_id,
        )
    )


if __name__ == "__main__":
    main()
