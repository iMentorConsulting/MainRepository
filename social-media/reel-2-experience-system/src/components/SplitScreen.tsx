import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion';
import {ACCENT_BLUE, BRAND_BLUE} from './TitleCard';

/**
 * "Δυνατή ιδέα: εδώ κάνε split screen — εσύ στο πάνω μισό, το σύστημα στο
 * κάτω. Οπτικοποιεί κυριολεκτικά το 'και τα δύο'."
 *
 * Top half: you on camera. Bottom half: an abstract "system" visual
 * (rows of checkmarked rules lighting up one by one) standing in for the
 * software/process side -- swap for a real product screen-recording clip
 * if you'd rather show the actual system here.
 */
export const SplitScreen: React.FC<{topClip: string}> = ({topClip}) => {
	const rules = ['Τράπεζες', 'Δημόσιο', 'Εξωδικαστικός μηχανισμός', 'Ρύθμιση οφειλών'];

	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', top: 0, left: 0, right: 0, height: '50%', overflow: 'hidden'}}>
				<OffthreadVideo src={staticFile(`footage/${topClip}`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
			</div>
			<div
				style={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					height: '50%',
					background: `linear-gradient(180deg, ${BRAND_BLUE} 0%, #08192E 100%)`,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-start',
					justifyContent: 'center',
					padding: '0 90px',
					gap: 26,
				}}
			>
				{rules.map((rule) => (
					<div
						key={rule}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 18,
							fontFamily: 'Inter, sans-serif',
							fontWeight: 600,
							fontSize: 38,
							color: 'white',
						}}
					>
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 36,
								height: 36,
								borderRadius: '50%',
								background: ACCENT_BLUE,
								fontSize: 20,
							}}
						>
							✓
						</span>
						{rule}
					</div>
				))}
			</div>
			<div
				style={{
					position: 'absolute',
					top: '50%',
					left: 0,
					right: 0,
					height: 4,
					background: 'rgba(255,255,255,0.25)',
					transform: 'translateY(-2px)',
				}}
			/>
		</AbsoluteFill>
	);
};
