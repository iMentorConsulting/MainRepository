import React from 'react';
import {
	AbsoluteFill,
	Audio,
	OffthreadVideo,
	Sequence,
	staticFile,
	useVideoConfig,
} from 'remotion';
import {Clip} from './components/Clip';
import {BlurRegion} from './components/BlurRegion';
import {TitleCard, PunchLine} from './components/TitleCard';
import {SyncedCaptions} from './components/SyncedCaptions';
import {SplitScreen} from './components/SplitScreen';
import {LogoOutro} from './components/LogoOutro';
import {DURATIONS, TRANSITION} from './timeline';
import {
	SCREEN_RECORDING_1,
	SCREEN_RECORDING_2,
	SHOT_BUILT_OVER_YEARS,
	SHOT_HOOK,
	SHOT_HUNDREDS_CASES,
	SHOT_NOT_ENOUGH,
	SHOT_ONE_BY_ONE,
	SHOT_RULES_OF_LAW,
	SHOT_SERIOUS_APPROACH,
	SHOT_SMASH_CUT,
	SHOT_SPLIT_TOP,
	SHOT_SYSTEM_BEAT,
} from './footage';

export type Reel2Props = {
	video1DurationInFrames: number;
	video2DurationInFrames: number;
};

/**
 * "REEL 2 — Εμπειρία και σύστημα"
 *
 * Beat-by-beat build of social-media/.../ΟΔΗΓΙΕΣ EDITING - Εμπειρία και σύστημα.docx.
 * Each <Sequence> below corresponds 1:1 to a row of that brief -- see the
 * inline comments for the exact line from the doc it implements.
 */
export const Reel2: React.FC<Reel2Props> = ({video1DurationInFrames, video2DurationInFrames}) => {
	const {fps} = useVideoConfig();

	let cursor = 0;
	const at = (duration: number) => {
		const from = cursor;
		cursor += duration;
		return from;
	};

	const hookFrom = at(DURATIONS.hook);
	const video1From = at(video1DurationInFrames);
	const builtFrom = at(DURATIONS.builtOverYears);
	const smashCutFrom = at(TRANSITION.smashCut + DURATIONS.smashCutHold);
	const notEnoughFrom = at(DURATIONS.notEnough);
	const video2From = at(video2DurationInFrames);
	const systemFrom = at(DURATIONS.systemPause + DURATIONS.systemBeat);
	const splitFrom = at(DURATIONS.splitScreen);
	const captionsFrom = at(DURATIONS.syncedCaptions);
	const seriousFrom = at(DURATIONS.seriousApproach);
	const outroFrom = at(DURATIONS.outro);

	const totalDuration = cursor;

	return (
		<AbsoluteFill style={{backgroundColor: 'black'}}>
			{/* Background music bed -- runs under the whole reel, ducked under VO sections */}
			<Sequence from={0} durationInFrames={totalDuration}>
				<Audio src={staticFile('audio/background-pad.mp3')} volume={0.5} />
			</Sequence>

			{/* 1. "Η εμπειρία στον εξωδικαστικό μηχανισμό είναι απαραίτητη."
			      Κείμενο: ΕΜΠΕΙΡΙΑ μεγάλη / "είναι απαραίτητη" από κάτω. Fade + scale 95%->100%. */}
			<Sequence from={hookFrom} durationInFrames={DURATIONS.hook}>
				<Clip src={SHOT_HOOK} />
				<TitleCard headline="ΕΜΠΕΙΡΙΑ" subline="είναι απαραίτητη" />
			</Sequence>

			{/* 2. ΕΜΠΕΙΡΙΑ-VIDEO1 -- "Ξέρεις πώς απαντούν οι τράπεζες..."
			      Screen recording; the visible link is covered per the brief's note. */}
			<Sequence from={video1From} durationInFrames={video1DurationInFrames}>
				<AbsoluteFill style={{backgroundColor: 'black'}}>
					<OffthreadVideo src={staticFile(`footage/${SCREEN_RECORDING_1}`)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
					<BlurRegion />
				</AbsoluteFill>
			</Sequence>

			{/* 3. "Αυτή η γνώση χτίζεται από τους συμβούλους με τα χρόνια." Κείμενο: "Χτίζεται με τα χρόνια". */}
			<Sequence from={builtFrom} durationInFrames={DURATIONS.builtOverYears}>
				<Clip src={SHOT_BUILT_OVER_YEARS} />
				<PunchLine text="Χτίζεται με τα χρόνια" />
			</Sequence>

			{/* 4. "Μετάβαση από το system πίσω σε σένα: καθαρό smash cut με ελαφρύ motion blur.
			      Όχι fancy transition." -- handled by an instant hard cut into the next clip;
			      a 0.5s hold gives the cut room to read before "Δεν αρκεί." lands. */}
			<Sequence from={smashCutFrom} durationInFrames={TRANSITION.smashCut + DURATIONS.smashCutHold}>
				<Clip src={SHOT_SMASH_CUT} zoom={false} />
			</Sequence>

			{/* 5. "Αλλά από μόνη της δεν αρκεί." Κείμενο: "Δεν αρκεί." -- κοφτό, μένει 1". */}
			<Sequence from={notEnoughFrom} durationInFrames={DURATIONS.notEnough}>
				<Clip src={SHOT_NOT_ENOUGH} />
				<PunchLine text="Δεν αρκεί." />
			</Sequence>

			{/* 6. ΕΜΠΕΙΡΙΑ-VIDEO2 -- "Γιατί οι παράμετροι που πρέπει να συνυπολογιστούν..." */}
			<Sequence from={video2From} durationInFrames={video2DurationInFrames}>
				<AbsoluteFill style={{backgroundColor: 'black'}}>
					<OffthreadVideo src={staticFile(`footage/${SCREEN_RECORDING_2}`)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
					<BlurRegion />
				</AbsoluteFill>
			</Sequence>

			{/* 7. "Χρειάζεται σύστημα." Κείμενο: ΣΥΣΤΗΜΑ μεγάλο κεντραρισμένο.
			      "Μικρή παύση/ανάσα ... 0.3s κενό αυξάνει το βάρος. Ένα διακριτικό whoosh." */}
			<Sequence from={systemFrom} durationInFrames={DURATIONS.systemPause}>
				<Clip src={SHOT_SYSTEM_BEAT} />
			</Sequence>
			<Sequence from={systemFrom + DURATIONS.systemPause} durationInFrames={DURATIONS.systemBeat}>
				<Clip src={SHOT_SYSTEM_BEAT} startFrom={DURATIONS.systemPause} />
				<TitleCard headline="ΣΥΣΤΗΜΑ" />
				<Audio src={staticFile('audio/whoosh.mp3')} volume={0.7} />
			</Sequence>

			{/* 8. "Στο γραφείο μας έχουμε και τα δύο." Split screen: εσύ πάνω / σύστημα κάτω. */}
			<Sequence from={splitFrom} durationInFrames={DURATIONS.splitScreen}>
				<SplitScreen topClip={SHOT_SPLIT_TOP} />
			</Sequence>

			{/* 9. "Την εμπειρία από εκατοντάδες υποθέσεις... ένα προς ένα."
			      Captions συγχρονισμένα σε 3 γραμμές + γρήγορο highlight 2-3 πεδίων στο τέλος. */}
			<Sequence from={captionsFrom} durationInFrames={DURATIONS.syncedCaptions}>
				<Clip src={SHOT_HUNDREDS_CASES} />
				<SyncedCaptions />
			</Sequence>
			{/* quick cutaways under the 2nd/3rd caption lines, matching "highlight διαδοχικά ... γρήγορα" */}
			<Sequence from={captionsFrom + 45} durationInFrames={45}>
				<Clip src={SHOT_RULES_OF_LAW} dim={false} />
			</Sequence>
			<Sequence from={captionsFrom + 90} durationInFrames={45}>
				<Clip src={SHOT_ONE_BY_ONE} dim={false} />
			</Sequence>

			{/* 10. "Αυτό είναι σοβαρή προσέγγιση." Καθαρό κάδρο, ησυχία στα effects. */}
			<Sequence from={seriousFrom} durationInFrames={DURATIONS.seriousApproach}>
				<Clip src={SHOT_SERIOUS_APPROACH} zoom={false} />
				<PunchLine text="Σοβαρή προσέγγιση" />
			</Sequence>

			{/* 11. "iMentor Consulting. Εμπειρία και σύστημα. Και τα δύο."
			       Λογότυπο fade-in σε brand color, μουσική κλείνει σε καθαρή νότα, CTA. */}
			<Sequence from={outroFrom} durationInFrames={DURATIONS.outro}>
				<LogoOutro />
				<Audio src={staticFile('audio/outro-note.mp3')} volume={0.8} />
			</Sequence>
		</AbsoluteFill>
	);
};

export const getReel2DurationInFrames = (video1: number, video2: number) => {
	return (
		DURATIONS.hook +
		video1 +
		DURATIONS.builtOverYears +
		(TRANSITION.smashCut + DURATIONS.smashCutHold) +
		DURATIONS.notEnough +
		video2 +
		DURATIONS.systemPause +
		DURATIONS.systemBeat +
		DURATIONS.splitScreen +
		DURATIONS.syncedCaptions +
		DURATIONS.seriousApproach +
		DURATIONS.outro
	);
};
