export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920; // vertical 9:16 for TikTok / Reels / Shorts

const s = (seconds: number) => Math.round(seconds * FPS);

// Fixed-length beats (in frames). The two screen-recording inserts
// (ΕΜΠΕΙΡΙΑ-VIDEO1 / VIDEO2) are measured at render time from the actual
// files via calculateMetadata, so they are not listed here.
export const DURATIONS = {
	hook: s(3), // "ΕΜΠΕΙΡΙΑ / είναι απαραίτητη"
	builtOverYears: s(2.5), // "Χτίζεται με τα χρόνια"
	smashCutHold: s(0.5), // brief hold right after the smash cut
	notEnough: s(1.2), // "Δεν αρκεί." -- short and punchy
	systemPause: s(0.3), // silent "ανάσα" before the VO continues
	systemBeat: s(2.0), // "ΣΥΣΤΗΜΑ"
	splitScreen: s(3.0), // you (top) / system (bottom)
	syncedCaptions: s(4.5), // "Εκατοντάδες υποθέσεις" -> ... -> "Ένα προς ένα"
	seriousApproach: s(2.0), // "Σοβαρή προσέγγιση"
	outro: s(3.5), // logo + tagline + CTA
} as const;

export const TRANSITION = {
	smashCut: s(0.18), // quick whip / motion-blur cut, not a "fancy" transition
};
