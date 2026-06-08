import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ACCENT_BLUE} from './TitleCard';

const LINES = ['Εκατοντάδες υποθέσεις', 'Οι κανόνες του νόμου σε κάθε δεδομένο', 'Ένα προς ένα'];

// Highlighted "fields" that flash up quickly during the final line, per the
// brief: "Στο 'ένα προς ένα' highlight διαδοχικά 2-3 πεδία γρήγορα".
const HIGHLIGHT_FIELDS = ['Ποσό οφειλής', 'Εισόδημα', 'Ρύθμιση'];

const LINE_DURATION = 45; // frames each caption line is held

const CaptionLine: React.FC<{text: string; localFrame: number; fps: number}> = ({
	text,
	localFrame,
	fps,
}) => {
	const enter = spring({frame: localFrame, fps, config: {damping: 200}, durationInFrames: 10});
	const exit = interpolate(localFrame, [LINE_DURATION - 10, LINE_DURATION], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const opacity = Math.min(enter, exit);
	const translateY = interpolate(enter, [0, 1], [24, 0]);

	return (
		<div
			style={{
				fontFamily: 'Inter, sans-serif',
				fontWeight: 700,
				fontSize: 56,
				color: 'white',
				background: 'rgba(11,42,74,0.6)',
				borderRadius: 16,
				padding: '16px 36px',
				opacity,
				transform: `translateY(${translateY}px)`,
				textAlign: 'center',
				maxWidth: '85%',
			}}
		>
			{text}
		</div>
	);
};

const HighlightChips: React.FC<{localFrame: number; fps: number}> = ({localFrame, fps}) => {
	const chipSpacing = 9; // frames between each chip flashing up
	return (
		<div style={{display: 'flex', gap: 14, marginTop: 22}}>
			{HIGHLIGHT_FIELDS.map((field, i) => {
				const chipFrame = localFrame - i * chipSpacing;
				const progress = spring({
					frame: chipFrame,
					fps,
					config: {damping: 14, stiffness: 180},
					durationInFrames: 8,
				});
				const opacity = interpolate(progress, [0, 1], [0, 1], {
					extrapolateLeft: 'clamp',
				});
				const scale = interpolate(progress, [0, 1], [0.7, 1], {extrapolateLeft: 'clamp'});

				return (
					<div
						key={field}
						style={{
							opacity,
							transform: `scale(${scale})`,
							background: ACCENT_BLUE,
							color: 'white',
							fontFamily: 'Inter, sans-serif',
							fontWeight: 600,
							fontSize: 30,
							borderRadius: 999,
							padding: '10px 24px',
							border: '2px solid rgba(255,255,255,0.5)',
						}}
					>
						{field}
					</div>
				);
			})}
		</div>
	);
};

/**
 * Three captions appear one after another, synced to the VO line:
 * "Την εμπειρία από εκατοντάδες υποθέσεις. Και το σύστημα που εφαρμόζει
 * τους κανόνες του νόμου σε κάθε δεδομένο, ένα προς ένα."
 *
 * On the last line, 2-3 small "field" chips flash up in quick succession
 * to visualize "ένα προς ένα" (one by one).
 */
export const SyncedCaptions: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const lineIndex = Math.min(Math.floor(frame / LINE_DURATION), LINES.length - 1);
	const localFrame = frame - lineIndex * LINE_DURATION;
	const isLastLine = lineIndex === LINES.length - 1;

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'flex-end',
				paddingBottom: 280,
			}}
		>
			<CaptionLine text={LINES[lineIndex]} localFrame={localFrame} fps={fps} />
			{isLastLine ? <HighlightChips localFrame={localFrame} fps={fps} /> : null}
		</div>
	);
};

export const SYNCED_CAPTIONS_RECOMMENDED_DURATION = LINE_DURATION * LINES.length;
