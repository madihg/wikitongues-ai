"""Generate evaluation reports from model results and annotations.

Reads results from data/results/ and annotations from data/annotations/,
computes inter-annotator agreement (Krippendorff's alpha), pairwise win rates,
rubric score aggregations, and produces a Markdown benchmark report.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import click
import krippendorff
import numpy as np
import pandas as pd
import yaml


# ── Helpers ──────────────────────────────────────────────────────────────────

RUBRIC_DIMENSIONS = [
    "cultural_accuracy",
    "linguistic_authenticity",
    "creative_depth",
    "factual_correctness",
]

DIMENSION_LABELS = {
    "cultural_accuracy": "Cultural Accuracy",
    "linguistic_authenticity": "Linguistic Authenticity",
    "creative_depth": "Creative Depth",
    "factual_correctness": "Factual Correctness",
}

CATEGORY_LABELS = {
    "real_world_use": "Real-World Use",
    "words_concepts": "Words & Concepts",
    "frontier_aspirations": "Frontier Aspirations",
    "abstract_vs_everyday": "Abstract vs Everyday",
}


def _load_json_arrays(directory: Path) -> list[dict]:
    """Load all JSON files in *directory*; each file must be a JSON array."""
    items: list[dict] = []
    if not directory.exists():
        return items
    for fp in sorted(directory.glob("*.json")):
        with open(fp) as f:
            data = json.load(f)
        if isinstance(data, list):
            items.extend(data)
    return items


def _load_prompt_metadata(prompts_dir: Path) -> dict[str, dict]:
    """Return {prompt_id: {category, language}} from YAML catalogues."""
    meta: dict[str, dict] = {}
    if not prompts_dir.exists():
        return meta
    for fp in sorted(prompts_dir.glob("*.yaml")):
        if fp.name == "schema.yaml":
            continue
        with open(fp) as f:
            doc = yaml.safe_load(f)
        for p in doc.get("prompts", []):
            meta[p["id"]] = {
                "category": p.get("category", "unknown"),
                "language": doc.get("language", p.get("language", "unknown")),
            }
    return meta


def _load_results_metadata(results_dir: Path) -> dict[str, dict]:
    """Fallback: extract prompt metadata from the latest results file."""
    meta: dict[str, dict] = {}
    if not results_dir.exists():
        return meta
    result_files = sorted(results_dir.glob("*.json"), key=os.path.getmtime)
    if not result_files:
        return meta
    latest = result_files[-1]
    with open(latest) as f:
        data = json.load(f)
    results_list = data if isinstance(data, list) else data.get("results", [])
    for entry in results_list:
        pid = entry.get("prompt_id", "")
        if pid and pid not in meta:
            meta[pid] = {
                "category": entry.get("category", "unknown"),
                "language": entry.get("language", "unknown"),
            }
    return meta


def _language_for_prompt(prompt_id: str, prompt_meta: dict[str, dict]) -> str:
    """Determine language from metadata or fall back to ID prefix heuristic."""
    if prompt_id in prompt_meta:
        return prompt_meta[prompt_id]["language"]
    prefix = prompt_id.split("_")[0]
    return {"ig": "igala", "la": "lebanese_arabic"}.get(prefix, "unknown")


def _category_for_prompt(prompt_id: str, prompt_meta: dict[str, dict]) -> str:
    if prompt_id in prompt_meta:
        return prompt_meta[prompt_id]["category"]
    return "unknown"


# ── Bootstrap confidence intervals ──────────────────────────────────────────


def _bootstrap_ci(
    values: np.ndarray, n_boot: int = 2000, ci: float = 0.95
) -> tuple[float, float]:
    """Return (lower, upper) bootstrap percentile CI for the mean."""
    if len(values) < 2:
        m = float(np.mean(values)) if len(values) else 0.0
        return (m, m)
    rng = np.random.default_rng(42)
    means = np.empty(n_boot)
    for i in range(n_boot):
        sample = rng.choice(values, size=len(values), replace=True)
        means[i] = np.mean(sample)
    alpha = (1 - ci) / 2
    return (float(np.percentile(means, 100 * alpha)),
            float(np.percentile(means, 100 * (1 - alpha))))


def _bootstrap_ci_proportion(
    wins: int, total: int, n_boot: int = 2000, ci: float = 0.95
) -> tuple[float, float]:
    """Bootstrap CI for a win-rate proportion."""
    if total < 2:
        p = wins / total if total else 0.0
        return (p, p)
    rng = np.random.default_rng(42)
    outcomes = np.array([1] * wins + [0] * (total - wins))
    props = np.empty(n_boot)
    for i in range(n_boot):
        sample = rng.choice(outcomes, size=len(outcomes), replace=True)
        props[i] = np.mean(sample)
    alpha = (1 - ci) / 2
    return (float(np.percentile(props, 100 * alpha)),
            float(np.percentile(props, 100 * (1 - alpha))))


# ── Krippendorff's alpha ────────────────────────────────────────────────────


def _krippendorff_alpha_rubric(
    rubric_df: pd.DataFrame, dimension: str
) -> float | None:
    """Compute Krippendorff's alpha (ordinal) for a rubric dimension.

    Builds an annotator-by-unit reliability matrix where each unit is
    (prompt_id, model) and values are scores 1-5.
    """
    subset = rubric_df[["prompt_id", "model", "annotator_id", dimension]].dropna(
        subset=[dimension]
    )
    if subset.empty:
        return None
    # Need at least 2 annotators across all units
    if subset["annotator_id"].nunique() < 2:
        return None

    # Pivot: rows = annotators, columns = units
    subset = subset.copy()
    subset["unit"] = subset["prompt_id"] + "|" + subset["model"]
    pivot = subset.pivot_table(
        index="annotator_id", columns="unit", values=dimension, aggfunc="first"
    )
    if pivot.shape[0] < 2:
        return None
    matrix = pivot.values.astype(float)
    # krippendorff expects np.nan for missing
    matrix = np.where(np.isnan(matrix), np.nan, matrix)
    try:
        alpha = krippendorff.alpha(
            reliability_data=matrix, level_of_measurement="ordinal"
        )
        return float(alpha)
    except Exception:
        return None


def _krippendorff_alpha_pairwise(pairwise_df: pd.DataFrame) -> float | None:
    """Compute Krippendorff's alpha (nominal) for pairwise winner selections.

    Each unit is (prompt_id, model_a, model_b). Values are the winner label.
    """
    if pairwise_df.empty:
        return None
    if pairwise_df["annotator_id"].nunique() < 2:
        return None

    df = pairwise_df.copy()
    df["unit"] = df["prompt_id"] + "|" + df["model_a"] + "|" + df["model_b"]
    # Encode winner as integer: a=1, b=2, tie=3
    winner_map = {"a": 1, "b": 2, "tie": 3}
    df["winner_code"] = df["winner"].map(winner_map)
    df = df.dropna(subset=["winner_code"])
    if df.empty:
        return None

    pivot = df.pivot_table(
        index="annotator_id", columns="unit", values="winner_code", aggfunc="first"
    )
    if pivot.shape[0] < 2:
        return None
    matrix = pivot.values.astype(float)
    matrix = np.where(np.isnan(matrix), np.nan, matrix)
    try:
        alpha = krippendorff.alpha(
            reliability_data=matrix, level_of_measurement="nominal"
        )
        return float(alpha)
    except Exception:
        return None


def _interpret_alpha(alpha: float | None) -> str:
    if alpha is None:
        return "N/A"
    if alpha >= 0.80:
        return "Good"
    if alpha >= 0.67:
        return "Tentative"
    if alpha >= 0.40:
        return "Moderate"
    return "Low"


# ── Pairwise analysis ───────────────────────────────────────────────────────


def _compute_win_rates(
    pairwise_df: pd.DataFrame, models: list[str]
) -> pd.DataFrame:
    """Return a model-vs-model win-rate matrix (row beats column)."""
    matrix = pd.DataFrame(
        np.nan, index=models, columns=models, dtype=float
    )
    for _, row in pairwise_df.iterrows():
        a, b, winner = row["model_a"], row["model_b"], row["winner"]
        if a not in models or b not in models:
            continue
        if winner == "a":
            winning, losing = a, b
        elif winner == "b":
            winning, losing = b, a
        else:
            continue
        # Increment win count for (winning beats losing)
        if np.isnan(matrix.loc[winning, losing]):
            matrix.loc[winning, losing] = 1.0
        else:
            matrix.loc[winning, losing] += 1.0
        # Increment loss count for reverse
        if np.isnan(matrix.loc[losing, winning]):
            matrix.loc[losing, winning] = 0.0
        # Ensure the reverse cell exists for computing rates
    # Convert counts to rates
    rate_matrix = pd.DataFrame(
        np.nan, index=models, columns=models, dtype=float
    )
    for m1 in models:
        for m2 in models:
            if m1 == m2:
                continue
            w = matrix.loc[m1, m2] if not np.isnan(matrix.loc[m1, m2]) else 0
            l = matrix.loc[m2, m1] if not np.isnan(matrix.loc[m2, m1]) else 0
            total = w + l
            if total > 0:
                rate_matrix.loc[m1, m2] = w / total
    return rate_matrix


def _compute_overall_win_pct(
    pairwise_df: pd.DataFrame, models: list[str]
) -> dict[str, float]:
    """Compute overall win percentage for each model across all matchups."""
    wins: dict[str, int] = {m: 0 for m in models}
    total: dict[str, int] = {m: 0 for m in models}
    for _, row in pairwise_df.iterrows():
        a, b, winner = row["model_a"], row["model_b"], row["winner"]
        if a in models:
            total[a] += 1
        if b in models:
            total[b] += 1
        if winner == "a" and a in models:
            wins[a] += 1
        elif winner == "b" and b in models:
            wins[b] += 1
    return {m: (wins[m] / total[m] * 100 if total[m] > 0 else 0.0) for m in models}


# ── Report rendering ────────────────────────────────────────────────────────


def _fmt_pct(val: float | None) -> str:
    if val is None or np.isnan(val):
        return "--"
    return f"{val * 100:.0f}%"


def _fmt_score(mean: float, ci_lo: float, ci_hi: float) -> str:
    margin = (ci_hi - ci_lo) / 2
    return f"{mean:.2f} +/- {margin:.2f}"


def _render_win_rate_table(
    rate_matrix: pd.DataFrame, models: list[str]
) -> str:
    header = "| | " + " | ".join(m.title() for m in models) + " |"
    sep = "|---" + "|---" * len(models) + "|"
    rows = [header, sep]
    for m1 in models:
        cells = []
        for m2 in models:
            if m1 == m2:
                cells.append("-")
            else:
                cells.append(_fmt_pct(rate_matrix.loc[m1, m2]))
        rows.append(f"| **{m1.title()}** | " + " | ".join(cells) + " |")
    return "\n".join(rows)


def _render_rubric_table(
    rubric_df: pd.DataFrame, models: list[str]
) -> str:
    dim_headers = [DIMENSION_LABELS[d] for d in RUBRIC_DIMENSIONS]
    header = "| Model | " + " | ".join(dim_headers) + " | Overall |"
    sep = "|---" + "|---" * (len(RUBRIC_DIMENSIONS) + 1) + "|"
    rows = [header, sep]
    for model in models:
        mdf = rubric_df[rubric_df["model"] == model]
        cells = []
        all_scores = []
        for dim in RUBRIC_DIMENSIONS:
            vals = mdf[dim].dropna().values
            if len(vals) == 0:
                cells.append("--")
                continue
            mean = float(np.mean(vals))
            ci_lo, ci_hi = _bootstrap_ci(vals)
            cells.append(_fmt_score(mean, ci_lo, ci_hi))
            all_scores.extend(vals.tolist())
        # Overall
        if all_scores:
            overall = np.array(all_scores)
            o_mean = float(np.mean(overall))
            o_lo, o_hi = _bootstrap_ci(overall)
            cells.append(_fmt_score(o_mean, o_lo, o_hi))
        else:
            cells.append("--")
        rows.append(f"| **{model.title()}** | " + " | ".join(cells) + " |")
    return "\n".join(rows)


# ── Main report generation ──────────────────────────────────────────────────


def generate_report(
    annotations_dir: Path,
    results_dir: Path,
    output_file: Path,
    epoch: str | None,
) -> str:
    """Generate the full benchmark report and return the Markdown string."""

    prompts_dir = annotations_dir.parent / "prompts"
    prompt_meta = _load_prompt_metadata(prompts_dir)
    if not prompt_meta:
        # Fall back to results metadata
        prompt_meta = _load_results_metadata(results_dir)

    # Load annotations
    pairwise_raw = _load_json_arrays(annotations_dir / "pairwise")
    rubric_raw = _load_json_arrays(annotations_dir / "rubric")

    if not pairwise_raw and not rubric_raw:
        msg = (
            "No annotation files found.\n"
            "Place pairwise comparison JSON arrays in:\n"
            f"  {annotations_dir / 'pairwise/'}\n"
            "Place rubric score JSON arrays in:\n"
            f"  {annotations_dir / 'rubric/'}\n\n"
            "See data/annotations/pairwise/sample.json and "
            "data/annotations/rubric/sample.json for examples."
        )
        click.echo(msg)
        return msg

    # Build DataFrames
    pairwise_df = pd.DataFrame(pairwise_raw) if pairwise_raw else pd.DataFrame()
    rubric_df = pd.DataFrame()
    if rubric_raw:
        # Flatten scores dict into columns
        flat = []
        for item in rubric_raw:
            row = {
                "prompt_id": item["prompt_id"],
                "model": item["model"],
                "annotator_id": item["annotator_id"],
                "timestamp": item.get("timestamp"),
            }
            for dim in RUBRIC_DIMENSIONS:
                row[dim] = item.get("scores", {}).get(dim)
            flat.append(row)
        rubric_df = pd.DataFrame(flat)

    # Enrich with language and category
    for df in [pairwise_df, rubric_df]:
        if df.empty:
            continue
        df["language"] = df["prompt_id"].apply(
            lambda pid: _language_for_prompt(pid, prompt_meta)
        )
        df["category"] = df["prompt_id"].apply(
            lambda pid: _category_for_prompt(pid, prompt_meta)
        )

    # Discover models and languages
    models_set: set[str] = set()
    if not pairwise_df.empty:
        models_set.update(pairwise_df["model_a"].unique())
        models_set.update(pairwise_df["model_b"].unique())
    if not rubric_df.empty:
        models_set.update(rubric_df["model"].unique())
    models = sorted(models_set)

    languages_set: set[str] = set()
    for df in [pairwise_df, rubric_df]:
        if not df.empty and "language" in df.columns:
            languages_set.update(df["language"].unique())
    languages = sorted(languages_set)

    categories_set: set[str] = set()
    for df in [pairwise_df, rubric_df]:
        if not df.empty and "category" in df.columns:
            categories_set.update(df["category"].unique())
    categories = sorted(categories_set)

    epoch_label = epoch or "all"
    generated_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lang_display = ", ".join(l.replace("_", " ").title() for l in languages)
    model_display = ", ".join(m.title() for m in models)

    lines: list[str] = []

    # ── Header ───────────────────────────────────────────────────────────
    lines.append("# Cultural Language Benchmark Report")
    lines.append("")
    lines.append(f"**Epoch:** {epoch_label}  ")
    lines.append(f"**Date:** {generated_date}  ")
    lines.append(f"**Languages:** {lang_display}  ")
    lines.append(f"**Models:** {model_display}")
    lines.append("")

    # ── Executive Summary ────────────────────────────────────────────────
    lines.append("## Executive Summary")
    lines.append("")

    # Per-language best model from rubric scores
    for lang in languages:
        lang_label = lang.replace("_", " ").title()
        if not rubric_df.empty:
            ldf = rubric_df[rubric_df["language"] == lang]
            if not ldf.empty:
                model_means = {}
                for m in models:
                    mdf = ldf[ldf["model"] == m]
                    all_vals = []
                    for dim in RUBRIC_DIMENSIONS:
                        all_vals.extend(mdf[dim].dropna().tolist())
                    if all_vals:
                        model_means[m] = float(np.mean(all_vals))
                if model_means:
                    best = max(model_means, key=model_means.get)
                    lines.append(
                        f"- **{lang_label}**: {best.title()} leads with an overall "
                        f"rubric mean of {model_means[best]:.2f}/5."
                    )

    # Overall win rate leader
    if not pairwise_df.empty:
        overall_pct = _compute_overall_win_pct(pairwise_df, models)
        if overall_pct:
            best_wr = max(overall_pct, key=overall_pct.get)
            lines.append(
                f"- **Overall pairwise winner**: {best_wr.title()} "
                f"({overall_pct[best_wr]:.0f}% win rate across all matchups)."
            )
    lines.append("")

    # ── Pairwise Win Rates ───────────────────────────────────────────────
    if not pairwise_df.empty:
        lines.append("## Pairwise Win Rates")
        lines.append("")
        for lang in languages:
            lang_label = lang.replace("_", " ").title()
            ldf = pairwise_df[pairwise_df["language"] == lang]
            if ldf.empty:
                continue
            lines.append(f"### {lang_label}")
            lines.append("")
            rate_matrix = _compute_win_rates(ldf, models)
            lines.append(_render_win_rate_table(rate_matrix, models))
            lines.append("")

        # Win-rate CIs
        lines.append("### Win Rate Confidence Intervals (95%)")
        lines.append("")
        lines.append("| Model | Overall Win % | 95% CI |")
        lines.append("|---|---|---|")
        overall_pct_data = _compute_overall_win_pct(pairwise_df, models)
        for m in models:
            # Count raw wins/total for bootstrap
            total = 0
            w = 0
            for _, row in pairwise_df.iterrows():
                if row["model_a"] == m:
                    total += 1
                    if row["winner"] == "a":
                        w += 1
                elif row["model_b"] == m:
                    total += 1
                    if row["winner"] == "b":
                        w += 1
            ci_lo, ci_hi = _bootstrap_ci_proportion(w, total)
            lines.append(
                f"| **{m.title()}** | {overall_pct_data[m]:.0f}% | "
                f"[{ci_lo * 100:.0f}%, {ci_hi * 100:.0f}%] |"
            )
        lines.append("")

    # ── Rubric Scores ────────────────────────────────────────────────────
    if not rubric_df.empty:
        lines.append("## Rubric Scores")
        lines.append("")
        for lang in languages:
            lang_label = lang.replace("_", " ").title()
            ldf = rubric_df[rubric_df["language"] == lang]
            if ldf.empty:
                continue
            lines.append(f"### {lang_label}")
            lines.append("")
            lines.append(_render_rubric_table(ldf, models))
            lines.append("")

    # ── Breakdown by Prompt Category ─────────────────────────────────────
    if categories:
        lines.append("## Breakdown by Prompt Category")
        lines.append("")
        for cat in categories:
            cat_label = CATEGORY_LABELS.get(cat, cat.replace("_", " ").title())
            lines.append(f"### {cat_label}")
            lines.append("")

            # Pairwise for this category
            if not pairwise_df.empty:
                cdf = pairwise_df[pairwise_df["category"] == cat]
                if not cdf.empty:
                    lines.append("**Pairwise Win Rates:**")
                    lines.append("")
                    rate_matrix = _compute_win_rates(cdf, models)
                    lines.append(_render_win_rate_table(rate_matrix, models))
                    lines.append("")

            # Rubric for this category
            if not rubric_df.empty:
                cdf = rubric_df[rubric_df["category"] == cat]
                if not cdf.empty:
                    lines.append("**Rubric Scores:**")
                    lines.append("")
                    lines.append(_render_rubric_table(cdf, models))
                    lines.append("")

    # ── Inter-Annotator Agreement ────────────────────────────────────────
    lines.append("## Inter-Annotator Agreement")
    lines.append("")
    lines.append("| Dimension | Krippendorff's alpha | Interpretation |")
    lines.append("|---|---|---|")

    for dim in RUBRIC_DIMENSIONS:
        if not rubric_df.empty:
            alpha = _krippendorff_alpha_rubric(rubric_df, dim)
        else:
            alpha = None
        alpha_str = f"{alpha:.3f}" if alpha is not None else "N/A"
        interp = _interpret_alpha(alpha)
        lines.append(
            f"| {DIMENSION_LABELS[dim]} | {alpha_str} | {interp} |"
        )

    # Pairwise agreement
    if not pairwise_df.empty:
        pw_alpha = _krippendorff_alpha_pairwise(pairwise_df)
    else:
        pw_alpha = None
    pw_alpha_str = f"{pw_alpha:.3f}" if pw_alpha is not None else "N/A"
    pw_interp = _interpret_alpha(pw_alpha)
    lines.append(
        f"| Pairwise Selection | {pw_alpha_str} | {pw_interp} |"
    )
    lines.append("")

    # Overall rubric alpha
    if not rubric_df.empty:
        all_dim_alphas = []
        for dim in RUBRIC_DIMENSIONS:
            a = _krippendorff_alpha_rubric(rubric_df, dim)
            if a is not None:
                all_dim_alphas.append(a)
        if all_dim_alphas:
            overall_alpha = float(np.mean(all_dim_alphas))
            lines.append(
                f"**Overall rubric alpha (mean across dimensions):** "
                f"{overall_alpha:.3f} ({_interpret_alpha(overall_alpha)})"
            )
            lines.append("")

    # ── Methodology ──────────────────────────────────────────────────────
    lines.append("## Methodology")
    lines.append("")
    lines.append(
        "This benchmark evaluates large language models on culturally grounded "
        "prompts across multiple languages. Evaluation combines two approaches:"
    )
    lines.append("")
    lines.append(
        "1. **Pairwise comparison**: Human annotators compare outputs from two "
        "models side-by-side and select the better response, with a written "
        "explanation. Win rates are computed per model pair."
    )
    lines.append(
        "2. **Rubric scoring**: Each model output is scored on a 1-5 scale across "
        "four dimensions: Cultural Accuracy, Linguistic Authenticity, Creative "
        "Depth, and Factual Correctness."
    )
    lines.append("")
    lines.append(
        "Inter-annotator agreement is measured using Krippendorff's alpha -- "
        "ordinal scale for rubric scores and nominal scale for pairwise "
        "selections. Confidence intervals are computed via bootstrap resampling "
        "(2000 iterations, 95% CI)."
    )
    lines.append("")

    return "\n".join(lines)


# ── CLI ──────────────────────────────────────────────────────────────────────


@click.command()
@click.option(
    "--annotations-dir",
    type=click.Path(exists=False, path_type=Path),
    default=Path("data/annotations"),
    help="Directory containing pairwise/ and rubric/ annotation JSON files.",
)
@click.option(
    "--results-dir",
    type=click.Path(exists=False, path_type=Path),
    default=Path("data/results"),
    help="Directory containing model result JSON files.",
)
@click.option(
    "--output-file",
    type=click.Path(path_type=Path),
    default=Path("reports/benchmark_report.md"),
    help="Output path for the Markdown report.",
)
@click.option(
    "--epoch",
    type=str,
    default=None,
    help="Optional epoch label (e.g. 'epoch_1').",
)
def main(
    annotations_dir: Path,
    results_dir: Path,
    output_file: Path,
    epoch: str | None,
) -> None:
    """Generate a Cultural Language Benchmark Report from annotations."""
    # Resolve relative paths against CWD
    annotations_dir = annotations_dir.resolve()
    results_dir = results_dir.resolve()
    output_file = output_file.resolve()

    click.echo(f"Annotations dir: {annotations_dir}")
    click.echo(f"Results dir:     {results_dir}")
    click.echo(f"Output file:     {output_file}")

    output_file.parent.mkdir(parents=True, exist_ok=True)

    report = generate_report(annotations_dir, results_dir, output_file, epoch)

    with open(output_file, "w") as f:
        f.write(report)

    click.echo(f"\nReport written to {output_file}")


if __name__ == "__main__":
    main()
