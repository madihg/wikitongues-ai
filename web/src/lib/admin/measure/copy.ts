/**
 * Every label of the speech measurement page with its one plain sentence.
 * The sentence is what a reader gets one tap away from the number, and it is
 * the same sentence everywhere the number appears. Written for a reader who
 * has never met the acronym: the label says what was counted.
 */

export interface Explained {
  label: string;
  /** One plain sentence, or two short ones. No acronym left unexplained. */
  meaning: string;
  /** When the number can be trusted. */
  trust: string;
}

export const AUTO_RECOGNITION = {
  cer: {
    label: "Letters wrong",
    meaning:
      "Out of 100 letters the speaker said, the model wrote this many wrong. Tone marks are ignored.",
    trust:
      "300 exam clips from at least 3 speakers who are in no training set.",
  },
  werStripped: {
    label: "Words wrong",
    meaning:
      "Out of 100 words, this many came out wrong. Tone marks are ignored.",
    trust:
      "300 exam clips from at least 3 speakers who are in no training set.",
  },
  werRetained: {
    label: "Words wrong, tones counted",
    meaning:
      "The same count, but a word with a wrong tone mark is a wrong word.",
    trust:
      "300 exam clips from at least 3 speakers who are in no training set.",
  },
  ter: {
    label: "Tone marks wrong",
    meaning:
      "Out of 100 vowels that carry a tone mark, this many came back with the wrong mark or with none.",
    trust:
      "At least 1,000 marked vowels in the exam text. That gives about plus or minus 3 points.",
  },
} as const satisfies Record<string, Explained>;

export const AUTO_VOICE = {
  roundTripCer: {
    label: "Letters lost on the way back",
    meaning:
      "Our own recogniser listens to the model's voice and writes what it hears. We compare that with the sentence we asked for, and do the same with a person's clip. The gap is what the voice loses.",
    trust:
      "50 sentences, and the recogniser's own Letters wrong is under 30%. Above that the ruler is too blurry to measure with.",
  },
  roundTripTer: {
    label: "Tone marks lost on the way back",
    meaning: "The same, counting only tone marks.",
    trust: "1,000 marked vowels.",
  },
  predictedScore: {
    label: "Predicted listening score",
    meaning:
      "A program trained on other languages guesses how a listener would score the clip from 1 to 5. It has never heard Igala, so read the gap to the person, not the number.",
    trust:
      "Grey until 100 clips have both this score and a listener's score, and the two rank the clips alike.",
  },
  sameVoice: {
    label: "Same voice",
    meaning:
      "How close the model's voice is to the speaker it learned from. 0 is a stranger, 1 is the same recording.",
    trust:
      "30 clips, and only for a speaker who agreed to have their voice copied.",
  },
  pitch: {
    label: "Pitch follows the tone marks",
    meaning:
      "Where the writing says the pitch goes up or down between two syllables, this is how often the voice moves the right way.",
    trust:
      "300 tone steps. Experimental until it is compared with what listeners say about tone.",
  },
} as const satisfies Record<string, Explained>;

export const AUTO_LEVELS = {
  peak: {
    label: "Loudest point",
    meaning: "The loudest instant in the clip. Too close to 0 distorts.",
    trust: "Shown as the middle clip of all kept clips.",
  },
  speech: {
    label: "Speech level",
    meaning: "How loud the speech itself is, silence left out.",
    trust: "Shown as the middle clip of all kept clips.",
  },
  noise: {
    label: "Background noise",
    meaning: "How loud the room is when nobody speaks.",
    trust: "Needs the cleaning step, which measures the silent parts.",
  },
  snr: {
    label: "Speech over noise",
    meaning: "How far the voice stands above the room.",
    trust: "Needs the cleaning step, which measures the silent parts.",
  },
  clipped: {
    label: "Clipped clips",
    meaning: "Clips where the loudest parts were cut off.",
    trust: "A count, always shown.",
  },
  cleaningCheck: {
    label: "Did cleaning change what the recogniser hears?",
    meaning:
      "Cleaning must not smear the tones. We run the recogniser on the clip before and after cleaning and compare.",
    trust: "The answer is No when the range of the difference includes 0.",
  },
} as const satisfies Record<string, Explained>;

export const HUMAN = {
  preference: {
    label: "Listeners chose the model",
    meaning:
      "A listener heard the model and a person say the same sentence, without knowing which was which. This is how often they chose the model. 50% would mean they cannot tell the two apart.",
    trust: "See the sample word beside the counts.",
  },
  axes: {
    label: "Scores, 0 to 5",
    meaning:
      "The average score each clip got on each line. The gap is model minus person in the same round.",
    trust: "30 rated rounds per line to show a gap, 100 to quote it.",
  },
  check: {
    label: "Does the clip say what is written?",
    meaning:
      "A second speaker reads the text, listens, and says whether the clip matches. When it does not, they say on which level.",
    trust: "100 checked clips per column.",
  },
  tonePairs: {
    label: "Tone pairs",
    meaning:
      "The listener picks between two words that differ only in tone. This is how often they heard the intended word. Guessing gives 50%.",
    trust: "50 answers.",
  },
  agreement: {
    label: "Do two listeners agree?",
    meaning:
      "When two people judged the same round, how often they made the same choice, corrected for luck. 0 is luck, 1 is full agreement.",
    trust: "30 rounds judged by two or more listeners.",
  },
  counts: {
    label: "Rounds, Sentences, Listeners",
    meaning: "How much evidence there is.",
    trust: "Always shown.",
  },
} as const satisfies Record<string, Explained>;

/** The five score lines, in the words a listener sees on the Listen page. */
export const AXIS_LINES: Record<string, string> = {
  intelligibility: "Can every word be made out",
  pronunciation: "Sounds match the word",
  tone: "Tone patterns are right",
  naturalness: "Sounds like a person",
  pace: "Speed is comfortable",
};

/** The empty states, word for word. */
export const EMPTY = {
  noModel: "No speech model has been scored yet.",
  noRounds: "No listener has compared a model with a person yet.",
  noChecks: "No clip has been checked yet.",
  noModelChecks:
    "No model clip has been checked yet. Check plays people's clips only for now.",
  noTonePairs: "No tone pair has been answered yet.",
  noSecondListener: "Needs a second listener on the same rounds.",
  oneListener: "One listener so far. This is one person's ear.",
  notMeasured: "Not measured yet",
  noExam: "No exam is locked yet. Lock exam clips in Data, Speech clips.",
} as const;
