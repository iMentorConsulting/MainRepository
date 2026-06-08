import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BRAND_BLUE, ACCENT_BLUE} from './TitleCard';
import {LOGO} from '../footage';

/**
 * "Λογότυπο iMentor Consulting σε καθαρό φόντο (brand color), με tagline
 * κάτω: 'Εμπειρία & Σύστημα.' Effect: logo fade-in ... CTA διακριτικό."
 */
export const LogoOutro: React.FC<{showCta?: boolean}> = ({showCta = true}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const logoIn = spring({frame, fps, config: {damping: 200}, durationInFrames: 24});
	const logoOpacity = interpolate(logoIn, [0, 1], [0, 1]);
	const logoScale = interpolate(logoIn, [0, 1], [0.92, 1]);

	const taglineIn = spring({
		frame: frame - 14,
		fps,
		config: {damping: 200},
		durationInFrames: 18,
	});
	const taglineOpacity = interpolate(taglineIn, [0, 1], [0, 1], {extrapolateLeft: 'clamp'});

	const ctaIn = spring({frame: frame - 34, fps, config: {damping: 200}, durationInFrames: 16});
	const ctaOpacity = interpolate(ctaIn, [0, 1], [0, 1], {extrapolateLeft: 'clamp'});

	return (
		<AbsoluteFill
			style={{
				background: `radial-gradient(circle at 50% 40%, ${ACCENT_BLUE} 0%, ${BRAND_BLUE} 70%)`,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 28,
			}}
		>
			<div style={{opacity: logoOpacity, transform: `scale(${logoScale})`, width: 460}}>
				<Img src={staticFile(LOGO)} style={{width: '100%', height: 'auto'}} />
			</div>
			<div
				style={{
					opacity: taglineOpacity,
					fontFamily: 'Inter, sans-serif',
					fontWeight: 600,
					fontSize: 42,
					color: 'rgba(255,255,255,0.92)',
					letterSpacing: 1,
				}}
			>
				Εμπειρία &amp; Σύστημα.
			</div>
			{showCta ? (
				<div
					style={{
						opacity: ctaOpacity,
						marginTop: 8,
						fontFamily: 'Inter, sans-serif',
						fontWeight: 500,
						fontSize: 28,
						color: 'rgba(255,255,255,0.78)',
						border: '2px solid rgba(255,255,255,0.4)',
						borderRadius: 999,
						padding: '12px 32px',
					}}
				>
					Επικοινώνησε μαζί μας
				</div>
			) : null}
		</AbsoluteFill>
	);
};
