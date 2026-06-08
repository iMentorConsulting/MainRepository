import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

/**
 * Standard burned-in caption bar near the bottom of the frame -- Greek text,
 * white-on-dark, sized to read clearly on a phone with the sound off.
 * Sits below the bigger headline/punchline graphics so the two layers don't
 * collide (those use `justify-content: center` / a smaller bottom padding).
 */
export const Subtitle: React.FC<{text: string}> = ({text}) => {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 6], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				bottom: 90,
				display: 'flex',
				justifyContent: 'center',
				padding: '0 64px',
				opacity,
			}}
		>
			<div
				style={{
					fontFamily: 'Inter, sans-serif',
					fontWeight: 600,
					fontSize: 34,
					lineHeight: 1.35,
					color: 'white',
					textAlign: 'center',
					background: 'rgba(0,0,0,0.45)',
					borderRadius: 14,
					padding: '14px 26px',
					textShadow: '0 2px 12px rgba(0,0,0,0.5)',
				}}
			>
				{text}
			</div>
		</div>
	);
};
