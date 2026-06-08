// Drop your raw clips into public/footage/ using these exact filenames
// (this matches the names already used in the shared Drive folder).
// The clips are listed in your numbered order (1-10) and assigned below
// to the "you on camera" beats of the script. If you'd rather a different
// clip play in a given beat, just swap the entries in YOU_FOOTAGE / BROLL_FOOTAGE.
export const FOOTAGE = [
	'1. BEST IMG_1956.MOV',
	'2. BEST IMG_1960.MOV',
	'3 BEST IMG_1963.MOV',
	'4. BEST IMG_1966.MOV',
	'5. BEST IMG_1972.MOV',
	'6. BEST IMG_1975.MOV',
	'7. BEST IMG_1975.MOV',
	'8. BEST IMG_1981.MOV',
	'9. BEST IMG_1982.MOV',
	'10. BEST IMG_1986.MOV',
] as const;

// Screen-recording inserts referenced by the script (ΕΜΠΕΙΡΙΑ-VIDEO1 / VIDEO2).
// IMPORTANT per the brief: the URL visible in both recordings must be blurred
// before publishing -- see <BlurRegion> usage in Reel2.tsx.
export const SCREEN_RECORDING_1 = 'ΕΜΠΕΙΡΙΑ-VIDEO1.mp4';
export const SCREEN_RECORDING_2 = 'ΕΜΠΕΙΡΙΑ-VIDEO2.mp4';

export const LOGO = 'logo-white-transparent.png';

// Beat -> clip assignment (indices into FOOTAGE), in on-screen order.
export const SHOT_HOOK = FOOTAGE[0]; // 1. opening hook ("ΕΜΠΕΙΡΙΑ")
export const SHOT_BUILT_OVER_YEARS = FOOTAGE[1]; // 2. "Χτίζεται με τα χρόνια"
export const SHOT_SMASH_CUT = FOOTAGE[2]; // 3. smash cut back to you
export const SHOT_NOT_ENOUGH = FOOTAGE[3]; // 4. "Δεν αρκεί."
export const SHOT_SYSTEM_BEAT = FOOTAGE[4]; // 5. "ΣΥΣΤΗΜΑ"
export const SHOT_SERIOUS_APPROACH = FOOTAGE[5]; // 6. "Σοβαρή προσέγγιση" -- now its own clip
export const SHOT_SPLIT_TOP = FOOTAGE[6]; // 7. split-screen top half (you)
export const SHOT_HUNDREDS_CASES = FOOTAGE[7]; // 8. "Εκατοντάδες υποθέσεις" cutaway
export const SHOT_RULES_OF_LAW = FOOTAGE[8]; // 9. "Οι κανόνες του νόμου..." cutaway
export const SHOT_ONE_BY_ONE = FOOTAGE[9]; // 10. "Ένα προς ένα" cutaway
export const SHOT_OUTRO_BG = FOOTAGE[0]; // soft b-roll behind the logo card (heavily dimmed)
