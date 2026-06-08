import React from 'react';
import {AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Wraps a footage clip with:
 *  - a slow Ken Burns zoom (keeps static-feeling shots alive on a vertical reel)
 *  - an optional dark gradient so white text overlays stay legible
 *  - the clip's own audio playing (your voice carries continuously through
 *    the "you on camera" beats, not just the screen-recording inserts)
 */
export const Clip: React.FC<{
	src: string;
	dim?: boolean;
	muted?: boolean;
	zoom?: boolean;
	startFrom?: number;
}> = ({src, dim = true, muted = false, zoom = true, startFrom = 0}) => {
	const frame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();

	const scale = zoom ? interpolate(frame, [0, durationInFrames], [1, 1.08]) : 1;

	return (
		<AbsoluteFill style={{overflow: 'hidden', background: 'black'}}>
			<OffthreadVideo
				src={staticFile(`footage/${src}`)}
				muted={muted}
				startFrom={startFrom}
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'cover',
					transform: `scale(${scale})`,
				}}
			/>
			{dim ? (
				<AbsoluteFill
					style={{
						background:
							'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.55) 100%)',
					}}
				/>
			) : null}
		</AbsoluteFill>
	);
};
