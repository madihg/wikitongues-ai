import { createHash } from "node:crypto";

/**
 * The consent a speaker reads (written) or hears (oral script) before the
 * Speech Lab will record them. Versioned, hashed and stored verbatim with
 * every grant (Consent.text, Consent.textHash), so a grant can always be
 * audited against exactly what the speaker saw or heard.
 *
 * Rules the text must keep (PRD Section 1, lab design):
 *  - simple English, short sentences;
 *  - how to WITHDRAW comes first, before anything the speaker is asked;
 *  - it says plainly that OPEN is permanent, that opting out cannot untrain
 *    a model, and that royalties exist for LICENSED use;
 *  - nothing is pre-checked and the four questions are separate.
 *
 * Changing any word here means a new CONSENT_VERSION: old grants keep the
 * text they were given, and speakers are asked again for the new version.
 */

export const CONSENT_VERSION = "2026-10-19-v1";

/** Shown wherever Igala text will go. Never filled in by code. */
export const IGALA_PLACEHOLDER =
  "[Igala version to be written and checked by community reviewers]";

export interface ConsentSection {
  id: string;
  heading: string;
  body: string;
}

/** The written consent, in reading order. Withdrawal is first. */
export const WRITTEN_SECTIONS: ConsentSection[] = [
  {
    id: "withdraw",
    heading: "You can stop at any time",
    body:
      "You can withdraw at any time, for any reason, without giving a reason. " +
      "Tell the research team and we will stop using your recordings and delete them from our storage. " +
      "Two things we cannot undo: we cannot take your voice out of an AI model that has already been trained on it, " +
      "and we cannot pull back a recording that has already been published under the Open choice.",
  },
  {
    id: "what",
    heading: "What we ask you to do",
    body:
      "We ask you to record yourself saying Igala sentences out loud. " +
      "The recordings help build tools for the Igala language, such as speech recognition and a synthetic voice. " +
      "You do not have to take part. Saying no changes nothing about your other work.",
  },
  {
    id: "choice",
    heading: "You choose what happens to each clip",
    body:
      "After each recording you pick one of three choices. " +
      "Stays with my community: the clip is only used inside the Igala tools and is never shared. " +
      "Licensed to AI labs: the clip may be shared with AI companies under a signed contract. " +
      "Open to everyone: the clip is published under the CC-BY 4.0 licence, so anyone may use it, including companies, if they credit the project. " +
      "Open is permanent: once a clip is published we cannot make it private again.",
  },
  {
    id: "pay",
    heading: "Payment",
    body:
      "If clips you licensed bring in money, you are paid a share of it (a royalty). " +
      "The share and how it is paid are set out in a separate written agreement that you can read before you rely on it. " +
      "Clips you keep in your community, or publish openly, earn no royalty.",
  },
  {
    id: "questions",
    heading: "Four separate questions",
    body:
      "You answer each of these on its own. None is ticked for you. " +
      "Licensing: may clips you choose to license be used by companies for money? " +
      "Other countries: may your clips be sent to organisations outside your country? " +
      "Voice cloning: may a synthetic copy of your voice be made? " +
      "Speaker identity: may your clips be linked to who you are, instead of a made-up speaker label? " +
      "You can change any answer later. A change applies to clips you record after it.",
  },
];

/** The oral script a facilitator reads aloud; same promises, spoken form. */
export const ORAL_SECTIONS: ConsentSection[] = [
  {
    id: "withdraw",
    heading: "First: you can stop at any time",
    body:
      "Before we start, you should know this. You can stop at any time. " +
      "You do not have to say why. Tell us, and we will stop using your recordings and delete them. " +
      "We cannot take your voice out of an AI model that has already learned from it. " +
      "We cannot take back a recording we have already published under the Open choice.",
  },
  {
    id: "what",
    heading: "What we are asking",
    body:
      "I am going to ask you to say some Igala sentences. We record them. " +
      "We use the recordings to build tools for the Igala language. You can say no.",
  },
  {
    id: "choice",
    heading: "What happens to each recording",
    body:
      "After each one, you choose. One: it stays with your community and is never shared. " +
      "Two: it may be licensed to AI companies under a contract, and you are paid a share. " +
      "Three: it is open to everyone, with credit to the project. Open is permanent. We cannot make it private later.",
  },
  {
    id: "questions",
    heading: "Four questions, one at a time",
    body:
      "I will ask you four questions. Answer each one yourself. If you say nothing, the answer is no. " +
      "Can companies use clips you license, for money? " +
      "Can your clips be sent to organisations outside your country? " +
      "Can we make a synthetic copy of your voice? " +
      "Can your clips be linked to your name, instead of a made-up label?",
  },
  {
    id: "confirm",
    heading: "Do you agree?",
    body:
      "Do you understand that you can stop at any time? " +
      "Do you agree to take part? I will write down what you said.",
  },
];

/** The four questions, in order. Each is a separate, unchecked-by-default flag. */
export const CONSENT_QUESTIONS = [
  {
    key: "commercialLicensing",
    label: "Licensing",
    question:
      "Companies may use clips I choose to license, and I am paid a share.",
  },
  {
    key: "crossBorder",
    label: "Other countries",
    question: "My clips may be sent to organisations outside my country.",
  },
  {
    key: "voiceCloning",
    label: "Voice cloning",
    question: "A synthetic copy of my voice may be made.",
  },
  {
    key: "speakerId",
    label: "Speaker identity",
    question: "My clips may be linked to who I am, not only a made-up label.",
  },
] as const;

export type ConsentFlagKey = (typeof CONSENT_QUESTIONS)[number]["key"];

export type ConsentTextMethod = "written" | "oral";

/** The exact text stored and hashed for a method: headings and bodies, in order. */
export function consentTextFor(method: ConsentTextMethod): string {
  const sections = method === "oral" ? ORAL_SECTIONS : WRITTEN_SECTIONS;
  return sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n");
}

/** sha256 hex of a consent text: the audit key stored beside it. */
export function consentTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
