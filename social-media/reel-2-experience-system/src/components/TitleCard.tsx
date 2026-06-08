import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export const BRAND_BLUE = '#0B2A4A';
export const ACCENT_BLUE = '#1F5BA8';

/**
 * Big headline + smaller subline. Fades in with a slight scale-up
 * (95% -> 100%), per the brief: "fade + slight scale-up, not a bounce".
 */
export const TitleCard: React.FC<{
	headline: string;
	subline?: string;
	align?: 'center' | 'flex-end';
}> = ({headline, subline, align = 'center'}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const progress = spring({
		frame,
		fps,
		config: {damping: 200, mass: 0.6},
		durationInFrames: 18,
	});

	const opacity = interpolate(progress, [0, 1], [0, 1]);
	const scale = interpolate(progress, [0, 1], [0.95, 1]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: align === 'center' ? 'center' : 'flex-end',
				paddingBottom: align === 'flex-end' ? 220 : 0,
				textAlign: 'center',
				opacity,
				transform: `scale(${scale})`,
			}}
		>
			<div
				style={{
					fontFamily: 'Inter, sans-serif',
					fontWeight: 800,
					fontSize: 110,
					color: 'white',
					letterSpacing: 2,
					textShadow: '0 6px 40px rgba(0,0,0,0.45)',
				}}
			>
				{headline}
			</div>
			{subline ? (
				<div
					style={{
						marginTop: 18,
						fontFamily: 'Inter, sans-serif',
						fontWeight: 500,
						fontSize: 44,
						color: 'rgba(255,255,255,0.88)',
						textShadow: '0 4px 24px rgba(0,0,0,0.4)',
					}}
				>
					{subline}
				</div>
			) : null}
		</div>
	);
};

/** A short, "kept on screen" caption -- for punchy single-line beats. */
export const PunchLine: React.FC<{text: string}> = ({text}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const progress = spring({frame, fps, config: {damping: 200}, durationInFrames: 10});
	const opacity = interpolate(progress, [0, 1], [0, 1]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'flex-end',
				justifyContent: 'center',
				paddingBottom: 260,
				opacity,
			}}
		>
			<div
				style={{
					fontFamily: 'Inter, sans-serif',
					fontWeight: 700,
					fontSize: 64,
					color: 'white',
					background: 'rgba(11,42,74,0.55)',
					borderRadius: 18,
					padding: '14px 38px',
					textShadow: '0 4px 24px rgba(0,0,0,0.4)',
				}}
			>
				{text}
			</div>
		</div>
	);
};
