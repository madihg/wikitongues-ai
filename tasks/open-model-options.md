# Open-weights models: what we can fine-tune AND serve, and the strongest Igala base

Read-only research, 2026-08-09. No training run, no endpoint created, no spend. All Together
findings below are from **live API/CLI calls on this account** (`TOGETHER_API_KEY` in
`web/.env.local`, quotes stripped) plus Together's own docs fetched raw (not paraphrased, where
noted). This builds on `web/Context.md`'s same-day verdict: Qwen3-14B LoRA (`ft-e63efcfc-8670`,
$4.00) trained but cannot be served — v1 endpoint creation is globally disabled
(`endpoints_v1_create_access_disabled`) and LoRA adapters need a dedicated endpoint as the
adapter target. That verdict stands. This document goes one level deeper: **is LoRA-on-v1 really
the only door, or is there a different door (full fine-tune + v2) that's actually open?**

**Answer, upfront: yes, a different door is open.** Together has a **v2** dedicated-endpoint
system, separate from the disabled v1, that is live and queryable on this account today. A subset
of Together's fine-tunable models — including two 7-9B models — are _also_ v2-dedicated-servable,
with a real, certified hardware config already showing in the API. Nothing in this account's
config, credentials, or the `endpoints_v1_create_access_disabled` block appears to touch v2. That
said: **the Igala-optimal base model (Lugha-Llama-8B) is not one of those models** — it isn't on
Together in any capacity. So the project still faces the same fork as before, just characterized
more precisely: _servable-on-Together-but-Africa-naive_ vs. _Africa-adapted-but-must-self-host_.

---

## 1. Does Together support full (non-LoRA) fine-tuning, and can the output be served?

**Yes to both, but only for a specific subset of models, and neither the base model this project
already trained (Qwen3-14B) nor its other two configured bases (`Llama-3.3-70B-Instruct`,
`Mistral-Nemo-Instruct-2407` in `web/src/lib/arena/together.ts`) are members of that subset today.**

### 1a. Full fine-tuning is real and cheap to select

Fetched raw (not model-paraphrased) from `https://docs.together.ai/docs/fine-tuning/lora-vs-full`:
the training API takes a boolean, not a "training_type" enum:

```python
job = client.fine_tuning.create(
    training_file="<FILE_ID>",
    model="meta-llama/Meta-Llama-3.1-8B-Instruct-Reference",
    lora=True,   # default — LoRA
)
# lora=False -> full fine-tune, updates every weight
```

`web/src/lib/arena/together.ts::startFineTune` **never sets this field**, so every job this
project has run on Together — including the $4.00 Qwen3-14B run — was LoRA by Together's default,
not a deliberate choice. Flipping to full fine-tuning is a one-line change (`lora: false` in the
request body) _if_ the base model supports it (see 1c).

### 1b. Which models support full fine-tuning today (fetched raw from

`https://docs.together.ai/docs/fine-tuning-models`, "Full fine-tuning" table, 11 rows):

| Model                                    | API ID                                            | Context (SFT) |
| ---------------------------------------- | ------------------------------------------------- | ------------- |
| Qwen3.5 27B                              | `Qwen/Qwen3.5-27B`                                | 32768         |
| **Qwen3.5 9B**                           | `Qwen/Qwen3.5-9B`                                 | 65536         |
| Qwen3.5 4B / 2B / 0.8B                   | —                                                 | —             |
| Qwen3.6 27B                              | `Qwen/Qwen3.6-27B`                                | 32768         |
| Llama 3.3 70B Instruct **Reference**     | `meta-llama/Llama-3.3-70B-Instruct-Reference`     | 24576         |
| **Meta Llama 3.1 8B Instruct Reference** | `meta-llama/Meta-Llama-3.1-8B-Instruct-Reference` | 131072        |
| Gemma 4 31B IT (+VLM)                    | `google/gemma-4-31B-it`                           | 49152         |
| Mixtral 8x7B Instruct v0.1               | `mistralai/Mixtral-8x7B-Instruct-v0.1`            | 32768         |

Note the doc's own warning, quoted exactly: _"Some models can be fine-tuned but cannot be
deployed as dedicated endpoints. To verify deployability before training, confirm the base model
appears in the supported models list for dedicated model inference (or run `tg beta models
configs <BASE_MODEL>`). If it isn't listed there, the fine-tune can't be hosted on a dedicated
endpoint."_ This is exactly the trap the Qwen3-14B run fell into, and Together is explicit that it
is a known, named failure mode, not a bug.

### 1c. Cross-checked live against the account's actual v2 model/config registry

`tg beta models public --json` (37 models total) reports a `products` array per model
(`PRODUCT_FINE_TUNING`, `PRODUCT_DEDICATED`, `PRODUCT_SERVERLESS`) and, for dedicated-eligible
models, a certified `deploymentProfiles` entry (exact GPU type/count/quantization). Computing the
intersection **live, today**:

- **23 of 37 public models carry both `PRODUCT_FINE_TUNING` and `PRODUCT_DEDICATED`** with a
  certified config — meaning fine-tune → dedicated-serve is a real, working pipeline for those
  specific models. Smallest two: `Qwen/Qwen2.5-7B-Instruct` (1× H100, BF16) and `Qwen/Qwen3.5-9B`
  (1× H100, BF16/FP8) — the same `Qwen3.5-9B` that supports full fine-tuning per 1b.
- **`Qwen/Qwen3-14B` (this project's already-trained base) does not appear in this list at all** —
  not in `--product fine-tuning` (23 models), not in `--product dedicated`, not in a plain
  `--search "Qwen3-14B"` (empty). It's still reachable via the older `/v1/fine-tunes` job-creation
  endpoint (that's how the $4 run succeeded), but Together's own current registry shows it has
  **zero certified deployment config** — confirmed empirically: `tg beta models configs
ml_Cd9bBgT2LjWfbzQfUx2L1` (the account's actual registered Qwen3-14B full-model object,
  migrated from the v1 job) returns `{"data": [], "object": "list"}`. Dead end, independently
  reconfirmed via a different code path than the earlier 400/model_not_available finding.
  `Mistral-Nemo-Instruct-2407` (this project's third configured base) is likewise absent from
  every current list.
- **`meta-llama/Llama-3.3-70B-Instruct` does have a working, certified config**: `tg beta models
configs ml_Cd9bCJXRWUGdkFjU5jw1K` (the account's real full-weight fine-tuned 70B model, 70.5B
  params, migrated from a _different_, older project — "singulars" — on this same account) returns
  one certified config: 4× NVIDIA H100 80GB, "aggregated" topology, `CERTIFICATION_TYPE_CERTIFIED`.
  This is not hypothetical — it's an actually-deployable object sitting in this account's project
  right now (not deployed, not billing, just registered). Proof that the fine-tune→v2-dedicated
  pipeline works end-to-end today, just not at 8B/14B for models this project has used.

### 1d. Is v2 endpoint creation itself blocked, the way v1 is?

**Not observably.** `tg beta endpoints ls` returns a normal empty list (`{"data": [], "object":
"list"}`), not an access-denied error. `tg beta models configs <id>` returns real certified
configs, not an error. The v1 disablement is scoped narrowly — fetched raw from Together's
migration doc: _"Creating a new v1 endpoint and restarting a stopped or paused one are no longer
available. These operations now return `endpoints_v1_create_access_disabled` (HTTP 403)... This is
not a permissions problem. Your models, fine-tuned checkpoints, hardware, and API key still
work."_ Nothing in that text, or in any v2 doc, mentions a parallel v2 restriction. **I did not
call `tg beta endpoints deploy`** (that would create a billable resource, out of scope per the
task) — so this is read-only evidence, not proof of a successful deploy. Before spending anything,
the cheap validating step is exactly that one `deploy` call on a model that already has a
certified config (e.g. redeploy the existing `Llama-3.3-70B-Instruct-Reference` migrated model, or
a fresh `Qwen3.5-9B` full fine-tune) with `--min-replicas 0 --max-replicas 1` so it starts stopped.

### 1e. Cost implications for an 8B or 14B full fine-tune

Together's pricing page (fetched, `https://www.together.ai/pricing`), fine-tuning section, priced
per token processed (`training rows × epochs`, plus eval tokens), **minimum $4.00/job**:

| Model size bracket | LoRA              | Full              |
| ------------------ | ----------------- | ----------------- |
| Up to 16B          | $0.48 / 1M tokens | $1.20 / 1M tokens |
| 17B-69B            | $1.50 / 1M tokens | $3.75 / 1M tokens |
| 70-100B            | $2.90 / 1M tokens | $7.25 / 1M tokens |

At this project's current data scale (the OpenAI SFT run trained on 370,443 tokens,
`web/Context.md` line 23), a full fine-tune of `Meta-Llama-3.1-8B-Instruct-Reference` or
`Qwen/Qwen3.5-9B` (both "up to 16B" bracket) would cost **370K tokens × $1.20/1M ≈ $0.44 →
rounds up to the $4.00 minimum** — the identical $4.00 the Qwen3-14B _LoRA_ run already cost. **At
this project's current data size, full and LoRA fine-tuning cost the same** (both hit the
per-job floor), so there is no cost reason to default to LoRA. A true 14B full fine-tune isn't
priceable because no 14B model currently appears in either fine-tuning table (1b) — the nearest
sizes are 9B and 27B/31B.

**Not independently verified**: whether `meta-llama/Meta-Llama-3.1-8B-Instruct-Reference`'s
architecture (the "-Reference" training-only checkpoint) actually maps to the _dedicated-servable_
`meta-llama/Llama-3.1-8B-Instruct` architecture (`arch_CcqavoedEn2SPa7mpb6pK`, confirmed live:
`PRODUCT_DEDICATED` only, 1× H100 FP8, certified) when registered as a v2 custom model. The
"-Reference"/production-name split is consistent across every model in the account's registry
(e.g. `Llama-3.3-70B-Instruct-Reference` trained → deployed under the `Llama-3.3-70B-Instruct`
architecture, confirmed via the certified config in 1c), and Together's custom-models doc requires
only that "the architecture must match one of the supported models," which points the same way —
but I did not register an 8B model to prove it. **Flag for a cheap acceptance test before
committing real training spend to the 8B path specifically.**

---

## 2. Which open-weights base is strongest for Igala?

Igala: Niger-Congo, **Yoruboid** (a close sister of Yoruba, not Idoma — see
`tasks/research-recommendation.md` lines 67-75, a standing correction against the older Idoma
framing), ~2M speakers, confirmed absent from NLLB/MADLAD-400/Glot500
(`tasks/research-dossier.md` lines 439-453). No candidate model has _seen_ Igala; the question is
which substrate transfers best from related languages, chiefly Yoruba.

| Candidate                                              | On HF?                                                     | African/Niger-Congo exposure                                                                                                                                                                                                                                                                                                                           | On Together?                                                                                                                                                                           | Size     | License                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lugha-Llama-8B** (`Lugha-Llama/Lugha-Llama-8B-wura`) | Yes, real, 3 variants (`-wura`, `-wura_math`, `-wura-edu`) | Llama-3.1-8B **continued-pretrained on 10B tokens of WURA**, a corpus of 16 African languages + English/French/Arabic/Portuguese; **Yoruba is confirmed in WURA/IrokoBench** (paper Table 1, arXiv:2504.06536, fetched raw), the closest living relative to Igala of anything in this table. Measured gains up to +8pp AfriMMLU vs. base Llama-3.1-8B. | **No** — zero hits searching Together's full 37-model registry for "lugha"                                                                                                             | 8B       | Llama 3.1 Community License (inherited from base)                                                                                                                     |
| **Aya-101** (`CohereLabs/aya-101`)                     | Yes                                                        | Instruction-tuned across 101 languages incl. **confirmed** Yoruba, Igbo, Hausa, Swahili                                                                                                                                                                                                                                                                | **No** — zero hits for "aya"                                                                                                                                                           | 13B      | Apache-2.0 (permissive)                                                                                                                                               |
| **Aya-23-8B** (`CohereLabs/aya-23-8B`)                 | Yes                                                        | 23 languages, **none African** (Arabic is the only lower-resource-adjacent one; no sub-Saharan coverage) — a worse fit than Aya-101 despite the newer/better architecture                                                                                                                                                                              | No                                                                                                                                                                                     | 8B       | CC-BY-NC (Aya 23 license, non-commercial-flavored)                                                                                                                    |
| **InkubaLM-0.4B** (`lelapa/InkubaLM-0.4B`)             | Yes                                                        | Trained from scratch on isiZulu, **Yoruba**, Swahili, isiXhosa, Hausa + English/French — real Yoruba exposure, but trained on only ~1.9B African-language tokens total and 0.4B params                                                                                                                                                                 | No                                                                                                                                                                                     | 0.4B     | **CC BY-NC 4.0 — non-commercial**, a real blocker if the model is ever released alongside anything monetized, and worth flagging to Halim regardless of current plans |
| Llama-3.1-8B / 3.3-70B (vanilla)                       | Yes                                                        | General web-scale multilingual pretraining; no deliberate African-language upsampling; this is the _base_ Lugha-Llama started from                                                                                                                                                                                                                     | **Yes** — both fine-tunable and dedicated-servable on Together today (70B confirmed with a certified config; 8B fine-tunable via the "-Reference" id per §1)                           | 8B / 70B | Llama license                                                                                                                                                         |
| Qwen3-14B / Qwen3.5-9B                                 | Yes                                                        | Strong multilingual (Chinese-centric multilingual mix) but **no evidence of Niger-Congo/African-language upsampling** in Qwen's published pretraining mix                                                                                                                                                                                              | Qwen3-14B: fine-tunable via legacy API, **not dedicated-servable** (§1c). Qwen3.5-9B: **both**, confirmed live.                                                                        | 9-14B    | Apache 2.0 / Qwen license                                                                                                                                             |
| Gemma (3/4)                                            | Yes                                                        | Broad multilingual pretraining (Google), marketed diacritic-friendly tokenizer (relevant to Igala's tone marks) but no specific Volta-Niger/African adaptation claim found                                                                                                                                                                             | Gemma-4-31B-it: fine-tunable + dedicated-servable, confirmed live. Gemma 3 (3-27b-it etc.) appears in Together's general serverless catalog but not in the fine-tuning tables fetched. | 4B-31B   | Gemma Terms of Use                                                                                                                                                    |

**Ranking for Igala specifically:**

1. **Lugha-Llama-8B** — the only candidate with measured, published transfer gains on a
   Yoruboid-adjacent benchmark set, and the only one whose adaptation corpus (WURA) is confirmed
   to include Yoruba, Igala's nearest relative. This matches the project's own prior research
   verdict (`tasks/research-recommendation.md` line 90, `tasks/research-dossier.md` line 171) —
   this research does not overturn that pick, it just prices out the consequence: **it cannot be
   trained or served on Together at all.** No instruction-tuned variant was found (checked the HF
   repo and the paper directly) — only base/CPT checkpoints, meaning any use requires our own SFT
   on top, which is exactly what this project's pipeline already produces.
2. **Aya-101** — second choice on paper (confirmed Yoruba/Igbo/Hausa/Swahili coverage, permissive
   Apache-2.0 license, no non-commercial trap), but its architecture is **mT5-XXL, an
   encoder-decoder, not a decoder-only chat LLM** — a materially harder self-serving story (vLLM's
   encoder-decoder support is newer and less optimized than its decoder-only path) and a poor fit
   for the open-ended generative completions this project trains on. Also not on Together.
3. **Qwen3.5-9B or Llama-3.1-8B (vanilla)** — no African-language edge at all, but the only tier in
   this table that is _both_ fine-tunable and dedicated-servable on Together **today**, cheaply (1×
   H100, $5.49/hr, per §3). This is the pragmatic fallback: strongest base _achievable without new
   infrastructure_, not strongest base in the abstract.
4. **InkubaLM-0.4B** — real Yoruba exposure but 0.4B is almost certainly too small for fluent
   open-ended Igala generation (its own eval suite is classification/sentiment, not generation),
   and the CC-BY-NC license is a standing constraint if community release is a goal. Useful mainly
   as a cheap sanity-check ("does a tiny model with real Yoruba tokens beat a huge model with
   none?"), not as the production base.
5. **Aya-23-8B** — ruled out; no African-language coverage at all per its own model card, despite
   the superficially attractive "Aya" branding.

The tokenizer-fertility probe both `research-recommendation.md` and `research-dossier.md` already
call for (never run per the dossier) becomes more, not less, urgent given this: Lugha-Llama's
advantage is empirically demonstrated on Yoruba/Hausa/Swahili-family tasks, not on Igala, and nobody
has yet measured how it tokenizes or generates Igala specifically.

---

## 3. Self-hosting path: rough costs for bursty use (a few hundred generations/week)

If Lugha-Llama-8B (or any non-Together model) is the chosen base, Together cannot serve it —
period, not a LoRA-vs-full distinction, its architecture simply isn't in Together's registry. The
question becomes standard open-weights self-hosting. Figures below are from official pricing pages
where fetched directly; two (RunPod, Modal per-second) came back through summarized web search and
should be treated as approximate, not quoted verbatim in any spend decision.

| Option                                                                      | $/hr (on-demand GPU, ~8-14B model fits 1× 24-80GB card)                                                                                                        | $/month if always-on                                                                                                                       | Bursty-use behavior                                                                                                                                                                                                                                                                                 | Notes                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modal** (serverless, official pricing page)                               | A10: $0.000306/sec ≈ **$1.10/hr**; A100-80GB: $0.000694/sec ≈ **$2.50/hr**; H100: $0.001097/sec ≈ **$3.95/hr**                                                 | N/A by design — scales to zero                                                                                                             | **Bills only for actual request time**, no idle charge; $30/month free credits on the Starter plan cover a meaningful chunk of a few-hundred-generations/week pattern outright. Cold start adds latency (and cost) per request after idle — roughly 10-20s cold load reported for a mid-size model. | Best fit for this project's stated pattern (bursty, a few hundred/week) _if_ the ~10-20s cold-start latency is acceptable for the arena/annotator UX.                                                             |
| **RunPod Serverless** (official pricing page + secondary sources)           | A100-80GB ≈ **$2.72/hr** active-compute-only; H100 ≈ **$4.55/hr**; On-Demand (always-reserved) Secure Cloud A100 ≈ **$1.39-1.49/hr**, H100 ≈ **$2.89-2.99/hr** | ~$1,000-2,150/month if an On-Demand A100/H100 pod is left running 24/7                                                                     | Serverless tier bills per-second of active compute like Modal; cheaper hourly rate than Modal's A100/H100 tier in some third-party comparisons, but per-request cost estimates online (~$0.0004/request for Llama-3.1-8B) are secondary-sourced, not official.                                      | Roughly comparable to Modal for bursty use; better if sustained throughput ever matters (cheaper on-demand hourly floor).                                                                                         |
| **Hugging Face Inference Endpoints** (official docs)                        | T4: $0.50/hr; A10G: $1.00/hr; A100-80GB: $2.50/hr; L40S: $1.80/hr                                                                                              | T4 always-on ≈ **$365/year (~$30/mo)**; a scale-to-zero endpoint serving 100-1,000 req/day is cited (secondary source) at **$20-60/month** | Scale-to-zero exists but HF's own docs note a scaled-to-zero endpoint still "counts as used quota" — billing detail worth confirming directly with HF before committing, not fully clear from the fetched page.                                                                                     | Simplest ops story (managed HF stack, no custom vLLM setup), least control over cold-start/latency tuning.                                                                                                        |
| **Self-managed vLLM on a rented GPU** (RunPod/Lambda/Vast.ai On-Demand pod) | Same on-demand figures as RunPod row above (~$1.39-2.99/hr depending on card)                                                                                  | Same as RunPod On-Demand row if left running                                                                                               | Cheapest **only** if you build your own scale-to-zero/start-stop automation (start pod on request, shut down after idle timeout) — otherwise it's the most expensive option because nothing scales down automatically.                                                                              | Most engineering effort (own Dockerfile, vLLM server, autoscaling logic); most control (needed for the interpretability/layer-inspection use case, since you own the full stack, not just an inference endpoint). |

**For "a few hundred generations a week" specifically**: that's roughly 15-60 requests/day. At
that volume, every serverless/scale-to-zero option (Modal, RunPod Serverless, HF scale-to-zero)
will land in the **tens of dollars a month**, not hundreds — the actual differentiator becomes
cold-start latency tolerance and the free-credit floor (Modal's $30/month free tier plausibly
covers this pattern at zero net cost). An always-on dedicated pod (RunPod On-Demand, HF non-scaling
endpoint, or a Together dedicated H100 at $5.49/hr = **~$4,000/month** if never paused) is the wrong
shape for this traffic pattern regardless of provider — the win from Together's v2 path in §1 is
technical reachability, not cost efficiency, unless autoscale-to-zero is configured there too
(`--min-replicas 0` is a real flag per §1d, not yet tested against actual traffic behavior).

**Not verified**: exact current RunPod Serverless official per-second rate (the RunPod pricing page
fetch mixed official and page-summarized figures); exact HF scale-to-zero billing floor (does a
paused endpoint bill $0, or is there a minimum). Both are cheap to confirm directly before
committing infrastructure.

---

## 4. Recommendation

**Primary: full-fine-tune `meta-llama/Meta-Llama-3.1-8B-Instruct-Reference` on Together
(`lora: false`), serve on a Together v2 dedicated endpoint (1× H100, ~$5.49/hr,
`--min-replicas 0` to avoid idle billing).**

Reasoning: this is the only path in this entire investigation that is _provably reachable today_,
end to end, on infrastructure already wired in this codebase (`web/src/lib/arena/together.ts`
already has the file-upload/job-start/poll plumbing; it needs exactly two changes — swap the base
model string, and add `lora: false` to the `startFineTune` request body). Cost is unchanged from
what's already been spent once ($4.00 floor, per §1e). It gives up the Yoruba-transfer advantage
Lugha-Llama would bring — this is a known, named tradeoff, not an oversight — but it keeps the
project inside its existing tooling and existing budget discipline, and 8B beats the already-tried
14B on the one axis that actually blocked the last run: it has a certified path to being served.
**Before spending anything real on this**, do the one cheap acceptance test flagged in §1e: run a
tiny/free-tier full fine-tune (or even just `tg beta models create --base-model
arch_CcqavoedEn2SPa7mpb6pK` against a dummy revision) to confirm the "-Reference"-trained output
really does register under the dedicated-servable architecture before committing the real Igala
corpus to it.

**Fallback: self-host `Lugha-Llama-8B-wura` fine-tuned on Modal (or RunPod Serverless), scale-to-zero.**

Reasoning: this is the base model the project's own prior research already picked
(`tasks/research-recommendation.md`, `tasks/research-dossier.md`) for real, evidenced,
Yoruba-transfer reasons that this investigation reconfirms and sharpens (WURA explicitly includes
Yoruba, Igala's nearest relative, with measured benchmark gains). Together cannot host it under any
configuration found — architecture absence, not a LoRA/full or v1/v2 technicality — so reaching it
requires renting compute directly. At this project's traffic pattern (a few hundred generations/
week), Modal's per-second billing plus its $30/month free tier plausibly makes this **free or
near-free**, not the expensive option intuition suggests — the real cost is engineering time (own
training script since Lugha-Llama isn't a Together-recognized fine-tuning base, own vLLM/serving
Dockerfile) rather than dollars. This path is also the only one of the two that satisfies the
project's stated non-cost goals directly: releasing real Yoruba-informed open weights to the Igala
community, and full layer-by-layer inspectability for the interpretability paper — both requiring
weights nobody has to ask Together's permission to touch.

**Recommended sequencing, if resources allow both**: run the primary (Llama-3.1-8B on Together)
first since it's nearly free and validates the whole fine-tune→serve pipeline end-to-end within
days; run the fallback (Lugha-Llama self-hosted) in parallel or immediately after as the "does
African-language pretraining actually matter for Igala" experiment the project has been waiting to
run since the tokenizer-fertility probe was first flagged as outstanding.

---

## Sources (fetched live, 2026-08-09)

- `https://docs.together.ai/docs/fine-tuning/lora-vs-full` (raw markdown fetch — `lora` boolean API param)
- `https://docs.together.ai/docs/fine-tuning-models` (raw markdown fetch — full LoRA/Full tables + deployability warning)
- `https://docs.together.ai/docs/dedicated-endpoints/custom-models` (v2 upload requirements)
- `https://docs.together.ai/docs/dedicated-endpoints/migrate-from-v1` (v1 disablement text, exact quote)
- `https://docs.together.ai/docs/dedicated-endpoints/pricing`, `https://www.together.ai/pricing` (GPU $/hr, fine-tune $/token brackets)
- Live Together API/CLI, this account, 2026-08-09: `GET /v1/models` (283 models), `tg beta models public [--product fine-tuning|dedicated|serverless] [--search ...]` (37 models, product/config ground truth), `tg beta models list` / `tg beta models configs <id>` (account's own registered models + certified deployment configs), `tg beta endpoints ls` (empty, no access error)
- `https://huggingface.co/Lugha-Llama/Lugha-Llama-8B-wura`, `https://arxiv.org/html/2504.06536` (Lugha-Llama paper, raw HTML fetch — WURA language list incl. Yoruba, license, no instruct variant)
- `https://huggingface.co/CohereLabs/aya-101`, `https://huggingface.co/CohereLabs/aya-23-8B` (language coverage, architecture, license)
- `https://huggingface.co/lelapa/InkubaLM-0.4B` (language coverage, CC-BY-NC license)
- Modal, RunPod, Hugging Face official pricing pages (`modal.com/pricing`, `runpod.io/pricing`, `huggingface.co/docs/inference-endpoints/pricing`), cross-checked against secondary sources where the official page didn't fully answer (flagged inline above)
- Project priors: `web/Context.md` (today's Qwen3-14B verdict), `tasks/research-recommendation.md`, `tasks/research-dossier.md` (Lugha-Llama pick, Yoruboid correction, base-model due-diligence ask)

## Flags for Halim

1. **InkubaLM is CC BY-NC 4.0 (non-commercial)** — irrelevant if it's never used as more than a
   sanity check, but worth knowing before it becomes anyone's default answer to "what's the small
   African model."
2. The "-Reference" → production-architecture mapping in §1e (Meta-Llama-3.1-8B-Instruct-Reference
   full fine-tune landing on the dedicated-servable Llama-3.1-8B-Instruct architecture) is inferred
   from a consistent pattern across the account's other models, not independently proven for 8B —
   worth a $0 CLI check (`tg beta models create` against a dummy revision) before trusting it with
   real training spend.
3. RunPod Serverless per-second official rate and HF's scale-to-zero billing floor were not fully
   pinned down to an official-page quote — cheap to confirm directly if the self-hosting fallback
   gets picked.
4. Nobody has run the tokenizer-fertility probe on Igala across Lugha-Llama/Gemma/Qwen that both
   prior research docs call for — this document sharpens the case for Lugha-Llama but doesn't
   substitute for that measurement.
