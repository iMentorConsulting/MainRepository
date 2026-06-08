import React from 'react';
import {AbsoluteFill} from 'remotion';
import {ACCENT_BLUE} from './TitleCard';

/**
 * Covers the URL visible in the top-right of both screen recordings
 * (per the brief: "ΠΡΟΣΟΧΗ: ... NA ΚΡΥΦΤΕΙ ΠΑΡΑΚΑΛΩ ΑΥΤΟ ΤΟ LINK").
 *
 * Implemented as a solid brand-blue patch rather than a CSS blur: the brief
 * also asks to recolor that exact area to match the background, so one
 * overlay solves both notes at once. Adjust `top` / `right` / `width` /
 * `height` once you can see the actual recording in the studio preview --
 * the values below are a sane starting guess for a 1080x1920 capture with
 * the link in the macOS/browser top bar.
 */
export const BlurRegion: React.FC<{
	top?: number;
	right?: number;
	width?: number;
	height?: number;
}> = ({top = 0, right = 0, width = 420, height = 90}) => {
	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					top,
					right,
					width,
					height,
					background: ACCENT_BLUE,
					borderBottomLeftRadius: 14,
				}}
			/>
		</AbsoluteFill>
	);
};
