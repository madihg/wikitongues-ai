/**
 * "How Speech works": the first-visit walkthrough every speaker gets on the
 * Record tab, annotators and researchers alike. Client-safe, pure data.
 *
 * The shape is a guided journey with a host: the guide talks, then asks the
 * speaker a small question and waits for their answer before moving on. Each
 * of the three jobs (Record, Check, Listen) is a clue to find; finding all
 * three ends the walk with one concrete first task. The questions are not a
 * test: a wrong tap gets a friendly hint and the speaker tries again.
 *
 * The words are English only. Igala text never enters this repository
 * (Context.md, data rules), so an Igala version of these lines would have to
 * be loaded from the database, not written here.
 */

export const WALKTHROUGH_KEY = "wt-speech-walkthrough-v1";

export type ClueKey = "record" | "check" | "listen";

export interface WalkthroughChoice {
  label: string;
  correct: boolean;
  /** What the guide says after this tap. */
  reply: string;
}

export interface WalkthroughStep {
  key: string;
  /** The clue this step belongs to; null for the welcome and the end. */
  clue: ClueKey | null;
  title: string;
  /** What the guide says, one short paragraph per line. */
  lines: readonly string[];
  /** The guide's question. With no question the step moves on with one button. */
  question?: { text: string; choices: readonly WalkthroughChoice[] };
  /** Finishing this step finds its clue. */
  findsClue?: boolean;
  /** The button that moves on (or the only button when there is no question). */
  next: string;
}

export const CLUES: readonly { key: ClueKey; label: string }[] = [
  { key: "record", label: "Record" },
  { key: "check", label: "Check" },
  { key: "listen", label: "Listen" },
];

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    key: "hello",
    clue: null,
    title: "Welcome to Speech!",
    lines: [
      "Hi! We are teaching a computer to hear and speak Igala, and it can only learn from people like you.",
      "There are three clues to find on the way: Record, Check and Listen. It takes two minutes.",
    ],
    next: "Ready!",
  },
  {
    key: "record-igala",
    clue: "record",
    title: "Clue 1: Record",
    lines: [
      "On the Record tab you see a question and the answer you wrote for it.",
      "Say your answer out loud in Igala, the way you would say it to a friend.",
    ],
    question: {
      text: "What do you say first?",
      choices: [
        {
          label: "My answer, in Igala",
          correct: true,
          reply: "Yes! Your own answer, in Igala.",
        },
        {
          label: "The question, in English",
          correct: false,
          reply: "Not quite. Say your own answer, and say it in Igala.",
        },
      ],
    },
    next: "Next",
  },
  {
    key: "record-english",
    clue: "record",
    title: "Clue 1: Record",
    lines: [
      "Then type what your answer means in English, in a few words, and say that out loud too.",
      "So every answer gets two clips: Igala first, then English.",
    ],
    question: {
      text: "How long is the English clip?",
      choices: [
        {
          label: "A few words",
          correct: true,
          reply: "Exactly. Just the meaning, short and clear.",
        },
        {
          label: "The whole answer again, word for word",
          correct: false,
          reply: "Shorter than that! A few words that give the meaning.",
        },
      ],
    },
    next: "Next",
  },
  {
    key: "record-choose",
    clue: "record",
    title: "Clue 1: Record",
    lines: [
      "After each clip you choose who may use it. Nothing is shared until you choose.",
      "A quiet room and the phone close to your mouth make the best clips.",
    ],
    findsClue: true,
    next: "I found clue 1!",
  },
  {
    key: "check",
    clue: "check",
    title: "Clue 2: Check",
    lines: [
      "On the Check tab you hear a clip by someone else and see the words they wrote.",
      "You say whether the clip and the words match. A different accent of the same word still matches.",
    ],
    question: {
      text: "Every word is right except one, which is a different word. What do you choose?",
      choices: [
        {
          label: "Does not match",
          correct: true,
          reply: "Right! Then tap the word that is different.",
        },
        {
          label: "Matches",
          correct: false,
          reply: "Close! One different word means it does not match.",
        },
      ],
    },
    next: "Next",
  },
  {
    key: "check-why",
    clue: "check",
    title: "Clue 2: Check",
    lines: [
      "Here is the secret: only a clip someone has checked as Matches can teach the computer.",
      "Nobody can check their own clips, so we need each other. This is the job we need most right now.",
    ],
    findsClue: true,
    next: "I found clue 2!",
  },
  {
    key: "listen",
    clue: "listen",
    title: "Clue 3: Listen",
    lines: [
      "On the Listen tab you hear two clips of the same sentence and pick the one that sounds more like a real Igala speaker.",
      "Some clips are people and some are a machine. We never tell you which. Please be strict!",
    ],
    question: {
      text: "Both clips sound wrong. What do you pick?",
      choices: [
        {
          label: "Both unusable",
          correct: true,
          reply: "Yes! Being strict is how the machine gets better.",
        },
        {
          label: "The less bad one",
          correct: false,
          reply: "Be strict! If neither sounds right, choose Both unusable.",
        },
      ],
    },
    findsClue: true,
    next: "I found clue 3!",
  },
  {
    key: "done",
    clue: null,
    title: "You found all three clues!",
    lines: [
      "Record, Check, Listen. That is all of Speech.",
      "To start, check 10 clips today. Then record a few of your own answers.",
    ],
    next: "Start checking",
  },
];

/** The clues found once the speaker has finished the steps before `index`. */
export function cluesFoundBefore(index: number): ClueKey[] {
  const found: ClueKey[] = [];
  WALKTHROUGH_STEPS.slice(0, Math.max(0, index)).forEach((s) => {
    if (s.findsClue && s.clue && !found.includes(s.clue)) found.push(s.clue);
  });
  return found;
}

/** May the speaker move on from this step, given what they tapped? */
export function canMoveOn(step: WalkthroughStep, tapped: number | null): boolean {
  if (!step.question) return true;
  return tapped !== null && !!step.question.choices[tapped]?.correct;
}
